from services.rag_engine import LLMService

svc = LLMService()

raw = 'prefix {"name": "A", "questions": [{"question": "Q1"}]} suffix'
data = svc._extract_json_from_text(raw)
assert data["name"] == "A"
assert len(data["questions"]) == 1

assert svc._exam_question_counts(50) == (5, 4, 2)
assert svc._exam_question_counts(100) == (10, 6, 2)
print("All tests passed")
