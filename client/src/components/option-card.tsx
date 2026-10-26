import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// A selectable card that is a real radio button: keyboard focus, Space/Enter, screen-reader state.
export function OptionGroup({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={className}>
      {children}
    </div>
  );
}

export function OptionCard({
  selected,
  onSelect,
  icon,
  title,
  description,
  meta,
  className,
  testId,
}: {
  selected: boolean;
  onSelect: () => void;
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  meta?: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      data-testid={testId}
      className={cn(
        "group relative flex w-full items-start gap-4 rounded-xl border bg-card p-4 text-left transition-colors sm:p-5",
        "hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        selected ? "border-primary bg-accent/60 ring-1 ring-primary" : "border-card-border",
        className,
      )}
    >
      {icon && (
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors [&_svg]:h-5 [&_svg]:w-5",
            selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
          )}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-snug">{title}</span>
        {description && <span className="mt-1 block text-sm text-muted-foreground">{description}</span>}
        {meta && <span className="mt-2 block text-xs text-muted-foreground">{meta}</span>}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-input",
        )}
      >
        {selected && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
    </button>
  );
}
