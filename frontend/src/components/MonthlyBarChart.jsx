import { useState } from "react";

const WIDTH = 640;
const HEIGHT = 260;
const MARGIN = { top: 16, right: 12, bottom: 28, left: 52 };
const INNER_W = WIDTH - MARGIN.left - MARGIN.right;
const INNER_H = HEIGHT - MARGIN.top - MARGIN.bottom;
const BAR_MAX = 24;

const currency = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function niceMax(value) {
  if (value <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function monthLabel(key) {
  const [year, month] = key.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-GB", {
    month: "short",
  });
}

export default function MonthlyBarChart({ data, selectedMonth, onSelectMonth }) {
  const [hovered, setHovered] = useState(null);

  if (!data.length) {
    return <div className="empty-state">No transactions yet — import a statement to see monthly totals.</div>;
  }

  const maxVal = niceMax(Math.max(...data.map((d) => Math.max(d.total_in, d.total_out))));
  const slotWidth = INNER_W / data.length;
  const groupWidth = Math.min(BAR_MAX * 2 + 2, slotWidth * 0.6);
  const barWidth = (groupWidth - 2) / 2;
  const yScale = (v) => INNER_H - (v / maxVal) * INNER_H;
  const ticks = [0, maxVal / 2, maxVal];

  return (
    <div>
      <div className="legend">
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: "var(--series-in)" }} />
          Money in
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: "var(--series-out)" }} />
          Money out
        </span>
        <span className="status-msg">Click a month to see spending by category</span>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" role="img" aria-label="Monthly money in and out">
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={0}
                x2={INNER_W}
                y1={yScale(t)}
                y2={yScale(t)}
                stroke="var(--gridline)"
                strokeWidth="1"
              />
              <text x={-8} y={yScale(t)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="var(--text-muted)">
                {currency.format(t)}
              </text>
            </g>
          ))}
          <line x1={0} x2={INNER_W} y1={INNER_H} y2={INNER_H} stroke="var(--baseline)" strokeWidth="1" />

          {data.map((d, i) => {
            const slotX = i * slotWidth + (slotWidth - groupWidth) / 2;
            const inH = INNER_H - yScale(d.total_in);
            const outH = INNER_H - yScale(d.total_out);
            const isHoveredIn = hovered?.i === i && hovered.series === "in";
            const isHoveredOut = hovered?.i === i && hovered.series === "out";

            const isSelected = selectedMonth === d.month;

            return (
              <g key={d.month}>
                <rect
                  x={i * slotWidth}
                  y={0}
                  width={slotWidth}
                  height={INNER_H}
                  fill={isSelected ? "var(--gridline)" : "transparent"}
                  rx={6}
                  style={{ cursor: "pointer" }}
                  onClick={() => onSelectMonth?.(isSelected ? null : d.month)}
                />
                <rect
                  x={slotX}
                  y={INNER_H - inH}
                  width={barWidth}
                  height={Math.max(inH, 1)}
                  rx={4}
                  fill="var(--series-in)"
                  opacity={isHoveredIn ? 0.85 : 1}
                  tabIndex={0}
                  style={{ cursor: "pointer" }}
                  onClick={() => onSelectMonth?.(isSelected ? null : d.month)}
                  onMouseEnter={() => setHovered({ i, series: "in" })}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered({ i, series: "in" })}
                  onBlur={() => setHovered(null)}
                />
                <rect
                  x={slotX + barWidth + 2}
                  y={INNER_H - outH}
                  width={barWidth}
                  height={Math.max(outH, 1)}
                  rx={4}
                  fill="var(--series-out)"
                  opacity={isHoveredOut ? 0.85 : 1}
                  tabIndex={0}
                  style={{ cursor: "pointer" }}
                  onClick={() => onSelectMonth?.(isSelected ? null : d.month)}
                  onMouseEnter={() => setHovered({ i, series: "out" })}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered({ i, series: "out" })}
                  onBlur={() => setHovered(null)}
                />
                {i === data.length - 1 && (
                  <>
                    <text x={slotX + barWidth / 2} y={INNER_H - inH - 6} textAnchor="middle" fontSize="11" fill="var(--text-secondary)">
                      {currency.format(d.total_in)}
                    </text>
                    <text x={slotX + barWidth * 1.5 + 2} y={INNER_H - outH - 6} textAnchor="middle" fontSize="11" fill="var(--text-secondary)">
                      {currency.format(d.total_out)}
                    </text>
                  </>
                )}
                <text x={slotX + groupWidth / 2} y={INNER_H + 18} textAnchor="middle" fontSize="11" fill="var(--text-muted)">
                  {monthLabel(d.month)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      {hovered && (
        <div className="status-msg">
          <strong>{hovered.series === "in" ? "Money in" : "Money out"}</strong> ·{" "}
          {monthLabel(data[hovered.i].month)}:{" "}
          {currency.format(hovered.series === "in" ? data[hovered.i].total_in : data[hovered.i].total_out)}
        </div>
      )}
    </div>
  );
}
