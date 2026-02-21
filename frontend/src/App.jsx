import { useState } from "react";
import axios from "axios";

const API = "http://localhost:8000";

export default function App() {
  const [file, setFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    setUploading(true);
    setUploadStatus("");
    try {
      const res = await axios.post(`${API}/upload`, formData);
      setUploadStatus(`✅ ${res.data.message}`);
    } catch (err) {
      setUploadStatus("❌ Upload failed. Check backend.");
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
      setMessages((prev) => [...prev, { role: "ai", text: res.data.answer }]);
    } catch {
      setMessages((prev) => [...prev, { role: "ai", text: "❌ Error fetching answer." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center py-10 px-4">
      <h1 className="text-4xl font-bold mb-2 text-indigo-400">📄 DocChat AI</h1>
      <p className="text-gray-400 mb-8">Upload a PDF and ask anything about it</p>

      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-2xl mb-6">
        <h2 className="text-lg font-semibold mb-3 text-gray-200">1. Upload Your PDF</h2>
        <input
          type="file"
          accept=".pdf"
          onChange={(e) => setFile(e.target.files[0])}
          className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 mb-4"
        />
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-5 py-2 rounded-lg font-medium transition"
        >
          {uploading ? "Uploading..." : "Upload & Process"}
        </button>
        {uploadStatus && <p className="mt-3 text-sm text-green-400">{uploadStatus}</p>}
      </div>

      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-2xl flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-gray-200">2. Ask Questions</h2>
        <div className="flex flex-col gap-3 max-h-96 overflow-y-auto pr-1">
          {messages.length === 0 && (
            <p className="text-gray-500 text-sm italic">Your conversation will appear here...</p>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`rounded-xl px-4 py-3 text-sm max-w-[85%] ${
                msg.role === "user"
                  ? "bg-indigo-700 self-end"
                  : "bg-gray-800 self-start text-gray-200"
              }`}
            >
              {msg.text}
            </div>
          ))}
          {loading && (
            <div className="bg-gray-800 self-start rounded-xl px-4 py-3 text-sm text-gray-400 animate-pulse">
              Thinking...
            </div>
          )}
        </div>
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAsk()}
            placeholder="Ask something about your document..."
            className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={handleAsk}
            disabled={loading || !question.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-4 py-2 rounded-lg font-medium transition"
          >
            Ask
          </button>
        </div>
      </div>
    </div>
  );
}