import os
import json
import shutil
import re
from typing import AsyncGenerator
import fitz
from dotenv import load_dotenv
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_community.retrievers import BM25Retriever
from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.output_parsers import StrOutputParser

load_dotenv()

FAISS_DIR = "./faiss_db"
MANIFEST_PATH = "./faiss_db/manifest.json"
CHUNKS_PATH = "./faiss_db/chunks.json"

AVAILABLE_GROQ_MODELS = [
    "qwen/qwen3.8-27b",
    "openai/gpt-oss-20b",
    "llama-3.1-8b-instant",
]

embeddings = HuggingFaceEmbeddings(
    model_name="all-MiniLM-L6-v2",
    model_kwargs={"device": "cpu"},
    encode_kwargs={"normalize_embeddings": True}
)


def has_index() -> bool:
    """Check if the FAISS vector index exists."""
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


def _load_all_chunks() -> list[Document]:
    if os.path.exists(CHUNKS_PATH):
        try:
            with open(CHUNKS_PATH, "r", encoding="utf-8") as f:
                raw_list = json.load(f)
                return [
                    Document(page_content=item["text"], metadata=item["metadata"])
                    for item in raw_list
                ]
        except Exception:
            return []
    return []


def _save_all_chunks(chunks: list[Document]):
    os.makedirs(FAISS_DIR, exist_ok=True)
    serializable = [
        {"text": c.page_content, "metadata": c.metadata} for c in chunks
    ]
    with open(CHUNKS_PATH, "w", encoding="utf-8") as f:
        json.dump(serializable, f)


def get_documents() -> list[dict]:
    """Return all active documents and their insights."""
    if not has_index():
        return []
    return _load_manifest()


def reset_documents():
    """Clear vector store, manifest, and cached chunks."""
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


def generate_document_insights(text: str, filename: str, groq_api_key: str) -> dict:
    """Generate executive summary, key takeaways, and tailored questions using Groq."""
    if not groq_api_key:
        return {
            "summary": f"Document '{filename}' processed and ready for questions.",
            "takeaways": ["Document indexed into vector store."],
            "suggested_questions": ["What is this document about?", "Summarize main points."]
        }

    sample_text = text[:4000]
    prompt = f"""You are an elite document intelligence assistant.
Analyze this document excerpt and return a JSON object with:
1. "summary": A crisp 2-sentence executive summary of the document.
2. "takeaways": An array of 3-4 bullet points highlighting the most important facts, skills, or findings.
3. "suggested_questions": An array of 4 diverse, high-value questions that a user reading this document would likely ask.

Respond ONLY with valid JSON. Do not include markdown formatting or explanations.

Document Excerpt ({filename}):
{sample_text}
"""
    for model_name in AVAILABLE_GROQ_MODELS:
        try:
            llm = ChatGroq(model=model_name, temperature=0.1, groq_api_key=groq_api_key)
            resp = llm.invoke([HumanMessage(content=prompt)])
            cleaned = resp.content.strip()
            # Extract JSON block if wrapped in markdown fences
            if "```" in cleaned:
                match = re.search(r"\{.*\}", cleaned, re.DOTALL)
                if match:
                    cleaned = match.group(0)
            data = json.loads(cleaned)
            return {
                "summary": data.get("summary", "Document analyzed."),
                "takeaways": data.get("takeaways", []),
                "suggested_questions": data.get("suggested_questions", [])
            }
        except Exception:
            continue

    return {
        "summary": f"Document '{filename}' loaded and indexed.",
        "takeaways": ["Indexed for hybrid search."],
        "suggested_questions": ["What is this document about?", "Summarize the key takeaways."]
    }


def ingest_document(file_path: str) -> dict:
    """Ingest a document into the FAISS vector database + BM25 keyword index and generate insights."""
    documents = parse_document(file_path)
    if not documents:
        raise ValueError("Document produced no readable text (it may be image-only or empty).")

    file_name = os.path.basename(file_path)
    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    new_chunks = splitter.split_documents(documents)

    os.makedirs(FAISS_DIR, exist_ok=True)

    # 1. Update FAISS Index
    if has_index():
        vectorstore = FAISS.load_local(
            FAISS_DIR, embeddings, allow_dangerous_deserialization=True
        )
        vectorstore.add_documents(new_chunks)
    else:
        vectorstore = FAISS.from_documents(documents=new_chunks, embedding=embeddings)
    vectorstore.save_local(FAISS_DIR)

    # 2. Update Chunks Store (for BM25)
    existing_chunks = _load_all_chunks()
    existing_chunks = [c for c in existing_chunks if c.metadata.get("source") != file_name]
    existing_chunks.extend(new_chunks)
    _save_all_chunks(existing_chunks)

    # 3. Generate Document Insights
    combined_sample_text = "\n".join([d.page_content for d in documents[:4]])
    groq_api_key = os.getenv("GROQ_API_KEY", "")
    insights = generate_document_insights(combined_sample_text, file_name, groq_api_key)

    # 4. Update Manifest
    manifest = _load_manifest()
    manifest = [doc for doc in manifest if doc.get("filename") != file_name]
    manifest.append({
        "filename": file_name,
        "chunks": len(new_chunks),
        "pages": len(documents),
        "size_kb": round(os.path.getsize(file_path) / 1024, 1),
        "insights": insights
    })
    _save_manifest(manifest)

    return {
        "filename": file_name,
        "chunks": len(new_chunks),
        "total_documents": len(manifest),
        "insights": insights
    }


