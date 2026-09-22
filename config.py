import os

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
VECTOR_STORE_FOLDER = os.path.join(BASE_DIR, "vector_store")
DATABASE_PATH = os.path.join(BASE_DIR, "study_assistant.db")

SECRET_KEY = os.getenv(
    "STUDY_ASSISTANT_SECRET",
    "study-assistant-super-secret-key-change-in-production-42",
)

ALLOWED_EXTENSIONS = {"pdf", "txt", "md"}
MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50 MB

# Local embedding model (runs offline)
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

# Ollama settings for local LLM (no paid API)
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "phi3:mini")

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200
TOP_K_RESULTS = 4
