import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Mic } from "lucide-react";
import { SessionRow, SessionRowSkeleton } from "@/components/session-row";
import { INTERVIEW_TYPE_LABELS, type InterviewSession, type InterviewType } from "@/lib/types";
import { cn } from "@/lib/utils";

type Filter = "all" | InterviewType;

export default function SessionHistory() {
  const [filter, setFilter] = useState<Filter>("all");
  const { data: sessions, isLoading } = useQuery<InterviewSession[]>({
    queryKey: ["/api/v1/sessions"],
  });

  const completed = useMemo(() => sessions?.filter((s) => s.status === "completed") ?? [], [sessions]);
  const types = useMemo(
    () => Array.from(new Set(completed.map((s) => s.interviewType).filter(Boolean))) as InterviewType[],
    [completed],
  );
  const shown = filter === "all" ? completed : completed.filter((s) => s.interviewType === filter);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl" data-testid="text-history-title">Past interviews</h1>
          <p className="mt-2 text-muted-foreground">Every report you've finished, newest first.</p>
        </div>
        <Button asChild data-testid="button-new-session">
          <Link href="/interview/setup">
            <Mic />
            New interview
          </Link>
        </Button>
      </div>

      {types.length > 1 && (
        <div className="mt-8 flex flex-wrap gap-2" role="group" aria-label="Filter by format">
          {(["all", ...types] as Filter[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilter(t)}
              aria-pressed={filter === t}
              className={cn(
                "min-h-9 rounded-full border px-4 text-sm transition-colors",
                filter === t ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/50",
              )}
            >
              {t === "all" ? "All" : INTERVIEW_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      )}

      <div className="mt-6">
        {isLoading ? (
          <ul className="divide-y rounded-xl border bg-card">
            <SessionRowSkeleton />
            <SessionRowSkeleton />
            <SessionRowSkeleton />
            <SessionRowSkeleton />
          </ul>
        ) : shown.length > 0 ? (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {shown.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed p-8 text-center sm:p-12">
            <p className="font-display text-xl font-semibold">Nothing here yet</p>
            <p className="mx-auto mt-2 max-w-sm text-muted-foreground">
              Finish an interview and its report will be saved here so you can compare attempts.
            </p>
            <Button asChild className="mt-6" data-testid="button-start-first">
              <Link href="/interview/setup">Start an interview</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
