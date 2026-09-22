# RAG Document Q&A App

Stack: **React + Vite** (frontend) · **FastAPI** (backend) · **FAISS** (vector store) · **Google Gemini** (LLM + embeddings).

## Quick start

The main app lives under **`rag-app/`** (backend + frontend).

### 1. Backend

```bash
cd rag-app/backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
```

Create `rag-app/backend/.env` with your Google Gemini API key (copy from `.env.example`):

```env
GOOGLE_API_KEY=your-gemini-api-key-here
```

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
    │   ├── rag.py          # RAG: PDF → chunk → FAISS, Gemini
    │   ├── requirements.txt
    │   └── .env.example    # GOOGLE_API_KEY
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
| Gemini auth error | Set `GOOGLE_API_KEY` or `GEMINI_API_KEY` in `rag-app/backend/.env` and restart backend |
| “No document has been ingested” | Upload at least one PDF before asking questions |
| Empty PDF text | Some PDFs are image-only; they would need OCR (not included) |
