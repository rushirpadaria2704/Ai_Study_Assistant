import json
import os
import uuid

try:
    from flask import Flask, flash, jsonify, redirect, render_template, request, url_for  # type: ignore[reportMissingImports]
    from werkzeug.utils import secure_filename  # type: ignore[reportMissingImports]
    
except ImportError as exc:
    raise ImportError(
        "Missing Flask/Werkzeug dependencies. Install with `pip install flask werkzeug`."
    ) from exc

import config
from models.database import get_connection, init_db, now_iso
from services.pdf_processor import allowed_file, extract_text, save_upload
from services.rag_engine import llm_service, rag_engine
from services.settings_service import (
    PROVIDER_TYPES,
    create_api_config,
    delete_api_config,
    get_active_models,
    get_active_provider,
    get_api_config,
    get_connected_models,
    get_current_active_model_info,
    get_provider_types,
    get_setting,
    list_api_configs,
    set_active_api_config,
    set_setting,
    test_api_connection,
    update_api_config,
    validate_api_key,
    validate_url,
)
from services.test_service import (
    create_test_attempt,
    generate_rag_test,
    get_attempt_runner_payload,
    get_test,
    get_test_result,
    list_attempt_history,
    list_tests,
    save_answer,
    submit_test_attempt,
)

app = Flask(__name__)
app.config["SECRET_KEY"] = "study-assistant-local-rag"
app.config["UPLOAD_FOLDER"] = config.UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = config.MAX_CONTENT_LENGTH


@app.context_processor
def inject_active_model():
    return {
        "current_model_info": get_current_active_model_info()
    }


init_db()
os.makedirs(config.UPLOAD_FOLDER, exist_ok=True)
os.makedirs(config.VECTOR_STORE_FOLDER, exist_ok=True)


def get_documents():
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM documents ORDER BY uploaded_at DESC"
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_document(doc_id: int):
    conn = get_connection()
    row = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_teaching_session(session_id: int):
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM teaching_sessions WHERE id = ?", (session_id,)
    ).fetchone()
    conn.close()
    if not row:
        return None
    item = dict(row)
    try:
        item["messages"] = json.loads(item["messages"])
    except json.JSONDecodeError:
        item["messages"] = []
    return item


@app.route("/")
def index():
    documents = get_documents()
    stats = {
        "documents": len(documents),
        "llm_available": llm_service.is_available(),
        "model": config.OLLAMA_MODEL,
    }
    return render_template("index.html", documents=documents, stats=stats)


@app.route("/upload", methods=["GET", "POST"])
def upload():
    if request.method == "POST":
        if "file" not in request.files:
            flash("No file selected.", "danger")
            return redirect(url_for("upload"))

        file = request.files["file"]
        if file.filename == "":
            flash("No file selected.", "danger")
            return redirect(url_for("upload"))

        if not allowed_file(file.filename):
            flash("Invalid file type. Upload PDF, TXT, or MD files.", "danger")
            return redirect(url_for("upload"))

        original_name = secure_filename(file.filename)
        ext = original_name.rsplit(".", 1)[1].lower()
        stored_name = f"{uuid.uuid4().hex}.{ext}"

        try:
            filepath = save_upload(file, stored_name)
            text, page_count = extract_text(filepath)
            if not text.strip():
                os.remove(filepath)
                flash("Could not extract text from the file.", "danger")
                return redirect(url_for("upload"))

            word_count = len(text.split())
            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO documents
                (filename, original_name, file_type, file_size, page_count, word_count, uploaded_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    stored_name,
                    original_name,
                    ext,
                    os.path.getsize(filepath),
                    page_count,
                    word_count,
                    now_iso(),
                ),
            )
            doc_id = cursor.lastrowid
            conn.commit()
            conn.close()

            chunk_count = rag_engine.build_index(doc_id, text)
            flash(
                f"Uploaded '{original_name}' — {page_count} pages, "
                f"{word_count} words, {chunk_count} chunks indexed.",
                "success",
            )
            return redirect(url_for("document_detail", doc_id=doc_id))
        except Exception as exc:
            flash(f"Upload failed: {exc}", "danger")
            return redirect(url_for("upload"))

    return render_template("upload.html")


@app.route("/documents/<int:doc_id>")
def document_detail(doc_id):
    document = get_document(doc_id)
    if not document:
        flash("Document not found.", "danger")
        return redirect(url_for("index"))

    conn = get_connection()
    summaries = conn.execute(
        "SELECT * FROM summaries WHERE document_id = ? ORDER BY created_at DESC",
        (doc_id,),
    ).fetchall()
    quizzes = conn.execute(
        "SELECT * FROM quizzes WHERE document_id = ? ORDER BY created_at DESC",
        (doc_id,),
    ).fetchall()
    interviews = conn.execute(
        "SELECT * FROM interview_sets WHERE document_id = ? ORDER BY created_at DESC",
        (doc_id,),
    ).fetchall()
    exams = conn.execute(
        "SELECT * FROM exam_papers WHERE document_id = ? ORDER BY created_at DESC",
        (doc_id,),
    ).fetchall()
    chats = conn.execute(
        "SELECT * FROM chat_history WHERE document_id = ? ORDER BY created_at DESC LIMIT 10",
        (doc_id,),
    ).fetchall()
    conn.close()

    return render_template(
        "document.html",
        document=document,
        summaries=[dict(s) for s in summaries],
        quizzes=[dict(q) for q in quizzes],
        interviews=[dict(i) for i in interviews],
        exams=[dict(e) for e in exams],
        chats=[dict(c) for c in chats],
    )


