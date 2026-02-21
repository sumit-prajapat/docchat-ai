import os
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from rag import ingest_document, query_document, has_index

app = FastAPI(title="RAG Document Q&A API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "./uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


class QuestionRequest(BaseModel):
    question: str


@app.get("/")
def health():
    return {"status": "RAG backend is running 🚀"}


@app.get("/status")
def get_status():
    """Return whether at least one document has been ingested (for frontend 'upload first' state)."""
    return {"has_document": has_index()}


@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    try:
        chunks = ingest_document(file_path)
        return {"message": f"✅ Ingested {chunks} chunks from '{file.filename}'"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        err_msg = str(e)
        if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg or "quota" in err_msg.lower():
            raise HTTPException(
                status_code=429,
                detail=(
                    "Gemini API quota exceeded. Wait a few minutes and try again, "
                    "or check your plan and usage: https://ai.google.dev/gemini-api/docs/rate-limits"
                ),
            )
        raise HTTPException(status_code=500, detail=err_msg)


@app.post("/ask")
async def ask_question(body: QuestionRequest):
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    try:
        answer, sources = query_document(body.question)
        return {"answer": answer, "sources": sources}
    except FileNotFoundError as e:
        raise HTTPException(status_code=409, detail=str(e))