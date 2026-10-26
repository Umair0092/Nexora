import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Mic, FileText, Code, Layers } from "lucide-react";
import { SessionRow, SessionRowSkeleton } from "@/components/session-row";
import type { InterviewSession, SessionStats } from "@/lib/types";

const quickStarts = [
  { icon: FileText, title: "CV interview", body: "Questions about your own projects", type: "cv" },
  { icon: Code, title: "Technical quiz", body: "SQL, DevOps, Cloud, SE or Data Science", type: "role" },
  { icon: Layers, title: "Full interview", body: "CV and technical, 10 questions", type: "complete" },
];

export default function Dashboard() {
  const { user } = useAuth();

  const { data: sessions, isLoading: sessionsLoading } = useQuery<InterviewSession[]>({
    queryKey: ["/api/v1/sessions"],
  });

  const { data: stats } = useQuery<SessionStats>({
    queryKey: ["/api/v1/sessions/stats"],
  });

  const completed = sessions?.filter((s) => s.status === "completed") ?? [];
  const recent = completed.slice(0, 5);
  const best = completed.reduce<number | null>(
    (max, s) => (s.overallScore !== null && (max === null || s.overallScore > max) ? s.overallScore : max),
    null,
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <h1 className="text-3xl font-bold sm:text-4xl" data-testid="text-dashboard-title">
        {user?.firstName ? `Hi ${user.firstName}, ready to rehearse?` : "Ready to rehearse?"}
      </h1>
      <p className="mt-2 text-muted-foreground">Pick a format and answer out loud. Your report is ready a minute after you finish.</p>

      <section className="mt-8" aria-labelledby="start-heading">
        <h2 id="start-heading" className="sr-only">Start an interview</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {quickStarts.map((q) => (
            <Link
              key={q.type}
              href={`/interview/setup?type=${q.type}`}
              className="group flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent/40 sm:flex-col sm:items-start sm:gap-4 sm:p-5"
              data-testid={`button-start-${q.type}`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <q.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block font-semibold">{q.title}</span>
                <span className="block text-sm text-muted-foreground">{q.body}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <dl className="mt-10 grid grid-cols-3 divide-x rounded-xl border bg-card">
        {[
          ["Interviews done", stats?.completedSessions ?? 0],
          ["Average score", stats && stats.completedSessions > 0 ? Math.round(stats.averageScore) : "–"],
          ["Best score", best !== null ? Math.round(best) : "–"],
        ].map(([label, value]) => (
          <div key={label} className="px-3 py-4 sm:px-6 sm:py-5">
            <dt className="text-xs text-muted-foreground sm:text-sm">{label}</dt>
            <dd className="mt-1 font-display text-2xl font-semibold tabular-nums sm:text-3xl">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-10" aria-labelledby="recent-heading">
        <div className="mb-3 flex items-end justify-between gap-4">
          <h2 id="recent-heading" className="text-xl font-semibold">Recent interviews</h2>
          {completed.length > 5 && (
            <Link href="/history" className="text-sm font-medium text-primary hover:underline" data-testid="button-view-all-sessions">
              See all {completed.length}
            </Link>
          )}
        </div>

        {sessionsLoading ? (
          <ul className="divide-y rounded-xl border bg-card">
            <SessionRowSkeleton />
            <SessionRowSkeleton />
            <SessionRowSkeleton />
          </ul>
        ) : recent.length > 0 ? (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {recent.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed p-8 text-center sm:p-12">
            <p className="font-display text-xl font-semibold">No interviews yet</p>
            <p className="mx-auto mt-2 max-w-sm text-muted-foreground">
              Your first one takes about ten minutes. Scores and feedback show up here when you finish.
            </p>
            <Button asChild className="mt-6" data-testid="button-start-first-session">
              <Link href="/interview/setup">
                <Mic />
                Start your first interview
              </Link>
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
