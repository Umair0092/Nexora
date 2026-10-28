import { useEffect, useRef, useState } from "react";
import { Table2, LineChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Validated categorical slots from index.css (light and dark steps).
const INVITED = "var(--series-1)";
const FINISHED = "var(--series-2)";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(260, entry.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const weekLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** Steps from invited to hired, each bar scaled to everyone invited. */
export function Funnel({ steps }: { steps: { key: string; label: string; count: number; ofPrevious: number | null; ofInvited: number | null }[] }) {
  const max = Math.max(1, steps[0]?.count ?? 1);
  return (
    <ol className="space-y-2.5" aria-label="Candidates reaching each stage">
      {steps.map((s) => (
        <li key={s.key} className="group grid grid-cols-[8.5rem_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[11rem_1fr_7rem]">
          <span className="truncate text-muted-foreground">{s.label}</span>
          <span className="relative h-5 rounded-r bg-muted/50" title={`${s.count} candidate${s.count === 1 ? "" : "s"}${s.ofInvited != null ? `, ${s.ofInvited}% of everyone invited` : ""}`}>
            <span
              className="absolute inset-y-0 left-0 rounded-r-[4px] transition-[width] duration-500"
              style={{ width: `${(100 * s.count) / max}%`, minWidth: s.count ? 4 : 0, background: INVITED }}
            />
          </span>
          <span className="text-right tabular-nums">
            <span className="font-semibold">{s.count}</span>
            {s.ofPrevious != null && <span className="ml-2 text-xs text-muted-foreground">{s.ofPrevious}% of prev.</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

const H = 220;
const PAD = { top: 14, right: 64, bottom: 26, left: 30 };

/** Invitations and finished interviews per week, with a table view. */
export function WeeklyChart({ weeks }: { weeks: { weekStart: string; invited: number; completed: number }[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const series = [
    { key: "invited" as const, label: "Invited", color: INVITED },
    { key: "completed" as const, label: "Finished", color: FINISHED },
  ];
  const top = Math.max(4, ...weeks.flatMap((w) => [w.invited, w.completed]));
  const niceTop = Math.ceil(top / 2) * 2;
  const iw = width - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (weeks.length === 1 ? iw / 2 : (i * iw) / (weeks.length - 1));
  const y = (v: number) => PAD.top + ih - (v / niceTop) * ih;
  const ticks = [0, niceTop / 2, niceTop];
  const totals = series.map((s) => weeks.reduce((n, w) => n + w[s.key], 0));
  const summary = `${totals[0]} invited and ${totals[1]} finished over ${weeks.length} weeks.`;
  const last = weeks.length - 1;

  const onPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * width;
    const i = Math.round(((px - PAD.left) / iw) * (weeks.length - 1));
    setHover(Math.min(last, Math.max(0, i)));
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul className="flex gap-4 text-sm" aria-label="Legend">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
        <Button variant="ghost" size="sm" onClick={() => setAsTable((t) => !t)} aria-pressed={asTable}>
          {asTable ? <LineChart /> : <Table2 />}
          {asTable ? "Chart" : "Table"}
        </Button>
      </div>
      <p className="sr-only" aria-live="polite">{summary}</p>
      {asTable ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 font-medium">Week of</th>
                <th className="py-2 text-right font-medium">Invited</th>
                <th className="py-2 text-right font-medium">Finished</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.weekStart} className="border-b last:border-0">
                  <td className="py-1.5">{weekLabel(w.weekStart)}</td>
                  <td className="py-1.5 text-right tabular-nums">{w.invited}</td>
                  <td className="py-1.5 text-right tabular-nums">{w.completed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="relative mt-3">
          <svg width="100%" viewBox={`0 0 ${width} ${H}`} role="img" aria-label={`Weekly activity. ${summary}`} onPointerMove={onPointer} onPointerLeave={() => setHover(null)} className="touch-none overflow-visible">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeDasharray={t === 0 ? undefined : "2 4"} />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">{t}</text>
              </g>
            ))}
            {weeks.map((w, i) =>
              i % Math.ceil(weeks.length / 6) === 0 || i === last ? (
                <text key={w.weekStart} x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[11px]">{weekLabel(w.weekStart)}</text>
              ) : null,
            )}
            {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} className="stroke-muted-foreground/50" />}
            {series.map((s) => (
              <g key={s.key}>
                <path d={weeks.map((w, i) => `${i ? "L" : "M"}${x(i)},${y(w[s.key])}`).join("")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {hover != null && <circle cx={x(hover)} cy={y(weeks[hover][s.key])} r={4.5} fill={s.color} className="stroke-card" strokeWidth={2} />}
              </g>
            ))}
            {/* End labels, nudged apart when the two lines finish close together. */}
            {(() => {
              const ys = series.map((s) => y(weeks[last][s.key]));
              if (Math.abs(ys[0] - ys[1]) < 14) {
                const mid = (ys[0] + ys[1]) / 2;
                const up = weeks[last].invited >= weeks[last].completed ? 0 : 1;
                ys[up] = mid - 7;
                ys[1 - up] = mid + 7;
              }
              return series.map((s, k) => (
                <text key={s.key} x={x(last) + 8} y={ys[k]} dy="0.32em" className="fill-foreground text-[11px]">
                  {s.label} {weeks[last][s.key]}
                </text>
              ));
            })()}
          </svg>
          {hover != null && (
            <div
              className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md"
              style={{ left: `${(x(hover) / width) * 100}%` }}
            >
              <p className="font-medium">Week of {weekLabel(weeks[hover].weekStart)}</p>
              {series.map((s) => (
                <p key={s.key} className="mt-0.5 flex items-center gap-2 tabular-nums">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                  {s.label} <span className="ml-auto font-semibold">{weeks[hover][s.key]}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** AI screening scores in bands of ten. */
export function ScoreHistogram({ bins, median }: { bins: { from: number; to: number; count: number }[]; median: number | null }) {
  const max = Math.max(1, ...bins.map((b) => b.count));
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div>
      <div className="relative flex h-40 items-end gap-[2px]" role="img" aria-label={`AI scores in bands of ten. ${bins.map((b) => `${b.from}–${b.to}: ${b.count}`).join(", ")}.`}>
        {bins.map((b, i) => (
          <div key={b.from} className="relative flex h-full flex-1 items-end" onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            <div
              className={cn("w-full rounded-t-[4px] transition-opacity", hover != null && hover !== i && "opacity-60")}
              style={{ height: `${(100 * b.count) / max}%`, minHeight: b.count ? 3 : 0, background: INVITED }}
            />
            {hover === i && (
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                {b.from}–{b.to}: <span className="font-semibold">{b.count}</span> candidate{b.count === 1 ? "" : "s"}
              </div>
            )}
          </div>
        ))}
        {median != null && (
          <div className="pointer-events-none absolute inset-y-0 border-l-2 border-dashed border-foreground/60" style={{ left: `${median}%` }}>
            <span className="absolute -top-5 -translate-x-1/2 whitespace-nowrap text-xs font-medium">Median {median}</span>
          </div>
        )}
      </div>
      <div className="mt-1.5 flex justify-between border-t pt-1.5 text-[11px] text-muted-foreground tabular-nums">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  );
}
