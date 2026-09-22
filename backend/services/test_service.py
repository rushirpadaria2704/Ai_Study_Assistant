import json
import os
import random
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import config
from models.database import get_connection, now_iso
from services.pdf_processor import extract_text
from services.rag_engine import llm_service, rag_engine


def _extract_key_concepts(text: str, max_items: int = 60) -> List[str]:
    bullets = re.findall(r"[•\-\*]\s+([^\n]{3,120})", text)
    sentences = re.split(r"(?<=[.!?])\s+", text)
    key_sents = [s.strip() for s in sentences if 15 <= len(s.strip()) <= 180]
    concept_lines = re.findall(r"^[A-Z][^\n]{5,140}[:\?]?$", text, flags=re.MULTILINE)
    combined = []
    seen = set()
    for item in bullets + key_sents + concept_lines:
        item = re.sub(r"\s+", " ", item.strip().rstrip("."))
        if len(item) < 8 or len(item) > 160:
            continue
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        combined.append(item)
        if len(combined) >= max_items:
            break
    return combined


def _extract_terms_and_definitions(text: str) -> List[Tuple[str, str]]:
    pairs = []
    skip_def_patterns = re.compile(r"(page\s*\d+|=====|contents?|introduction|examples?|use cases?|regression)", re.IGNORECASE)
    for m in re.finditer(r"([A-Za-z][A-Za-z0-9\s\-]{2,40}?)\s*[:=]\s*([^\n.]{5,200})", text):
        term = m.group(1).strip()
        definition = m.group(2).strip().rstrip(".")
        if 2 <= len(term) <= 40 and 10 <= len(definition) <= 200:
            if skip_def_patterns.search(definition) or skip_def_patterns.search(term):
                continue
            pairs.append((term, definition))
    bullet_defs = re.findall(r"[•\-\*]\s*([A-Z][^\n:]{2,40}?):\s*([^\n]{10,200})", text)
    for term, definition in bullet_defs:
        term = term.strip()
        definition = definition.strip().rstrip(".")
        if 2 <= len(term) <= 40 and 10 <= len(definition) <= 200:
            if skip_def_patterns.search(definition) or skip_def_patterns.search(term):
                continue
            pairs.append((term, definition))
    return pairs[:30]


def _build_distractors(correct: str, all_concepts: List[str], count: int = 3) -> List[str]:
    distractors = []
    pool = [c for c in all_concepts if c.lower() != correct.lower()]
    random.shuffle(pool)
    for item in pool:
        if len(distractors) >= count:
            break
        if item not in distractors and len(item) >= 6:
            distractors.append(item)
    fallback_bank = [
        "A supervised clustering technique",
        "An unsupervised classification method",
        "A data preprocessing algorithm",
        "A dimensionality reduction approach",
        "A categorical label encoder",
        "A feature selection routine",
        "A cross-validation procedure",
        "A hyperparameter tuning strategy",
    ]
    while len(distractors) < count:
        for fb in fallback_bank:
            if fb not in distractors:
                distractors.append(fb)
                if len(distractors) >= count:
                    break
        if len(distractors) >= count:
            break
    return distractors[:count]


