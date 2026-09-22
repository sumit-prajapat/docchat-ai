# DocChat AI - Intelligent Document Assistant

An advanced, full-stack **Retrieval-Augmented Generation (RAG)** platform that enables conversational Q&A over documents with **real-time token streaming**, **multi-turn chat memory**, and **page-accurate source citations**.

Stack: **React 19 + Vite** (frontend) · **FastAPI** (backend) · **FAISS** (vector store) · **HuggingFace** (local embeddings) · **Groq** (high-speed LLM inference).

---

## Project Structure

The project has a clean, organized root structure:

```
docchat-ai/
├── backend/                  # FastAPI + LangChain + FAISS + Groq engine
│   ├── main.py               # REST API & SSE streaming routes
│   ├── rag.py                # RAG engine (ingestion, vectorstore, LLM fallback)
│   ├── requirements.txt      # Python dependencies
│   ├── Dockerfile            # Container config for Hugging Face Spaces
│   ├── .env.example          # Environment template (GROQ_API_KEY)
│   └── README.md             # Backend documentation
├── frontend/                 # React 19 + Vite + Tailwind application
│   ├── src/
│   │   ├── App.jsx           # Streaming chat UI, dropzone, citations
│   │   ├── index.css         # Glassmorphic dark styling & Markdown typography
│   │   └── main.jsx          # Entrypoint
│   ├── package.json          # Dependencies & build scripts
│   ├── .env.example          # Environment template (VITE_API_URL)
│   └── vite.config.js        # Vite configuration
└── README.md                 # Master project documentation
```

---

## Quick Start (Running Locally)

### 1. Backend Setup

> **Requires Python 3.11 or 3.12**

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
```

Create `backend/.env` with your **Groq API key** (free tier at [https://console.groq.com](https://console.groq.com)):

```env
GROQ_API_KEY=your-groq-api-key-here
```

Start the FastAPI server:

```bash
uvicorn main:app --reload --port 8000
```

- API Docs (Swagger): [http://localhost:8000/docs](http://localhost:8000/docs)
- Health Check: [http://localhost:8000/status](http://localhost:8000/status)

---

### 2. Frontend Setup

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

The application will run at **[http://localhost:5173](http://localhost:5173)**.

*(Optional)* Create `frontend/.env` to configure the API URL:
```env
VITE_API_URL=http://localhost:8000
```

---

## Features & Highlights

- ⚡ **Word-by-Word Streaming**: Uses Server-Sent Events (SSE) via `/ask/stream` for live, instant answer generation.
- 🧠 **Multi-Turn Conversational Memory**: Supports follow-up questions by contextualizing queries against chat history.
- 📚 **Multi-Document Support**: Ingest multiple **PDF**, **TXT**, and **Markdown** documents into a persistent knowledge base.
- 🔍 **Structured Source Citations**: Shows clickable cards with the document name, **`Page X` badges**, and extracted context passages.
- 🎨 **Modern Dark Glassmorphic UI**: Includes suggested question pills, 1-click clipboard copy, and Markdown rendering (code blocks, lists, bold).
- 🆓 **Zero Ingestion Cost**: Local HuggingFace embeddings (`all-MiniLM-L6-v2`) run on CPU with zero rate limits or API fees.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Health check |
| `GET` | `/status` | Active status & list of indexed documents |
| `GET` | `/documents` | List of all loaded documents with page and chunk stats |
| `DELETE` | `/documents` | Clear all documents & reset the vector store |
| `POST` | `/upload` | Upload & ingest a `.pdf`, `.txt`, or `.md` file |
| `POST` | `/ask/stream` | Stream answers token-by-token via Server-Sent Events (SSE) |
| `POST` | `/ask` | Synchronous JSON fallback (`{ "answer": "...", "sources": [...] }`) |

---

## Deployment

- **Backend**: Containerized with `Dockerfile` for deployment on [Hugging Face Spaces](https://huggingface.co/spaces) (port 7860). Remember to set `GROQ_API_KEY` under Space Secrets.
- **Frontend**: Pre-configured for seamless deployment on [Vercel](https://vercel.com).
