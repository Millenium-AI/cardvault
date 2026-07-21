import { useRef, useState, useLayoutEffect } from "react";

type Point = { t: number; p: number };
type Stats = { high?: number; low?: number; avg?: number; change?: number } | null;

interface Crosshair {
  x: number;
  y: number;
  price: number;
  date: string;
}

// `width` is only a fallback used for the very first paint, before the
// ResizeObserver below reports the container's real pixel width. `height`
// is a real, fixed pixel height — it no longer gets derived from an
// aspect-ratio, so callers can size it independently of column width and
// it won't fight a parent's max-height wrapper.
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
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [crosshair, setCrosshair] = useState<Crosshair | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState(width);

  // ── Responsive width measurement ─────────────────────────────────────────
  // Ties the viewBox width to the container's actual rendered pixel width,
  // so 1 SVG unit == 1 real px. This is what keeps font-size/stroke-width/
  // padding visually consistent whether the chart sits in a 320px mobile
  // drawer or a 600px desktop panel — previously a fixed 320-unit viewBox
  // got stretched by the browser to fill whatever width it was given, which
  // scaled text and lines up or down along with it.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width;
      if (w && w > 0) setMeasuredWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!points || points.length < 2) return null;

  const prices = points.map(p => p.p);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;

  const W = measuredWidth;
  const H = height;
  const PAD_L = padding + 18;
  const PAD_R = padding;
  const PAD_T = padding * 0.6;
  const PAD_B = padding + 4;

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

  const hiY = stats?.high != null ? yCoord(stats.high) : null;
  const loY = stats?.low  != null ? yCoord(stats.low)  : null;

  const yTicks = [0, 0.33, 0.67, 1].map(r => {
    const p = yMin + r * yRange;
    return { y: yCoord(p), label: `$${p.toFixed(2)}` };
  });

  const midIdx = Math.floor((points.length - 1) / 2);
  const xLabels = [
    { x: PAD_L,          label: fmt(first.t) },
    { x: xCoord(midIdx), label: fmt(points[midIdx].t) },
    { x: W - PAD_R,      label: fmt(latest.t) },
  ];

  function fmt(ts: number) {
    return new Date(ts * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  const latX = xCoord(points.length - 1);
  const latY = yCoord(latest.p);
  const firstX = xCoord(0);
  const firstY = yCoord(first.p);

  // ── Accurate client → SVG coordinate mapping ─────────────────────────────
  // Uses both scaleX and scaleY from the actual rendered bounding box so the
  // crosshair stays locked to the cursor regardless of container width or
  // device pixel ratio.
  function clientToSVG(clientX: number): number | null {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width === 0) return null;
    const scaleX = W / rect.width;
    return (clientX - rect.left) * scaleX;
  }

  function findNearest(svgX: number): number {
    let nearest = 0;
    let minDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const dist = Math.abs(xCoord(i) - svgX);
      if (dist < minDist) { minDist = dist; nearest = i; }
    }
    return nearest;
  }

  function updateCrosshair(clientX: number) {
    const svgX = clientToSVG(clientX);
    if (svgX == null) return;
    // Clamp to chart area so crosshair doesn't jump to edges when cursor
    // is over the Y-axis label or right padding region
    if (svgX < PAD_L || svgX > W - PAD_R) {
      setCrosshair(null);
      return;
    }
    const idx = findNearest(svgX);
    const pt = points[idx];
    setCrosshair({
      x: xCoord(idx),
      y: yCoord(pt.p),
      price: pt.p,
      date: fmt(pt.t),
    });
  }

  // ── Desktop handlers ──────────────────────────────────────────────────────
  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    updateCrosshair(e.clientX);
  }

  function handleMouseLeave() {
    setCrosshair(null);
  }

  // ── Mobile handlers ───────────────────────────────────────────────────────
  // preventDefault stops the page from scrolling while scrubbing the chart.
  // passive: false is set via onTouchMove (React handles this correctly in
  // modern versions when touchAction is set to "none" on the element).
  function handleTouchMove(e: React.TouchEvent<SVGSVGElement>) {
    e.preventDefault();
    if (e.touches.length > 0) updateCrosshair(e.touches[0].clientX);
  }

  function handleTouchEnd() {
    // Keep crosshair visible briefly on mobile so user can read the value,
    // then fade out after a short delay
    setTimeout(() => setCrosshair(null), 800);
  }

  // Pill dimensions
  const PILL_W = 88;
  const PILL_H = 18;
  const pillX = crosshair
    ? Math.min(Math.max(crosshair.x - PILL_W / 2, PAD_L), W - PAD_R - PILL_W)
    : 0;
  const pillY = crosshair ? Math.max(crosshair.y - PILL_H - 6, PAD_T) : 0;

  return (
    <div className="w-full" ref={containerRef}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{
          // Height is fixed in real pixels (from the `height` prop) and no
          // longer derived from an aspect-ratio tied to viewBox width. Width
          // and height now scale independently, matching how the measured
          // viewBox width already keeps 1 unit == 1 px.
          height: `${H}px`,
          display: "block",
          touchAction: "none",        // Prevents scroll-hijack on mobile
          userSelect: "none",         // Prevents text selection while scrubbing
          WebkitUserSelect: "none",
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Grid lines */}
        {yTicks.map((t, i) => (
          <line key={i} x1={PAD_L} x2={W - PAD_R} y1={t.y} y2={t.y}
            stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" />
        ))}

        {/* Axes */}
        <line x1={PAD_L} x2={PAD_L} y1={PAD_T} y2={H - PAD_B}
          stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" />
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

        {/* Hi dashed line */}
        {hiY != null && (
          <>
            <line x1={PAD_L} x2={W - PAD_R} y1={hiY} y2={hiY}
              stroke="#34d399" strokeDasharray="3 3" strokeWidth="1" strokeOpacity="0.55" />
            <text x={W - PAD_R - 2} y={hiY - 3} textAnchor="end" fontSize="9" fill="#34d399" fillOpacity="0.8">
              Hi ${stats!.high!.toFixed(2)}
            </text>
          </>
        )}

        {/* Lo dashed line */}
        {loY != null && (
          <>
            <line x1={PAD_L} x2={W - PAD_R} y1={loY} y2={loY}
              stroke="#f87171" strokeDasharray="3 3" strokeWidth="1" strokeOpacity="0.55" />
            <text x={PAD_L + 2} y={loY + 9} textAnchor="start" fontSize="9" fill="#f87171" fillOpacity="0.8">
              Lo ${stats!.low!.toFixed(2)}
            </text>
          </>
        )}

        {/* Open price dot (hollow) */}
        <circle cx={firstX} cy={firstY} r="3" fill="none" stroke={stroke} strokeWidth="1.5" strokeOpacity="0.6" />

        {/* Latest dot + price label */}
        <circle cx={latX} cy={latY} r="3.5" fill={stroke} />
        <text x={latX - 5} y={latY - 6} textAnchor="end" fontSize="10"
          fontWeight="600" fill={stroke}>
          ${latest.p.toFixed(2)}
        </text>

        {/* ── Crosshair ── */}
        {crosshair && (
          <>
            {/* Vertical dashed line */}
            <line
              x1={crosshair.x} x2={crosshair.x}
              y1={PAD_T} y2={H - PAD_B}
              stroke="currentColor" strokeOpacity="0.35" strokeWidth="1"
              strokeDasharray="3 3"
            />
            {/* Invisible wide hit-area line for easier touch targeting on mobile */}
            <line
              x1={crosshair.x} x2={crosshair.x}
              y1={PAD_T} y2={H - PAD_B}
              stroke="transparent" strokeWidth="24"
            />
            {/* Dot on line */}
            <circle cx={crosshair.x} cy={crosshair.y} r="3.5" fill={stroke} opacity="0.9" />
            <circle cx={crosshair.x} cy={crosshair.y} r="6" fill={stroke} fillOpacity="0.2" />
            {/* Pill label */}
            <rect
              x={pillX} y={pillY}
              width={PILL_W} height={PILL_H}
              rx="5" ry="5"
              fill="hsl(0 0% 8%)" stroke="hsl(0 0% 20%)" strokeWidth="0.75"
            />
            <text
              x={pillX + PILL_W / 2}
              y={pillY + PILL_H / 2 + 4}
              textAnchor="middle"
              fontSize="9.5"
              fontWeight="600"
              fill={stroke}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              ${crosshair.price.toFixed(2)} · {crosshair.date}
            </text>
          </>
        )}
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