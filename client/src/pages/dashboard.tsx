import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Mic, FileText, Code, Layers, Users, MailWarning, X, Loader2 } from "lucide-react";
import { SessionRow, SessionRowSkeleton } from "@/components/session-row";
import { ProgressChart } from "@/components/progress-chart";
import { api, errorMessage } from "@/lib/api";
import type { InterviewSession, ProgressPoint, SessionStats } from "@/lib/types";

const BANNER_KEY = "nexora.verifyBannerDismissed";

function VerifyEmailBanner({ email }: { email: string }) {
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(BANNER_KEY) === "1";
    } catch {
      return false;
    }
  });
  const resend = useMutation({
    mutationFn: () => api<{ message: string }>("/api/v1/email/resend", { method: "POST" }),
    onSuccess: (data) => toast({ title: "Check your inbox", description: data.message }),
    onError: (error) => toast({ title: "Couldn't send the email", description: errorMessage(error), variant: "destructive" }),
  });
  if (dismissed) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(BANNER_KEY, "1");
    } catch {
      // Storage unavailable: the banner just comes back on the next visit.
    }
  };
  return (
    <div className="mb-8 flex items-start gap-3 rounded-xl border border-signal/50 bg-signal/10 p-4" role="status">
      <MailWarning className="mt-0.5 h-5 w-5 shrink-0 text-signal-foreground dark:text-signal" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">Confirm your email</p>
        <p className="mt-0.5 text-muted-foreground">
          We sent a link to <span className="break-all font-medium text-foreground">{email}</span>. You'll need it to reset your password or get reminders.
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => resend.mutate()} disabled={resend.isPending}>
          {resend.isPending && <Loader2 className="animate-spin" />}
          Send it again
        </Button>
      </div>
      <button type="button" onClick={dismiss} className="rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Hide for now">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function WeekProgress({ done, goal }: { done: number; goal: number }) {
  const pct = Math.min(100, (done / Math.max(goal, 1)) * 100);
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={goal} aria-label="Weekly goal progress">
      <div className={done >= goal ? "h-full rounded-full bg-success" : "h-full rounded-full bg-primary"} style={{ width: `${pct}%` }} />
    </div>
  );
}

const quickStarts = [
  { icon: FileText, title: "CV interview", body: "Questions about your own projects", type: "cv" },
  { icon: Code, title: "Technical quiz", body: "SQL, DevOps, Cloud, SE or Data Science", type: "role" },
  { icon: Layers, title: "Full interview", body: "CV and technical, 10 questions", type: "complete" },
  { icon: Users, title: "Behavioral", body: "\"Tell me about a time…\" with STAR feedback", type: "behavioral" },
];

const timezone = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
})();

export default function Dashboard() {
  const { user } = useAuth();

  const { data: sessions, isLoading: sessionsLoading } = useQuery<InterviewSession[]>({
    queryKey: ["/api/v1/sessions"],
  });

  const { data: stats } = useQuery<SessionStats>({
    queryKey: ["/api/v1/sessions/stats"],
    queryFn: () => api<SessionStats>(`/api/v1/sessions/stats?tz=${encodeURIComponent(timezone)}`),
  });

  const { data: progress, isLoading: progressLoading } = useQuery<ProgressPoint[]>({
    queryKey: ["/api/v1/sessions/progress"],
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
      {user && !user.emailVerified && <div className="mt-6"><VerifyEmailBanner email={user.email} /></div>}

      <section className="mt-8" aria-labelledby="start-heading">
        <h2 id="start-heading" className="sr-only">Start an interview</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

      {/* 1px gaps over a border-coloured background draw the dividers at every width. */}
      <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4 [&>div]:bg-card">
        <div className="px-4 py-4 sm:px-6 sm:py-5">
          <dt className="text-xs text-muted-foreground sm:text-sm">Streak</dt>
          <dd className="mt-1">
            <span className="font-display text-2xl font-semibold tabular-nums sm:text-3xl">{stats?.currentStreak ?? 0}</span>{" "}
            <span className="text-sm text-muted-foreground">{stats?.currentStreak === 1 ? "day" : "days"}</span>
            <span className="block text-xs text-muted-foreground">
              {stats && stats.currentStreak > 0 && !stats.practicedToday ? "Practise today to keep it" : `Best ${stats?.longestStreak ?? 0}`}
            </span>
          </dd>
        </div>
        <div className="px-4 py-4 sm:px-6 sm:py-5">
          <dt className="text-xs text-muted-foreground sm:text-sm">This week</dt>
          <dd className="mt-1">
            <span className="font-display text-2xl font-semibold tabular-nums sm:text-3xl">{stats?.thisWeek ?? 0}</span>
            <span className="text-sm text-muted-foreground"> of {stats?.weeklyGoal ?? user?.weeklyGoal ?? 3}</span>
            <WeekProgress done={stats?.thisWeek ?? 0} goal={stats?.weeklyGoal ?? 3} />
            <Link href="/account" className="mt-1.5 block text-xs text-primary hover:underline">Change goal</Link>
          </dd>
        </div>
        <div className="px-4 py-4 sm:px-6 sm:py-5">
          <dt className="text-xs text-muted-foreground sm:text-sm">Average score</dt>
          <dd className="mt-1 font-display text-2xl font-semibold tabular-nums sm:text-3xl">
            {stats && stats.completedSessions > 0 ? Math.round(stats.averageScore) : "–"}
          </dd>
          <dd className="text-xs text-muted-foreground">{stats?.completedSessions ?? 0} {stats?.completedSessions === 1 ? "interview" : "interviews"}</dd>
        </div>
        <div className="px-4 py-4 sm:px-6 sm:py-5">
          <dt className="text-xs text-muted-foreground sm:text-sm">Best score</dt>
          <dd className="mt-1 font-display text-2xl font-semibold tabular-nums sm:text-3xl">{best !== null ? Math.round(best) : "–"}</dd>
        </div>
      </dl>

      <section className="mt-10 rounded-2xl border bg-card p-5 sm:p-6" aria-labelledby="progress-heading">
        <h2 id="progress-heading" className="text-xl font-semibold">Your progress</h2>
        {progressLoading ? (
          <Skeleton className="mt-4 h-64 rounded-xl" />
        ) : (progress?.length ?? 0) >= 2 ? (
          <div className="mt-4">
            <ProgressChart points={progress!} />
          </div>
        ) : (
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            {progress?.length === 1
              ? "One interview done. Finish another and your scores will be charted here, so you can see what's improving."
              : "Finish two interviews and your scores will be charted here, so you can see what's improving."}
          </p>
        )}
      </section>

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
