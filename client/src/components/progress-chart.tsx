import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Table2, LineChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProgressPoint } from "@/lib/types";
import { cn } from "@/lib/utils";

// Series colours are the validated categorical slots 1–4 (light and dark steps in
// index.css as --series-1…4). Light slots 3–4 sit under 3:1 against the card, so
// the chart always ships end labels, a legend and a table view.
const SERIES = [
  { key: "overall", label: "Overall", color: "var(--series-1)" },
  { key: "communication", label: "Communication", color: "var(--series-2)" },
  { key: "technical", label: "Technical depth", color: "var(--series-3)" },
  { key: "presence", label: "Presence", color: "var(--series-4)" },
] as const;
type SeriesKey = (typeof SERIES)[number]["key"];

const HEIGHT = 240;
const PAD = { top: 16, right: 44, bottom: 28, left: 32 };
const TICKS = [0, 25, 50, 75, 100];

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(260, entry.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

// Splits a series at missing values so the line doesn't invent data between them.
function segments(values: (number | null)[]) {
  const out: { i: number; v: number }[][] = [];
  let run: { i: number; v: number }[] = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (run.length) out.push(run);
      run = [];
    } else run.push({ i, v });
  });
  if (run.length) out.push(run);
  return out;
}

export function ProgressChart({ points }: { points: ProgressPoint[] }) {
  const [visible, setVisible] = useState<Set<SeriesKey>>(() => new Set<SeriesKey>(["overall"]));
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const [wrapRef, width] = useWidth<HTMLDivElement>();

  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / 100) * innerH;

  const shown = SERIES.filter((s) => visible.has(s.key));
  const hasData = (key: SeriesKey) => points.some((p) => typeof p[key] === "number");

  const change = useMemo(
    () =>
      SERIES.map((s) => {
        const vals = points.map((p) => p[s.key]).filter((v): v is number => typeof v === "number");
        return { ...s, first: vals[0], last: vals[vals.length - 1], n: vals.length };
      }),
    [points],
  );

  const toggle = (key: SeriesKey) =>
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key) && next.size > 1) next.delete(key);
      else next.add(key);
      return next;
    });

  const onPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const i = points.length === 1 ? 0 : Math.round(((px - PAD.left) / innerW) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    setHover((h) => {
      const cur = h ?? points.length - 1;
      if (e.key === "Home") return 0;
      if (e.key === "End") return points.length - 1;
      return Math.max(0, Math.min(points.length - 1, cur + (e.key === "ArrowRight" ? 1 : -1)));
    });
  };

  const overall = change[0];
  const delta = overall.n >= 2 ? Math.round(overall.last - overall.first) : null;
  const summary =
    delta === null
      ? "Finish another interview to see a trend."
      : `Overall score went from ${Math.round(overall.first)} to ${Math.round(overall.last)} across ${points.length} interviews (${delta >= 0 ? "+" : ""}${delta}).`;

  const hovered = hover !== null ? points[hover] : null;
  const tipLeft = hover !== null ? (x(hover) / width) * 100 : 0;

  return (
    <div className="viz-root" ref={wrapRef}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Scores to show">
          {SERIES.map((s) => {
            const on = visible.has(s.key);
            const available = hasData(s.key);
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => toggle(s.key)}
                aria-pressed={on}
                disabled={!available}
                className={cn(
                  "inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  on ? "border-foreground/30 bg-muted font-semibold" : "bg-card text-muted-foreground hover:border-foreground/30",
                )}
                title={available ? undefined : "No data yet"}
              >
                <span className="h-0.5 w-4 rounded-full" style={{ background: s.color, opacity: on ? 1 : 0.5 }} aria-hidden="true" />
                {s.label}
              </button>
            );
          })}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setAsTable((t) => !t)} aria-pressed={asTable}>
          {asTable ? <LineChart /> : <Table2 />}
          {asTable ? "Show chart" : "Show table"}
        </Button>
      </div>

      <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">{summary}</p>

      {asTable ? (
        <div className="mt-4 overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <caption className="sr-only">Scores for each finished interview, oldest first</caption>
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Date</th>
                <th scope="col" className="px-3 py-2 font-medium">Interview</th>
                {SERIES.map((s) => <th key={s.key} scope="col" className="px-3 py-2 text-right font-medium">{s.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y">
              {points.map((p) => (
                <tr key={p.sessionId}>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{shortDate(p.date)}</td>
                  <td className="px-3 py-2">
                    <Link href={`/report/${p.sessionId}`} className="text-primary hover:underline">{p.title || "Interview"}</Link>
                  </td>
                  {SERIES.map((s) => (
                    <td key={s.key} className="px-3 py-2 text-right tabular-nums">{typeof p[s.key] === "number" ? Math.round(p[s.key] as number) : "–"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative mt-4">
          <svg
            width="100%"
            height={HEIGHT}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            role="img"
            aria-label={`Score over time. ${summary} Use the arrow keys to read each interview.`}
            tabIndex={0}
            onPointerMove={onPointer}
            onPointerLeave={() => setHover(null)}
            onKeyDown={onKey}
            onBlur={() => setHover(null)}
            className="touch-pan-y overflow-visible rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {TICKS.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="hsl(var(--border))" strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">{t}</text>
              </g>
            ))}
            <text x={x(0)} y={HEIGHT - 6} textAnchor={points.length === 1 ? "middle" : "start"} className="fill-muted-foreground text-[11px]">
              {shortDate(points[0]?.date)}
            </text>
            {points.length > 1 && (
              <text x={x(points.length - 1)} y={HEIGHT - 6} textAnchor="end" className="fill-muted-foreground text-[11px]">
                {shortDate(points[points.length - 1]?.date)}
              </text>
            )}

            {hover !== null && (
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="hsl(var(--muted-foreground))" strokeWidth={1} />
            )}

            {shown.map((s) => {
              const values = points.map((p) => (typeof p[s.key] === "number" ? (p[s.key] as number) : null));
              const runs = segments(values);
              const last = runs.length ? runs[runs.length - 1][runs[runs.length - 1].length - 1] : null;
              return (
                <g key={s.key}>
                  {runs.map((run, r) => (
                    <polyline
                      key={r}
                      points={run.map(({ i, v }) => `${x(i)},${y(v)}`).join(" ")}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ))}
                  {runs.flat().map(({ i, v }) =>
                    points.length <= 24 || i === hover || i === last?.i ? (
                      <circle key={i} cx={x(i)} cy={y(v)} r={i === hover ? 5 : 4} fill={s.color} stroke="hsl(var(--card))" strokeWidth={2} />
                    ) : null,
                  )}
                  {last && shown.length <= 4 && (
                    <text x={x(last.i) + 9} y={y(last.v)} dy="0.32em" className="fill-foreground text-[12px] font-semibold tabular-nums">
                      {Math.round(last.v)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {hovered && (
            <div
              className="pointer-events-none absolute top-0 z-10 w-48 rounded-lg border bg-popover p-3 text-sm shadow-md"
              style={{ left: `clamp(0px, calc(${tipLeft}% - 6rem), calc(100% - 12rem))` }}
              role="status"
            >
              <p className="font-semibold leading-snug">{hovered.title || "Interview"}</p>
              <p className="text-xs text-muted-foreground">{shortDate(hovered.date)}</p>
              <dl className="mt-2 space-y-1">
                {SERIES.map((s) => (
                  <div key={s.key} className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-2 text-muted-foreground">
                      <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                      {s.label}
                    </dt>
                    <dd className="font-semibold tabular-nums">{typeof hovered[s.key] === "number" ? Math.round(hovered[s.key] as number) : "–"}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      )}

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {change.map((c) => (
          <div key={c.key} className="rounded-xl bg-muted/50 p-3">
            <dt className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-0.5 w-3 rounded-full" style={{ background: c.color }} aria-hidden="true" />
              {c.label}
            </dt>
            <dd className="mt-1 font-display text-xl font-semibold tabular-nums">
              {c.n >= 2 ? `${c.last - c.first >= 0 ? "+" : ""}${Math.round(c.last - c.first)}` : "–"}
              <span className="ml-1 text-xs font-normal text-muted-foreground">{c.n >= 2 ? "since first" : "not enough data"}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
