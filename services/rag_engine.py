import json
import os
from typing import List, Optional

import requests
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings

import config


class RAGEngine:
    def __init__(self):
        os.makedirs(config.VECTOR_STORE_FOLDER, exist_ok=True)
        self.embeddings = HuggingFaceEmbeddings(
            model_name=config.EMBEDDING_MODEL,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=config.CHUNK_SIZE,
            chunk_overlap=config.CHUNK_OVERLAP,
            length_function=len,
        )
        self._stores = {}

    def _store_path(self, document_id: int) -> str:
        return os.path.join(config.VECTOR_STORE_FOLDER, f"doc_{document_id}")

    def build_index(self, document_id: int, text: str) -> int:
        chunks = self.text_splitter.split_text(text)
        if not chunks:
            raise ValueError("No text content found to index.")

        vector_store = FAISS.from_texts(chunks, self.embeddings)
        store_path = self._store_path(document_id)
        vector_store.save_local(store_path)
        self._stores[document_id] = vector_store
        return len(chunks)

    def load_index(self, document_id: int) -> bool:
        store_path = self._store_path(document_id)
        if not os.path.isdir(store_path):
            return False
        self._stores[document_id] = FAISS.load_local(
            store_path,
            self.embeddings,
            allow_dangerous_deserialization=True,
        )
        return True

    def get_store(self, document_id: int) -> Optional[FAISS]:
        if document_id not in self._stores:
            self.load_index(document_id)
        return self._stores.get(document_id)

    def retrieve(self, document_id: int, query: str, k: int = None) -> List[str]:
        store = self.get_store(document_id)
        if store is None:
            return []
        k = k or config.TOP_K_RESULTS
        docs = store.similarity_search(query, k=k)
        return [doc.page_content for doc in docs]

    def delete_index(self, document_id: int):
        store_path = self._store_path(document_id)
        if os.path.isdir(store_path):
            for name in os.listdir(store_path):
                os.remove(os.path.join(store_path, name))
            os.rmdir(store_path)
        self._stores.pop(document_id, None)


