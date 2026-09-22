# AI Study Assistant Using RAG (Offline)

An AI-powered study assistant for students that works **entirely offline** — no OpenAI, Gemini, Claude, or paid API services. Upload PDF notes, textbooks, and lecture slides, then get summaries, quizzes, and question answering powered by local open-source models.

## Features

- **Document Upload** — PDF, TXT, and MD files with validation and local storage
- **Text Extraction** — PDF parsing via pdfplumber and PyPDF2 with text cleaning
- **Knowledge Base** — Chunking, local embeddings (Sentence Transformers), FAISS vector store
- **RAG Q&A** — Ask questions answered only from your uploaded materials
- **Summaries** — AI-generated chapter summaries with key points
- **Quizzes** — Auto-generated MCQ, True/False, and short answer questions
- **Dashboard** — Track documents, summaries, quizzes, and chat history (SQLite)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | HTML, CSS, JavaScript, Bootstrap 5 |
| Backend | Python, Flask |
| LLM | Ollama (Mistral, Llama 3, Phi-3, TinyLlama, etc.) |
| RAG | LangChain, FAISS, Sentence Transformers |
| PDF | pdfplumber, PyPDF2 |
| Database | SQLite |

## Prerequisites

1. **Python 3.10+**
2. **Ollama** — [https://ollama.com](https://ollama.com) for running local LLMs

## Setup

### 1. Install Ollama and pull a model

```bash
# Install Ollama from https://ollama.com, then:
ollama pull phi3:mini
```

Other supported models: `mistral`, `llama3`, `tinyllama`

### 2. Install Python dependencies

```bash
cd d:\inyernship
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

The first run downloads the embedding model (`all-MiniLM-L6-v2`) automatically.

### 3. Run the application

```bash
python app.py
```

Open **http://localhost:5000** in your browser.

## Configuration

Edit `config.py` or set environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API URL |
| `OLLAMA_MODEL` | `phi3:mini` | Model name for generation |

## Project Structure

```
inyernship/
├── app.py                 # Flask application & routes
├── config.py              # Configuration
├── requirements.txt
├── models/
│   └── database.py        # SQLite schema & helpers
├── services/
│   ├── pdf_processor.py   # PDF/text extraction
│   └── rag_engine.py      # FAISS RAG + Ollama LLM
├── templates/             # HTML pages
├── static/                # CSS & JS
├── uploads/               # Uploaded files (auto-created)
└── vector_store/          # FAISS indexes (auto-created)
```

## Workflow

1. **Upload** a PDF or text document
2. Text is extracted, chunked, and embedded locally
3. Embeddings are stored in FAISS per document
4. **Ask questions** — relevant chunks are retrieved and sent to the local LLM
5. **Generate summaries** or **quizzes** from the full document text
6. All history is saved in SQLite and visible on the **Dashboard**

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | System status and LLM availability |
| POST | `/api/chat/<doc_id>` | JSON Q&A: `{"question": "..."}` |

## Troubleshooting

- **"Local LLM is unavailable"** — Start Ollama and ensure the model is pulled: `ollama pull phi3:mini`
- **Slow first upload** — Embedding model downloads on first use (~90 MB)
- **Empty PDF text** — Scanned PDFs need OCR (not included); use text-based PDFs

## Future Enhancements

- Voice-based Q&A
- Multilingual support
- Personalized study plans
- Performance analytics
- AI-generated flashcards

## License

Educational / internship project — free to use and modify.
