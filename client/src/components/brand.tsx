import { cn } from "@/lib/utils";

// Wordmark: a speech-bubble "N" — the product is about speaking, not dashboards.
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8", className)} aria-hidden="true">
      <path
        d="M6 4h20a4 4 0 0 1 4 4v13a4 4 0 0 1-4 4H14l-6 5v-5H6a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Z"
        className="fill-primary"
      />
      <path d="M10.5 19.5v-10l11 10v-10" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="stroke-primary-foreground" />
    </svg>
  );
}

export function Brand({ className, subtitle }: { className?: string; subtitle?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className="flex flex-col leading-none">
        <span className="font-display text-lg font-bold tracking-tight">Nexora</span>
        {subtitle && <span className="mt-1 text-xs text-muted-foreground">{subtitle}</span>}
      </span>
    </span>
  );
}
