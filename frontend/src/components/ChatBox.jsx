import { useState } from "react";
import axios from "axios";

export default function ChatBox({ apiUrl, messages, setMessages }) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAsk = async () => {
    if (!question.trim()) return;
    const userMsg = { role: "user", text: question };
    setMessages((prev) => [...prev, userMsg]);
    setQuestion("");
    setLoading(true);
    try {
      const res = await axios.post(`${apiUrl}/ask`, { question });
      setMessages((prev) => [...prev, { role: "ai", text: res.data.answer }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: "❌ Error fetching answer. Upload a PDF first and check backend." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
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
  );
}
