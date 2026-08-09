import { useMemo, useState } from "react";
import { deleteTransaction, runTransferDetection, updateTransaction } from "../api";

const currency = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

export default function TransactionsTable({ transactions, categories, onChanged }) {
  const [categoryFilter, setCategoryFilter] = useState("");
  const [directionFilter, setDirectionFilter] = useState("");
  const [transferFilter, setTransferFilter] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (categoryFilter && t.category !== categoryFilter) return false;
      if (directionFilter && t.direction !== directionFilter) return false;
      if (transferFilter === "transfers" && !t.is_transfer) return false;
      if (transferFilter === "real" && t.is_transfer) return false;
      return true;
    });
  }, [transactions, categoryFilter, directionFilter, transferFilter]);

  async function handleCategoryChange(id, category) {
    await updateTransaction(id, { category });
    onChanged();
  }

  async function handleToggleTransfer(t) {
    await updateTransaction(t.id, { is_transfer: !t.is_transfer });
    onChanged();
  }

  async function handleDelete(id) {
    await deleteTransaction(id);
    onChanged();
  }

  async function handleDetectTransfers() {
    setBusy(true);
    try {
      await runTransferDetection();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Transactions</h2>
      <div className="filters-row">
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={directionFilter} onChange={(e) => setDirectionFilter(e.target.value)}>
          <option value="">In & out</option>
          <option value="in">In only</option>
          <option value="out">Out only</option>
        </select>
        <select value={transferFilter} onChange={(e) => setTransferFilter(e.target.value)}>
          <option value="">Transfers & real</option>
          <option value="real">Real income/spend only</option>
          <option value="transfers">Transfers only</option>
        </select>
        <button type="button" className="delete-btn" onClick={handleDetectTransfers} disabled={busy}>
          {busy ? "Scanning…" : "Re-scan for transfers"}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">No transactions match these filters.</div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Name</th>
                <th>Category</th>
                <th>Amount</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} style={t.is_transfer ? { opacity: 0.55 } : undefined}>
                  <td>{t.date}</td>
                  <td>
                    {t.name}
                    {t.is_transfer && <span className="transfer-badge">Transfer</span>}
                  </td>
                  <td>
                    <select
                      className="category-select"
                      value={t.category}
                      onChange={(e) => handleCategoryChange(t.id, e.target.value)}
                    >
                      {[...new Set([t.category, ...categories])].map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </td>
                  <td className={`amount ${t.direction}`}>
                    {t.direction === "in" ? "+" : "-"}
                    {currency.format(t.amount)}
                  </td>
                  <td>
                    <button className="delete-btn" onClick={() => handleToggleTransfer(t)}>
                      {t.is_transfer ? "Unmark transfer" : "Mark as transfer"}
                    </button>
                  </td>
                  <td>
                    <button className="delete-btn" onClick={() => handleDelete(t.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