@app.route("/documents/<int:doc_id>/delete", methods=["POST"])
def delete_document(doc_id):
    document = get_document(doc_id)
    if not document:
        flash("Document not found.", "danger")
        return redirect(url_for("index"))

    filepath = os.path.join(config.UPLOAD_FOLDER, document["filename"])
    if os.path.isfile(filepath):
        os.remove(filepath)

    rag_engine.delete_index(doc_id)

    conn = get_connection()
    conn.execute("DELETE FROM summaries WHERE document_id = ?", (doc_id,))
    conn.execute("DELETE FROM quizzes WHERE document_id = ?", (doc_id,))
    conn.execute("DELETE FROM interview_sets WHERE document_id = ?", (doc_id,))
    conn.execute("DELETE FROM exam_papers WHERE document_id = ?", (doc_id,))
    conn.execute("DELETE FROM teaching_sessions WHERE document_id = ?", (doc_id,))
    conn.execute("DELETE FROM chat_history WHERE document_id = ?", (doc_id,))
    conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    conn.commit()
    conn.close()

    flash(f"Deleted '{document['original_name']}'.", "success")
    return redirect(url_for("index"))


@app.route("/chat/<int:doc_id>", methods=["GET", "POST"])
def chat(doc_id):
    document = get_document(doc_id)
    if not document:
        flash("Document not found.", "danger")
        return redirect(url_for("index"))

    answer = None
    question = ""

    if request.method == "POST":
        question = request.form.get("question", "").strip()
        if question:
            chunks = rag_engine.retrieve(doc_id, question)
            if chunks:
                answer = llm_service.answer_question(question, chunks)
            else:
                answer = "No indexed content found for this document. Try re-uploading."

            conn = get_connection()
            conn.execute(
                """
                INSERT INTO chat_history (document_id, question, answer, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (doc_id, question, answer, now_iso()),
            )
            conn.commit()
            conn.close()

    conn = get_connection()
    history = conn.execute(
        "SELECT * FROM chat_history WHERE document_id = ? ORDER BY created_at DESC LIMIT 20",
        (doc_id,),
    ).fetchall()
    conn.close()

    return render_template(
        "chat.html",
        document=document,
        question=question,
        answer=answer,
        history=[dict(h) for h in history],
    )


@app.route("/api/chat/<int:doc_id>", methods=["POST"])
def api_chat(doc_id):
    document = get_document(doc_id)
    if not document:
        return jsonify({"error": "Document not found"}), 404

    data = request.get_json(silent=True) or {}
    question = (data.get("question") or "").strip()
    if not question:
        return jsonify({"error": "Question is required"}), 400

    chunks = rag_engine.retrieve(doc_id, question)
    if not chunks:
        return jsonify({"error": "No indexed content found"}), 404

    answer = llm_service.answer_question(question, chunks)

    conn = get_connection()
    conn.execute(
        """
        INSERT INTO chat_history (document_id, question, answer, created_at)
        VALUES (?, ?, ?, ?)
        """,
        (doc_id, question, answer, now_iso()),
    )
    conn.commit()
    conn.close()

    return jsonify({"question": question, "answer": answer, "sources": chunks})


@app.route("/summary/<int:doc_id>", methods=["GET", "POST"])
def summary(doc_id):
    document = get_document(doc_id)
    if not document:
        flash("Document not found.", "danger")
        return redirect(url_for("index"))

    summary_text = None

    if request.method == "POST":
        filepath = os.path.join(config.UPLOAD_FOLDER, document["filename"])
        text, _ = extract_text(filepath)
        summary_text = llm_service.generate_summary(text, document["original_name"])

        conn = get_connection()
        conn.execute(
            """
            INSERT INTO summaries (document_id, title, content, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (doc_id, document["original_name"], summary_text, now_iso()),
        )
        conn.commit()
        conn.close()

    conn = get_connection()
    summaries = conn.execute(
        "SELECT * FROM summaries WHERE document_id = ? ORDER BY created_at DESC",
        (doc_id,),
    ).fetchall()
    conn.close()

    return render_template(
        "summary.html",
        document=document,
        summary_text=summary_text,
        summaries=[dict(s) for s in summaries],
    )


@app.route("/quiz/<int:doc_id>", methods=["GET", "POST"])
def quiz(doc_id):
    document = get_document(doc_id)
    if not document:
        flash("Document not found.", "danger")
        return redirect(url_for("index"))

    quiz_data = None

    if request.method == "POST":
        question_type = request.form.get("question_type", "mcq")
        if question_type not in ("mcq", "short_answer", "true_false"):
            question_type = "mcq"

        try:
            num_questions = int(request.form.get("num_questions", 5))
        except (TypeError, ValueError):
            num_questions = 5
        if num_questions not in (1, 5, 10, 15, 20):
            num_questions = 5

        filepath = os.path.join(config.UPLOAD_FOLDER, document["filename"])
        text, _ = extract_text(filepath)
        quiz_data = llm_service.generate_quiz(
            text,
            document["original_name"],
            question_type=question_type,
            num_questions=num_questions,
        )
        quiz_json = json.dumps(quiz_data)

        type_labels = {
            "mcq": "MCQ",
            "short_answer": "Short Answer",
            "true_false": "True/False",
        }
        quiz_title = (
            f"{quiz_data.get('title', 'Generated Quiz')} "
            f"({type_labels[question_type]}, {num_questions} Q)"
        )

        conn = get_connection()
        conn.execute(
            """
            INSERT INTO quizzes (document_id, title, quiz_data, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (doc_id, quiz_title, quiz_json, now_iso()),
        )
        conn.commit()
        conn.close()

    conn = get_connection()
    quizzes = conn.execute(
        "SELECT * FROM quizzes WHERE document_id = ? ORDER BY created_at DESC",
        (doc_id,),
    ).fetchall()
    conn.close()

    parsed_quizzes = []
    for q in quizzes:
        item = dict(q)
        try:
            item["parsed"] = json.loads(item["quiz_data"])
        except json.JSONDecodeError:
            item["parsed"] = {}
        parsed_quizzes.append(item)

    return render_template(
        "quiz.html",
        document=document,
        quiz_data=quiz_data,
        quizzes=parsed_quizzes,
    )


@app.route("/interview/<int:doc_id>", methods=["GET", "POST"])
def interview(doc_id):
    document = get_document(doc_id)
    if not document:
        flash("Document not found.", "danger")
        return redirect(url_for("index"))

    interview_data = None

    if request.method == "POST":
        try:
            num_per_level = int(request.form.get("num_per_level", 3))
        except (TypeError, ValueError):
            num_per_level = 3
        if num_per_level not in (1, 3, 5):
            num_per_level = 3

        filepath = os.path.join(config.UPLOAD_FOLDER, document["filename"])
        text, _ = extract_text(filepath)
        interview_data = llm_service.generate_interview_questions(
            text,
            document["original_name"],
            num_per_level=num_per_level,
        )
        interview_json = json.dumps(interview_data)
        interview_title = (
            f"{interview_data.get('title', 'Interview Questions')} "
            f"({num_per_level} per level)"
        )

        conn = get_connection()
        conn.execute(
            """
            INSERT INTO interview_sets (document_id, title, interview_data, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (doc_id, interview_title, interview_json, now_iso()),
        )
        conn.commit()
        conn.close()

    conn = get_connection()
    interviews = conn.execute(
        "SELECT * FROM interview_sets WHERE document_id = ? ORDER BY created_at DESC",
        (doc_id,),
    ).fetchall()
    conn.close()

    parsed_interviews = []
    for item in interviews:
        row = dict(item)
        try:
            row["parsed"] = json.loads(row["interview_data"])
        except json.JSONDecodeError:
            row["parsed"] = {}
        parsed_interviews.append(row)

    return render_template(
        "interview.html",
        document=document,
        interview_data=interview_data,
        interviews=parsed_interviews,
    )


@app.route("/exam/<int:doc_id>", methods=["GET", "POST"])
def exam(doc_id):
    document = get_document(doc_id)
    if not document:
        flash("Document not found.", "danger")
        return redirect(url_for("index"))

    exam_data = None

    if request.method == "POST":
        difficulty = request.form.get("difficulty", "medium")
        if difficulty not in ("easy", "medium", "hard"):
            difficulty = "medium"

        duration = request.form.get("duration", "3 hours")
        if duration not in ("1 hour", "2 hours", "3 hours"):
            duration = "3 hours"

        try:
            total_marks = int(request.form.get("total_marks", 100))
        except (TypeError, ValueError):
            total_marks = 100
        if total_marks not in (50, 75, 100):
            total_marks = 100

        filepath = os.path.join(config.UPLOAD_FOLDER, document["filename"])
        text, _ = extract_text(filepath)
        exam_data = llm_service.generate_exam_paper(
            text,
            document["original_name"],
            difficulty=difficulty,
            duration=duration,
            total_marks=total_marks,
        )
        exam_json = json.dumps(exam_data)
        difficulty_label = difficulty.capitalize()
        exam_title = (
            f"{exam_data.get('title', 'Exam Paper')} "
            f"({difficulty_label}, {total_marks} marks)"
        )

        conn = get_connection()
        conn.execute(
            """
            INSERT INTO exam_papers (document_id, title, exam_data, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (doc_id, exam_title, exam_json, now_iso()),
        )
        conn.commit()
        conn.close()

    conn = get_connection()
    exams = conn.execute(
        "SELECT * FROM exam_papers WHERE document_id = ? ORDER BY created_at DESC",
        (doc_id,),
    ).fetchall()
    conn.close()

    parsed_exams = []
    for item in exams:
        row = dict(item)
        try:
            row["parsed"] = json.loads(row["exam_data"])
        except json.JSONDecodeError:
            row["parsed"] = {}
        parsed_exams.append(row)

    return render_template(
        "exam.html",
        document=document,
        exam_data=exam_data,
        exams=parsed_exams,
    )


@app.route("/teach/<int:doc_id>", methods=["GET", "POST"])
def teach(doc_id):
    document = get_document(doc_id)
    if not document:
        flash("Document not found.", "danger")
        return redirect(url_for("index"))

    active_session = None

    if request.method == "POST":
        action = request.form.get("action", "reply")

        if action == "start":
            filepath = os.path.join(config.UPLOAD_FOLDER, document["filename"])
            text, _ = extract_text(filepath)
            first_message = llm_service.start_teaching(
                text, document["original_name"]
            )
            messages = [
                {
                    "role": "teacher",
                    "content": first_message,
                    "created_at": now_iso(),
                }
            ]
            topic_context = text[:12000]

            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO teaching_sessions
                (document_id, title, topic_context, messages, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'active', ?, ?)
                """,
                (
                    doc_id,
                    f"Lesson: {document['original_name']}",
                    topic_context,
                    json.dumps(messages),
                    now_iso(),
                    now_iso(),
                ),
            )
            session_id = cursor.lastrowid
            conn.commit()
            conn.close()
            return redirect(url_for("teach", doc_id=doc_id, session_id=session_id))

        if action == "reply":
            session_id = request.form.get("session_id", type=int)
            answer = request.form.get("answer", "").strip()
            if not session_id:
                flash("Session not found.", "danger")
                return redirect(url_for("teach", doc_id=doc_id))
            if not answer:
                flash("Please enter your answer before continuing.", "warning")
                return redirect(url_for("teach", doc_id=doc_id, session_id=session_id))

            session = get_teaching_session(session_id)
            if not session or session["document_id"] != doc_id:
                flash("Session not found.", "danger")
                return redirect(url_for("teach", doc_id=doc_id))

            messages = session["messages"]
            messages.append(
                {"role": "student", "content": answer, "created_at": now_iso()}
            )
            teacher_reply = llm_service.teach_continue(
                session["topic_context"],
                messages[:-1],
                answer,
            )
            messages.append(
                {
                    "role": "teacher",
                    "content": teacher_reply,
                    "created_at": now_iso(),
                }
            )

            conn = get_connection()
            conn.execute(
                """
                UPDATE teaching_sessions
                SET messages = ?, updated_at = ?
                WHERE id = ?
                """,
                (json.dumps(messages), now_iso(), session_id),
            )
            conn.commit()
            conn.close()
            return redirect(url_for("teach", doc_id=doc_id, session_id=session_id))

    session_id = request.args.get("session_id", type=int)
    if session_id:
        active_session = get_teaching_session(session_id)
        if active_session and active_session["document_id"] != doc_id:
            active_session = None

    conn = get_connection()
    sessions = conn.execute(
        """
        SELECT id, title, created_at, updated_at
        FROM teaching_sessions
        WHERE document_id = ?
        ORDER BY updated_at DESC
        """,
        (doc_id,),
    ).fetchall()
    conn.close()

    return render_template(
        "teach.html",
        document=document,
        active_session=active_session,
        sessions=[dict(s) for s in sessions],
    )


@app.route("/settings", methods=["GET", "POST"])
def settings_page():
    advanced_mode = bool(get_setting("advanced_mode_enabled", False))

    if request.method == "POST":
        action = request.form.get("action", "")

        if action == "toggle_advanced":
            new_val = not advanced_mode
            set_setting("advanced_mode_enabled", new_val)
            flash(
                "Advanced mode " + ("enabled" if new_val else "disabled") + ".",
                "success" if new_val else "info",
            )
            return redirect(url_for("settings_page"))

        if action == "save_general":
            default_model = request.form.get("default_model", "").strip()
            if default_model:
                set_setting("default_model", default_model)
            set_setting(
                "enable_opencv_processing",
                bool(request.form.get("enable_opencv_processing")),
            )
            set_setting(
                "max_tokens_per_request",
                request.form.get("max_tokens_per_request", "1024"),
            )
            flash("General settings saved.", "success")
            return redirect(url_for("settings_page"))

    general = {
        "default_model": get_setting("default_model", config.OLLAMA_MODEL),
        "enable_opencv_processing": bool(get_setting("enable_opencv_processing", False)),
        "max_tokens_per_request": get_setting("max_tokens_per_request", "1024"),
    }
    configs = list_api_configs() if advanced_mode else []
    active = get_active_provider()
    return render_template(
        "settings.html",
        advanced_mode=advanced_mode,
        general=general,
        api_configs=configs,
        active_provider=active,
        provider_types=get_provider_types(),
        provider_meta=PROVIDER_TYPES,
        llm_available=llm_service.is_available(),
        current_model=(
            (active.get("model_name") if active else None) or config.OLLAMA_MODEL
        ),
    )


@app.route("/api/settings/advanced", methods=["POST"])
def api_toggle_advanced():
    data = request.get_json(silent=True) or {}
    enabled = bool(data.get("enabled"))
    set_setting("advanced_mode_enabled", enabled)
    return jsonify({"ok": True, "advanced_mode_enabled": enabled})


@app.route("/api/settings/api-configs", methods=["GET"])
def api_list_configs():
    if not bool(get_setting("advanced_mode_enabled", False)):
        return jsonify({"error": "Advanced mode required"}), 403
    return jsonify({"configs": list_api_configs()})


@app.route("/api/settings/api-configs", methods=["POST"])
def api_create_config():
    if not bool(get_setting("advanced_mode_enabled", False)):
        return jsonify({"error": "Advanced mode required"}), 403
    data = request.get_json(silent=True) or {}
    try:
        config_item = create_api_config(data)
        return jsonify({"ok": True, "config": config_item})
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400


@app.route("/api/settings/api-configs/<int:config_id>", methods=["GET"])
def api_get_config(config_id):
    if not bool(get_setting("advanced_mode_enabled", False)):
        return jsonify({"error": "Advanced mode required"}), 403
    cfg = get_api_config(config_id, include_key=False)
    if not cfg:
        return jsonify({"error": "Not found"}), 404
    return jsonify({"config": cfg})


@app.route("/api/settings/api-configs/<int:config_id>", methods=["PUT"])
def api_update_config(config_id):
    if not bool(get_setting("advanced_mode_enabled", False)):
        return jsonify({"error": "Advanced mode required"}), 403
    data = request.get_json(silent=True) or {}
    try:
        cfg = update_api_config(config_id, data)
        return jsonify({"ok": True, "config": cfg})
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400


@app.route("/api/settings/api-configs/<int:config_id>", methods=["DELETE"])
def api_delete_config(config_id):
    if not bool(get_setting("advanced_mode_enabled", False)):
        return jsonify({"error": "Advanced mode required"}), 403
    delete_api_config(config_id)
    return jsonify({"ok": True})


@app.route("/api/settings/api-configs/<int:config_id>/activate", methods=["POST"])
def api_activate_config(config_id):
    if not bool(get_setting("advanced_mode_enabled", False)):
        return jsonify({"error": "Advanced mode required"}), 403
    try:
        set_active_api_config(config_id)
        return jsonify({"ok": True})
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400


@app.route("/api/settings/api-configs/test", methods=["POST"])
def api_test_config():
    if not bool(get_setting("advanced_mode_enabled", False)):
        return jsonify({"error": "Advanced mode required"}), 403
    data = request.get_json(silent=True) or {}
    provider_type = (data.get("provider_type") or "custom").lower()
    api_key = (data.get("api_key") or "").strip()
    base_url = (data.get("base_url") or "").strip().rstrip("/")
    model_name = (data.get("model_name") or "").strip() or None
    result = test_api_connection(provider_type, api_key, base_url, model_name)
    return jsonify(result)


@app.route("/api/settings/validate", methods=["POST"])
def api_validate_inputs():
    data = request.get_json(silent=True) or {}
    response = {}
    provider_type = data.get("provider_type")
    if "api_key" in data and provider_type:
        response["api_key"] = validate_api_key(provider_type, data.get("api_key") or "")
    if "base_url" in data:
        response["base_url"] = validate_url(data.get("base_url") or "")
    return jsonify(response)


@app.route("/dashboard")
def dashboard():
    conn = get_connection()
    documents = conn.execute(
        "SELECT * FROM documents ORDER BY uploaded_at DESC"
    ).fetchall()
    summary_count = conn.execute("SELECT COUNT(*) AS c FROM summaries").fetchone()["c"]
    quiz_count = conn.execute("SELECT COUNT(*) AS c FROM quizzes").fetchone()["c"]
    interview_count = conn.execute("SELECT COUNT(*) AS c FROM interview_sets").fetchone()["c"]
    exam_count = conn.execute("SELECT COUNT(*) AS c FROM exam_papers").fetchone()["c"]
    chat_count = conn.execute("SELECT COUNT(*) AS c FROM chat_history").fetchone()["c"]
    recent_chats = conn.execute(
        """
        SELECT ch.*, d.original_name
        FROM chat_history ch
        LEFT JOIN documents d ON d.id = ch.document_id
        ORDER BY ch.created_at DESC LIMIT 10
        """
    ).fetchall()
    conn.close()

    active = get_active_provider()
    current_model = (active.get("model_name") if active else None) or config.OLLAMA_MODEL

    return render_template(
        "dashboard.html",
        documents=[dict(d) for d in documents],
        summary_count=summary_count,
        quiz_count=quiz_count,
        interview_count=interview_count,
        exam_count=exam_count,
        chat_count=chat_count,
        recent_chats=[dict(c) for c in recent_chats],
        llm_available=llm_service.is_available(),
        model=current_model,
    )


@app.route("/api/models/active", methods=["GET"])
def api_get_active_models():
    """
    Returns list of configured AI models with live connection status.
    Filters/validates so only properly connected models are shown as connected.
    """
    models = get_active_models(validate_connection=True)
    connected = [m for m in models if m["status"] == "connected"]
    return jsonify({
        "ok": True,
        "models": models,
        "connected_models": connected,
        "connected_count": len(connected),
        "total_count": len(models)
    })


@app.route("/api/models/verify", methods=["POST", "GET"])
def api_verify_models():
    """
    Forces a fresh live connectivity verification on all configured models.
    Returns details on active model connections for verification purposes.
    """
    models = get_active_models(validate_connection=True)
    connected = [m for m in models if m["status"] == "connected"]
    disconnected = [m for m in models if m["status"] != "connected"]
    return jsonify({
        "ok": True,
        "verified": True,
        "timestamp": now_iso(),
        "total_models": len(models),
        "connected_count": len(connected),
        "disconnected_count": len(disconnected),
        "models": models,
        "connected_models": connected,
        "disconnected_models": disconnected
    })


# -----------------------------------------------------------------------------
# Online Test Module Routes & REST APIs
# -----------------------------------------------------------------------------
@app.route("/online-test", methods=["GET"], strict_slashes=False)
@app.route("/online-tests", methods=["GET"], strict_slashes=False)
def online_test_hub():
    documents = get_documents()
    tests = list_tests()
    attempts = list_attempt_history()
    return render_template("online_test_list.html", documents=documents, tests=tests, attempts=attempts)


@app.route("/online-test/setup/<int:doc_id>", methods=["GET", "POST"])
def online_test_setup(doc_id):
    document = get_document(doc_id)
    if not document:
        flash("Document not found.", "danger")
        return redirect(url_for("online_test_hub"))

    if request.method == "POST":
        num_questions = int(request.form.get("num_questions", 15))
        time_per_question = int(request.form.get("time_per_question", 30))
        difficulty = request.form.get("difficulty", "mixed")

        try:
            test = generate_rag_test(doc_id, num_questions=num_questions, time_per_question=time_per_question, difficulty=difficulty)
            flash("New Online Test generated successfully!", "success")
            return redirect(url_for("online_test_start_page", test_id=test["id"]))
        except Exception as exc:
            flash(f"Failed to generate test: {exc}", "danger")
            return redirect(url_for("online_test_setup", doc_id=doc_id))

    return render_template("online_test_setup.html", document=document)


@app.route("/online-test/<int:test_id>", methods=["GET"])
def online_test_start_page(test_id):
    test = get_test(test_id)
    if not test:
        flash("Test not found.", "danger")
        return redirect(url_for("online_test_hub"))
    return render_template("online_test_setup.html", test=test, document=get_document(test["document_id"]))


@app.route("/online-test/<int:test_id>/start", methods=["POST"])
def online_test_start_action(test_id):
    time_per_q = request.form.get("time_per_question")
    override_time = int(time_per_q) if time_per_q and time_per_q.isdigit() else None
    try:
        payload = create_test_attempt(test_id, override_time_per_q=override_time)
        return redirect(url_for("online_test_runner", attempt_id=payload["attempt_id"]))
    except Exception as exc:
        flash(f"Could not start attempt: {exc}", "danger")
        return redirect(url_for("online_test_hub"))


@app.route("/online-test/runner/<int:attempt_id>", methods=["GET"])
def online_test_runner(attempt_id):
    payload = get_attempt_runner_payload(attempt_id)
    if not payload:
        flash("Attempt not found.", "danger")
        return redirect(url_for("online_test_hub"))
    if payload.get("status") == "completed":
        return redirect(url_for("online_test_result_page", attempt_id=attempt_id))
    return render_template("online_test_exam.html", attempt=payload)


@app.route("/api/online-test/attempt/<int:attempt_id>/answer", methods=["POST"])
def api_online_test_answer(attempt_id):
    data = request.get_json(silent=True) or {}
    question_id = data.get("question_id")
    selected_option = data.get("selected_option")
    is_marked = bool(data.get("is_marked_for_review"))
    time_taken = int(data.get("time_taken", 0))

    if not question_id:
        return jsonify({"ok": False, "error": "question_id required"}), 400

    success = save_answer(attempt_id, question_id, selected_option, is_marked, time_taken)
    return jsonify({"ok": success})


@app.route("/api/online-test/attempt/<int:attempt_id>/submit", methods=["POST"])
def api_online_test_submit(attempt_id):
    try:
        result = submit_test_attempt(attempt_id)
        return jsonify({"ok": True, "result": result, "redirect": url_for("online_test_result_page", attempt_id=attempt_id)})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400


@app.route("/online-test/result/<int:attempt_id>", methods=["GET"])
def online_test_result_page(attempt_id):
    try:
        res = get_test_result(attempt_id)
        return render_template("online_test_result.html", result=res)
    except Exception as exc:
        flash(f"Could not load result: {exc}", "danger")
        return redirect(url_for("online_test_hub"))


@app.route("/api/online-test/attempt/<int:attempt_id>/analysis", methods=["GET"])
def api_online_test_analysis(attempt_id):
    try:
        res = get_test_result(attempt_id)
        return jsonify({"ok": True, "ai_analysis": res.get("ai_analysis")})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400


def get_viva_session(session_id: int):
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM viva_sessions WHERE id = ?", (session_id,)
    ).fetchone()
    conn.close()
    if not row:
        return None
    item = dict(row)
    try:
        item["questions"] = json.loads(item["questions"])
    except json.JSONDecodeError:
        item["questions"] = []
    try:
        item["replies"] = json.loads(item["replies"])
    except json.JSONDecodeError:
        item["replies"] = []
    return item


@app.route("/viva")
def viva_hub():
    documents = get_documents()
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT vs.*, d.original_name
        FROM viva_sessions vs
        LEFT JOIN documents d ON d.id = vs.document_id
        ORDER BY vs.created_at DESC
        """
    ).fetchall()
    conn.close()
    sessions = []
    for r in rows:
        item = dict(r)
        try:
            item["questions"] = json.loads(item["questions"])
        except json.JSONDecodeError:
            item["questions"] = []
        try:
            item["replies"] = json.loads(item["replies"])
        except json.JSONDecodeError:
            item["replies"] = []
        total_score = sum(rep.get("score", 0) for rep in item["replies"])
        max_score = len(item["questions"]) * 10
        item["total_score"] = total_score
        item["max_score"] = max_score
        sessions.append(item)
    return render_template("viva_list.html", documents=documents, sessions=sessions)


@app.route("/viva/delete/<int:session_id>", methods=["POST"])
def viva_delete(session_id):
    session = get_viva_session(session_id)
    if not session:
        flash("Viva session not found.", "danger")
        return redirect(url_for("viva_hub"))

    conn = get_connection()
    conn.execute("DELETE FROM viva_sessions WHERE id = ?", (session_id,))
    conn.commit()
    conn.close()

    flash("Viva session deleted successfully.", "success")
    return redirect(url_for("viva_hub"))


@app.route("/api/viva/session/<int:session_id>/delete", methods=["POST", "DELETE"])
def api_viva_delete(session_id):
    session = get_viva_session(session_id)
    if not session:
        return jsonify({"ok": False, "error": "Viva session not found"}), 404

    conn = get_connection()
    conn.execute("DELETE FROM viva_sessions WHERE id = ?", (session_id,))
    conn.commit()
    conn.close()

    return jsonify({"ok": True, "redirect": url_for("viva_hub")})


@app.route("/viva/start/<int:doc_id>")
def viva_start(doc_id):
    document = get_document(doc_id)
    if not document:
        flash("Document not found.", "danger")
        return redirect(url_for("viva_hub"))
    
    filepath = os.path.join(config.UPLOAD_FOLDER, document["filename"])
    text, _ = extract_text(filepath)
    try:
        viva_data = llm_service.generate_viva_questions(text, document["original_name"])
        questions = viva_data.get("questions", [])
        if not questions:
            flash("Failed to generate questions. Check if LLM provider is connected.", "danger")
            return redirect(url_for("viva_hub"))
        
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO viva_sessions (document_id, student_name, questions, current_question_index, replies, status, created_at)
            VALUES (?, NULL, ?, -1, '[]', 'active', ?)
            """,
            (doc_id, json.dumps(questions), now_iso())
        )
        session_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return redirect(url_for("viva_session_page", session_id=session_id))
    except Exception as exc:
        flash(f"Error starting Viva session: {exc}", "danger")
        return redirect(url_for("viva_hub"))


