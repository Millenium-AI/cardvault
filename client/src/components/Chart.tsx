type Point = { t: number; p: number };
type Stats = { high?: number; low?: number; avg?: number; change?: number } | null;

export function Chart({
  points,
  stats,
  showStats = true,
  width = 320,
  height = 160,
  padding = 22,
}: {
  points: Point[];
  stats?: Stats;
  showStats?: boolean;
  width?: number;
  height?: number;
  padding?: number;
}) {
  if (!points || points.length < 2) return null;

  const prices = points.map(p => p.p);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;

  const W = width;
  const H = height;
  const PAD_L = padding + 18; // extra left room for y-axis labels
  const PAD_R = padding;
  const PAD_T = padding * 0.6;
  const PAD_B = padding + 4; // extra bottom room for x-axis labels

  const yMin = minP - 0.06 * range;
  const yMax = maxP + 0.06 * range;
  const yRange = yMax - yMin || 1;

  const xCoord = (i: number) => PAD_L + (i / (points.length - 1)) * (W - PAD_L - PAD_R);
  const yCoord = (p: number) => H - PAD_B - ((p - yMin) / yRange) * (H - PAD_T - PAD_B);

  const linePoints = points.map((pt, i) => `${xCoord(i).toFixed(1)},${yCoord(pt.p).toFixed(1)}`).join(" ");
  const areaPoints = `${PAD_L},${H - PAD_B} ${linePoints} ${W - PAD_R},${H - PAD_B}`;

  const latest = points[points.length - 1];
  const first = points[0];
  const isUp = latest.p >= first.p;
  const stroke = isUp ? "#34d399" : "#f87171";
  const fill   = isUp ? "#34d399" : "#f87171";

  // High / low from stats
  const hiY = stats?.high != null ? yCoord(stats.high) : null;
  const loY = stats?.low  != null ? yCoord(stats.low)  : null;

  // 4 y-axis grid ticks
  const yTicks = [0, 0.33, 0.67, 1].map(r => {
    const p = yMin + r * yRange;
    return { y: yCoord(p), label: `$${p.toFixed(2)}` };
  });

  // X labels: first, mid, last
  const midIdx = Math.floor((points.length - 1) / 2);
  const xLabels = [
    { x: PAD_L, label: fmt(first.t) },
    { x: xCoord(midIdx), label: fmt(points[midIdx].t) },
    { x: W - PAD_R, label: fmt(latest.t) },
  ];

  function fmt(ts: number) {
    return new Date(ts * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  const latX = xCoord(points.length - 1);
  const latY = yCoord(latest.p);

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        {/* Grid lines */}
        {yTicks.map((t, i) => (
          <line key={i} x1={PAD_L} x2={W - PAD_R} y1={t.y} y2={t.y}
            stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" />
        ))}

        {/* Y axis */}
        <line x1={PAD_L} x2={PAD_L} y1={PAD_T} y2={H - PAD_B}
          stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" />
        {/* X axis */}
        <line x1={PAD_L} x2={W - PAD_R} y1={H - PAD_B} y2={H - PAD_B}
          stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" />

        {/* Y-axis labels */}
        {yTicks.map((t, i) => (
          <text key={i} x={PAD_L - 4} y={t.y + 3.5}
            textAnchor="end" fontSize="9" fill="currentColor" fillOpacity="0.45">
            {t.label}
          </text>
        ))}

        {/* X-axis labels */}
        {xLabels.map((l, i) => (
          <text key={i} x={l.x} y={H - PAD_B + 11}
            textAnchor={i === 0 ? "start" : i === xLabels.length - 1 ? "end" : "middle"}
            fontSize="9" fill="currentColor" fillOpacity="0.45">
            {l.label}
          </text>
        ))}

        {/* Area fill */}
        <polyline points={areaPoints} fill={fill} fillOpacity="0.1" stroke="none" />

        {/* Price line */}
        <polyline points={linePoints} fill="none" stroke={stroke} strokeWidth="1.75"
          strokeLinejoin="round" strokeLinecap="round" />

        {/* High dashed line */}
        {hiY != null && (
          <>
            <line x1={PAD_L} x2={W - PAD_R} y1={hiY} y2={hiY}
              stroke="#34d399" strokeDasharray="3 3" strokeWidth="1" strokeOpacity="0.55" />
            <text x={W - PAD_R - 2} y={hiY - 3} textAnchor="end" fontSize="9" fill="#34d399" fillOpacity="0.8">
              Hi ${stats!.high!.toFixed(2)}
            </text>
          </>
        )}

        {/* Low dashed line */}
        {loY != null && (
          <>
            <line x1={PAD_L} x2={W - PAD_R} y1={loY} y2={loY}
              stroke="#f87171" strokeDasharray="3 3" strokeWidth="1" strokeOpacity="0.55" />
            <text x={PAD_L + 2} y={loY + 9} textAnchor="start" fontSize="9" fill="#f87171" fillOpacity="0.8">
              Lo ${stats!.low!.toFixed(2)}
            </text>
          </>
        )}

        {/* Latest dot + label */}
        <circle cx={latX} cy={latY} r="3.5" fill={stroke} />
        <text x={latX - 5} y={latY - 6} textAnchor="end" fontSize="10"
          fontWeight="600" fill={stroke}>
          ${latest.p.toFixed(2)}
        </text>
      </svg>

      {/* Compact stats row */}
      {showStats && stats && (
        <div className="flex items-center gap-3 text-[10px] font-semibold tabular-nums pt-1.5 pl-1">
          {stats.change != null && (
            <span className={stats.change >= 0 ? "text-emerald-400" : "text-red-400"}>
              {stats.change >= 0 ? "+" : ""}{(stats.change * 100).toFixed(1)}%
            </span>
          )}
          {stats.high != null && <span className="text-emerald-400">Hi ${stats.high.toFixed(2)}</span>}
          {stats.low  != null && <span className="text-red-400">Lo ${stats.low.toFixed(2)}</span>}
          {stats.avg  != null && <span className="text-muted-foreground">Avg ${stats.avg.toFixed(2)}</span>}
        </div>
      )}
    </div>
  );
}
