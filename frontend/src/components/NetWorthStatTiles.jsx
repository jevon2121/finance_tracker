const formatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

export default function NetWorthStatTiles({ netWorthTrend }) {
  const latest = netWorthTrend[netWorthTrend.length - 1];

  return (
    <div className="stat-tiles">
      <div className="stat-tile">
        <div className="label">Total net worth</div>
        <div className="value">{latest ? formatter.format(latest.total) : "—"}</div>
      </div>
      <div className="stat-tile">
        <div className="label">Cash &amp; Savings</div>
        <div className="value">{latest ? formatter.format(latest.cash_savings) : "—"}</div>
      </div>
      <div className="stat-tile">
        <div className="label">Savings &amp; Investments</div>
        <div className="value">{latest ? formatter.format(latest.stocks) : "—"}</div>
      </div>
    </div>
  );
}
