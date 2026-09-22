import os
import json
import shutil
from typing import AsyncGenerator
import fitz
from dotenv import load_dotenv
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.output_parsers import StrOutputParser

load_dotenv()

FAISS_DIR = "./faiss_db"
MANIFEST_PATH = "./faiss_db/manifest.json"

embeddings = HuggingFaceEmbeddings(
    model_name="all-MiniLM-L6-v2",
    model_kwargs={"device": "cpu"},
    encode_kwargs={"normalize_embeddings": True}
)


def has_index() -> bool:
    """Check if the FAISS vector index file exists."""
    return os.path.exists(os.path.join(FAISS_DIR, "index.faiss"))


def _load_manifest() -> list[dict]:
    if os.path.exists(MANIFEST_PATH):
        try:
            with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []


def _save_manifest(manifest: list[dict]):
    os.makedirs(FAISS_DIR, exist_ok=True)
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)


def get_documents() -> list[dict]:
    """Return all active documents currently in the vector store."""
    if not has_index():
        return []
    return _load_manifest()


def reset_documents():
    """Clear the vector store, manifest, and cached embeddings."""
    if os.path.exists(FAISS_DIR):
        shutil.rmtree(FAISS_DIR, ignore_errors=True)


def parse_document(file_path: str) -> list[Document]:
    """Parse PDF, TXT, or MD files into Document objects with per-page metadata."""
    file_name = os.path.basename(file_path)
    ext = os.path.splitext(file_name)[1].lower()
    documents = []

    if ext == ".pdf":
        doc = fitz.open(file_path)
        for page_idx, page in enumerate(doc):
            text = page.get_text()
            if text.strip():
                documents.append(
                    Document(
                        page_content=text,
                        metadata={"source": file_name, "page": page_idx + 1}
                    )
                )
    elif ext in [".txt", ".md"]:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                text = f.read()
        except UnicodeDecodeError:
            with open(file_path, "r", encoding="latin-1") as f:
                text = f.read()
        if text.strip():
            documents.append(
                Document(
                    page_content=text,
                    metadata={"source": file_name, "page": 1}
                )
            )
    else:
        raise ValueError(f"Unsupported file format '{ext}'. Supported formats: PDF, TXT, MD.")

    return documents


def ingest_document(file_path: str) -> dict:
    """Ingest a document into the FAISS vector database and update document manifest."""
    documents = parse_document(file_path)
    if not documents:
        raise ValueError("Document produced no readable text (it may be image-only or empty).")

    file_name = os.path.basename(file_path)
    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    chunks = splitter.split_documents(documents)

    os.makedirs(FAISS_DIR, exist_ok=True)

    if has_index():
        vectorstore = FAISS.load_local(
            FAISS_DIR, embeddings, allow_dangerous_deserialization=True
        )
        vectorstore.add_documents(chunks)
    else:
        vectorstore = FAISS.from_documents(documents=chunks, embedding=embeddings)

    vectorstore.save_local(FAISS_DIR)

    # Update manifest
    manifest = _load_manifest()
    # Remove older entry for the same file if re-uploaded
    manifest = [doc for doc in manifest if doc.get("filename") != file_name]
    manifest.append({
        "filename": file_name,
        "chunks": len(chunks),
        "pages": len(documents),
        "size_kb": round(os.path.getsize(file_path) / 1024, 1)
    })
    _save_manifest(manifest)

    return {
        "filename": file_name,
        "chunks": len(chunks),
        "total_documents": len(manifest)
    }


def _contextualize_query(question: str, history: list[dict], groq_api_key: str) -> str:
    """Rephrase user question using chat history if available to create a standalone search query."""
    if not history:
        return question

    recent_turns = history[-4:]
    history_text = "\n".join([f"{h.get('role', 'user')}: {h.get('content', '')}" for h in recent_turns])

    llm = ChatGroq(model="llama-3.1-8b-instant", temperature=0, groq_api_key=groq_api_key)
    rephrase_prompt = ChatPromptTemplate.from_template("""
Given the recent chat history and a follow-up question, rephrase the follow-up question into a standalone question that can be understood without the chat history.
Do NOT answer the question. Only output the rephrased standalone query. If it is already standalone, return it as is.

Chat History:
{history_text}

Follow-up Question: {question}

Standalone Query:
""")
    chain = rephrase_prompt | llm | StrOutputParser()
    try:
        standalone = chain.invoke({"history_text": history_text, "question": question}).strip()
        return standalone if standalone else question
    except Exception:
        return question