def _build_prediction_kb_questions() -> List[Dict[str, Any]]:
    return [
        {
            "question": "What does Prediction model in data analysis?",
            "options": [
                "Continuous-valued functions or ordered values",
                "Categorical class labels only",
                "Discrete nominal classes",
                "Clusters of unlabeled data",
            ],
            "correct_answer": "Continuous-valued functions or ordered values",
            "explanation": "Prediction models continuous-valued functions, whereas classification predicts categorical class labels.",
            "difficulty": "easy",
        },
        {
            "question": "Which of the following is a typical use case of Prediction (numeric prediction)?",
            "options": [
                "Predicting how much a customer will spend during a sale",
                "Classifying a loan applicant as risky or safe",
                "Diagnosing a disease as present or absent",
                "Labeling an email as spam or not spam",
            ],
            "correct_answer": "Predicting how much a customer will spend during a sale",
            "explanation": "Predicting a numeric value such as customer spending is an example of numeric prediction.",
            "difficulty": "easy",
        },
        {
            "question": "Classification predicts _______ whereas Prediction predicts _______.",
            "options": [
                "categorical class labels; continuous-valued functions",
                "continuous values; discrete nominal labels",
                "missing data; complete data",
                "clusters; regression trees only",
            ],
            "correct_answer": "categorical class labels; continuous-valued functions",
            "explanation": "Classification outputs categorical labels, prediction outputs continuous or ordered values.",
            "difficulty": "medium",
        },
        {
            "question": "What is the major method used for Prediction?",
            "options": [
                "Regression analysis",
                "Apriori algorithm",
                "K-means clustering",
                "Association rule mining",
            ],
            "correct_answer": "Regression analysis",
            "explanation": "Regression is the major prediction method that models relationships between independent and dependent variables.",
            "difficulty": "easy",
        },
        {
            "question": "In Simple Linear Regression, what is the correct model form?",
            "options": [
                "y = β₀ + Xβ₁",
                "y = β₀ * Xβ₁",
                "y = β₀ - Xβ₁",
                "y = (β₀ + X) / β₁",
            ],
            "correct_answer": "y = β₀ + Xβ₁",
            "explanation": "Simple linear regression uses y = β₀ + Xβ₁ where β₀ is the intercept and β₁ is the slope coefficient.",
            "difficulty": "medium",
        },
        {
            "question": "In the simple linear regression formula y = β₀ + Xβ₁, what does β₀ represent?",
            "options": [
                "The intercept — value of y when X equals 0",
                "The slope of the regression line",
                "The coefficient for the feature X",
                "The residual sum of squares",
            ],
            "correct_answer": "The intercept — value of y when X equals 0",
            "explanation": "β₀ is the intercept: the predicted value of the response y when the feature X is zero.",
            "difficulty": "medium",
        },
        {
            "question": "What does β₁ (beta-1) represent in the linear regression model?",
            "options": [
                "The slope — change in y divided by change in X",
                "The value of y when X equals zero",
                "The sum of squared residuals",
                "The coefficient of determination R²",
            ],
            "correct_answer": "The slope — change in y divided by change in X",
            "explanation": "β₁ is the slope coefficient describing how much y changes per unit change in X.",
            "difficulty": "medium",
        },
        {
            "question": "What criterion is generally used to estimate regression coefficients?",
            "options": [
                "Least squares — minimize sum of squared residuals",
                "Maximum likelihood clustering",
                "Principal component analysis",
                "Gini impurity minimization",
            ],
            "correct_answer": "Least squares — minimize sum of squared residuals",
            "explanation": "Coefficients are estimated by the least squares criterion, minimizing the sum of squared errors.",
            "difficulty": "medium",
        },
        {
            "question": "Which of the following is a use case of regression analysis?",
            "options": [
                "Forecasting the effect of advertisement spending on sales",
                "Assigning records to pre-defined clusters",
                "Finding frequent itemsets in transactions",
                "Reducing the number of features via PCA",
            ],
            "correct_answer": "Forecasting the effect of advertisement spending on sales",
            "explanation": "Regression is used to forecast effects, determine predictor strength, and evaluate trend impacts.",
            "difficulty": "easy",
        },
        {
            "question": "What type of variable does Linear Regression predict?",
            "options": [
                "Continuous variables such as sales or temperature",
                "Categorical labels like Yes/No",
                "Nominal classes without order",
                "Binary cluster assignments only",
            ],
            "correct_answer": "Continuous variables such as sales or temperature",
            "explanation": "Linear regression predicts continuous, quantitative response variables.",
            "difficulty": "easy",
        },
        {
            "question": "What is the equation of a Positive Linear Regression line?",
            "options": [
                "Y = mX + c",
                "Y = -mX + c",
                "Y = mX * c",
                "Y = (m + X) / c",
            ],
            "correct_answer": "Y = mX + c",
            "explanation": "A positive linear regression line is written Y = mX + c with positive slope m.",
            "difficulty": "medium",
        },
        {
            "question": "What is the equation of a Negative Linear Regression line?",
            "options": [
                "Y = -mX + c",
                "Y = mX + c",
                "Y = mX * c",
                "Y = cX - m",
            ],
            "correct_answer": "Y = -mX + c",
            "explanation": "A negative linear regression line uses Y = -mX + c with a negative slope coefficient.",
            "difficulty": "medium",
        },
        {
            "question": "What does R-squared (R²) indicate in regression?",
            "options": [
                "How well the model captures variance — higher R² means a better model",
                "The statistical significance of predictors",
                "The total number of features in the model",
                "The average residual magnitude",
            ],
            "correct_answer": "How well the model captures variance — higher R² means a better model",
            "explanation": "R² measures the proportion of variance explained; higher values indicate a better fitting model.",
            "difficulty": "medium",
        },
        {
            "question": "How is Sum of Squared Error (SSE) defined?",
            "options": [
                "Σ (predicted − actual)²",
                "Σ (average − actual)²",
                "SST − SSR",
                "SSR / SST",
            ],
            "correct_answer": "Σ (predicted − actual)²",
            "explanation": "SSE (Sum of Squared Errors) is the sum over all observations of (predicted minus actual) squared.",
            "difficulty": "hard",
        },
        {
            "question": "How is R² (R-squared) computed?",
            "options": [
                "SSR divided by SST",
                "SSE divided by SST",
                "SST minus SSR",
                "SST plus SSE",
            ],
            "correct_answer": "SSR divided by SST",
            "explanation": "R² is calculated as the ratio SSR / SST (Regression Sum of Squares / Total Sum of Squares).",
            "difficulty": "hard",
        },
        {
            "question": "Sum of Squares Regression (SSR) equals:",
            "options": [
                "SST − SSE",
                "SSE − SST",
                "SST + SSE",
                "SSE / SST",
            ],
            "correct_answer": "SST − SSE",
            "explanation": "SSR (Regression sum of squares) is the Total sum of squares minus the Error sum of squares.",
            "difficulty": "hard",
        },
        {
            "question": "What does SST (Total Sum of Squares) measure?",
            "options": [
                "Σ (average value − actual value)²",
                "Σ (predicted − actual)²",
                "SSE − SSR",
                "SSR / SSE",
            ],
            "correct_answer": "Σ (average value − actual value)²",
            "explanation": "SST is the total variation around the mean: sum of (average minus actual) squared for all observations.",
            "difficulty": "hard",
        },
        {
            "question": "Given linear regression Y = a + Bx, what is the predicted y for x=10 when a=1.5 and B=0.95?",
            "options": [
                "11",
                "10",
                "9.5",
                "1.5",
            ],
            "correct_answer": "11",
            "explanation": "y = 1.5 + 0.95(10) = 1.5 + 9.5 = 11.",
            "difficulty": "medium",
        },
        {
            "question": "Which of the following is NOT a typical regression application?",
            "options": [
                "Finding frequent itemsets in market baskets",
                "Determining the strength of predictors like age and income",
                "Forecasting trends such as sales over time",
                "Assessing risk in financial services",
            ],
            "correct_answer": "Finding frequent itemsets in market baskets",
            "explanation": "Frequent itemset mining is an association rule task, not a regression application.",
            "difficulty": "medium",
        },
        {
            "question": "For better predictions with Linear Regression, what should be done with outliers?",
            "options": [
                "Outliers should be removed",
                "Outliers must be multiplied by the slope",
                "Outliers should replace the intercept",
                "Outliers improve fit so they are kept always",
            ],
            "correct_answer": "Outliers should be removed",
            "explanation": "Removing outliers generally improves the fit and prediction quality of a linear regression model.",
            "difficulty": "easy",
        },
    ]


