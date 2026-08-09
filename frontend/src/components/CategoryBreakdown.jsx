import { useEffect, useState } from "react";
import { fetchCategoryBreakdown, fetchTransactions } from "../api";

const currency = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

function monthLabel(key) {
  const [year, month] = key.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

function monthRange(month) {
  const [year, mon] = month.split("-").map(Number);
  const start_date = `${month}-01`;
  const end_date = new Date(year, mon, 0).toISOString().slice(0, 10);
  return { start_date, end_date };
}

export default function CategoryBreakdown({ month, onClose, monthOptions, onMonthChange }) {
  const [direction, setDirection] = useState("out");
  const [rows, setRows] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [transactions, setTransactions] = useState(null);

  useEffect(() => {
    setRows(null);
    setSelectedCategory(null);
    fetchCategoryBreakdown(month, direction).then(setRows);
  }, [month, direction]);

  useEffect(() => {
    if (!selectedCategory) return;
    setTransactions(null);
    fetchTransactions({ ...monthRange(month), category: selectedCategory, direction, is_transfer: "false" }).then(
      setTransactions
    );
  }, [selectedCategory, month, direction]);

  if (!month) return null;

  const total = rows ? rows.reduce((sum, r) => sum + r.total, 0) : 0;
  const maxVal = rows && rows.length ? Math.max(...rows.map((r) => r.total)) : 1;
  const barColor = direction === "out" ? "var(--series-out)" : "var(--series-in)";

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>
          {monthLabel(month)}
          {selectedCategory ? ` · ${selectedCategory}` : " by category"}
        </h2>
        {onClose && <button type="button" className="delete-btn" onClick={onClose}>Close</button>}
      </div>
      <div className="filters-row" style={{ marginTop: 12 }}>
        {monthOptions && (
          <select value={month} onChange={(e) => onMonthChange(e.target.value)} disabled={!!selectedCategory}>
            {monthOptions.map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
        )}
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          disabled={!!selectedCategory}
        >
          <option value="out">Spending (money out)</option>
          <option value="in">Income (money in)</option>
        </select>
        {selectedCategory ? (
          <button type="button" className="delete-btn" onClick={() => setSelectedCategory(null)}>
            ← Back to categories
          </button>
        ) : (
          <span className="status-msg">Total: {currency.format(total)}</span>
        )}
      </div>

      {selectedCategory ? (
        transactions === null ? (
          <div className="empty-state">Loading…</div>
        ) : transactions.length === 0 ? (
          <div className="empty-state">No transactions found.</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Name</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <td>{t.date}</td>
                    <td>{t.name}</td>
                    <td className={`amount ${t.direction}`}>
                      {t.direction === "in" ? "+" : "-"}
                      {currency.format(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : rows === null ? (
        <div className="empty-state">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="empty-state">No {direction === "out" ? "spending" : "income"} recorded this month.</div>
      ) : (
        <div>
          {rows.map((r) => (
            <div
              key={r.category}
              className="category-row"
              onClick={() => setSelectedCategory(r.category)}
            >
              <span style={{ width: 130, fontSize: 13, color: "var(--text-secondary)" }}>{r.category}</span>
              <div style={{ flex: 1, background: "var(--surface-1)", borderRadius: 4, height: 16 }}>
                <div
                  style={{
                    width: `${(r.total / maxVal) * 100}%`,
                    background: barColor,
                    height: "100%",
                    borderRadius: 4,
                    minWidth: 2,
                  }}
                />
              </div>
              <span style={{ width: 90, textAlign: "right", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                {currency.format(r.total)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
