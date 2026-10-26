import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import { ScoreDial } from "@/components/score-dial";
import { Skeleton } from "@/components/ui/skeleton";
import { INTERVIEW_TYPE_LABELS, sessionTitle, type InterviewSession } from "@/lib/types";

function formatDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// One completed interview as a row: the whole row is the link to its report.
export function SessionRow({ session }: { session: InterviewSession }) {
  const type = session.interviewType ? INTERVIEW_TYPE_LABELS[session.interviewType] : null;
  const answered = session.completedQuestions ?? 0;

  return (
    <li>
      <Link
        href={`/report/${session.id}`}
        className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none sm:px-5"
        data-testid={`card-session-${session.id}`}
      >
        <ScoreDial score={session.overallScore} size="sm" label={`${sessionTitle(session)} score`} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{sessionTitle(session)}</p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {[type, `${answered} ${answered === 1 ? "answer" : "answers"}`, formatDate(session.completedAt || session.startedAt)]
              .filter(Boolean)
              .join(", ")}
          </p>
        </div>
        <span className="hidden text-sm font-medium text-primary sm:inline">View report</span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>
    </li>
  );
}

export function SessionRowSkeleton() {
  return (
    <li className="flex items-center gap-4 px-4 py-4 sm:px-5">
      <Skeleton className="h-[52px] w-[52px] rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-64 max-w-full" />
      </div>
    </li>
  );
}