def _generate_content_based_mcqs(text: str, count: int, default_topic: str) -> List[Dict[str, Any]]:
    kb = _build_prediction_kb_questions()
    text_lower = text.lower()
    use_kb = any(w in text_lower for w in ["prediction", "regression", "classification", "r-squared", "linear regression"])
    if use_kb:
        random.shuffle(kb)
        base = kb[:]
    else:
        base = []

    concept_lines = _extract_key_concepts(text)
    term_defs = _extract_terms_and_definitions(text)

    def _opt_pool(exclude: str) -> List[str]:
        opts = [c for c in concept_lines if c.lower() != exclude.lower()]
        random.shuffle(opts)
        return opts

    def _q_from_def(term: str, definition: str) -> Dict[str, Any]:
        correct = definition[:140]
        distractors = _build_distractors(correct, concept_lines, 3)
        options = [correct] + distractors
        random.shuffle(options)
        return {
            "question": f"Which best describes the term '{term}'?",
            "options": options,
            "correct_answer": correct,
            "explanation": f"'{term}' is defined as: {correct}.",
            "difficulty": "medium",
        }

    def _q_from_concept(concept: str, idx: int) -> Dict[str, Any]:
        stem = concept[:120]
        correct = "A core concept described in the study notes"
        distractors = [
            "An unrelated preprocessing step",
            "A clustering algorithm only",
            "A data visualization technique",
            "A database indexing method",
            "A network routing protocol",
        ]
        pool = distractors + [c for c in concept_lines if c.lower() != stem.lower()][:6]
        random.shuffle(pool)
        wrongs = pool[:3]
        options = [stem] + wrongs
        random.shuffle(options)
        return {
            "question": f"According to the notes, which statement reflects the topic: {stem[:80]}?",
            "options": options,
            "correct_answer": stem,
            "explanation": f"This concept is highlighted in the study material for {default_topic}.",
            "difficulty": "medium",
        }

    for term, definition in term_defs:
        if len(base) >= count * 2:
            break
        try:
            base.append(_q_from_def(term, definition))
        except Exception:
            pass

    for idx, concept in enumerate(concept_lines):
        if len(base) >= count * 2:
            break
        try:
            base.append(_q_from_concept(concept, idx))
        except Exception:
            pass

    random.shuffle(base)
    seen_q = set()
    unique = []
    for q in base:
        key = q["question"].lower()[:80]
        if key in seen_q:
            continue
        seen_q.add(key)
        unique.append(q)
        if len(unique) >= count:
            break

    while len(unique) < count:
        idx = len(unique) + 1
        stem_candidates = concept_lines[idx:] + concept_lines[:idx]
        correct = stem_candidates[0] if stem_candidates else f"Core concept #{idx} from {default_topic}"
        distractors = _build_distractors(correct, concept_lines, 3)
        options = [correct] + distractors
        random.shuffle(options)
        unique.append({
            "question": f"Key Concept Review Question #{idx} regarding {default_topic}?",
            "options": options,
            "correct_answer": correct,
            "explanation": f"This question reinforces core principles of {default_topic} from the uploaded notes.",
            "difficulty": "medium",
        })

    return unique[:count]


