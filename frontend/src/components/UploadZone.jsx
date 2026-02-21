import { useState } from "react";
import axios from "axios";

export default function UploadZone({ apiUrl, uploadStatus, setUploadStatus }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    setUploading(true);
    setUploadStatus("");
    try {
      const res = await axios.post(`${apiUrl}/upload`, formData);
      setUploadStatus(`✅ ${res.data.message}`);
    } catch (err) {
      setUploadStatus("❌ Upload failed. Check backend is running and .env has OPENAI_API_KEY.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-2xl mb-6">
      <h2 className="text-lg font-semibold mb-3 text-gray-200">1. Upload Your PDF</h2>
      <input
        type="file"
        accept=".pdf"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 mb-4"
      />
      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-5 py-2 rounded-lg font-medium transition"
      >
        {uploading ? "Uploading..." : "Upload & Process"}
      </button>
      {uploadStatus && (
        <p className="mt-3 text-sm text-green-400">{uploadStatus}</p>
      )}
    </div>
  );
}
