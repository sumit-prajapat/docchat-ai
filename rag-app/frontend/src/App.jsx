import { useState, useEffect } from "react";
import axios from "axios";

const API = "https://docchat-ai-backend.onrender.com";

export default function App() {
  const [file, setFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const [hasDocument, setHasDocument] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fetchStatus = async () => {
    setStatusLoading(true);
    try {
      const res = await axios.get(`${API}/status`);
      setHasDocument(res.data.has_document ?? false);
    } catch {
      setHasDocument(false);
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    setUploading(true);
    setUploadStatus("");
    try {
      const res = await axios.post(`${API}/upload`, formData);
      setUploadStatus(res.data.message ?? "Uploaded.");
      setHasDocument(true);
    } catch (err) {
      const detail = err.response?.data?.detail ?? err.message ?? "Upload failed. Check backend.";
      const msg = typeof detail === "string" ? detail : Array.isArray(detail) ? detail.join(" ") : "Upload failed.";
      setUploadStatus(`❌ ${msg}`);
    } finally {
      setUploading(false);
    }
  };

  const handleAsk = async () => {
    if (!question.trim()) return;
    const userMsg = { role: "user", text: question };
    setMessages((prev) => [...prev, userMsg]);
    setQuestion("");
    setLoading(true);
    try {
      const res = await axios.post(`${API}/ask`, { question });
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: res.data.answer, sources: res.data.sources ?? [] },
      ]);
    } catch (err) {
      const detail = err.response?.data?.detail ?? "Error fetching answer.";
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: `❌ ${typeof detail === "string" ? detail : "Error."}`, sources: [] },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f?.name.toLowerCase().endsWith(".pdf")) setFile(f);
  };
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);

  return (
    <div className="min-h-screen bg-mesh flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-700/50 bg-slate-900/40 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 border border-amber-500/30 flex items-center justify-center text-xl">
            📄
          </div>
          <div>
            <h1 className="font-semibold text-lg text-slate-100 tracking-tight">DocChat AI</h1>
            <p className="text-xs text-slate-500">Ask anything about your documents</p>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full flex flex-col items-center px-6 py-8">
        <div className="max-w-2xl w-full flex flex-col gap-8 items-center text-center">
        {/* Upload Section */}
        <section className="glass rounded-2xl p-6 animate-fade-up w-full">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-md bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-semibold">1</span>
            <h2 className="font-medium text-slate-200">Upload your PDF</h2>
          </div>

          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${
              isDragging
                ? "border-amber-500/50 bg-amber-500/5"
                : "border-slate-600/60 hover:border-slate-500/80 bg-slate-800/30"
            }`}
          >
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setFile(e.target.files[0])}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <span className="text-3xl">📑</span>
                <p className="font-medium text-slate-200">{file.name}</p>
                <p className="text-sm text-slate-500">Click or drop another file to replace</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <span className="text-4xl opacity-80">📁</span>
                <p className="font-medium text-slate-300">Drop your PDF here</p>
                <p className="text-sm text-slate-500">or click to browse</p>
              </div>
            )}
          </div>

          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="mt-4 w-full py-3 px-4 rounded-xl font-medium bg-gradient-to-r from-amber-500 to-orange-600 text-slate-900 hover:from-amber-400 hover:to-orange-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-amber-500 disabled:hover:to-orange-600 transition-all duration-200"
          >
            {uploading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
                Processing…
              </span>
            ) : (
              "Upload & process"
            )}
          </button>

          {uploadStatus && (
            <p className={`mt-3 text-sm text-center ${uploadStatus.startsWith("❌") ? "text-red-400" : "text-emerald-400"}`}>
              {uploadStatus}
            </p>
          )}
          {!statusLoading && !hasDocument && (
            <p className="mt-2 text-sm text-amber-500/80 text-center">Upload a PDF to start asking questions</p>
          )}
        </section>

        {/* Chat Section */}
        <section className="glass rounded-2xl p-6 flex flex-col gap-4 flex-1 min-h-[320px] animate-fade-up w-full" style={{ animationDelay: "0.1s" }}>
          <div className="flex items-center justify-center gap-2">
            <span className="w-6 h-6 rounded-md bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-semibold">2</span>
            <h2 className="font-medium text-slate-200">Ask questions</h2>
          </div>

          {!statusLoading && !hasDocument && (
            <div className="flex-1 flex items-center justify-center rounded-xl bg-slate-800/40 border border-slate-700/50">
              <p className="text-slate-500 text-center px-6">
                No document loaded. Upload a PDF above to get started.
              </p>
            </div>
          )}

          <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1 min-h-[200px]">
            {messages.length === 0 && hasDocument && (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-slate-500 text-sm">Your conversation will appear here…</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className="stagger flex justify-center"
              >
                <div
                  className={`w-full rounded-2xl px-5 py-4 border ${
                    msg.role === "user"
                      ? "bg-gradient-to-r from-amber-500/90 to-orange-600/90 text-slate-900 border-amber-400/30"
                      : "glass text-slate-200 border-slate-600/50 bg-slate-800/40"
                  }`}
                >
                  <div className={`whitespace-pre-wrap text-[15px] leading-relaxed ${msg.role === "user" ? "text-center" : "text-left"}`}>{msg.text}</div>
                  {msg.role === "ai" && msg.sources?.length > 0 && (
                    <details className="mt-3 pt-3 border-t border-slate-600/50 group">
                      <summary className="text-xs text-slate-500 cursor-pointer hover:text-amber-400/90 transition-colors">
                        View {msg.sources.length} source{msg.sources.length > 1 ? "s" : ""}
                      </summary>
                      <ul className="mt-2 space-y-2 text-xs text-slate-500 text-left">
                        {msg.sources.slice(0, 4).map((src, j) => (
                          <li key={j} className="line-clamp-2 pl-3 border-l-2 border-amber-500/40">
                            {src}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-center">
                <div className="glass rounded-2xl px-4 py-3 flex items-center justify-center gap-2 border border-slate-600/50">
                  <span className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-500/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 rounded-full bg-amber-500/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 rounded-full bg-amber-500/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                  <span className="text-sm text-slate-400">Thinking…</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2 w-full">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleAsk()}
              placeholder="Ask something about your document…"
              className="flex-1 py-3 px-4 rounded-xl bg-slate-800/60 border border-slate-600/50 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all"
              disabled={!hasDocument}
            />
            <button
              onClick={handleAsk}
              disabled={loading || !question.trim() || !hasDocument}
              className="py-3 px-5 rounded-xl font-medium bg-amber-500/90 hover:bg-amber-500 text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Ask
            </button>
          </div>
        </section>
        </div>
      </main>
    </div>
  );
}
