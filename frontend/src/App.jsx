import { useState, useEffect, useRef } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import {
  FileText,
  UploadCloud,
  Sparkles,
  Trash2,
  Copy,
  Check,
  Send,
  RefreshCw,
  BookOpen,
  AlertCircle,
  Bot,
  User,
  Layers,
  FileCode,
  File,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "https://mk1311-docchat-ai-backend.hf.space";

const SUGGESTED_PROMPTS = [
  "📌 Summarize key highlights of this document",
  "🎯 What are the main takeaways & conclusions?",
  "📋 List important skills, qualifications, or requirements",
  "❓ What critical questions does this document answer?",
];

export default function App() {
  const [file, setFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const [hasDocument, setHasDocument] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [statusLoading, setStatusLoading] = useState(true);
  const [isWakingUp, setIsWakingUp] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);

  const chatBottomRef = useRef(null);

  const fetchStatus = async () => {
    setStatusLoading(true);
    const wakeTimer = setTimeout(() => {
      setIsWakingUp(true);
    }, 2500);

    try {
      const res = await axios.get(`${API}/status`);
      setHasDocument(Boolean(res.data.has_document));
      setDocuments(res.data.documents || []);
    } catch {
      setHasDocument(false);
      setDocuments([]);
    } finally {
      clearTimeout(wakeTimer);
      setIsWakingUp(false);
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleUpload = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    setUploading(true);
    setUploadStatus("");
    try {
      const res = await axios.post(`${API}/upload`, formData);
      setUploadStatus(res.data.message || "Document processed successfully.");
      setHasDocument(true);
      setFile(null);
      await fetchStatus();
    } catch (err) {
      const detail = err.response?.data?.detail ?? err.message ?? "Upload failed. Check backend connection.";
      const msg = typeof detail === "string" ? detail : Array.isArray(detail) ? detail.join(" ") : "Upload failed.";
      setUploadStatus(`❌ ${msg}`);
    } finally {
      setUploading(false);
    }
  };

  const handleResetDocuments = async () => {
    if (!window.confirm("Are you sure you want to clear all loaded documents from the knowledge base?")) {
      return;
    }
    try {
      await axios.delete(`${API}/documents`);
      setHasDocument(false);
      setDocuments([]);
      setMessages([]);
      setUploadStatus("Knowledge base cleared.");
    } catch (err) {
      alert("Failed to reset documents: " + (err.response?.data?.detail || err.message));
    }
  };

  const handleAsk = async (customQuestion = null) => {
    const query = (customQuestion || question).trim();
    if (!query || loading) return;

    const userMsg = { role: "user", text: query };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setQuestion("");
    setLoading(true);
    setIsStreaming(true);

    // Prepare message history payload
    const historyPayload = messages
      .filter((m) => !m.isError)
      .map((m) => ({
        role: m.role === "ai" ? "assistant" : "user",
        content: m.text,
      }));

    // Placeholder for incoming AI response
    const aiIndex = newHistory.length;
    setMessages((prev) => [
      ...prev,
      { role: "ai", text: "", sources: [], isStreaming: true },
    ]);

    try {
      const response = await fetch(`${API}/ask/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: query,
          history: historyPayload,
        }),
      });

      if (response.status === 404) {
        // Graceful fallback to standard /ask endpoint
        const fallbackRes = await axios.post(`${API}/ask`, {
          question: query,
          history: historyPayload,
        });
        setMessages((prev) =>
          prev.map((msg, idx) =>
            idx === aiIndex
              ? {
                  role: "ai",
                  text: fallbackRes.data.answer,
                  sources: fallbackRes.data.sources || [],
                  isStreaming: false,
                }
              : msg
          )
        );
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Server returned error status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullAnswer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const data = JSON.parse(jsonStr);

            if (data.type === "sources") {
              setMessages((prev) =>
                prev.map((msg, idx) =>
                  idx === aiIndex ? { ...msg, sources: data.sources || [] } : msg
                )
              );
            } else if (data.type === "token") {
              fullAnswer += data.token;
              setMessages((prev) =>
                prev.map((msg, idx) =>
                  idx === aiIndex ? { ...msg, text: fullAnswer } : msg
                )
              );
            } else if (data.type === "error") {
              setMessages((prev) =>
                prev.map((msg, idx) =>
                  idx === aiIndex
                    ? {
                        ...msg,
                        text: `❌ ${data.error}`,
                        isStreaming: false,
                        isError: true,
                      }
                    : msg
                )
              );
              break;
            } else if (data.type === "done") {
              setMessages((prev) =>
                prev.map((msg, idx) =>
                  idx === aiIndex ? { ...msg, isStreaming: false } : msg
                )
              );
            }
          } catch (e) {
            if (e.message !== "Unexpected end of JSON input") {
              console.error("Stream parse error:", e);
            }
          }
        }
      }

      // Mark streaming finished
      setMessages((prev) =>
        prev.map((msg, idx) =>
          idx === aiIndex ? { ...msg, isStreaming: false } : msg
        )
      );
    } catch (err) {
      const errMsg = err.message || "Error generating response.";
      setMessages((prev) =>
        prev.map((msg, idx) =>
          idx === aiIndex
            ? {
                role: "ai",
                text: `❌ ${errMsg}`,
                sources: [],
                isError: true,
                isStreaming: false,
              }
            : msg
        )
      );
    } finally {
      setLoading(false);
      setIsStreaming(false);
    }
  };

  const handleCopy = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith(".pdf") || f.name.endsWith(".txt") || f.name.endsWith(".md"))) {
      setFile(f);
    }
  };

  const getFileIcon = (name) => {
    if (name.endsWith(".pdf")) return <FileText className="w-4 h-4 text-red-400" />;
    if (name.endsWith(".md") || name.endsWith(".txt")) return <FileCode className="w-4 h-4 text-sky-400" />;
    return <File className="w-4 h-4 text-amber-400" />;
  };

  return (
    <div className="min-h-screen bg-mesh flex flex-col selection:bg-amber-500/30 selection:text-amber-200">
      {/* Header */}
      <header className="border-b border-slate-700/60 bg-slate-900/60 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/30 to-orange-600/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/10">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-lg text-slate-100 tracking-tight">DocChat AI</h1>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-500/20 text-amber-300 rounded-full border border-amber-500/30">
                  RAG 2.0
                </span>
              </div>
              <p className="text-xs text-slate-400">Intelligent conversational document assistant</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasDocument && (
              <button
                onClick={handleResetDocuments}
                title="Clear all indexed documents"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset KB</span>
              </button>
            )}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700/80 text-xs text-slate-300">
              <span
                className={`w-2 h-2 rounded-full ${
                  isWakingUp
                    ? "bg-amber-400 animate-ping"
                    : hasDocument
                    ? "bg-emerald-400 animate-pulse"
                    : "bg-slate-500"
                }`}
              />
              <span className="font-medium text-[11px]">
                {isWakingUp
                  ? "Waking up cloud backend..."
                  : statusLoading
                  ? "Connecting..."
                  : hasDocument
                  ? `${documents.length || 1} Doc(s) Ready`
                  : "No Document"}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
        {isWakingUp && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-center justify-center gap-2.5 animate-fade-up shadow-sm">
            <RefreshCw className="w-4 h-4 animate-spin text-amber-400 flex-shrink-0" />
            <span>Connecting to free cloud backend (waking container from standby, takes ~20-30s)...</span>
          </div>
        )}

        {/* Upload & Document Management Section */}
        <section className="glass rounded-2xl p-5 sm:p-6 shadow-xl border border-slate-700/50 animate-fade-up">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold border border-amber-500/30">
                1
              </span>
              <h2 className="font-semibold text-sm sm:text-base text-slate-200">
                Knowledge Base & Document Upload
              </h2>
            </div>
            <span className="text-xs text-slate-400">Supports PDF, TXT, MD</span>
          </div>

          {/* Active Documents Banner */}
          {documents.length > 0 && (
            <div className="mb-4 p-3 rounded-xl bg-slate-900/70 border border-slate-700/60">
              <div className="flex items-center gap-2 mb-2 text-xs font-medium text-slate-400">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                <span>Indexed Documents ({documents.length})</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {documents.map((doc, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-800/90 border border-slate-700 text-xs text-slate-200"
                  >
                    {getFileIcon(doc.filename)}
                    <span className="font-medium truncate max-w-[180px]">{doc.filename}</span>
                    <span className="text-[10px] text-amber-400/90 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                      {doc.chunks} chunks
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dropzone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            className={`relative border-2 border-dashed rounded-xl p-6 sm:p-8 text-center transition-all duration-200 cursor-pointer ${
              isDragging
                ? "border-amber-500/80 bg-amber-500/10 scale-[0.99]"
                : "border-slate-700/80 hover:border-slate-600 bg-slate-900/40"
            }`}
          >
            <input
              type="file"
              accept=".pdf,.txt,.md"
              onChange={(e) => setFile(e.target.files[0])}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <FileText className="w-6 h-6" />
                </div>
                <p className="font-semibold text-slate-200 text-sm">{file.name}</p>
                <p className="text-xs text-slate-400">
                  {(file.size / 1024).toFixed(1)} KB • Click or drop another to change
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-xl bg-slate-800/70 border border-slate-700/60 flex items-center justify-center text-slate-400">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <p className="font-medium text-slate-300 text-sm">Drop document here or click to browse</p>
                <p className="text-xs text-slate-500">PDF, TXT, or Markdown documents</p>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="w-full sm:w-auto flex-1 py-2.5 px-5 rounded-xl font-semibold text-sm bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-amber-500/10 flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Ingesting & Chunking Document...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4" />
                  <span>Upload & Ingest to Knowledge Base</span>
                </>
              )}
            </button>
          </div>

          {uploadStatus && (
            <p
              className={`mt-3 text-xs sm:text-sm font-medium ${
                uploadStatus.startsWith("❌") ? "text-rose-400" : "text-emerald-400"
              }`}
            >
              {uploadStatus}
            </p>
          )}
        </section>

        {/* Chat Conversation Section */}
        <section className="glass rounded-2xl p-5 sm:p-6 shadow-xl border border-slate-700/50 flex flex-col flex-1 min-h-[480px]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold border border-amber-500/30">
                2
              </span>
              <h2 className="font-semibold text-sm sm:text-base text-slate-200">
                Conversational Document Q&A
              </h2>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Chat</span>
              </button>
            )}
          </div>

          {/* Empty / Initial State */}
          {!hasDocument && !statusLoading && (
            <div className="flex-1 flex flex-col items-center justify-center rounded-xl bg-slate-900/40 border border-dashed border-slate-800 p-8 text-center my-4">
              <AlertCircle className="w-10 h-10 text-amber-500/60 mb-2" />
              <p className="text-slate-300 font-medium text-sm">No Document in Knowledge Base</p>
              <p className="text-slate-500 text-xs mt-1 max-w-sm">
                Upload your resume, research paper, policy, or notes above to begin asking questions.
              </p>
            </div>
          )}

          {/* Suggested Prompts Banner */}
          {hasDocument && messages.length === 0 && (
            <div className="my-auto py-6 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-3">
                <Bot className="w-6 h-6" />
              </div>
              <h3 className="font-medium text-slate-200 text-sm mb-1">DocChat AI is Ready</h3>
              <p className="text-xs text-slate-400 mb-5 max-w-md">
                Ask anything about your uploaded documents or pick one of these suggested prompts to get started:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-lg">
                {SUGGESTED_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => handleAsk(prompt)}
                    className="p-3 text-left text-xs text-slate-300 bg-slate-800/60 hover:bg-slate-800 hover:border-amber-500/40 border border-slate-700/60 rounded-xl transition-all duration-150 leading-relaxed group"
                  >
                    <span className="group-hover:text-amber-300 transition-colors">{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message List */}
          <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1 min-h-[260px] max-h-[500px]">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-3 animate-fade-up ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.role === "ai" && (
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 flex-shrink-0 mt-1">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`relative group max-w-[88%] sm:max-w-[82%] rounded-2xl p-4 text-sm ${
                    msg.role === "user"
                      ? "bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-medium rounded-tr-sm shadow-md"
                      : "bg-slate-900/80 border border-slate-700/70 text-slate-200 rounded-tl-sm shadow-sm"
                  }`}
                >
                  {/* Copy Button for AI response */}
                  {msg.role === "ai" && !msg.isStreaming && !msg.isError && msg.text && (
                    <button
                      onClick={() => handleCopy(msg.text, i)}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 rounded-md bg-slate-800 border border-slate-700 text-slate-400 hover:text-amber-400 transition-all"
                      title="Copy response"
                    >
                      {copiedIndex === i ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}

                  {/* Message Content */}
                  {msg.role === "user" ? (
                    <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>
                  ) : (
                    <div className="leading-relaxed prose-docchat">
                      {msg.text ? (
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                      ) : (
                        <span className="text-slate-400 text-xs italic flex items-center gap-1.5">
                          <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                          Thinking & synthesizing answer...
                        </span>
                      )}
                      {msg.isStreaming && <span className="typing-cursor" />}
                    </div>
                  )}

                  {/* Expandable Citations */}
                  {msg.role === "ai" && msg.sources && msg.sources.length > 0 && (
                    <details className="mt-3.5 pt-3 border-t border-slate-700/60 group/details text-left">
                      <summary className="text-xs font-semibold text-slate-400 cursor-pointer hover:text-amber-400 transition-colors inline-flex items-center gap-1.5 select-none">
                        <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                        <span>View {msg.sources.length} cited source{msg.sources.length > 1 ? "s" : ""}</span>
                      </summary>
                      <div className="mt-2.5 space-y-2 text-xs">
                        {msg.sources.slice(0, 4).map((src, j) => {
                          const isObj = typeof src === "object" && src !== null;
                          const page = isObj ? src.page : null;
                          const sourceName = isObj ? src.source : null;
                          const text = isObj ? src.text : src;
                          return (
                            <div
                              key={j}
                              className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 text-slate-300"
                            >
                              <div className="flex items-center gap-2 mb-1.5">
                                {page && (
                                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded">
                                    Page {page}
                                  </span>
                                )}
                                {sourceName && (
                                  <span className="text-[11px] text-slate-400 truncate max-w-[220px]">
                                    {sourceName}
                                  </span>
                                )}
                              </div>
                              <p className="line-clamp-3 text-slate-400 italic font-mono text-[11px]">
                                "{text}"
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  )}
                </div>

                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 flex-shrink-0 mt-1">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>

          {/* Chat Input */}
          <div className="mt-4 pt-3 border-t border-slate-700/50 flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleAsk()}
                placeholder={
                  hasDocument
                    ? "Ask a question about your documents..."
                    : "Upload a document above to start asking questions..."
                }
                disabled={!hasDocument || loading}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-900/80 border border-slate-700/80 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                onClick={() => handleAsk()}
                disabled={loading || !question.trim() || !hasDocument}
                className="py-3 px-4 sm:px-5 rounded-xl font-semibold text-sm bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 shadow-md shadow-amber-500/10"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span className="hidden sm:inline">Ask</span>
                  </>
                )}
              </button>
            </div>
            {messages.length > 0 && (
              <p className="text-[11px] text-slate-500 text-right">
                Multi-turn conversation active • Ask follow-up questions anytime
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
