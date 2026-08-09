import { useCallback, useEffect, useState } from "react";
import {
  fetchCategories,
  fetchMonthlySummary,
  fetchNetWorth,
  fetchNetWorthOverTime,
  fetchSavingsCohort,
  fetchTransactions,
  fetchWealth,
} from "./api";
import UploadForm from "./components/UploadForm";
import NetWorthStatTiles from "./components/NetWorthStatTiles";
import SpendingStatTiles from "./components/SpendingStatTiles";
import MonthlyBarChart from "./components/MonthlyBarChart";
import TrendLineChart from "./components/TrendLineChart";
import TransactionsTable from "./components/TransactionsTable";
import NetWorthPanel from "./components/NetWorthPanel";
import CategoryBreakdown from "./components/CategoryBreakdown";
import SavingsCohortChart from "./components/SavingsCohortChart";
import ManualTransactionForm from "./components/ManualTransactionForm";

const TABS = [
  { key: "networth", label: "Net Worth" },
  { key: "spending", label: "Spending & Inflow" },
  { key: "monthly", label: "Monthly Spending" },
  { key: "transactions", label: "Transactions" },
];

// Trend charts anchored to a starting balance should only show from that
// date forward — data before your chosen starting point isn't meaningful
// once you've told the app "ignore everything before this."
function sinceMonth(data, asOfDate) {
  if (!asOfDate) return data;
  const cutoff = asOfDate.slice(0, 7);
  return data.filter((d) => d.month >= cutoff);
}

function App() {
  const [tab, setTab] = useState("networth");
  const [transactions, setTransactions] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [wealth, setWealth] = useState([]);
  const [netWorthTrend, setNetWorthTrend] = useState([]);
  const [netWorth, setNetWorth] = useState(null);
  const [savingsCohort, setSavingsCohort] = useState(null);
  const [categories, setCategories] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(() => {
    Promise.all([
      fetchTransactions(),
      fetchMonthlySummary(),
      fetchWealth(),
      fetchCategories(),
      fetchNetWorthOverTime(),
      fetchSavingsCohort(),
      fetchNetWorth(),
    ])
      .then(([txns, monthlyData, wealthData, cats, netWorthData, savingsCohortData, netWorthBreakdown]) => {
        setTransactions(txns);
        setMonthly(monthlyData);
        setWealth(wealthData);
        setCategories(cats);
        setNetWorthTrend(netWorthData);
        setSavingsCohort(savingsCohortData);
        setNetWorth(netWorthBreakdown);
        setError(null);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const monthOptions = monthly.map((m) => m.month);
  const activeMonth = selectedMonth || monthOptions[monthOptions.length - 1] || null;

  function goToMonth(month) {
    setSelectedMonth(month);
    setTab("monthly");
  }

  const cashAsOf = netWorth?.cash_savings_as_of;
  const stocksAsOf = netWorth?.stocks_as_of;
  const totalAsOf = [cashAsOf, stocksAsOf].filter(Boolean).sort().pop() || null;

  return (
    <>
      <h1>Budget Tracker</h1>
      <p className="subtitle">Import statements, track real inflow/outflow, and watch your net worth over time.</p>

      {error && (
        <div className="card status-msg error">
          Couldn't reach the backend at http://127.0.0.1:8000 — is it running? ({error})
        </div>
      )}

      <UploadForm onUploaded={refresh} />

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "networth" && (
        <>
          <NetWorthStatTiles netWorthTrend={netWorthTrend} />

          <div className="card">
            <h2>Net worth over time</h2>
            <p className="status-msg" style={{ marginBottom: 12 }}>
              Cash &amp; Savings and Savings &amp; Investments are both tracked from your
              transactions; Real Estate and Other are only as accurate as your last manual update.
              {totalAsOf
                ? " Shown from your starting balance onward."
                : " Set a starting balance in the breakdown below to anchor this to a real date."}
            </p>
            <TrendLineChart
              data={sinceMonth(netWorthTrend, totalAsOf)}
              valueKey="total"
              color="var(--cat-cash)"
              ariaLabel="Total net worth over time"
              emptyMessage="No data yet — import a statement to see your net worth trend."
            />
          </div>

          <div className="card">
            <h2>Cash &amp; Savings over time</h2>
            <TrendLineChart
              data={sinceMonth(wealth, cashAsOf)}
              valueKey="cumulative_net"
              ariaLabel="Cash and savings over time"
              emptyMessage="No transactions yet — import a statement to see your wealth trend."
            />
          </div>

          <div className="card">
            <h2>Savings &amp; Investments over time</h2>
            <TrendLineChart
              data={sinceMonth(netWorthTrend, stocksAsOf)}
              valueKey="stocks"
              color="var(--cat-stocks)"
              ariaLabel="Savings and investments over time"
              emptyMessage="No Savings-category activity yet."
            />
          </div>

          <div className="card">
            <h2>Savings &amp; Investments by cohort</h2>
            <p className="status-msg" style={{ marginBottom: 12 }}>
              Paying into Trading212 or a Saver pot adds a contribution; withdrawing deducts one.
              Each bar is your running total, split by the month the money was added — set your
              starting balance in the breakdown below.
            </p>
            {savingsCohort && (
              <SavingsCohortChart startingBalance={savingsCohort.starting_balance} months={savingsCohort.months} />
            )}
          </div>

          <NetWorthPanel onChanged={refresh} />
        </>
      )}

      {tab === "spending" && (
        <>
          <SpendingStatTiles monthly={monthly} />

          <div className="card">
            <h2>Monthly inflow &amp; outflow</h2>
            <p className="status-msg" style={{ marginBottom: 12 }}>
              Transfers between your own accounts (paying off a card, moving money between banks)
              are detected automatically and excluded — only real income and spending count here.
              Click a month to see it broken down by category.
            </p>
            <MonthlyBarChart data={monthly} selectedMonth={selectedMonth} onSelectMonth={goToMonth} />
          </div>
        </>
      )}

      {tab === "monthly" && (
        activeMonth ? (
          <CategoryBreakdown month={activeMonth} monthOptions={monthOptions} onMonthChange={setSelectedMonth} />
        ) : (
          <div className="card empty-state">No transactions yet — import a statement to see monthly spending.</div>
        )
      )}

      {tab === "transactions" && (
        <>
          <ManualTransactionForm categories={categories} onAdded={refresh} />
          <TransactionsTable transactions={transactions} categories={categories} onChanged={refresh} />
        </>
      )}
    </>
  );
}

export default App;
