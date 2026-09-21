/** Small custom SVG visualizations — no chart library needed. */

/** Discrete SLA heat scale: deviations from 100% must read instantly. */
export function heatColor(v: number | null): string {
  if (v == null) return "#e6eaf0";
  if (v >= 1) return "#059669";
  if (v >= 0.999) return "#34d399";
  if (v >= 0.99) return "#fbbf24";
  if (v >= 0.95) return "#f97316";
  return "#ef4444";
}

export function heatLabel(v: number | null): string {
  if (v == null) return "no data";
  return `${(v * 100).toFixed(2)}% available`;
}

interface RingProps {
  value: number; // 0..1
  size?: number;
  stroke?: number;
  good: boolean;
  label: string;
  sub: string;
}

/** Availability ring for the dark command panel. */
export function Ring({ value, size = 148, stroke = 13, good, label, sub }: RingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, value));
  const color = good ? "#34d399" : "#f87171";
  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${frac * c} ${c}`}
          style={{ transition: "stroke-dasharray 0.6s ease", filter: `drop-shadow(0 0 6px ${good ? "rgba(52,211,153,0.5)" : "rgba(248,113,113,0.5)"})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num text-[26px] font-extrabold leading-7 tracking-tight text-white">{label}</span>
        <span className="mt-1 text-[11px] font-medium text-slate-400">{sub}</span>
      </div>
    </div>
  );
}

interface HeatStripProps {
  values: (number | null)[];
  dates: string[];
  serviceId: string;
}

/** One row of daily availability cells with native tooltips. */
export function HeatStrip({ values, dates, serviceId }: HeatStripProps) {
  return (
    <div className="flex flex-1 gap-[3px]" role="img" aria-label={`Daily availability for ${serviceId}`}>
      {values.map((v, i) => (
        <div
          key={`${serviceId}-${dates[i]}`}
          className="heat-cell flex-1"
          style={{ background: heatColor(v) }}
          title={`${dates[i]} · ${heatLabel(v)}`}
        >
          <span className="sr-only">
            {dates[i]}: {heatLabel(v)}
          </span>
        </div>
      ))}
    </div>
  );
}

interface SparkProps {
  values: (number | null)[];
  width?: number;
  height?: number;
  stroke?: string;
  label: string;
}

/** Minimal area sparkline (daily p95 latency). */
export function Spark({ values, width = 220, height = 44, stroke = "#38bdf8", label }: SparkProps) {
  const pts = values.map((v) => v ?? 0);
  const max = Math.max(...pts, 1);
  const min = Math.min(...pts);
  const span = Math.max(1, max - min);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const coords = pts.map((v, i) => {
    const x = Math.round(i * step * 10) / 10;
    const y = Math.round((height - 5 - ((v - min) / span) * (height - 12)) * 10) / 10;
    return `${x},${y}`;
  });
  const line = `M${coords.join(" L")}`;
  const area = `${line} L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="overflow-visible">
      <path d={area} fill={stroke} opacity={0.14} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
