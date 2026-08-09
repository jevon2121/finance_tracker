import { useState } from "react";

const WIDTH = 640;
const HEIGHT = 260;
const MARGIN = { top: 16, right: 12, bottom: 28, left: 60 };
const INNER_W = WIDTH - MARGIN.left - MARGIN.right;
const INNER_H = HEIGHT - MARGIN.top - MARGIN.bottom;
const BAR_MAX = 40;
const MAX_MONTH_COHORTS = 7; // + 1 "Starting balance" slot = 8 total, the palette's safe cap

const currency = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function monthLabel(key) {
  const [year, month] = key.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-GB", { month: "short" });
}

function monthLabelLong(key) {
  const [year, month] = key.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function niceStep(span) {
  if (span <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(span));
  const normalized = span / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

export default function SavingsCohortChart({ startingBalance, months }) {
  const [hovered, setHovered] = useState(null);

  if (!months.length && !startingBalance) {
    return (
      <div className="empty-state">
        No Savings-category activity yet — contributions to Trading212 or a Saver pot will show up here.
      </div>
    );
  }

  const hasStarting = startingBalance !== 0;

  // Fold any months beyond the safe categorical count into one "Earlier" cohort
  // (never generate a 9th hue) — keep the most recent months distinctly colored.
  const overflowCount = Math.max(0, months.length - MAX_MONTH_COHORTS);
  const recentMonths = months.slice(overflowCount);
  const earlierTotal = months.slice(0, overflowCount).reduce((sum, m) => sum + m.contribution, 0);
  const firstRecentSlot = hasStarting ? 2 : 1;

  const legend = [];
  if (hasStarting) legend.push({ key: "starting", label: "Starting balance", value: startingBalance, color: "var(--cohort-1)" });
  if (overflowCount > 0) legend.push({ key: "earlier", label: "Earlier months", value: earlierTotal, color: "var(--cohort-8)" });
  recentMonths.forEach((m, i) => {
    legend.push({ key: m.month, label: monthLabelLong(m.month), value: m.contribution, color: `var(--cohort-${firstRecentSlot + i})` });
  });

  const bars = months.map((_, idx) => {
    let running = 0;
    const segments = [];

    if (hasStarting) {
      const from = running;
      running += startingBalance;
      segments.push({ key: "starting", label: "Starting balance", color: "var(--cohort-1)", from, to: running });
    }
    if (overflowCount > 0) {
      const includedCount = Math.min(idx + 1, overflowCount);
      const value = months.slice(0, includedCount).reduce((sum, m) => sum + m.contribution, 0);
      const from = running;
      running += value;
      segments.push({ key: "earlier", label: "Earlier months", color: "var(--cohort-8)", from, to: running });
    }
    recentMonths.forEach((m, i) => {
      const monthIndex = overflowCount + i;
      if (monthIndex > idx) return;
      const from = running;
      running += m.contribution;
      segments.push({
        key: m.month, label: monthLabelLong(m.month), color: `var(--cohort-${firstRecentSlot + i})`, from, to: running,
      });
    });

    return { month: months[idx].month, segments, total: running };
  });

  const allBoundaries = bars.flatMap((b) => b.segments.flatMap((s) => [s.from, s.to])).concat(0);
  const min = Math.min(...allBoundaries);
  const max = Math.max(...allBoundaries);
  const step = niceStep(max - min || 100);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const span = niceMax - niceMin || 1;

  const slotWidth = INNER_W / bars.length;
  const barWidth = Math.min(BAR_MAX, slotWidth * 0.5);
  const yScale = (v) => INNER_H - ((v - niceMin) / span) * INNER_H;
  const ticks = [niceMin, (niceMin + niceMax) / 2, niceMax];

  return (
    <div>
      <div className="legend" style={{ flexWrap: "wrap" }}>
        {legend.map((c) => (
          <span className="legend-item" key={c.key}>
            <span className="legend-swatch" style={{ background: c.color }} />
            {c.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" role="img" aria-label="Savings and investments by contribution cohort">
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

          {bars.map((bar, i) => {
            const slotX = i * slotWidth + (slotWidth - barWidth) / 2;
            return (
              <g key={bar.month}>
                {bar.segments.map((s) => {
                  // yScale decreases as the value increases (SVG y grows downward),
                  // so the pixel for the smaller of from/to is the BOTTOM of the bar.
                  const yTop = Math.min(yScale(s.from), yScale(s.to));
                  const yBottom = Math.max(yScale(s.from), yScale(s.to));
                  const isHovered = hovered?.month === bar.month && hovered.key === s.key;
                  return (
                    <rect
                      key={s.key}
                      x={slotX}
                      y={yTop + 1}
                      width={barWidth}
                      height={Math.max(yBottom - yTop - 2, 1)}
                      fill={s.color}
                      opacity={isHovered ? 0.85 : 1}
                      style={{ cursor: "pointer" }}
                      onMouseEnter={() => setHovered({ month: bar.month, key: s.key, label: s.label, value: s.to - s.from })}
                      onMouseLeave={() => setHovered(null)}
                    />
                  );
                })}
                <text x={slotX + barWidth / 2} y={INNER_H + 18} textAnchor="middle" fontSize="11" fill="var(--text-muted)">
                  {monthLabel(bar.month)}
                </text>
                {i === bars.length - 1 && (
                  <text x={slotX + barWidth / 2} y={yScale(bar.total) - 8} textAnchor="middle" fontSize="11" fill="var(--text-secondary)">
                    {currency.format(bar.total)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      {hovered && (
        <div className="status-msg">
          <strong>{currency.format(hovered.value)}</strong> · {hovered.label}
        </div>
      )}
    </div>
  );
}