def _format_chat_history(history: list[dict]):
    messages = []
    for h in history[-6:]:
        role = h.get("role")
        content = h.get("content", "")
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role in ["ai", "assistant"]:
            messages.append(AIMessage(content=content))
    return messages


async def stream_query_document(question: str, history: list[dict] = []) -> AsyncGenerator[str, None]:
    """Stream answers token-by-token via Server-Sent Events (SSE)."""
    if not has_index():
        yield f"data: {json.dumps({'type': 'error', 'error': 'No documents loaded. Please upload a document first.'})}\n\n"
        return

    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        yield f"data: {json.dumps({'type': 'error', 'error': 'GROQ_API_KEY is not set. Please configure your Groq API key.'})}\n\n"
        return

    try:
        # 1. Standalone Query Reformulation for Follow-ups
        standalone_query = _contextualize_query(question, history, groq_api_key)

        # 2. Similarity Search
        vectorstore = FAISS.load_local(
            FAISS_DIR, embeddings, allow_dangerous_deserialization=True
        )
        docs = vectorstore.similarity_search(standalone_query, k=4)

        if not docs:
            yield f"data: {json.dumps({'type': 'sources', 'sources': []})}\n\n"
            yield f"data: {json.dumps({'type': 'token', 'token': 'I could not find relevant information in the uploaded document.'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return

        # 3. Emit Sources Event First
        sources = [
            {
                "source": d.metadata.get("source", "Document"),
                "page": d.metadata.get("page", 1),
                "text": d.page_content.strip()
            }
            for d in docs
        ]
        yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"

        # 4. Construct Prompt with Context and Memory
        context = "\n\n---\n\n".join(
            [f"[Source: {d.metadata.get('source', 'Doc')} | Page {d.metadata.get('page', 1)}]:\n{d.page_content}" for d in docs]
        )

        chat_messages = [
            SystemMessage(
                content=(
                    "You are DocChat AI, an intelligent, helpful document assistant. "
                    "Answer the user's question accurately based strictly on the provided context below. "
                    "If the context does not provide sufficient information to answer the question, state that clearly and concisely. "
                    "Format answers using clear Markdown with bold headers, bullet points, or code blocks where appropriate.\n\n"
                    f"Context:\n{context}"
                )
            )
        ]
        chat_messages.extend(_format_chat_history(history))
        chat_messages.append(HumanMessage(content=question))

        llm = ChatGroq(
            model="llama-3.1-8b-instant",
            temperature=0.1,
            streaming=True,
            groq_api_key=groq_api_key
        )

        # 5. Stream Tokens
        async for chunk in llm.astream(chat_messages):
            if chunk.content:
                yield f"data: {json.dumps({'type': 'token', 'token': chunk.content})}\n\n"

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"


def query_document(question: str, history: list[dict] = []) -> tuple[str, list[dict]]:
    """Synchronous query for standard endpoint fallback."""
    if not has_index():
        raise FileNotFoundError("No document has been ingested yet. Please upload a document first.")

    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        raise ValueError("GROQ_API_KEY is not set.")

    standalone_query = _contextualize_query(question, history, groq_api_key)

    vectorstore = FAISS.load_local(
        FAISS_DIR, embeddings, allow_dangerous_deserialization=True
    )
    docs = vectorstore.similarity_search(standalone_query, k=4)
    if not docs:
        return "I could not find relevant information in the uploaded document.", []

    sources = [
        {
            "source": d.metadata.get("source", "Document"),
            "page": d.metadata.get("page", 1),
            "text": d.page_content.strip()
        }
        for d in docs
    ]

    context = "\n\n---\n\n".join(
        [f"[Source: {d.metadata.get('source', 'Doc')} | Page {d.metadata.get('page', 1)}]:\n{d.page_content}" for d in docs]
    )

    chat_messages = [
        SystemMessage(
            content=(
                "You are DocChat AI, an intelligent, helpful document assistant. "
                "Answer the user's question accurately based strictly on the provided context below. "
                "If the context does not provide sufficient information to answer the question, state that clearly and concisely. "
                "Format answers using clear Markdown with bold headers, bullet points, or code blocks where appropriate.\n\n"
                f"Context:\n{context}"
            )
        )
    ]
    chat_messages.extend(_format_chat_history(history))
    chat_messages.append(HumanMessage(content=question))

    llm = ChatGroq(model="llama-3.1-8b-instant", temperature=0.1, groq_api_key=groq_api_key)
    response = llm.invoke(chat_messages)
    return response.content, sources
