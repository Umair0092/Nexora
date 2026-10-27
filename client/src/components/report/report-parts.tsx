import { Check, Minus } from "lucide-react";
import { ScoreDial, scoreTone } from "@/components/score-dial";
import { fillerVerdict, fillersPerMinute, paceVerdict } from "@/lib/speech";
import type { SpeechMetrics, StarCoverage } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Bullets({ items, empty, tone }: { items: string[] | undefined | null; empty: string; tone: "good" | "fix" }) {
  if (!items?.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-sm leading-relaxed">
          <span
            aria-hidden="true"
            className={cn("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", tone === "good" ? "bg-success" : "bg-warning")}
          />
          {item}
        </li>
      ))}
    </ul>
  );
}

export function SubScore({ label, value, hint }: { label: string; value: number | null | undefined; hint: string }) {
  const has = typeof value === "number" && Number.isFinite(value);
  return (
    <div className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
      <ScoreDial score={has ? value : null} size="sm" label={label} />
      <div>
        <p className="font-semibold">{label}</p>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

export function ScoreNumber({ score, className }: { score: number | null | undefined; className?: string }) {
  const has = typeof score === "number";
  return (
    <span
      className={cn("font-display font-semibold tabular-nums", has ? scoreTone(score) : "text-muted-foreground", className)}
      aria-label={has ? `Score ${Math.round(score)} out of 100` : "Not scored"}
    >
      {has ? Math.round(score) : "–"}
    </span>
  );
}

const STAR_PARTS: { key: keyof Omit<StarCoverage, "note">; label: string; hint: string }[] = [
  { key: "situation", label: "Situation", hint: "When, where, who" },
  { key: "task", label: "Task", hint: "Your goal or responsibility" },
  { key: "action", label: "Action", hint: "What you did, in first person" },
  { key: "result", label: "Result", hint: "The outcome, ideally measured" },
];

// The four STAR parts as a checklist. Each item says covered / missing in words, not just colour.
export function StarChecklist({ star, compact = false }: { star: StarCoverage; compact?: boolean }) {
  return (
    <div>
      <ul className={cn("grid gap-2", compact ? "grid-cols-2 sm:grid-cols-4" : "sm:grid-cols-4")} aria-label="STAR structure">
        {STAR_PARTS.map(({ key, label, hint }) => {
          const done = star[key];
          return (
            <li
              key={key}
              className={cn(
                "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
                done ? "border-success/40 bg-success/5" : "border-dashed bg-muted/40",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                  done ? "bg-success text-white" : "bg-muted text-muted-foreground",
                )}
                aria-hidden="true"
              >
                {done ? <Check className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
              </span>
              <span>
                <span className="block font-semibold">{label}</span>
                <span className="block text-xs text-muted-foreground">
                  {done ? "Covered" : "Missing"}
                  {!compact && `: ${hint}`}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {star.note && <p className="mt-2 text-sm text-muted-foreground">{star.note}</p>}
    </div>
  );
}

export function topFillers(fillers: Record<string, number>, n = 3) {
  return Object.entries(fillers || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

// Pace, fillers and pauses for one answer (inline) or the whole interview.
export function DeliveryStats({ speech, size = "lg" }: { speech: SpeechMetrics; size?: "sm" | "lg" }) {
  const pace = paceVerdict(speech.wordsPerMinute);
  const perMinute = fillersPerMinute(speech);
  const fillers = fillerVerdict(perMinute);
  const common = topFillers(speech.fillers);
  const big = size === "lg";

  const items = [
    {
      label: "Pace",
      value: speech.wordsPerMinute ? `${speech.wordsPerMinute}` : "–",
      unit: "words a minute",
      verdict: pace,
      hint: "120–160 is comfortable to follow",
    },
    {
      label: "Filler words",
      value: perMinute.toFixed(perMinute < 10 ? 1 : 0),
      unit: "a minute",
      verdict: fillers,
      hint: common.length ? common.map(([w, c]) => `"${w}" ${c}×`).join(", ") : "None heard",
    },
    {
      label: "Long pauses",
      value: `${speech.longPauses}`,
      unit: speech.longPauses === 1 ? "pause over 2s" : "pauses over 2s",
      verdict: speech.longPauses === 0 ? { label: "Fluent", tone: "text-success" } : speech.longPauses <= 2 ? { label: "Fine", tone: "text-success" } : { label: "Frequent", tone: "text-warning" },
      hint: speech.longestPauseSeconds ? `Longest ${speech.longestPauseSeconds.toFixed(1)}s` : "No long silences",
    },
  ];

  return (
    <dl className={cn("grid gap-4", big ? "sm:grid-cols-3" : "grid-cols-3 gap-3")}>
      {items.map((item) => (
        <div key={item.label} className={cn(big && "rounded-xl bg-muted/50 p-4")}>
          <dt className="text-sm text-muted-foreground">{item.label}</dt>
          <dd className="mt-1">
            <span className={cn("font-display font-semibold tabular-nums", big ? "text-3xl" : "text-lg")}>{item.value}</span>{" "}
            <span className="text-xs text-muted-foreground">{item.unit}</span>
            {item.verdict && <span className={cn("block text-sm font-semibold", item.verdict.tone)}>{item.verdict.label}</span>}
            {big && <span className="mt-1 block text-xs text-muted-foreground">{item.hint}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