def generate_rag_test(
    document_id: int,
    num_questions: int = 15,
    time_per_question: int = 30,
    difficulty: str = "mixed",
) -> Dict[str, Any]:
    conn = get_connection()
    doc_row = conn.execute("SELECT * FROM documents WHERE id = ?", (document_id,)).fetchone()
    conn.close()
    if not doc_row:
        raise ValueError(f"Document with ID {document_id} not found.")

    doc = dict(doc_row)
    filepath = os.path.join(config.UPLOAD_FOLDER, doc["filename"])
    text, _ = extract_text(filepath)
    if not text or not text.strip():
        raise ValueError("Could not extract text from document for test generation.")

    # Fast RAG Chunk Retrieval via FAISS
    chunks = rag_engine.retrieve(document_id, "key concepts definitions overview facts principles", k=6)
    if chunks:
        excerpt = "\n\n".join(f"- Chunk {i+1}: {c}" for i, c in enumerate(chunks[:6]))
    else:
        excerpt = text[:8000]

    system_prompt = (
        "You are an expert examiner. Generate multiple-choice questions based ONLY on the provided notes. "
        "Output valid JSON only."
    )

    user_prompt = (
        f"Document Title: '{doc['original_name']}'\n"
        f"Generate exactly {num_questions} Multiple-Choice Questions (MCQs) from this text.\n"
        f"Target Difficulty: {difficulty}\n\n"
        "JSON SCHEMA:\n"
        "{\n"
        '  "questions": [\n'
        "    {\n"
        '      "question": "Factual question?",\n'
        '      "options": ["Option A", "Option B", "Option C", "Option D"],\n'
        '      "correct_answer": "Option A",\n'
        '      "explanation": "Short 1-sentence rationale based on notes.",\n'
        '      "difficulty": "medium"\n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        "RULES:\n"
        "1. Return EXACTLY 4 options per question.\n"
        "2. 'correct_answer' must match one option string exactly.\n"
        "3. Keep explanations brief (1 short sentence) for maximum speed.\n\n"
        f"Context Chunks:\n{excerpt}"
    )

    num_predict = min(3072, 180 * num_questions + 400)
    raw_response = llm_service._generate_with_options(
        user_prompt, system=system_prompt, num_predict=num_predict, json_mode=True, temperature=0.1
    )

    parsed = _parse_and_validate_questions(raw_response, doc["original_name"], num_questions, text)

    questions = parsed["questions"]
    title = f"{doc['original_name']} - {num_questions} Q Online Test"
    topic = doc["original_name"]

    total_time = num_questions * time_per_question

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO tests
        (document_id, title, topic, total_questions, time_per_question, total_time, difficulty, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            document_id,
            title,
            topic,
            len(questions),
            time_per_question,
            total_time,
            difficulty,
            now_iso(),
        ),
    )
    test_id = cursor.lastrowid

    for idx, q in enumerate(questions, start=1):
        opts = q["options"]
        cursor.execute(
            """
            INSERT INTO test_questions
            (test_id, question_number, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, difficulty, source_chunk_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                test_id,
                idx,
                q["question"],
                opts[0],
                opts[1],
                opts[2],
                opts[3],
                q["correct_answer"],
                q.get("explanation", "Grounded in study material."),
                q.get("difficulty", "medium"),
                str(document_id),
            ),
        )

    conn.commit()
    conn.close()

    return get_test(test_id)


def _parse_and_validate_questions(raw: str, default_topic: str, expected_count: int, text: str = "") -> Dict[str, Any]:
    data = None
    if raw and not raw.startswith("Local LLM is unavailable"):
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            cleaned = raw.strip()
            if "```json" in cleaned:
                cleaned = cleaned.split("```json")[1].split("```")[0].strip()
            elif "```" in cleaned:
                cleaned = cleaned.split("```")[1].split("```")[0].strip()
            s_idx = cleaned.find("{")
            e_idx = cleaned.rfind("}")
            if s_idx != -1 and e_idx != -1:
                try:
                    data = json.loads(cleaned[s_idx : e_idx + 1])
                except json.JSONDecodeError:
                    data = None

    valid_questions = []
    if data and isinstance(data, dict) and "questions" in data and isinstance(data["questions"], list):
        for item in data["questions"]:
            if not isinstance(item, dict):
                continue
            q_text = (item.get("question") or "").strip()
            opts = item.get("options") or []
            ans = (item.get("correct_answer") or "").strip()
            expl = (item.get("explanation") or "").strip()
            diff = (item.get("difficulty") or "medium").lower()

            if not q_text or len(opts) < 2:
                continue

            cleaned_opts = [str(o).strip() for o in opts if str(o).strip()]
            while len(cleaned_opts) < 4:
                cleaned_opts.append(f"Option {len(cleaned_opts) + 1}")

            cleaned_opts = cleaned_opts[:4]

            if ans not in cleaned_opts:
                match = None
                for o in cleaned_opts:
                    if ans.lower() in o.lower() or o.lower() in ans.lower():
                        match = o
                        break
                ans = match if match else cleaned_opts[0]

            valid_questions.append(
                {
                    "question": q_text,
                    "options": cleaned_opts,
                    "correct_answer": ans,
                    "explanation": expl or "Factual concept from uploaded notes.",
                    "difficulty": diff if diff in ("easy", "medium", "hard") else "medium",
                }
            )

    if len(valid_questions) < expected_count:
        still_needed = expected_count - len(valid_questions)
        try:
            content_mcqs = _generate_content_based_mcqs(text or default_topic, still_needed, default_topic)
            valid_questions.extend(content_mcqs[:still_needed])
        except Exception:
            pass

    while len(valid_questions) < expected_count:
        idx = len(valid_questions) + 1
        fallback_text = text if text and len(text) >= 100 else f"Key concept from {default_topic}"
        stem_options = _extract_key_concepts(fallback_text, max_items=40)
        correct = stem_options[idx % len(stem_options)] if stem_options else f"Core factual statement {idx}.A"
        distractors = _build_distractors(correct, stem_options, 3)
        options = [correct] + distractors
        random.shuffle(options)
        valid_questions.append(
            {
                "question": f"Key Concept Review Question #{idx} regarding {default_topic}?",
                "options": options,
                "correct_answer": correct,
                "explanation": f"This question reinforces core principles of {default_topic} from notes.",
                "difficulty": "medium",
            }
        )

    return {"questions": valid_questions[:expected_count]}


def get_test(test_id: int) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    row = conn.execute("SELECT * FROM tests WHERE id = ?", (test_id,)).fetchone()
    if not row:
        conn.close()
        return None

    test_dict = dict(row)
    q_rows = conn.execute(
        "SELECT * FROM test_questions WHERE test_id = ? ORDER BY question_number ASC",
        (test_id,),
    ).fetchall()
    conn.close()

    test_dict["questions"] = [dict(r) for r in q_rows]
    return test_dict


def list_tests() -> List[Dict[str, Any]]:
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT t.*, d.original_name
        FROM tests t
        LEFT JOIN documents d ON d.id = t.document_id
        ORDER BY t.created_at DESC
        """
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_test_attempt(test_id: int, override_time_per_q: Optional[int] = None) -> Dict[str, Any]:
    test = get_test(test_id)
    if not test:
        raise ValueError(f"Test {test_id} not found.")

    questions = test["questions"]
    if not questions:
        raise ValueError(f"Test {test_id} has no questions.")

    time_per_q = override_time_per_q if override_time_per_q and override_time_per_q > 0 else test["time_per_question"]
    total_time = time_per_q * len(questions)

    q_order = [q["id"] for q in questions]
    random.shuffle(q_order)

    option_orders = {}
    for q in questions:
        opts = [q["option_a"], q["option_b"], q["option_c"], q["option_d"]]
        random.shuffle(opts)
        option_orders[str(q["id"])] = opts

    started_at = now_iso()

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO test_attempts
        (test_id, title, topic, total_questions, time_per_question, total_time, started_at, status, question_order, option_orders)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'in_progress', ?, ?)
        """,
        (
            test_id,
            test["title"],
            test["topic"],
            len(questions),
            time_per_q,
            total_time,
            started_at,
            json.dumps(q_order),
            json.dumps(option_orders),
        ),
    )
    attempt_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return get_attempt_runner_payload(attempt_id)


def get_attempt_runner_payload(attempt_id: int) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    att_row = conn.execute("SELECT * FROM test_attempts WHERE id = ?", (attempt_id,)).fetchone()
    if not att_row:
        conn.close()
        return None

    att = dict(att_row)
    if att["status"] == "completed":
        conn.close()
        return {"id": attempt_id, "status": "completed"}

    q_order = json.loads(att["question_order"])
    option_orders = json.loads(att["option_orders"])

    placeholders = ",".join("?" for _ in q_order)
    q_rows = conn.execute(
        f"SELECT * FROM test_questions WHERE id IN ({placeholders})", q_order
    ).fetchall()

    q_map = {r["id"]: dict(r) for r in q_rows}

    ans_rows = conn.execute(
        "SELECT * FROM test_answers WHERE attempt_id = ?", (attempt_id,)
    ).fetchall()
    saved_answers = {
        r["question_id"]: {
            "selected_option": r["selected_option"],
            "is_marked_for_review": bool(r["is_marked_for_review"]),
        }
        for r in ans_rows
    }
    conn.close()

    client_questions = []
    for idx, q_id in enumerate(q_order, start=1):
        q_data = q_map.get(q_id)
        if not q_data:
            continue

        shuffled_opts = option_orders.get(str(q_id), [q_data["option_a"], q_data["option_b"], q_data["option_c"], q_data["option_d"]])
        saved = saved_answers.get(q_id, {})

        client_questions.append(
            {
                "id": q_id,
                "question_index": idx,
                "question_text": q_data["question_text"],
                "options": shuffled_opts,
                "difficulty": q_data["difficulty"],
                "selected_option": saved.get("selected_option"),
                "is_marked_for_review": saved.get("is_marked_for_review", False),
            }
        )

    started_dt = datetime.strptime(att["started_at"], "%Y-%m-%d %H:%M:%S")
    elapsed_seconds = int((datetime.utcnow() - started_dt).total_seconds())

    return {
        "attempt_id": attempt_id,
        "test_id": att["test_id"],
        "title": att["title"],
        "topic": att["topic"],
        "total_questions": att["total_questions"],
        "time_per_question": att["time_per_question"],
        "total_time": att["total_time"],
        "started_at": att["started_at"],
        "elapsed_seconds": max(0, elapsed_seconds),
        "status": att["status"],
        "questions": client_questions,
    }


def save_answer(attempt_id: int, question_id: int, selected_option: Optional[str], is_marked: bool = False, time_taken: int = 0) -> bool:
    conn = get_connection()
    att = conn.execute("SELECT status FROM test_attempts WHERE id = ?", (attempt_id,)).fetchone()
    if not att or att["status"] == "completed":
        conn.close()
        return False

    q_row = conn.execute("SELECT correct_option FROM test_questions WHERE id = ?", (question_id,)).fetchone()
    if not q_row:
        conn.close()
        return False

    correct_opt = q_row["correct_option"]
    clean_sel = (selected_option or "").strip()
    clean_correct = correct_opt.strip()

    is_correct = 1 if (clean_sel and (clean_sel == clean_correct or clean_sel.lower() in clean_correct.lower() or clean_correct.lower() in clean_sel.lower())) else 0

    existing = conn.execute(
        "SELECT id FROM test_answers WHERE attempt_id = ? AND question_id = ?",
        (attempt_id, question_id),
    ).fetchone()

    cursor = conn.cursor()
    if existing:
        cursor.execute(
            """
            UPDATE test_answers
            SET selected_option = ?, correct_option = ?, is_correct = ?, time_taken = ?, is_marked_for_review = ?
            WHERE id = ?
            """,
            (selected_option, correct_opt, is_correct, time_taken, 1 if is_marked else 0, existing["id"]),
        )
    else:
        cursor.execute(
            """
            INSERT INTO test_answers
            (attempt_id, question_id, question_index, selected_option, correct_option, is_correct, time_taken, is_marked_for_review)
            VALUES (?, ?, 0, ?, ?, ?, ?, ?)
            """,
            (attempt_id, question_id, selected_option, correct_opt, is_correct, time_taken, 1 if is_marked else 0),
        )

    conn.commit()
    conn.close()
    return True


def submit_test_attempt(attempt_id: int) -> Dict[str, Any]:
    conn = get_connection()
    att_row = conn.execute("SELECT * FROM test_attempts WHERE id = ?", (attempt_id,)).fetchone()
    if not att_row:
        conn.close()
        raise ValueError(f"Attempt {attempt_id} not found.")

    att = dict(att_row)
    if att["status"] == "completed":
        conn.close()
        return get_test_result(attempt_id)

    q_order = json.loads(att["question_order"])
    total_q = len(q_order)

    ans_rows = conn.execute(
        "SELECT * FROM test_answers WHERE attempt_id = ?", (attempt_id,)
    ).fetchall()
    ans_map = {r["question_id"]: dict(r) for r in ans_rows}

    q_rows = conn.execute(
        f"SELECT * FROM test_questions WHERE id IN ({','.join('?' for _ in q_order)})", q_order
    ).fetchall()
    q_map = {r["id"]: dict(r) for r in q_rows}

    correct_count = 0
    wrong_count = 0
    unanswered_count = 0

    for q_id in q_order:
        ans = ans_map.get(q_id)
        q_data = q_map.get(q_id)

        if not ans or not ans.get("selected_option"):
            unanswered_count += 1
        else:
            sel = ans["selected_option"].strip()
            corr = q_data["correct_option"].strip() if q_data else ""
            if sel == corr or sel.lower() in corr.lower() or corr.lower() in sel.lower():
                correct_count += 1
            else:
                wrong_count += 1

    percentage = round((correct_count / total_q) * 100.0, 2) if total_q > 0 else 0.0

    started_dt = datetime.strptime(att["started_at"], "%Y-%m-%d %H:%M:%S")
    submitted_at = now_iso()
    sub_dt = datetime.strptime(submitted_at, "%Y-%m-%d %H:%M:%S")
    time_taken = max(1, int((sub_dt - started_dt).total_seconds()))

    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE test_attempts
        SET score = ?, correct_answers = ?, wrong_answers = ?, unanswered = ?,
            percentage = ?, time_taken = ?, submitted_at = ?, status = 'completed'
        WHERE id = ?
        """,
        (
            correct_count,
            correct_count,
            wrong_count,
            unanswered_count,
            percentage,
            time_taken,
            submitted_at,
            attempt_id,
        ),
    )
    conn.commit()
    conn.close()

    _generate_ai_analysis_async(attempt_id)

    return get_test_result(attempt_id)


