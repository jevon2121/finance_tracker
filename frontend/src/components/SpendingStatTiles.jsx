const formatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

export default function SpendingStatTiles({ monthly }) {
  const latestMonth = monthly[monthly.length - 1];

  return (
    <div className="stat-tiles">
      <div className="stat-tile">
        <div className="label">This month in</div>
        <div className="value">{latestMonth ? formatter.format(latestMonth.total_in) : "—"}</div>
      </div>
      <div className="stat-tile">
        <div className="label">This month out</div>
        <div className="value">{latestMonth ? formatter.format(latestMonth.total_out) : "—"}</div>
      </div>
      <div className="stat-tile">
        <div className="label">This month net</div>
        <div className="value">{latestMonth ? formatter.format(latestMonth.net) : "—"}</div>
        {latestMonth && (
          <div className={`delta ${latestMonth.net >= 0 ? "up" : "down"}`}>
            {latestMonth.net >= 0 ? "↑ saved" : "↓ overspent"}
          </div>
        )}
      </div>
    </div>
  );
}
