# RAG Document Q&A App

Stack: **React + Vite** (frontend) · **FastAPI** (backend) · **FAISS** (vector store) · **HuggingFace** (local embeddings) · **Groq** (free LLM).

## Quick start

The main app lives under **`rag-app/`** (backend + frontend).

### 1. Backend

**Requires Python 3.11 or 3.12** (Python 3.14+ breaks LangChain/Pydantic).

```bash
cd rag-app/backend
# Use Python 3.12 if you have it (e.g. py -3.12 -m venv venv)
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
```

Create `rag-app/backend/.env` with your **Groq API key** (free at https://console.groq.com):

```env
GROQ_API_KEY=your-groq-api-key-here
```

**First run:** Embeddings run locally (no API key). Only Groq is used for answering questions. If you previously used Gemini, delete the old index: `rm -rf rag-app/backend/faiss_db` (or delete the folder manually).

Run the API:

```bash
uvicorn main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

### 2. Frontend

```bash
cd rag-app/frontend
npm install
npm run dev
```

App: http://localhost:5173

### 3. Use the app

1. Open http://localhost:5173
2. Upload a PDF (research paper, resume, manual, etc.)
3. Wait for “Ingested X chunks”
4. Ask questions about the document; answers include expandable **source citations**

## Project structure

```
ragapp/
├── README.md
├── RAGAPP_ANALYSIS.md       # What’s done + improvement notes
├── backend/                 # Standalone backend (optional duplicate)
└── rag-app/
    ├── backend/
    │   ├── main.py         # FastAPI: /, /status, /upload, /ask
    │   ├── rag.py          # RAG: PDF → chunk → FAISS, HuggingFace + Groq
    │   ├── requirements.txt
    │   └── .env.example    # GROQ_API_KEY
    └── frontend/
        └── src/
            └── App.jsx     # Upload + chat with status & sources
```

## API

| Endpoint | Description |
|----------|-------------|
| `GET /` | Health check |
| `GET /status` | `{ "has_document": true/false }` — whether a PDF has been ingested |
| `POST /upload` | Upload a PDF (multipart); (re)builds the vector index |
| `POST /ask` | `{ "question": "..." }` → `{ "answer": "...", "sources": ["..."] }` |

## Common issues

| Issue | Fix |
|-------|-----|
| CORS in browser | Backend allows `http://localhost:5173`; ensure frontend runs on that port |
| Groq auth error | Set `GROQ_API_KEY` in `rag-app/backend/.env`; get free key at https://console.groq.com |
| Index dimension error | Delete `rag-app/backend/faiss_db` and re-upload (happens if you switched from Gemini) |
| **ERR_CONNECTION_REFUSED** / Pydantic Python 3.14 warning | Use Python 3.11 or 3.12. Recreate venv: `Remove-Item -Recurse venv; py -3.12 -m venv venv; .\venv\Scripts\Activate; pip install -r requirements.txt` |
| “No document has been ingested” | Upload at least one PDF before asking questions |
| Empty PDF text | Some PDFs are image-only; they would need OCR (not included) |