def get_test_result(attempt_id: int) -> Dict[str, Any]:
    conn = get_connection()
    att_row = conn.execute("SELECT * FROM test_attempts WHERE id = ?", (attempt_id,)).fetchone()
    if not att_row:
        conn.close()
        raise ValueError(f"Attempt {attempt_id} not found.")

    att = dict(att_row)
    q_order = json.loads(att["question_order"])
    option_orders = json.loads(att["option_orders"])

    placeholders = ",".join("?" for _ in q_order)
    q_rows = conn.execute(
        f"SELECT * FROM test_questions WHERE id IN ({placeholders})", q_order
    ).fetchall()
    q_map = {r["id"]: dict(r) for r in q_rows}

    ans_rows = conn.execute(
        "SELECT * FROM test_answers WHERE attempt_id = ?", (attempt_id,)
    ).fetchall()
    ans_map = {r["question_id"]: dict(r) for r in ans_rows}
    conn.close()

    detailed_review = []
    question_times = []

    for idx, q_id in enumerate(q_order, start=1):
        q_data = q_map.get(q_id, {})
        ans = ans_map.get(q_id, {})

        sel = ans.get("selected_option")
        corr = q_data.get("correct_option", "")

        is_corr = False
        status = "unanswered"

        if sel:
            clean_sel = sel.strip()
            clean_corr = corr.strip()
            if clean_sel == clean_corr or clean_sel.lower() in clean_corr.lower() or clean_corr.lower() in clean_sel.lower():
                is_corr = True
                status = "correct"
            else:
                status = "wrong"

        t_taken = ans.get("time_taken", 0)
        if t_taken > 0:
            question_times.append(t_taken)

        opts = option_orders.get(str(q_id), [q_data.get("option_a"), q_data.get("option_b"), q_data.get("option_c"), q_data.get("option_d")])

        detailed_review.append(
            {
                "question_index": idx,
                "question_id": q_id,
                "question_text": q_data.get("question_text", ""),
                "options": opts,
                "selected_option": sel or "Unanswered / Time Expired",
                "correct_option": corr,
                "explanation": q_data.get("explanation", ""),
                "difficulty": q_data.get("difficulty", "medium"),
                "status": status,
                "is_correct": is_corr,
                "time_taken": t_taken,
            }
        )

    avg_time = round(sum(question_times) / len(question_times), 1) if question_times else round(att["time_taken"] / max(1, len(q_order)), 1)
    fastest = min(question_times) if question_times else 0
    slowest = max(question_times) if question_times else 0

    return {
        "attempt_id": attempt_id,
        "test_id": att["test_id"],
        "title": att["title"],
        "topic": att["topic"],
        "total_questions": att["total_questions"],
        "score": att["score"],
        "correct_answers": att["correct_answers"],
        "wrong_answers": att["wrong_answers"],
        "unanswered": att["unanswered"],
        "percentage": att["percentage"],
        "time_taken": att["time_taken"],
        "started_at": att["started_at"],
        "submitted_at": att["submitted_at"],
        "status": att["status"],
        "ai_analysis": att.get("ai_analysis"),
        "analytics": {
            "average_time_per_q": avg_time,
            "fastest_time": fastest,
            "slowest_time": slowest,
            "accuracy": att["percentage"],
        },
        "review": detailed_review,
    }


