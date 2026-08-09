import { useRef, useState } from "react";
import { uploadStatement } from "../api";

export default function UploadForm({ onUploaded }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const result = await uploadStatement(file);
      setMessage(
        result.inserted === 0
          ? "No new transactions — this statement was already imported."
          : `Imported ${result.inserted} new transaction${result.inserted === 1 ? "" : "s"}.`
      );
      fileRef.current.value = "";
      onUploaded?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>Import a statement</h2>
      <div className="upload-row">
        <input ref={fileRef} type="file" accept="application/pdf" className="file-input" />
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Parsing…" : "Upload PDF"}
        </button>
      </div>
      {message && <p className="status-msg">{message}</p>}
      {error && <p className="status-msg error">{error}</p>}
    </form>
  );
}