@app.route("/viva/session/<int:session_id>")
def viva_session_page(session_id):
    session = get_viva_session(session_id)
    if not session:
        flash("Viva session not found.", "danger")
        return redirect(url_for("viva_hub"))
    
    document = get_document(session["document_id"])
    return render_template("viva_session.html", session=session, document=document)


@app.route("/api/viva/session/<int:session_id>/reply", methods=["POST"])
def api_viva_reply(session_id):
    session = get_viva_session(session_id)
    if not session:
        return jsonify({"ok": False, "error": "Session not found"}), 404
    
    if session["status"] == "completed":
        return jsonify({"ok": False, "error": "Session already completed"}), 400

    data = request.get_json(silent=True) or {}
    text_input = (data.get("reply") or "").strip()

    if not text_input:
        return jsonify({"ok": False, "error": "Reply text is required"}), 400

    conn = get_connection()
    
    if session["current_question_index"] == -1:
        student_name = text_input
        for phrase in ["my name is ", "i am ", "myself "]:
            if student_name.lower().startswith(phrase):
                student_name = student_name[len(phrase):].strip()
        
        student_name = student_name.capitalize()
        first_q = session["questions"][0]["question"]
        bot_response = f"Welcome {student_name}! Let's begin the Viva. I'll ask you {len(session['questions'])} questions based on the document. Here is the first question: {first_q}"
        
        conn.execute(
            """
            UPDATE viva_sessions
            SET student_name = ?, current_question_index = 0
            WHERE id = ?
            """,
            (student_name, session_id)
        )
        conn.commit()
        conn.close()
        
        return jsonify({
            "ok": True,
            "phase": "questioning",
            "student_name": student_name,
            "current_question_index": 0,
            "bot_response": bot_response,
            "question": first_q,
            "is_last": len(session["questions"]) == 1
        })
        
    current_idx = session["current_question_index"]
    questions_list = session["questions"]
    current_q_data = questions_list[current_idx]
    
    eval_result = llm_service.evaluate_viva_answer(
        question=current_q_data["question"],
        ideal_answer=current_q_data["ideal_answer"],
        student_answer=text_input
    )
    
    replies = session["replies"]
    replies.append({
        "question_idx": current_idx,
        "question": current_q_data["question"],
        "ideal_answer": current_q_data["ideal_answer"],
        "student_reply": text_input,
        "score": eval_result.get("score", 5),
        "feedback": eval_result.get("feedback", "Response recorded."),
        "explanation": eval_result.get("explanation", "")
    })
    
    next_idx = current_idx + 1
    is_completed = next_idx >= len(questions_list)
    
    if is_completed:
        total_score = sum(rep["score"] for rep in replies)
        max_score = len(questions_list) * 10
        percentage = (total_score / max_score) * 100
        
        bot_response = (
            f"{eval_result.get('bot_response', 'Thank you.')} "
            f"That concludes our Viva session! You scored {total_score} out of {max_score} ({percentage:.1f}%). "
            "I'm now generating your review scorecard. Click 'View Scorecard' to see a detailed breakdown."
        )
        
        conn.execute(
            """
            UPDATE viva_sessions
            SET replies = ?, status = 'completed'
            WHERE id = ?
            """,
            (json.dumps(replies), session_id)
        )
    else:
        next_q = questions_list[next_idx]["question"]
        bot_response = (
            f"{eval_result.get('bot_response', 'Good.')} "
            f"Here is your next question: {next_q}"
        )
        
        conn.execute(
            """
            UPDATE viva_sessions
            SET replies = ?, current_question_index = ?
            WHERE id = ?
            """,
            (json.dumps(replies), next_idx, session_id)
        )
        
    conn.commit()
    conn.close()
    
    return jsonify({
        "ok": True,
        "phase": "completed" if is_completed else "questioning",
        "current_question_index": next_idx,
        "bot_response": bot_response,
        "question": None if is_completed else questions_list[next_idx]["question"],
        "is_last": next_idx == len(questions_list) - 1,
        "evaluation": eval_result,
        "redirect_url": url_for("viva_review_page", session_id=session_id) if is_completed else None
    })


