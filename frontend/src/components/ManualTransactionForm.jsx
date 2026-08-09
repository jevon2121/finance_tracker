import { useState } from "react";
import { createTransaction } from "../api";

const today = () => new Date().toISOString().slice(0, 10);

export default function ManualTransactionForm({ categories, onAdded }) {
  const [date, setDate] = useState(today());
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Uncategorized");
  const [direction, setDirection] = useState("out");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name || !amount) return;
    setBusy(true);
    setError(null);
    try {
      await createTransaction({ date, name, category, direction, amount: Number(amount) });
      setName("");
      setAmount("");
      onAdded?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>Add a transaction manually</h2>
      <p className="status-msg" style={{ marginBottom: 12 }}>
        For cash spending or anything else that won't show up on an imported statement.
      </p>
      <div className="upload-row">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="networth-input" />
        <input
          type="text"
          placeholder="Description"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="networth-input"
          style={{ width: 220 }}
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="category-select"
          style={{ padding: "7px 10px", fontSize: 13 }}
        >
          {[...new Set([category, ...categories, "Uncategorized"])].map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={direction} onChange={(e) => setDirection(e.target.value)}>
          <option value="out">Money out</option>
          <option value="in">Money in</option>
        </select>
        <input
          type="number"
          step="0.01"
          placeholder="Amount (£)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="networth-input"
        />
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Adding…" : "Add"}
        </button>
      </div>
      {error && <p className="status-msg error">{error}</p>}
    </form>
  );
}
