import { useEffect, useState } from "react";
import { clearNetWorthCategory, fetchNetWorth, setNetWorthCategory } from "../api";

const currency = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

const today = () => new Date().toISOString().slice(0, 10);

const CATEGORIES = [
  { key: "cash_savings", label: "Cash & Savings", color: "var(--cat-cash)", hasDate: true },
  { key: "stocks", label: "Savings & Investments", color: "var(--cat-stocks)", hasDate: true },
  { key: "real_estate", label: "Real Estate", color: "var(--cat-realestate)", hasDate: false },
  { key: "other", label: "Other", color: "var(--cat-other)", hasDate: false },
];

function CategoryRow({ def, value, asOf, onSaved }) {
  const hasEntry = asOf != null;
  const [amount, setAmount] = useState("");
  const [asOfDate, setAsOfDate] = useState(today());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAmount(value ? String(value) : "");
    if (asOf) setAsOfDate(asOf);
  }, [value, asOf]);

  async function handleSave(e) {
    e.preventDefault();
    if (amount === "") return;
    setBusy(true);
    try {
      await setNetWorthCategory(def.key, { amount: Number(amount), as_of_date: def.hasDate ? asOfDate : today() });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  async function handleClear() {
    setBusy(true);
    try {
      await clearNetWorthCategory(def.key);
      setAmount("");
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="networth-row" onSubmit={handleSave}>
      <span className="legend-swatch" style={{ background: def.color }} />
      <span className="networth-label">{def.label}</span>
      <input
        type="number"
        step="0.01"
        placeholder="Amount (£)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="networth-input"
      />
      {def.hasDate && (
        <input
          type="date"
          value={asOfDate}
          onChange={(e) => setAsOfDate(e.target.value)}
          className="networth-input"
        />
      )}
      <button type="submit" className="primary" disabled={busy}>Save</button>
      {hasEntry && (
        <button type="button" className="delete-btn" onClick={handleClear} disabled={busy}>Clear</button>
      )}
    </form>
  );
}

export default function NetWorthPanel({ onChanged }) {
  const [breakdown, setBreakdown] = useState(null);
  const [editing, setEditing] = useState(false);

  function refresh() {
    fetchNetWorth().then(setBreakdown);
    onChanged?.();
  }

  useEffect(() => {
    refresh();
  }, []);

  if (!breakdown) return null;

  const segments = CATEGORIES.map((def) => ({ ...def, value: Math.max(0, breakdown[def.key]) }));
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;

  return (
    <div className="card">
      <h2>Net worth breakdown</h2>
      <div className="stat-tile" style={{ marginBottom: 16, padding: "12px 16px" }}>
        <div className="label">Total net worth</div>
        <div className="value">{currency.format(breakdown.total)}</div>
      </div>

      <div className="composition-bar">
        {segments.filter((s) => s.value > 0).map((s) => (
          <div
            key={s.key}
            style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
            title={`${s.label}: ${currency.format(s.value)}`}
          />
        ))}
      </div>
      <div className="legend" style={{ marginTop: 8, marginBottom: 4 }}>
        {segments.map((s) => (
          <span className="legend-item" key={s.key}>
            <span className="legend-swatch" style={{ background: s.color }} />
            {s.label} · {currency.format(s.value)}
          </span>
        ))}
      </div>

      <button
        type="button"
        className="delete-btn"
        style={{ padding: "6px 0" }}
        onClick={() => setEditing((v) => !v)}
      >
        {editing ? "Hide" : "Edit starting balances"}
      </button>

      {editing && (
        <>
          <p className="status-msg" style={{ margin: "12px 0" }}>
            Cash &amp; Savings and Savings &amp; Investments are both computed automatically from
            your transactions — this is only for anchoring them to a real balance as of a date (a
            starting balance works too; see the cohort chart above for the breakdown). Real Estate
            and Other have no transaction feed, so just enter their current value whenever it
            changes.
          </p>

          {CATEGORIES.map((def) => (
            <CategoryRow
              key={def.key}
              def={def}
              value={breakdown[def.key]}
              asOf={breakdown[`${def.key}_as_of`]}
              onSaved={refresh}
            />
          ))}
        </>
      )}
    </div>
  );
}
