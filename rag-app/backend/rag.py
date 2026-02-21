import os
import fitz
from dotenv import load_dotenv
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_groq import ChatGroq
from langchain_community.vectorstores import FAISS
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

load_dotenv()

FAISS_DIR = "./faiss_db"
FAISS_INDEX_PATH = os.path.join(FAISS_DIR, "index.faiss")

# Local embeddings - no API key, no quota (runs on your machine)
embeddings = HuggingFaceEmbeddings(
    model_name="all-MiniLM-L6-v2",
    model_kwargs={"device": "cpu"},
    encode_kwargs={"normalize_embeddings": True}
)


def has_index() -> bool:
    """Return True if a FAISS index exists (at least one document has been ingested)."""
    return os.path.isfile(FAISS_INDEX_PATH)


def parse_pdf(file_path: str) -> str:
    doc = fitz.open(file_path)
    text = ""
    for page in doc:
        text += page.get_text()
    return text


def ingest_document(file_path: str) -> int:
    raw_text = parse_pdf(file_path)
    if not raw_text.strip():
        raise ValueError("PDF produced no text (possibly image-only; OCR not supported).")
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
    )
    chunks = splitter.split_text(raw_text)
    os.makedirs(FAISS_DIR, exist_ok=True)
    vectorstore = FAISS.from_texts(texts=chunks, embedding=embeddings)
    vectorstore.save_local(FAISS_DIR)
    return len(chunks)


def query_document(question: str) -> tuple[str, list[str]]:
    """
    Answer the question using the ingested document(s). Returns (answer, source_chunks).
    Raises FileNotFoundError if no index exists (no document ingested yet).
    """
    if not has_index():
        raise FileNotFoundError("No document has been ingested yet. Please upload a PDF first.")

    vectorstore = FAISS.load_local(
        FAISS_DIR,
        embeddings,
        allow_dangerous_deserialization=True,
    )
    docs = vectorstore.similarity_search(question, k=4)
    source_chunks = [d.page_content for d in docs]

    # Groq free tier: 30 req/min, 14.4K req/day (https://console.groq.com)
    llm = ChatGroq(model="llama-3.1-8b-instant", temperature=0)
    context = "\n\n---\n\n".join(source_chunks)
    prompt = ChatPromptTemplate.from_template("""
Answer the question based only on the following context. If the context does not contain enough information, say so.

Context:
{context}

Question: {question}
""")
    chain = prompt | llm | StrOutputParser()
    answer = chain.invoke({"context": context, "question": question})
    return answer, source_chunks