def reciprocal_rank_fusion(
    dense_docs: list[Document],
    sparse_docs: list[Document],
    k: int = 60,
    top_n: int = 4
) -> list[Document]:
    """Combine dense (vector) and sparse (BM25) retrieved documents using Reciprocal Rank Fusion."""
    scores: dict[str, float] = {}
    doc_map: dict[str, Document] = {}

    for rank, doc in enumerate(dense_docs):
        doc_id = f"{doc.metadata.get('source', '')}_{doc.metadata.get('page', 0)}_{hash(doc.page_content[:80])}"
        doc_map[doc_id] = doc
        scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank + 1)

    for rank, doc in enumerate(sparse_docs):
        doc_id = f"{doc.metadata.get('source', '')}_{doc.metadata.get('page', 0)}_{hash(doc.page_content[:80])}"
        doc_map[doc_id] = doc
        scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank + 1)

    sorted_ids = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)
    return [doc_map[doc_id] for doc_id in sorted_ids[:top_n]]


def hybrid_search(query: str, top_n: int = 4) -> list[Document]:
    """Execute Hybrid Search: FAISS Dense Search + BM25 Sparse Search + RRF Re-ranking."""
    if not has_index():
        return []

    # 1. Dense FAISS Search
    vectorstore = FAISS.load_local(
        FAISS_DIR, embeddings, allow_dangerous_deserialization=True
    )
    dense_docs = vectorstore.similarity_search(query, k=6)

    # 2. Sparse BM25 Search
    all_chunks = _load_all_chunks()
    if not all_chunks:
        return dense_docs[:top_n]

    try:
        bm25_retriever = BM25Retriever.from_documents(all_chunks)
        bm25_retriever.k = 6
        sparse_docs = bm25_retriever.invoke(query)
        # 3. Reciprocal Rank Fusion
        return reciprocal_rank_fusion(dense_docs, sparse_docs, k=60, top_n=top_n)
    except Exception as e:
        print(f"BM25 fallback to dense: {e}")
        return dense_docs[:top_n]


def _contextualize_query(question: str, history: list[dict], groq_api_key: str) -> str:
    """Rephrase user question using chat history if available to create a standalone search query."""
    if not history:
        return question

    recent_turns = history[-4:]
    history_text = "\n".join([f"{h.get('role', 'user')}: {h.get('content', '')}" for h in recent_turns])

    for model_name in AVAILABLE_GROQ_MODELS:
        try:
            llm = ChatGroq(model=model_name, temperature=0, groq_api_key=groq_api_key)
            rephrase_prompt = ChatPromptTemplate.from_template("""
Given the recent chat history and a follow-up question, rephrase the follow-up question into a standalone question that can be understood without the chat history.
Do NOT answer the question. Only output the rephrased standalone query. If it is already standalone, return it as is.

Chat History:
{history_text}

Follow-up Question: {question}

Standalone Query:
""")
            chain = rephrase_prompt | llm | StrOutputParser()
            standalone = chain.invoke({"history_text": history_text, "question": question}).strip()
            return standalone if standalone else question
        except Exception:
            continue
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
    """Stream answers token-by-token using Hybrid Search (BM25 + FAISS) and Groq LLaMA/Qwen."""
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

        # 2. Hybrid Search (FAISS + BM25 via RRF)
        docs = hybrid_search(standalone_query, top_n=4)

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

        # 5. Stream Tokens with multi-model fallback
        stream_success = False
        for model_name in AVAILABLE_GROQ_MODELS:
            try:
                llm = ChatGroq(
                    model=model_name,
                    temperature=0.1,
                    streaming=True,
                    groq_api_key=groq_api_key,
                )
                async for chunk in llm.astream(chat_messages):
                    if chunk.content:
                        yield f"data: {json.dumps({'type': 'token', 'token': chunk.content})}\n\n"
                stream_success = True
                break
            except Exception as stream_err:
                print(f"Model {model_name} streaming error: {stream_err}")
                continue

        if not stream_success:
            yield f"data: {json.dumps({'type': 'error', 'error': 'Failed to generate answer. Please verify Groq API key.'})}\n\n"
            return

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"


def query_document(question: str, history: list[dict] = []) -> tuple[str, list[dict]]:
    """Synchronous query using Hybrid Search for standard endpoint fallback."""
    if not has_index():
        raise FileNotFoundError("No document has been ingested yet. Please upload a document first.")

    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        raise ValueError("GROQ_API_KEY is not set.")

    standalone_query = _contextualize_query(question, history, groq_api_key)

    docs = hybrid_search(standalone_query, top_n=4)
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

    for model_name in AVAILABLE_GROQ_MODELS:
        try:
            llm = ChatGroq(model=model_name, temperature=0.1, groq_api_key=groq_api_key)
            response = llm.invoke(chat_messages)
            return response.content, sources
        except Exception:
            continue

    raise RuntimeError("Failed to generate answer with available Groq models.")
