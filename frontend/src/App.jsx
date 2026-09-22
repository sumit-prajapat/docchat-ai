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
  Eye,
  EyeOff,
  ExternalLink,
  Zap,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Download,
  CheckCircle2,
  Filter,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "https://mk1311-docchat-ai-backend.hf.space";

export default function App() {
  const [file, setFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const [hasDocument, setHasDocument] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [activeDoc, setActiveDoc] = useState(null);
  const [docFilter, setDocFilter] = useState("all");
  const [statusLoading, setStatusLoading] = useState(true);
  const [isWakingUp, setIsWakingUp] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);

  // Document Viewer State
  const [showViewer, setShowViewer] = useState(true);
  const [viewerPage, setViewerPage] = useState(1);

  // Voice Mode State
  const [isListening, setIsListening] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState(null);
  const speechRecognitionRef = useRef(null);

  const chatBottomRef = useRef(null);

  const fetchStatus = async () => {
    setStatusLoading(true);
    const wakeTimer = setTimeout(() => {
      setIsWakingUp(true);
    }, 2500);

    try {
      const res = await axios.get(`${API}/status`);
      const docs = res.data.documents || [];
      setHasDocument(Boolean(res.data.has_document));
      setDocuments(docs);
      if (docs.length > 0 && !activeDoc) {
        setActiveDoc(docs[0]);
      }
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

  // Voice: Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map((r) => r[0].transcript)
          .join("");
        setQuestion(transcript);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      speechRecognitionRef.current = recognition;
    }
  }, []);

  const toggleListening = () => {
    if (!speechRecognitionRef.current) {
      alert("Speech recognition is not supported in this browser. Please try Chrome, Edge, or Safari.");
      return;
    }

    if (isListening) {
      speechRecognitionRef.current.stop();
      setIsListening(false);
    } else {
      setQuestion("");
      speechRecognitionRef.current.start();
      setIsListening(true);
    }
  };

  const toggleSpeak = (text, index) => {
    if (!("speechSynthesis" in window)) {
      alert("Text-to-speech is not supported in your browser.");
      return;
    }

    if (speakingIndex === index) {
      window.speechSynthesis.cancel();
      setSpeakingIndex(null);
      return;
    }

    window.speechSynthesis.cancel();
    // Strip markdown formatting characters for natural speech
    const cleanText = text
      .replace(/[*#_`~]/g, "")
      .replace(/\[Page \d+\]/g, "")
      .replace(/https?:\/\/\S+/g, "");

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onend = () => setSpeakingIndex(null);
    utterance.onerror = () => setSpeakingIndex(null);

    setSpeakingIndex(index);
    window.speechSynthesis.speak(utterance);
  };

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

      const uploadedFilename = res.data.details?.filename;
      if (uploadedFilename) {
        setActiveDoc({
          filename: uploadedFilename,
          insights: res.data.insights || {},
          chunks: res.data.details?.chunks || 0,
        });
        setViewerPage(1);
      }
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
      setActiveDoc(null);
      setMessages([]);
      setUploadStatus("Knowledge base cleared.");
    } catch (err) {
      alert("Failed to reset documents: " + (err.response?.data?.detail || err.message));
    }
  };

  const handleAsk = async (customQuestion = null) => {
    const query = (customQuestion || question).trim();
    if (!query || loading) return;

    if (isListening && speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      setIsListening(false);
    }

    const userMsg = { role: "user", text: query };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setQuestion("");
    setLoading(true);
    setIsStreaming(true);

    const historyPayload = messages
      .filter((m) => !m.isError)
      .map((m) => ({
        role: m.role === "ai" ? "assistant" : "user",
        content: m.text,
      }));

    const filterTarget = docFilter === "all" ? null : docFilter;

    const aiIndex = newHistory.length;
    setMessages((prev) => [
      ...prev,
      { role: "ai", text: "", sources: [], confidence: null, isStreaming: true },
    ]);

    try {
      const response = await fetch(`${API}/ask/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: query,
          history: historyPayload,
          filter_doc: filterTarget,
        }),
      });

      // Fallback to standard /ask if /ask/stream is not found (404)
      if (response.status === 404) {
        const fallbackRes = await axios.post(`${API}/ask`, {
          question: query,
          history: historyPayload,
          filter_doc: filterTarget,
        });
        setMessages((prev) =>
          prev.map((msg, idx) =>
            idx === aiIndex
              ? {
                  role: "ai",
                  text: fallbackRes.data.answer,
                  sources: fallbackRes.data.sources || [],
                  confidence: fallbackRes.data.confidence || 88,
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
            } else if (data.type === "confidence") {
              setMessages((prev) =>
                prev.map((msg, idx) =>
                  idx === aiIndex ? { ...msg, confidence: data.score } : msg
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

  const handleSourceClick = (src) => {
    const isObj = typeof src === "object" && src !== null;
    const pageNum = isObj ? src.page : 1;
    const srcDocName = isObj ? src.source : null;

    if (srcDocName) {
      const matchingDoc = documents.find((d) => d.filename === srcDocName);
      if (matchingDoc) {
        setActiveDoc(matchingDoc);
      } else {
        setActiveDoc({ filename: srcDocName });
      }
    }
    setViewerPage(pageNum || 1);
    setShowViewer(true);
  };

  // Feature 2: Executive Report Exporter
  const handleExportReport = () => {
    const title = activeDoc?.filename || "Document";
    let report = `# DocChat AI - Executive Q&A Briefing Report\n\n`;
    report += `**Document:** ${title}\n`;
    report += `**Generated:** ${new Date().toLocaleString()}\n`;
    report += `**Total Q&A Exchanges:** ${messages.filter((m) => m.role === "user").length}\n\n`;
    report += `---\n\n`;

    if (activeDoc?.insights?.summary) {
      report += `## 📋 Executive Summary\n\n${activeDoc.insights.summary}\n\n`;
    }

    if (activeDoc?.insights?.takeaways?.length > 0) {
      report += `### Key Highlights\n\n`;
      activeDoc.insights.takeaways.forEach((point) => {
        report += `- ${point}\n`;
      });
      report += `\n`;
    }

    report += `## 💬 Q&A Transcript\n\n`;
    let qNum = 1;
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === "user") {
        report += `### Q${qNum}: ${msg.text}\n\n`;
        qNum++;
      } else if (msg.role === "ai" && !msg.isError) {
        report += `**Answer:**\n\n${msg.text}\n\n`;
        if (msg.confidence) {
          report += `*Confidence Grounding:* ${msg.confidence}%\n\n`;
        }
        if (msg.sources?.length > 0) {
          report += `*Cited Sources:*\n`;
          msg.sources.forEach((s) => {
            const pageStr = s.page ? ` (Page ${s.page})` : "";
            report += `> "${s.text}" — *${s.source || title}${pageStr}*\n\n`;
          });
        }
        report += `---\n\n`;
      }
    }

    const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.replace(/\.[^/.]+$/, "")}-briefing-report.md`;
    link.click();
    URL.revokeObjectURL(url);
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
    if (!name) return <File className="w-4 h-4 text-amber-400" />;
    if (name.endsWith(".pdf")) return <FileText className="w-4 h-4 text-red-400" />;
    if (name.endsWith(".md") || name.endsWith(".txt")) return <FileCode className="w-4 h-4 text-sky-400" />;
    return <File className="w-4 h-4 text-amber-400" />;
  };

  const currentInsights = activeDoc?.insights || documents[0]?.insights;

  return (
    <div className="min-h-screen bg-mesh flex flex-col selection:bg-amber-500/30 selection:text-amber-200">
      {/* Header */}
      <header className="border-b border-slate-700/60 bg-slate-900/60 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/30 to-orange-600/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-md shadow-amber-500/10">
              <Sparkles className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base sm:text-lg text-slate-100 tracking-tight">DocChat AI</h1>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-500/20 text-amber-300 rounded-full border border-amber-500/30 flex items-center gap-1">
                  <Zap className="w-2.5 h-2.5 text-amber-400" />
                  <span>Hybrid RAG + Voice</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                BM25 + FAISS Dense Embeddings with Real-time Streaming & Voice
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasDocument && (
              <>
                {/* Export Briefing Report */}
                {messages.length > 0 && (
                  <button
                    onClick={handleExportReport}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800/90 text-slate-200 hover:text-amber-300 hover:bg-slate-700 border border-slate-700 transition-colors shadow-sm"
                    title="Download Executive Briefing Report (.md)"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden sm:inline">Export Report</span>
                  </button>
                )}

                {/* Toggle PDF Viewer */}
                <button
                  onClick={() => setShowViewer(!showViewer)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    showViewer
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                      : "bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700"
                  }`}
                  title="Toggle Side-by-Side PDF Viewer"
                >
                  {showViewer ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{showViewer ? "Hide Document" : "Show Document"}</span>
                </button>

                <button
                  onClick={handleResetDocuments}
                  title="Clear all indexed documents"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Reset KB</span>
                </button>
              </>
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
                  ? "Waking cloud backend..."
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
      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 flex flex-col gap-4">
        {isWakingUp && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-center justify-center gap-2.5 animate-fade-up shadow-sm">
            <RefreshCw className="w-4 h-4 animate-spin text-amber-400 flex-shrink-0" />
            <span>Connecting to free cloud backend (waking container from standby, takes ~20–30s)...</span>
          </div>
        )}

        {/* Compact Document Ingestion Bar */}
        <section className="glass rounded-2xl p-4 shadow-lg border border-slate-700/50">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div
                onDrop={handleDrop}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                className={`relative border border-dashed rounded-xl px-4 py-2 text-center transition-all duration-200 cursor-pointer flex items-center gap-2 ${
                  isDragging
                    ? "border-amber-500 bg-amber-500/10"
                    : "border-slate-700 hover:border-slate-600 bg-slate-900/60"
                }`}
              >
                <input
                  type="file"
                  accept=".pdf,.txt,.md"
                  onChange={(e) => setFile(e.target.files[0])}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <UploadCloud className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-slate-300 font-medium">
                  {file ? file.name : "Add PDF, TXT, or MD..."}
                </span>
              </div>

              {file && (
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-sm"
                >
                  {uploading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Ingesting...</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-3.5 h-3.5" />
                      <span>Process File</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Document Switcher & Scope Filter */}
            {documents.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto max-w-full py-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-500 font-medium mr-1 flex items-center gap-1">
                    <Layers className="w-3 h-3 text-amber-400" />
                    <span>Docs:</span>
                  </span>
                  {documents.map((doc, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setActiveDoc(doc);
                        setViewerPage(1);
                      }}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all ${
                        activeDoc?.filename === doc.filename
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold"
                          : "bg-slate-800/80 text-slate-400 border border-slate-700/60 hover:text-slate-200"
                      }`}
                    >
                      {getFileIcon(doc.filename)}
                      <span className="truncate max-w-[130px]">{doc.filename}</span>
                      <span className="text-[10px] text-slate-400 opacity-80">{doc.chunks}c</span>
                    </button>
                  ))}
                </div>

                {documents.length > 1 && (
                  <div className="flex items-center gap-1 border-l border-slate-700 pl-2">
                    <Filter className="w-3 h-3 text-slate-400" />
                    <select
                      value={docFilter}
                      onChange={(e) => setDocFilter(e.target.value)}
                      className="bg-slate-800 text-[11px] text-slate-300 border border-slate-700 rounded-md px-1.5 py-0.5 focus:outline-none"
                    >
                      <option value="all">Search All Docs</option>
                      {documents.map((d, i) => (
                        <option key={i} value={d.filename}>
                          Only {d.filename}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          {uploadStatus && (
            <p
              className={`mt-2.5 text-xs font-medium ${
                uploadStatus.startsWith("❌") ? "text-rose-400" : "text-emerald-400"
              }`}
            >
              {uploadStatus}
            </p>
          )}
        </section>

        {/* Automated Document Intelligence Card */}
        {hasDocument && currentInsights && currentInsights.summary && (
          <section className="p-4 rounded-2xl bg-gradient-to-r from-slate-900/90 via-slate-800/70 to-slate-900/90 border border-amber-500/30 shadow-md">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs sm:text-sm font-semibold text-slate-200">
                  AI Document Insights • <span className="text-amber-400 font-normal">{activeDoc?.filename}</span>
                </h3>
              </div>
              <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                Auto-Analyzed
              </span>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-3">
              {currentInsights.summary}
            </p>

            {currentInsights.takeaways?.length > 0 && (
              <div className="mb-3">
                <span className="text-[11px] font-semibold text-amber-400 block mb-1.5">Key Highlights:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {currentInsights.takeaways.map((point, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-lg bg-slate-900/60 border border-slate-700/60 text-[11px] text-slate-300 flex items-start gap-1.5"
                    >
                      <span className="text-amber-400 font-bold">•</span>
                      <span>{point}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currentInsights.suggested_questions?.length > 0 && (
              <div>
                <span className="text-[11px] font-semibold text-amber-400 block mb-1.5">
                  Suggested Questions for this Document:
                </span>
                <div className="flex flex-wrap gap-2">
                  {currentInsights.suggested_questions.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAsk(q)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 hover:border-amber-500/50 border border-slate-700 text-left text-xs text-slate-300 hover:text-amber-300 transition-all flex items-center gap-1.5 group"
                    >
                      <span className="text-amber-400/80 group-hover:text-amber-300">❓</span>
                      <span>{q}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Side-by-Side Area (Document Viewer + Chat) */}
        <div
          className={`grid gap-4 flex-1 transition-all duration-300 ${
            showViewer && hasDocument && activeDoc ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"
          }`}
        >
          {/* Side-by-Side Document Viewer */}
          {showViewer && hasDocument && activeDoc && (
            <div className="glass rounded-2xl p-4 shadow-xl border border-slate-700/50 flex flex-col h-[660px] animate-fade-up">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-700/60">
                <div className="flex items-center gap-2">
                  {getFileIcon(activeDoc.filename)}
                  <span className="text-xs sm:text-sm font-semibold text-slate-200 truncate max-w-[220px]">
                    {activeDoc.filename}
                  </span>
                  <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 font-mono">
                    Page {viewerPage}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`${API}/files/${activeDoc.filename}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open document in new tab"
                    className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-amber-400 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              <div className="flex-1 w-full rounded-xl overflow-hidden bg-slate-950 border border-slate-800">
                {activeDoc.filename.endsWith(".pdf") ? (
                  <iframe
                    key={`${activeDoc.filename}-${viewerPage}`}
                    src={`${API}/files/${activeDoc.filename}#page=${viewerPage}`}
                    title="Document Viewer"
                    className="w-full h-full border-none rounded-xl"
                  />
                ) : (
                  <div className="p-4 text-xs text-slate-300 font-mono overflow-auto h-full whitespace-pre-wrap leading-relaxed">
                    <p className="text-slate-500 italic mb-2">// Showing text content for {activeDoc.filename}</p>
                    <iframe
                      src={`${API}/files/${activeDoc.filename}`}
                      title="Text Viewer"
                      className="w-full h-full border-none"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Conversational Q&A Section */}
          <section className="glass rounded-2xl p-4 sm:p-5 shadow-xl border border-slate-700/50 flex flex-col h-[660px]">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-700/60">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold border border-amber-500/30">
                  💬
                </span>
                <h2 className="font-semibold text-xs sm:text-sm text-slate-200">
                  Conversational Q&A
                </h2>
                {docFilter !== "all" && (
                  <span className="text-[10px] text-amber-300 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/30">
                    Filtered: {docFilter}
                  </span>
                )}
              </div>
              {messages.length > 0 && (
                <button
                  onClick={() => setMessages([])}
                  className="text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {/* Empty State */}
            {!hasDocument && !statusLoading && (
              <div className="flex-1 flex flex-col items-center justify-center rounded-xl bg-slate-900/40 border border-dashed border-slate-800 p-8 text-center my-auto">
                <AlertCircle className="w-9 h-9 text-amber-500/60 mb-2" />
                <p className="text-slate-300 font-medium text-sm">No Documents in Knowledge Base</p>
                <p className="text-slate-500 text-xs mt-1 max-w-xs">
                  Upload a document above to experience Hybrid Search, voice Q&A, and live streaming.
                </p>
              </div>
            )}

            {/* Initial Welcome message */}
            {hasDocument && messages.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 my-auto">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-2.5">
                  <Bot className="w-5 h-5" />
                </div>
                <h4 className="font-medium text-slate-200 text-sm mb-1">DocChat AI Ready</h4>
                <p className="text-xs text-slate-400 max-w-sm mb-3">
                  Ask by typing or clicking the microphone icon to speak naturally.
                </p>
              </div>
            )}

            {/* Message List */}
            <div className="flex-1 flex flex-col gap-3.5 overflow-y-auto pr-1">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-2.5 animate-fade-up ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {msg.role === "ai" && (
                    <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 flex-shrink-0 mt-0.5">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                  )}

                  <div
                    className={`relative group max-w-[90%] sm:max-w-[85%] rounded-2xl p-3.5 text-xs sm:text-sm ${
                      msg.role === "user"
                        ? "bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-medium rounded-tr-sm shadow-md"
                        : "bg-slate-900/80 border border-slate-700/70 text-slate-200 rounded-tl-sm shadow-sm"
                    }`}
                  >
                    {/* Action Toolbar on AI bubble (Copy & Audio Speech) */}
                    {msg.role === "ai" && !msg.isStreaming && !msg.isError && msg.text && (
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all">
                        {/* Audio TTS Button */}
                        <button
                          onClick={() => toggleSpeak(msg.text, i)}
                          className={`p-1 rounded-md border transition-all ${
                            speakingIndex === i
                              ? "bg-amber-500/30 text-amber-300 border-amber-500/50"
                              : "bg-slate-800 border-slate-700 text-slate-400 hover:text-amber-400"
                          }`}
                          title={speakingIndex === i ? "Stop audio playback" : "Listen to answer"}
                        >
                          {speakingIndex === i ? (
                            <VolumeX className="w-3 h-3 text-amber-400 animate-pulse" />
                          ) : (
                            <Volume2 className="w-3 h-3" />
                          )}
                        </button>

                        {/* Copy Button */}
                        <button
                          onClick={() => handleCopy(msg.text, i)}
                          className="p-1 rounded-md bg-slate-800 border border-slate-700 text-slate-400 hover:text-amber-400 transition-all"
                          title="Copy response"
                        >
                          {copiedIndex === i ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    )}

                    {/* Groundedness Confidence Badge */}
                    {msg.role === "ai" && !msg.isStreaming && msg.confidence && (
                      <div className="mb-2 flex items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            msg.confidence >= 80
                              ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                              : "bg-amber-500/10 text-amber-300 border-amber-500/30"
                          }`}
                          title="Calculated from Hybrid Vector + BM25 Context Alignment"
                        >
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>{msg.confidence}% Grounded in Document</span>
                        </span>
                      </div>
                    )}

                    {/* Content */}
                    {msg.role === "user" ? (
                      <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>
                    ) : (
                      <div className="leading-relaxed prose-docchat">
                        {msg.text ? (
                          <ReactMarkdown>{msg.text}</ReactMarkdown>
                        ) : (
                          <span className="text-slate-400 text-xs italic flex items-center gap-1.5">
                            <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                            Synthesizing answer with Hybrid Search...
                          </span>
                        )}
                        {msg.isStreaming && <span className="typing-cursor" />}
                      </div>
                    )}

                    {/* Expandable Citations with Jump-to-Page Trigger */}
                    {msg.role === "ai" && msg.sources && msg.sources.length > 0 && (
                      <details className="mt-3 pt-2.5 border-t border-slate-700/60 group/details text-left">
                        <summary className="text-[11px] font-semibold text-slate-400 cursor-pointer hover:text-amber-400 transition-colors inline-flex items-center gap-1.5 select-none">
                          <BookOpen className="w-3 h-3 text-amber-400" />
                          <span>View {msg.sources.length} cited source{msg.sources.length > 1 ? "s" : ""} (Click to Jump)</span>
                        </summary>
                        <div className="mt-2 space-y-2 text-xs">
                          {msg.sources.slice(0, 4).map((src, j) => {
                            const isObj = typeof src === "object" && src !== null;
                            const page = isObj ? src.page : null;
                            const sourceName = isObj ? src.source : null;
                            const text = isObj ? src.text : src;
                            return (
                              <div
                                key={j}
                                onClick={() => handleSourceClick(src)}
                                className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 hover:border-amber-500/40 text-slate-300 cursor-pointer transition-all hover:bg-slate-900"
                                title="Click to view this page in the document viewer"
                              >
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <div className="flex items-center gap-1.5">
                                    {page && (
                                      <span className="px-1.5 py-0.2 text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded">
                                        Page {page}
                                      </span>
                                    )}
                                    {sourceName && (
                                      <span className="text-[10px] text-slate-400 truncate max-w-[160px]">
                                        {sourceName}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-amber-400 opacity-80 flex items-center gap-0.5">
                                    View Page ↗
                                  </span>
                                </div>
                                <p className="line-clamp-2 text-slate-400 italic font-mono text-[10px]">
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
                    <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 flex-shrink-0 mt-0.5">
                      <User className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>

            {/* Input Bar with Voice Button */}
            <div className="mt-3 pt-2.5 border-t border-slate-700/50 flex flex-col gap-1.5">
              <div className="flex gap-2">
                {/* Microphone Button */}
                <button
                  type="button"
                  onClick={toggleListening}
                  title={isListening ? "Listening... Click to stop" : "Click to speak your question"}
                  className={`p-2.5 rounded-xl border transition-all flex items-center justify-center ${
                    isListening
                      ? "bg-rose-500/30 border-rose-500 text-rose-300 animate-pulse shadow-md shadow-rose-500/20"
                      : "bg-slate-900/80 border-slate-700/80 text-slate-400 hover:text-amber-400 hover:border-amber-500/40"
                  }`}
                >
                  {isListening ? <MicOff className="w-4 h-4 text-rose-400" /> : <Mic className="w-4 h-4" />}
                </button>

                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleAsk()}
                  placeholder={
                    isListening
                      ? "Listening to speech... Speak now..."
                      : hasDocument
                      ? "Ask anything or click the microphone to speak..."
                      : "Upload a document to ask questions..."
                  }
                  disabled={!hasDocument || loading}
                  className="flex-1 py-2.5 px-3.5 rounded-xl bg-slate-900/80 border border-slate-700/80 text-slate-100 placeholder-slate-500 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all disabled:opacity-50"
                />

                <button
                  onClick={() => handleAsk()}
                  disabled={loading || !question.trim() || !hasDocument}
                  className="py-2.5 px-4 rounded-xl font-semibold text-xs sm:text-sm bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-40 transition-all flex items-center gap-1.5 shadow-md shadow-amber-500/10"
                >
                  {loading ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Ask</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-500 px-1">
                <span>Hybrid BM25 + FAISS • Zero-latency Speech Input</span>
                <span>Enter to Send</span>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