class LLMService:
    JSON_SYSTEM = (
        "You output ONLY valid JSON. "
        "No markdown, no code fences, no explanations, no summaries. "
        "The response must be a single JSON object starting with { and ending with }."
    )

    def __init__(self):
        self.base_url = config.OLLAMA_BASE_URL.rstrip("/")
        self.model = config.OLLAMA_MODEL

    @staticmethod
    def _get_multi_llm_client():
        from services.settings_service import multi_llm_client
        return multi_llm_client

    @staticmethod
    def _get_active_provider_safe():
        from services.settings_service import get_active_provider
        return get_active_provider()

    def _has_active_custom(self) -> bool:
        active = self._get_active_provider_safe()
        return bool(active and active.get("provider_type") != "ollama")

    def _ollama_fallback(self) -> bool:
        active = self._get_active_provider_safe()
        if not active:
            return True
        return active.get("provider_type") == "ollama"

    def is_available(self) -> bool:
        client = self._get_multi_llm_client()
        if self._has_active_custom():
            return client.is_available()
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=5)
            return response.status_code == 200
        except requests.RequestException:
            return False

    def list_models(self) -> List[str]:
        active = self._get_active_provider_safe()
        if active and active.get("provider_type") != "ollama":
            return [active.get("model_name", "custom-model")]
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=10)
            response.raise_for_status()
            data = response.json()
            return [item.get("name", "") for item in data.get("models", [])]
        except requests.RequestException:
            return []

    def generate(self, prompt: str, system: str = None) -> str:
        client = self._get_multi_llm_client()
        if self._has_active_custom():
            result = client.generate(prompt, system=system, max_tokens=1024, temperature=0.3)
            if result and not result.startswith("No active") and not result.startswith("API request") and not result.startswith("Unexpected"):
                return result
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0.3, "num_predict": 1024},
        }
        if system:
            payload["system"] = system

        try:
            response = requests.post(
                f"{self.base_url}/api/generate",
                json=payload,
                timeout=180,
            )
            response.raise_for_status()
            return response.json().get("response", "").strip()
        except requests.RequestException as exc:
            custom_msg = ""
            if self._has_active_custom():
                custom_msg = " Custom provider also unavailable."
            return (
                "Local LLM is unavailable. Install Ollama and pull a model "
                f"(e.g. `ollama pull {self.model}`).{custom_msg} Error: {exc}"
            )

    def answer_question(self, question: str, context_chunks: List[str]) -> str:
        context = "\n\n".join(f"- {chunk}" for chunk in context_chunks)
        system = (
            "You are a helpful study assistant. Answer ONLY using the provided "
            "context from the student's notes. If the answer is not in the context, "
            "say you cannot find it in the uploaded materials."
        )
        prompt = (
            f"Context from study materials:\n{context}\n\n"
            f"Student question: {question}\n\n"
            "Provide a clear, concise answer based on the context."
        )
        return self.generate(prompt, system=system)

    def generate_summary(self, text: str, title: str = "Document") -> str:
        excerpt = text[:12000]
        system = (
            "You are a study assistant. Create concise summaries with bullet points "
            "for key concepts. Keep it student-friendly."
        )
        prompt = (
            f"Summarize the following study material titled '{title}'.\n"
            "Include:\n"
            "1. A short overview (2-3 sentences)\n"
            "2. Key points as bullet list\n"
            "3. Important terms or definitions\n\n"
            f"Content:\n{excerpt}"
        )
        return self.generate(prompt, system=system)

    def generate_quiz(
        self,
        text: str,
        title: str = "Document",
        question_type: str = "mcq",
        num_questions: int = 5,
    ) -> dict:
        excerpt = text[:15000]
        type_labels = {
            "mcq": "multiple choice",
            "short_answer": "short answer",
            "true_false": "true/false",
        }
        type_label = type_labels.get(question_type, "multiple choice")

        if question_type == "mcq":
            structure = (
                '{\n'
                '  "title": "Quiz title",\n'
                '  "mcq": [{"question": "...", "options": ["A","B","C","D"], "answer": "A", "explanation": "..."}]\n'
                "}"
            )
        elif question_type == "true_false":
            structure = (
                '{\n'
                '  "title": "Quiz title",\n'
                '  "true_false": [{"question": "...", "answer": true, "explanation": "..."}]\n'
                "}"
            )
        else:
            structure = (
                '{\n'
                '  "title": "Quiz title",\n'
                '  "short_answer": [{"question": "...", "answer": "...", "explanation": "..."}]\n'
                "}"
            )

        system = (
            "You generate educational quizzes. Respond with valid JSON only, no markdown."
        )
        prompt = (
            f"Create a quiz from this study material titled '{title}'.\n"
            f"Generate exactly {num_questions} {type_label} questions.\n"
            "Return JSON with this exact structure:\n"
            f"{structure}\n\n"
            f"Content:\n{excerpt}"
        )

        num_predict = min(4096, 256 * num_questions + 512)
        raw = self._generate_with_options(
            prompt, system=system, num_predict=num_predict, json_mode=True, temperature=0.1
        )
        data = self._parse_quiz_json(raw, title)
        data["question_type"] = question_type
        data["num_questions"] = num_questions
        return data

    def _generate_with_options(
        self,
        prompt: str,
        system: str = None,
        num_predict: int = 1024,
        temperature: float = 0.3,
        json_mode: bool = False,
    ) -> str:
        client = self._get_multi_llm_client()
        if self._has_active_custom():
            result = client.generate(
                prompt,
                system=system,
                max_tokens=num_predict,
                temperature=temperature,
                json_mode=json_mode,
                timeout=300,
            )
            if result and not result.startswith("No active") and not result.startswith("API request") and not result.startswith("Unexpected"):
                return result
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": temperature, "num_predict": num_predict},
        }
        if system:
            payload["system"] = system
        if json_mode:
            payload["format"] = "json"

        try:
            response = requests.post(
                f"{self.base_url}/api/generate",
                json=payload,
                timeout=300,
            )
            response.raise_for_status()
            return response.json().get("response", "").strip()
        except requests.RequestException as exc:
            custom_msg = ""
            if self._has_active_custom():
                custom_msg = " Custom provider also unavailable."
            return (
                "Local LLM is unavailable. Install Ollama and pull a model "
                f"(e.g. `ollama pull {self.model}`).{custom_msg} Error: {exc}"
            )

    def _extract_json_from_text(self, raw: str) -> Optional[dict]:
        if not raw or raw.startswith("Local LLM is unavailable"):
            return None

        cleaned = raw.strip()

        if "```" in cleaned:
            for part in cleaned.split("```"):
                part = part.strip()
                if part.startswith("json"):
                    part = part[4:].strip()
                if part.startswith("{"):
                    cleaned = part
                    break

        try:
            data = json.loads(cleaned)
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass

        start = cleaned.find("{")
        if start == -1:
            return None

        depth = 0
        in_string = False
        escape = False
        for i in range(start, len(cleaned)):
            ch = cleaned[i]
            if escape:
                escape = False
                continue
            if ch == "\\":
                escape = True
                continue
            if ch == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        data = json.loads(cleaned[start : i + 1])
                        if isinstance(data, dict):
                            return data
                    except json.JSONDecodeError:
                        return None
        return None

    def _parse_quiz_json(self, raw: str, title: str) -> dict:
        data = self._extract_json_from_text(raw)
        if data:
            return data
        return {
            "title": f"Quiz: {title}",
            "mcq": [],
            "true_false": [],
            "short_answer": [],
            "raw_response": raw,
        }

    def generate_interview_questions(
        self,
        text: str,
        title: str = "Document",
        num_per_level: int = 3,
    ) -> dict:
        context = text[:12000]
        system = (
            "You generate technical interview questions for study preparation. "
            "Respond with valid JSON only, no markdown."
        )
        prompt = (
            "Generate interview questions based on these notes.\n\n"
            "Include:\n"
            "- Basic\n"
            "- Intermediate\n"
            "- Advanced\n\n"
            "Each question should have an ideal answer.\n\n"
            f"Generate exactly {num_per_level} questions per difficulty level.\n"
            "Return JSON with this exact structure:\n"
            "{\n"
            '  "title": "Interview Questions title",\n'
            '  "basic": [{"question": "...", "ideal_answer": "..."}],\n'
            '  "intermediate": [{"question": "...", "ideal_answer": "..."}],\n'
            '  "advanced": [{"question": "...", "ideal_answer": "..."}]\n'
            "}\n\n"
            f"Context:\n{context}"
        )

        num_predict = min(8192, 400 * num_per_level * 3 + 512)
        raw = self._generate_with_options(
            prompt, system=system, num_predict=num_predict, json_mode=True, temperature=0.1
        )
        data = self._parse_interview_json(raw, title)
        data["num_per_level"] = num_per_level
        return data

    def _parse_interview_json(self, raw: str, title: str) -> dict:
        data = self._extract_json_from_text(raw)
        if data:
            return data
        return {
            "title": f"Interview Questions: {title}",
            "basic": [],
            "intermediate": [],
            "advanced": [],
            "raw_response": raw,
        }

    def _exam_question_counts(self, total_marks: int) -> tuple:
        if total_marks <= 50:
            return 5, 4, 2
        if total_marks <= 75:
            return 8, 5, 2
        return 10, 6, 2

    def _generate_exam_section(
        self,
        section_type: str,
        context: str,
        title: str,
        difficulty: str,
        num_questions: int,
        section_marks: int,
    ) -> dict:
        section_names = {
            "mcq": "Section A - Multiple Choice Questions",
            "short_answer": "Section B - Short Answer Questions",
            "long_answer": "Section C - Long Answer Questions",
        }
        type_labels = {
            "mcq": "multiple choice (MCQ)",
            "short_answer": "short answer",
            "long_answer": "long answer",
        }

        if section_type == "mcq":
            structure = (
                "{\n"
                f'  "name": "{section_names[section_type]}",\n'
                f'  "type": "{section_type}",\n'
                f'  "total_marks": {section_marks},\n'
                '  "questions": [\n'
                "    {\n"
                '      "question": "Question text",\n'
                '      "options": ["A. option", "B. option", "C. option", "D. option"],\n'
                '      "answer": "A",\n'
                '      "marks": 2,\n'
                '      "explanation": "Brief explanation"\n'
                "    }\n"
                "  ]\n"
                "}"
            )
        else:
            structure = (
                "{\n"
                f'  "name": "{section_names[section_type]}",\n'
                f'  "type": "{section_type}",\n'
                f'  "total_marks": {section_marks},\n'
                '  "questions": [\n'
                "    {\n"
                '      "question": "Question text",\n'
                '      "answer": "Model answer",\n'
                '      "marks": 5\n'
                "    }\n"
                "  ]\n"
                "}"
            )

        prompt = (
            f"Study material from '{title}':\n{context}\n\n"
            f"Create exactly {num_questions} {type_labels[section_type]} exam questions "
            f"based ONLY on the study material above.\n"
            f"Difficulty: {difficulty}\n"
            f"Section total marks: {section_marks}\n"
            "Distribute marks across questions so they sum to the section total.\n"
            "Do NOT summarize the material. Output exam questions only as JSON.\n\n"
            f"Return JSON with this structure:\n{structure}"
        )

        num_predict = min(4096, 350 * num_questions + 512)
        raw = self._generate_with_options(
            prompt,
            system=self.JSON_SYSTEM,
            num_predict=num_predict,
            json_mode=True,
            temperature=0.1,
        )
        data = self._extract_json_from_text(raw)

        if not data or not data.get("questions"):
            retry_prompt = (
                "Your previous response was invalid. Output ONLY a JSON object.\n\n"
                + prompt
            )
            raw = self._generate_with_options(
                retry_prompt,
                system=self.JSON_SYSTEM,
                num_predict=num_predict,
                json_mode=True,
                temperature=0.0,
            )
            data = self._extract_json_from_text(raw)

        if data and data.get("questions"):
            data.setdefault("name", section_names[section_type])
            data.setdefault("type", section_type)
            data.setdefault("total_marks", section_marks)
            return data

        return {
            "name": section_names[section_type],
            "type": section_type,
            "total_marks": section_marks,
            "questions": [],
            "raw_response": raw,
        }

    def generate_exam_paper(
        self,
        text: str,
        title: str = "Document",
        difficulty: str = "medium",
        duration: str = "3 hours",
        total_marks: int = 100,
    ) -> dict:
        context = text[:8000]
        difficulty = difficulty if difficulty in ("easy", "medium", "hard") else "medium"

        mcq_count, short_count, long_count = self._exam_question_counts(total_marks)
        mcq_marks = int(total_marks * 0.2)
        short_marks = int(total_marks * 0.3)
        long_marks = total_marks - mcq_marks - short_marks

        mcq_section = self._generate_exam_section(
            "mcq", context, title, difficulty, mcq_count, mcq_marks
        )
        short_section = self._generate_exam_section(
            "short_answer", context, title, difficulty, short_count, short_marks
        )
        long_section = self._generate_exam_section(
            "long_answer", context, title, difficulty, long_count, long_marks
        )

        sections = [mcq_section, short_section, long_section]
        subject = title.rsplit(".", 1)[0] if "." in title else title

        metadata_prompt = (
            f"Study material from '{title}':\n{context[:4000]}\n\n"
            "Infer the academic subject name from this material.\n"
            'Return JSON: {"subject": "Subject Name"}'
        )
        meta_raw = self._generate_with_options(
            metadata_prompt,
            system=self.JSON_SYSTEM,
            num_predict=128,
            json_mode=True,
            temperature=0.0,
        )
        meta = self._extract_json_from_text(meta_raw)
        if meta and meta.get("subject"):
            subject = meta["subject"]

        failed_sections = [s for s in sections if not s.get("questions")]
        raw_responses = [
            s.get("raw_response")
            for s in failed_sections
            if s.get("raw_response")
        ]

        result = {
            "title": f"Exam Paper: {subject}",
            "subject": subject,
            "difficulty": difficulty,
            "duration": duration,
            "total_marks": total_marks,
            "instructions": [
                "Answer all questions in Section A.",
                f"Attempt all questions in Sections B and C.",
                f"Time allowed: {duration}.",
                f"Total marks: {total_marks}.",
            ],
            "sections": sections,
        }

        if raw_responses and len(failed_sections) == len(sections):
            result["raw_response"] = "\n\n".join(raw_responses)

        return result

    def _parse_exam_json(self, raw: str, title: str) -> dict:
        data = self._extract_json_from_text(raw)
        if data:
            return data
        return {
            "title": f"Exam Paper: {title}",
            "subject": title,
            "sections": [],
            "raw_response": raw,
        }

    def _teacher_system(self, context: str) -> str:
        return (
            "You are a friendly teacher.\n\n"
            "Teach the topic step-by-step.\n\n"
            "Rules:\n"
            "- Explain one concept at a time.\n"
            "- Ask one question before moving ahead.\n"
            "- If the student answers incorrectly, explain again using another example.\n"
            "- Encourage learning.\n\n"
            f"Topic:\n{context}"
        )

    def start_teaching(self, text: str, title: str = "Document") -> str:
        context = text[:12000]
        system = self._teacher_system(context)
        prompt = (
            f"The student wants to learn from the notes titled '{title}'.\n"
            "Begin the lesson now. Greet them warmly, explain the first concept clearly, "
            "then ask exactly one question to check their understanding. "
            "Do not teach multiple concepts yet."
        )
        return self._generate_with_options(
            prompt, system=system, num_predict=1024, temperature=0.5
        )

    def teach_continue(
        self, context: str, messages: List[dict], student_answer: str
    ) -> str:
        system = self._teacher_system(context[:12000])

        history = ""
        for msg in messages:
            speaker = "Teacher" if msg["role"] == "teacher" else "Student"
            history += f"{speaker}: {msg['content']}\n\n"

        prompt = (
            f"Conversation so far:\n{history}"
            f"Student's latest answer: {student_answer}\n\n"
            "Respond as the friendly teacher:\n"
            "- If the answer is correct or mostly correct, praise them and teach the "
            "next concept, then ask exactly one new question.\n"
            "- If the answer is incorrect or incomplete, gently explain again with a "
            "different example, then ask exactly one question.\n"
            "- Stay encouraging. Teach only one new concept per turn."
        )
        return self._generate_with_options(
            prompt, system=system, num_predict=1024, temperature=0.5
        )

    def generate_viva_questions(
        self,
        text: str,
        title: str = "Document",
        num_questions: int = 5,
    ) -> dict:
        context = text[:15000]
        system = (
            "You generate verbal exam (viva voce) questions based on study materials. "
            "Respond with valid JSON only, no markdown."
        )
        prompt = (
            "Generate academic viva voce (oral exam) questions based on these study notes.\n\n"
            "Each question should be direct, concise, and suitable for a verbal response.\n"
            "Each question MUST have a clear, detailed ideal answer that can be used for grading the student's reply.\n\n"
            f"Generate exactly {num_questions} questions.\n"
            "Return JSON with this exact structure:\n"
            "{\n"
            '  "title": "Viva Questions: ' + title + '",\n'
            '  "questions": [\n'
            '    {\n'
            '      "question": "question text...",\n'
            '      "ideal_answer": "ideal answer explanation..."\n'
            '    }\n'
            '  ]\n'
            "}\n\n"
            f"Context:\n{context}"
        )
        num_predict = min(4096, 350 * num_questions + 512)
        raw = self._generate_with_options(
            prompt, system=system, num_predict=num_predict, json_mode=True, temperature=0.2
        )
        data = self._extract_json_from_text(raw)
        if data and isinstance(data, dict) and "questions" in data:
            return data
        return {
            "title": f"Viva Session: {title}",
            "questions": [
                {
                    "question": "What is the primary topic of the uploaded document?",
                    "ideal_answer": f"The document is titled {title} and covers its core subject matter."
                }
            ],
            "raw_response": raw
        }

    def evaluate_viva_answer(
        self,
        question: str,
        ideal_answer: str,
        student_answer: str,
    ) -> dict:
        system = (
            "You are an academic examiner conducting an oral viva. "
            "Evaluate the student's answer against the ideal answer. "
            "Respond with valid JSON only, no markdown."
        )
        prompt = (
            "Review the student's answer to the viva question and compare it to the ideal answer.\n\n"
            f"Question: {question}\n"
            f"Ideal Answer: {ideal_answer}\n"
            f"Student's Answer: {student_answer}\n\n"
            "Provide:\n"
            "1. A score from 0 to 10 based on accuracy and completeness.\n"
            "2. Brief, polite, and constructive feedback (1-2 sentences) addressed to the student.\n"
            "3. An explanation of what was missing or incorrect if applicable.\n"
            "4. A conversational verbal response that the bot should speak next (e.g. praising correct answers, gently correcting, then moving on).\n\n"
            "Return JSON with this exact structure:\n"
            "{\n"
            '  "score": 8,\n'
            '  "feedback": "...",\n'
            '  "explanation": "...",\n'
            '  "bot_response": "..."\n'
            "}"
        )
        raw = self._generate_with_options(
            prompt, system=system, num_predict=512, json_mode=True, temperature=0.2
        )
        data = self._extract_json_from_text(raw)
        if data and isinstance(data, dict) and "score" in data:
            # Coerce score to integer
            try:
                data["score"] = int(data["score"])
            except (ValueError, TypeError):
                data["score"] = 5
            return data
        # Fallback
        return {
            "score": 5,
            "feedback": "Response recorded.",
            "explanation": "Could not generate detailed evaluation.",
            "bot_response": "Thanks for your reply. Let's proceed."
        }


rag_engine = RAGEngine()
llm_service = LLMService()
