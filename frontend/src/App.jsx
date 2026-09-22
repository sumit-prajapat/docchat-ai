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
  Bot,
  User,
  Layers,
  FileCode,
  File,
  Eye,
  EyeOff,
  ExternalLink,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Download,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  ShieldCheck,
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
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // Document Viewer & Insights UI State
  const [showViewer, setShowViewer] = useState(true);
  const [viewerPage, setViewerPage] = useState(1);
  const [insightsExpanded, setInsightsExpanded] = useState(false);

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

  const handleUpload = async (fileToUpload = null) => {
    const targetFile = fileToUpload || file;
    if (!targetFile) return;

    const formData = new FormData();
    formData.append("file", targetFile);
    setUploading(true);
    setUploadStatus("");
    try {
      const res = await axios.post(`${API}/upload`, formData);
      setUploadStatus(res.data.message || "Document processed successfully.");
      setHasDocument(true);
      setFile(null);
      setIsUploadModalOpen(false);
      await fetchStatus();

      const uploadedFilename = res.data.details?.filename;
      if (uploadedFilename) {
        setActiveDoc({
          filename: uploadedFilename,
          insights: res.data.insights || {},
          chunks: res.data.details?.chunks || 0,
        });
        setViewerPage(1);
        setInsightsExpanded(true);
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

  const handleExportReport = () => {
    const title = activeDoc?.filename || "Document";
    let report = `# DocChat AI - Executive Briefing Report\n\n`;
    report += `**Document:** ${title}\n`;
    report += `**Generated:** ${new Date().toLocaleString()}\n`;
    report += `**Total Exchanges:** ${messages.filter((m) => m.role === "user").length}\n\n`;
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

    report += `## 💬 Verified Q&A Transcript\n\n`;
    let qNum = 1;
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === "user") {
        report += `### Q${qNum}: ${msg.text}\n\n`;
        qNum++;
      } else if (msg.role === "ai" && !msg.isError) {
        report += `**Answer:**\n\n${msg.text}\n\n`;
        if (msg.confidence) {
          report += `*Factual Grounding:* ${msg.confidence}%\n\n`;
        }
        if (msg.sources?.length > 0) {
          report += `*Citations:*\n`;
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
      handleUpload(f);
    }
  };

  const getFileIcon = (name) => {
    if (!name) return <File className="w-3.5 h-3.5 text-zinc-400" />;
    if (name.endsWith(".pdf")) return <FileText className="w-3.5 h-3.5 text-rose-400" />;
    if (name.endsWith(".md") || name.endsWith(".txt")) return <FileCode className="w-3.5 h-3.5 text-indigo-400" />;
    return <File className="w-3.5 h-3.5 text-zinc-400" />;
  };

  const currentInsights = activeDoc?.insights || documents[0]?.insights;

  return (
    <div className="h-screen w-screen flex flex-col bg-[#09090b] text-zinc-100 overflow-hidden select-none">
      {/* Top Navigation Bar */}
      <header className="h-13 border-b border-white/[0.08] bg-[#0c0c0e] px-4 flex items-center justify-between flex-shrink-0 z-30">
        {/* Left: Brand & Status */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-sm">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm tracking-tight text-white">DocChat AI</span>
            <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-white/[0.06]">
              Enterprise
            </span>
          </div>
        </div>

        {/* Center: Document Scope / Active Document Pill */}
        <div className="flex items-center gap-2">
          {hasDocument ? (
            <div className="flex items-center gap-1.5 bg-zinc-900 border border-white/[0.08] rounded-lg px-2.5 py-1">
              {getFileIcon(activeDoc?.filename)}
              <span className="text-xs font-medium text-zinc-200 truncate max-w-[140px] sm:max-w-[220px]">
                {activeDoc?.filename}
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">
                ({activeDoc?.chunks || 0} chunks)
              </span>

              {documents.length > 1 && (
                <select
                  value={docFilter}
                  onChange={(e) => setDocFilter(e.target.value)}
                  className="bg-transparent text-[11px] text-indigo-300 font-medium ml-1 pl-1 border-l border-white/10 focus:outline-none cursor-pointer"
                >
                  <option value="all" className="bg-zinc-900 text-zinc-200">
                    Scope: All Docs
                  </option>
                  {documents.map((d, i) => (
                    <option key={i} value={d.filename} className="bg-zinc-900 text-zinc-200">
                      Scope: {d.filename}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <div className="text-xs text-zinc-500 hidden sm:block">
              Upload a PDF or document to begin
            </div>
          )}

          {/* Add / Upload Button */}
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/[0.08] transition-colors"
            title="Upload new document"
          >
            <Plus className="w-3 h-3 text-indigo-400" />
            <span className="hidden sm:inline">Add Doc</span>
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {hasDocument && (
            <>
              {/* Export Briefing Report */}
              {messages.length > 0 && (
                <button
                  onClick={handleExportReport}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 border border-white/[0.08] transition-colors"
                  title="Download Executive Briefing Report (.md)"
                >
                  <Download className="w-3 h-3 text-indigo-400" />
                  <span className="hidden md:inline">Export Report</span>
                </button>
              )}

              {/* Toggle Document Viewer */}
              <button
                onClick={() => setShowViewer(!showViewer)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  showViewer
                    ? "bg-indigo-600/15 text-indigo-300 border-indigo-500/30"
                    : "bg-zinc-800/80 text-zinc-400 border-white/[0.08] hover:text-zinc-200"
                }`}
                title="Toggle Document Viewer"
              >
                {showViewer ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                <span className="hidden sm:inline">{showViewer ? "Hide Doc" : "View Doc"}</span>
              </button>

              {/* Reset Knowledge Base */}
              <button
                onClick={handleResetDocuments}
                title="Clear all indexed documents"
                className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {/* Backend Status Indicator */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-900 border border-white/[0.06] text-[11px] text-zinc-400"
            title={hasDocument ? "Backend connected" : "Awaiting document"}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isWakingUp
                  ? "bg-amber-400 animate-ping"
                  : hasDocument
                  ? "bg-emerald-400"
                  : "bg-zinc-600"
              }`}
            />
            <span className="text-[11px] font-mono hidden md:inline">
              {isWakingUp ? "Waking..." : hasDocument ? "Ready" : "Standby"}
            </span>
          </div>
        </div>
      </header>

      {/* Main Workspace (Full-Viewport Side-by-Side Studio) */}
      <main className="flex-1 flex overflow-hidden p-2.5 gap-2.5">
        {/* Left Column: Full-Height Document Viewer */}
        {showViewer && hasDocument && activeDoc && (
          <section className="w-full lg:w-1/2 h-full flex flex-col surface-card rounded-xl overflow-hidden animate-fade-up">
            {/* Viewer Header */}
            <div className="h-10 px-3 bg-[#131317] border-b border-white/[0.07] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                {getFileIcon(activeDoc.filename)}
                <span className="text-xs font-medium text-zinc-200 truncate">
                  {activeDoc.filename}
                </span>
                <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-1.5 py-0.2 rounded border border-indigo-500/20">
                  Page {viewerPage}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <a
                  href={`${API}/files/${activeDoc.filename}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open document in new browser tab"
                  className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Viewer Canvas */}
            <div className="flex-1 w-full bg-[#09090b] overflow-hidden">
              {activeDoc.filename.endsWith(".pdf") ? (
                <iframe
                  key={`${activeDoc.filename}-${viewerPage}`}
                  src={`${API}/files/${activeDoc.filename}#page=${viewerPage}`}
                  title="Document Preview"
                  className="w-full h-full border-none"
                />
              ) : (
                <div className="p-4 text-xs text-zinc-300 font-mono overflow-auto h-full whitespace-pre-wrap leading-relaxed">
                  <iframe
                    src={`${API}/files/${activeDoc.filename}`}
                    title="Text Content"
                    className="w-full h-full border-none"
                  />
                </div>
              )}
            </div>
          </section>
        )}

        {/* Right Column: Conversational Studio */}
        <section
          className={`flex flex-col h-full surface-card rounded-xl overflow-hidden transition-all duration-300 ${
            showViewer && hasDocument && activeDoc ? "w-full lg:w-1/2" : "w-full"
          }`}
        >
          {/* Collapsible Executive Insights (Accordion) */}
          {hasDocument && currentInsights && currentInsights.summary && (
            <div className="border-b border-white/[0.07] bg-[#121216] flex-shrink-0 transition-all">
              <button
                onClick={() => setInsightsExpanded(!insightsExpanded)}
                className="w-full px-3.5 py-2 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                  <span className="text-xs font-medium text-zinc-200 truncate">
                    Executive Briefing & Document Insights
                  </span>
                  {currentInsights.takeaways?.length > 0 && (
                    <span className="text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.2 rounded border border-white/[0.06] hidden sm:inline">
                      {currentInsights.takeaways.length} key points
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200">
                  <span className="hidden sm:inline">
                    {insightsExpanded ? "Collapse" : "Expand"}
                  </span>
                  {insightsExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </div>
              </button>

              {insightsExpanded && (
                <div className="px-4 pb-3 pt-1 border-t border-white/[0.05] animate-fade-up max-h-[220px] overflow-y-auto">
                  <p className="text-xs text-zinc-300 leading-relaxed mb-2.5">
                    {currentInsights.summary}
                  </p>

                  {currentInsights.takeaways?.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {currentInsights.takeaways.map((point, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded-lg bg-zinc-900/90 border border-white/[0.06] text-[11px] text-zinc-300 flex items-start gap-1.5"
                        >
                          <span className="text-indigo-400 font-bold">•</span>
                          <span>{point}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Empty State when No Document */}
          {!hasDocument && !statusLoading && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center my-auto">
              <div
                onDrop={handleDrop}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                className={`max-w-md w-full p-8 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center ${
                  isDragging
                    ? "border-indigo-500 bg-indigo-500/5"
                    : "border-white/10 hover:border-white/20 bg-zinc-900/50"
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-indigo-600/15 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-sm text-zinc-200 mb-1">
                  Upload your Document to Start
                </h3>
                <p className="text-xs text-zinc-400 mb-4 max-w-xs">
                  Drag and drop a PDF, Markdown, or Text file here, or browse from your computer.
                </p>

                <label className="cursor-pointer px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-sm">
                  <span>Select File</span>
                  <input
                    type="file"
                    accept=".pdf,.txt,.md"
                    onChange={(e) => {
                      if (e.target.files[0]) {
                        setFile(e.target.files[0]);
                        handleUpload(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          )}

          {/* Empty Conversation State */}
          {hasDocument && messages.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center my-auto">
              <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-center text-indigo-400 mb-3">
                <Bot className="w-5 h-5" />
              </div>
              <h4 className="font-medium text-sm text-zinc-200 mb-1">
                Document Indexed & Ready
              </h4>
              <p className="text-xs text-zinc-400 max-w-sm mb-4">
                Ask any question below or select a suggested prompt to explore key facts and insights.
              </p>
            </div>
          )}

          {/* Message Stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 pr-2">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2.5 animate-fade-up ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.role === "ai" && (
                  <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-white/[0.08] flex items-center justify-center text-indigo-400 flex-shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}

                <div
                  className={`relative group max-w-[88%] text-xs sm:text-sm select-text ${
                    msg.role === "user"
                      ? "bg-zinc-800 text-zinc-100 border border-white/[0.08] rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-sm"
                      : "bg-[#141418] border border-white/[0.07] text-zinc-200 rounded-2xl rounded-tl-sm p-4 shadow-sm"
                  }`}
                >
                  {/* Floating Action Toolbar on AI Bubble */}
                  {msg.role === "ai" && !msg.isStreaming && !msg.isError && msg.text && (
                    <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all bg-zinc-900/90 border border-white/10 rounded-md p-0.5">
                      {/* Audio Narration Button */}
                      <button
                        onClick={() => toggleSpeak(msg.text, i)}
                        className={`p-1 rounded transition-colors ${
                          speakingIndex === i
                            ? "text-indigo-400 bg-indigo-500/20"
                            : "text-zinc-400 hover:text-zinc-200"
                        }`}
                        title={speakingIndex === i ? "Stop narration" : "Listen to answer"}
                      >
                        {speakingIndex === i ? (
                          <VolumeX className="w-3 h-3 animate-pulse" />
                        ) : (
                          <Volume2 className="w-3 h-3" />
                        )}
                      </button>

                      {/* Copy Text Button */}
                      <button
                        onClick={() => handleCopy(msg.text, i)}
                        className="p-1 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
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

                  {/* Factual Grounding Badge */}
                  {msg.role === "ai" && !msg.isStreaming && msg.confidence && (
                    <div className="mb-2 flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                        <span>{msg.confidence}% Grounded in Document</span>
                      </span>
                    </div>
                  )}

                  {/* Message Content */}
                  {msg.role === "user" ? (
                    <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>
                  ) : (
                    <div className="leading-relaxed prose-docchat">
                      {msg.text ? (
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                      ) : (
                        <span className="text-zinc-400 text-xs italic flex items-center gap-1.5">
                          <RefreshCw className="w-3 h-3 animate-spin text-indigo-400" />
                          Synthesizing answer with Hybrid Search...
                        </span>
                      )}
                      {msg.isStreaming && <span className="typing-cursor" />}
                    </div>
                  )}

                  {/* Sources Accordion */}
                  {msg.role === "ai" && msg.sources && msg.sources.length > 0 && (
                    <details className="mt-3 pt-2.5 border-t border-white/[0.06] text-left">
                      <summary className="text-[11px] font-medium text-zinc-400 cursor-pointer hover:text-indigo-400 transition-colors inline-flex items-center gap-1.5 select-none">
                        <BookOpen className="w-3 h-3 text-indigo-400" />
                        <span>{msg.sources.length} Cited Source{msg.sources.length > 1 ? "s" : ""} (Click to Jump)</span>
                      </summary>
                      <div className="mt-2 space-y-1.5 text-xs">
                        {msg.sources.slice(0, 4).map((src, j) => {
                          const isObj = typeof src === "object" && src !== null;
                          const page = isObj ? src.page : null;
                          const sourceName = isObj ? src.source : null;
                          const text = isObj ? src.text : src;
                          return (
                            <div
                              key={j}
                              onClick={() => handleSourceClick(src)}
                              className="p-2 rounded-lg bg-zinc-950/80 border border-white/[0.06] hover:border-indigo-500/40 text-zinc-300 cursor-pointer transition-all hover:bg-zinc-900"
                              title="Click to jump to this page in the document viewer"
                            >
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <div className="flex items-center gap-1.5">
                                  {page && (
                                    <span className="px-1.5 py-0.2 text-[9px] font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded font-mono">
                                      Page {page}
                                    </span>
                                  )}
                                  {sourceName && (
                                    <span className="text-[10px] text-zinc-400 truncate max-w-[160px]">
                                      {sourceName}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-indigo-400 opacity-80">
                                  Jump ↗
                                </span>
                              </div>
                              <p className="line-clamp-2 text-zinc-400 italic text-[10px]">
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
                  <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-white/10 flex items-center justify-center text-zinc-300 flex-shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>

          {/* Bottom Area: Suggestions Carousel + Input Bar */}
          <div className="p-3 border-t border-white/[0.07] bg-[#0e0e11] flex-shrink-0">
            {/* Horizontal Scrollable Question Pills (Sleek & Non-Intrusive) */}
            {hasDocument && currentInsights?.suggested_questions?.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2 pt-0.5">
                {currentInsights.suggested_questions.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAsk(q)}
                    disabled={loading}
                    className="px-2.5 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-indigo-300 border border-white/[0.08] text-[11px] whitespace-nowrap transition-all flex items-center gap-1.5 flex-shrink-0 disabled:opacity-40"
                  >
                    <span className="text-indigo-400 text-xs font-semibold">✦</span>
                    <span>{q}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Input Bar */}
            <div className="flex items-center gap-1.5 bg-zinc-900 border border-white/[0.09] rounded-xl p-1 focus-within:border-indigo-500/50 transition-all">
              {/* Mic Dictation Button */}
              <button
                type="button"
                onClick={toggleListening}
                title={isListening ? "Listening... Click to stop" : "Speak question"}
                className={`p-2 rounded-lg transition-all flex items-center justify-center ${
                  isListening
                    ? "bg-rose-500/20 text-rose-300 animate-pulse border border-rose-500/40"
                    : "text-zinc-400 hover:text-indigo-400 hover:bg-zinc-800"
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
                    ? "Listening to speech... Speak naturally..."
                    : hasDocument
                    ? "Ask a question about this document..."
                    : "Upload a document to begin..."
                }
                disabled={!hasDocument || loading}
                className="flex-1 bg-transparent border-none text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none px-2 disabled:opacity-50"
              />

              <button
                onClick={() => handleAsk()}
                disabled={loading || !question.trim() || !hasDocument}
                className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-30 transition-all shadow-sm"
                title="Send question"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>

            <div className="flex items-center justify-between text-[10px] text-zinc-500 px-1 pt-1.5">
              <span>Hybrid Search (BM25 + Dense) • Speech Dictation Enabled</span>
              <span>Press Enter ↵</span>
            </div>
          </div>
        </section>
      </main>

      {/* Upload Modal Drawer */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="surface-elevated rounded-2xl max-w-md w-full p-5 border border-white/10 shadow-2xl animate-fade-up">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-indigo-400" />
                <h3 className="font-semibold text-sm text-white">Add Document</h3>
              </div>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-all ${
                isDragging
                  ? "border-indigo-500 bg-indigo-500/5"
                  : "border-white/10 hover:border-white/20 bg-zinc-900/40"
              }`}
            >
              <FileText className="w-8 h-8 text-indigo-400 mx-auto mb-2 opacity-80" />
              <p className="text-xs text-zinc-300 font-medium mb-1">
                {file ? file.name : "Drag & drop PDF, TXT, or Markdown"}
              </p>
              <p className="text-[11px] text-zinc-500 mb-3">
                Max 10MB per document
              </p>

              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 transition-colors">
                <span>Browse Files</span>
                <input
                  type="file"
                  accept=".pdf,.txt,.md"
                  onChange={(e) => {
                    if (e.target.files[0]) {
                      setFile(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />
              </label>
            </div>

            {uploadStatus && (
              <p className="mt-3 text-xs text-zinc-400 text-center">
                {uploadStatus}
              </p>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleUpload()}
                disabled={!file || uploading}
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition-colors flex items-center gap-1.5"
              >
                {uploading ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>Index Document</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
