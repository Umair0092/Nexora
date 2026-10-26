import { cn } from "@/lib/utils";

// One score visual used everywhere. Colour tracks the band, never the decoration.
export function scoreTone(score: number) {
  if (score >= 75) return "text-success";
  if (score >= 50) return "text-warning";
  return "text-destructive";
}

export function scoreVerdict(score: number) {
  if (score >= 85) return "Interview-ready";
  if (score >= 70) return "Strong, with a few gaps";
  if (score >= 50) return "Getting there";
  return "Needs more practice";
}

const SIZES = {
  sm: { box: 52, stroke: 5, text: "text-sm" },
  md: { box: 88, stroke: 7, text: "text-xl" },
  lg: { box: 168, stroke: 11, text: "text-5xl" },
} as const;

export function ScoreDial({
  score,
  size = "md",
  label,
  className,
}: {
  score: number | null | undefined;
  size?: keyof typeof SIZES;
  label?: string;
  className?: string;
}) {
  const value = typeof score === "number" && Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : null;
  const { box, stroke, text } = SIZES[size];
  const radius = (box - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - ((value ?? 0) / 100) * circumference;

  return (
    <div
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      role="img"
      aria-label={value === null ? `${label ?? "Score"}: not available` : `${label ?? "Score"}: ${Math.round(value)} out of 100`}
    >
      <svg width={box} height={box} className="-rotate-90" aria-hidden="true">
        <circle cx={box / 2} cy={box / 2} r={radius} strokeWidth={stroke} fill="none" className="stroke-muted" />
        {value !== null && (
          <circle
            cx={box / 2}
            cy={box / 2}
            r={radius}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={cn("stroke-current transition-[stroke-dashoffset] duration-700", scoreTone(value))}
          />
        )}
      </svg>
      <span className={cn("absolute font-display font-semibold tabular-nums", text)} aria-hidden="true">
        {value === null ? "–" : Math.round(value)}
      </span>
    </div>
  );
}