def _generate_ai_analysis_async(attempt_id: int):
    try:
        res = get_test_result(attempt_id)
        wrong_items = [r for r in res["review"] if not r["is_correct"]]

        summary_parts = [f"Topic: {res['topic']}", f"Score: {res['percentage']}% ({res['correct_answers']}/{res['total_questions']})"]

        if wrong_items:
            summary_parts.append("Missed Questions:")
            for item in wrong_items[:5]:
                summary_parts.append(f"- Question: {item['question_text']} | Correct: {item['correct_option']}")

        prompt = (
            "You are an AI tutor analyzing a student's online exam performance.\n"
            f"{' '.join(summary_parts)}\n\n"
            "Provide a brief, encouraging, highly actionable performance review with:\n"
            "1. Key Strengths\n"
            "2. Weak Areas / Concepts Needing Work\n"
            "3. Recommended Revision Focus based on their notes.\n"
            "Keep it concise (3 short paragraphs)."
        )

        analysis = llm_service.generate(prompt, system="You are an encouraging academic AI tutor.")

        conn = get_connection()
        conn.execute("UPDATE test_attempts SET ai_analysis = ? WHERE id = ?", (analysis, attempt_id))
        conn.commit()
        conn.close()
    except Exception as exc:
        print(f"AI Analysis generation error: {exc}")


def list_attempt_history() -> List[Dict[str, Any]]:
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT a.*, t.document_id
        FROM test_attempts a
        LEFT JOIN tests t ON t.id = a.test_id
        ORDER BY a.started_at DESC
        """
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