@app.route("/viva/review/<int:session_id>")
def viva_review_page(session_id):
    session = get_viva_session(session_id)
    if not session:
        flash("Viva session not found.", "danger")
        return redirect(url_for("viva_hub"))
    
    document = get_document(session["document_id"])
    total_score = sum(rep.get("score", 0) for rep in session["replies"])
    max_score = len(session["questions"]) * 10
    percentage = (total_score / max_score) * 100 if max_score > 0 else 0
    
    if percentage >= 90:
        perf_label = "Excellent"
        perf_class = "text-success"
    elif percentage >= 75:
        perf_label = "Very Good"
        perf_class = "text-primary"
    elif percentage >= 50:
        perf_label = "Good"
        perf_class = "text-warning"
    else:
        perf_label = "Needs Improvement"
        perf_class = "text-danger"

    stats = {
        "total_score": total_score,
        "max_score": max_score,
        "percentage": round(percentage, 1),
        "perf_label": perf_label,
        "perf_class": perf_class
    }
    
    return render_template("viva_review.html", session=session, document=document, stats=stats)


@app.route("/api/health")
def health():
    return jsonify(
        {
            "status": "ok",
            "llm_available": llm_service.is_available(),
            "models": llm_service.list_models(),
            "embedding_model": config.EMBEDDING_MODEL,
        }
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)



