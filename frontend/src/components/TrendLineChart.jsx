import { useState } from "react";

const WIDTH = 640;
const HEIGHT = 220;
const MARGIN = { top: 16, right: 16, bottom: 28, left: 60 };
const INNER_W = WIDTH - MARGIN.left - MARGIN.right;
const INNER_H = HEIGHT - MARGIN.top - MARGIN.bottom;

const currency = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function monthLabel(key) {
  const [year, month] = key.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
  });
}

export default function TrendLineChart({ data, valueKey, color = "var(--series-wealth)", ariaLabel, emptyMessage }) {
  const [hoverIndex, setHoverIndex] = useState(null);

  if (!data.length) {
    return <div className="empty-state">{emptyMessage}</div>;
  }

  const values = data.map((d) => d[valueKey]);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const xStep = data.length > 1 ? INNER_W / (data.length - 1) : 0;
  const xScale = (i) => i * xStep;
  const yScale = (v) => INNER_H - ((v - min) / span) * INNER_H;

  const path = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${xScale(i).toFixed(1)} ${yScale(d[valueKey]).toFixed(1)}`)
    .join(" ");

  const ticks = [min, (min + max) / 2, max];
  const last = data[data.length - 1];

  function handleMove(e) {
    const svgRect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - svgRect.left) / svgRect.width) * WIDTH - MARGIN.left;
    const idx = Math.round(relX / xStep);
    setHoverIndex(Math.max(0, Math.min(data.length - 1, idx)));
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        role="img"
        aria-label={ariaLabel}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={0} x2={INNER_W} y1={yScale(t)} y2={yScale(t)} stroke="var(--gridline)" strokeWidth="1" />
              <text x={-8} y={yScale(t)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="var(--text-muted)">
                {currency.format(t)}
              </text>
            </g>
          ))}
          <line x1={0} x2={INNER_W} y1={yScale(0)} y2={yScale(0)} stroke="var(--baseline)" strokeWidth="1" />

          <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

          {hoverIndex !== null && (
            <line
              x1={xScale(hoverIndex)}
              x2={xScale(hoverIndex)}
              y1={0}
              y2={INNER_H}
              stroke="var(--baseline)"
              strokeWidth="1"
            />
          )}

          {data.map((d, i) => (
            <circle
              key={d.month}
              cx={xScale(i)}
              cy={yScale(d[valueKey])}
              r={hoverIndex === i ? 5 : 4}
              fill={color}
              stroke="var(--surface-1)"
              strokeWidth="2"
            />
          ))}

          <text x={xScale(data.length - 1)} y={yScale(last[valueKey]) - 12} textAnchor="end" fontSize="12" fill="var(--text-secondary)">
            {currency.format(last[valueKey])}
          </text>

          {data.map((d, i) => (
            <text key={d.month} x={xScale(i)} y={INNER_H + 18} textAnchor="middle" fontSize="11" fill="var(--text-muted)">
              {monthLabel(d.month)}
            </text>
          ))}
        </g>
      </svg>
      {hoverIndex !== null && (
        <div className="status-msg">
          <strong>{currency.format(data[hoverIndex][valueKey])}</strong> · {monthLabel(data[hoverIndex].month)}
        </div>
      )}
    </div>
  );
}
