import os
import shutil
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from rag import (
    ingest_document,
    query_document,
    stream_query_document,
    has_index,
    get_documents,
    reset_documents,
)

app = FastAPI(title="DocChat AI - Document Intelligence API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "./uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
ALLOWED_EXTENSIONS = {".pdf", ".txt", ".md"}


class ChatMessage(BaseModel):
    role: str
    content: str


class QuestionRequest(BaseModel):
    question: str
    history: Optional[List[ChatMessage]] = []


@app.get("/")
def health():
    return {"status": "DocChat AI backend is running 🚀"}


@app.get("/status")
def get_status():
    """Return whether documents are loaded and list active documents."""
    docs = get_documents()
    return {
        "has_document": len(docs) > 0 or has_index(),
        "documents": docs,
        "total_documents": len(docs),
    }


@app.get("/documents")
def list_documents():
    """List all currently indexed documents."""
    return {"documents": get_documents()}


@app.delete("/documents")
def clear_all_documents():
    """Reset the knowledge base and clear all documents."""
    reset_documents()
    if os.path.exists(UPLOAD_DIR):
        shutil.rmtree(UPLOAD_DIR, ignore_errors=True)
        os.makedirs(UPLOAD_DIR, exist_ok=True)
    return {"message": "All documents cleared successfully."}


@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded.")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        result = ingest_document(file_path)
        return {
            "message": f"✅ Ingested {result['chunks']} chunks from '{result['filename']}'",
            "details": result,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process document: {str(e)}")


@app.post("/ask")
async def ask_question(body: QuestionRequest):
    """Synchronous question-answering endpoint (JSON response)."""
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    history_dicts = [{"role": m.role, "content": m.content} for m in body.history] if body.history else []

    try:
        answer, sources = query_document(body.question, history_dicts)
        return {"answer": answer, "sources": sources}
    except FileNotFoundError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        err_msg = str(e)
        if "api_key" in err_msg.lower() or "authentication" in err_msg.lower():
            raise HTTPException(
                status_code=401,
                detail="Groq API key is missing or invalid. Please check your GROQ_API_KEY environment variable.",
            )
        if "rate limit" in err_msg.lower() or "429" in err_msg:
            raise HTTPException(
                status_code=429,
                detail="Groq rate limit reached. Please wait a moment before trying again.",
            )
        raise HTTPException(status_code=500, detail=f"Inference error: {err_msg}")


@app.post("/ask/stream")
async def ask_question_stream(body: QuestionRequest):
    """Server-Sent Events (SSE) streaming endpoint for real-time word-by-word answering."""
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    history_dicts = [{"role": m.role, "content": m.content} for m in body.history] if body.history else []

    return StreamingResponse(
        stream_query_document(body.question, history_dicts),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )