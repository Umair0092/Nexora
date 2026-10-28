import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Briefcase, ChevronRight, Loader2, Mail, Plus, Users } from "lucide-react";
import { UpcomingMeetings } from "@/components/hiring/meetings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { api, errorMessage } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { COLUMN_LABELS, feedSentence, timeAgo, useOrganization, type Column, type HiringOverview, type Job, type Organization } from "@/lib/hiring";
import { cn } from "@/lib/utils";

function CreateCompany() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => api<Organization>("/api/v1/organization", { method: "POST", body: { name } }),
    onSuccess: (org) => queryClient.setQueryData(["/api/v1/organization"], org),
    onError: (error) => toast({ title: "Couldn't create the company", description: errorMessage(error), variant: "destructive" }),
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:py-16">
      <Briefcase className="h-10 w-10 text-primary" aria-hidden="true" />
      <h1 className="mt-5 text-3xl font-bold sm:text-4xl">Screen candidates with Nexora</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        Set up a job with the questions you want answered, send candidates a link, and review their spoken answers with your team.
      </p>
      <ul className="mt-6 space-y-2 text-muted-foreground">
        <li>Every candidate for a job answers the same questions, so you compare like with like.</li>
        <li>Only the content of answers is assessed: no camera, and no judging of accent or delivery.</li>
        <li>An AI summary helps you read faster. Your team makes the decision.</li>
      </ul>

      <form
        className="mt-10 rounded-2xl border bg-card p-5 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Label htmlFor="company-name" className="text-base font-semibold">Company name</Label>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <Input id="company-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required placeholder="Acme Ltd" />
          <Button type="submit" disabled={!name.trim() || create.isPending} className="shrink-0" data-testid="button-create-company">
            {create.isPending && <Loader2 className="animate-spin" />}
            Create company
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Joining a team that already uses Nexora? Open the invitation link from your email instead.</p>
      </form>
    </div>
  );
}

// The columns that show how far a job's candidates have got.
const FUNNEL: Column[] = ["invited", "review", "shortlisted", "interviewing", "offer", "hired"];

function JobCard({ job, columns }: { job: Job; columns?: Partial<Record<Column, number>> }) {
  const total = Object.values(job.candidateCounts).reduce((s, n) => s + (n ?? 0), 0);
  return (
    <Link
      href={`/hiring/jobs/${job.id}`}
      className="group block rounded-2xl border bg-card p-5 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-testid={`link-job-${job.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold group-hover:text-primary">{job.title}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {total} candidate{total === 1 ? "" : "s"}, {job.questions.length} questions
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
            job.status === "open" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
          )}
        >
          {job.status === "open" ? "Open" : "Closed"}
        </span>
      </div>
      <ol className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-6" aria-label="Candidates by stage">
        {FUNNEL.map((col) => {
          const n = columns?.[col] ?? 0;
          return (
            <li key={col} className="bg-card px-2.5 py-2">
              <span className={cn("block text-lg font-semibold tabular-nums", n === 0 && "text-muted-foreground/60")}>{n}</span>
              <span className="block truncate text-xs text-muted-foreground">{COLUMN_LABELS[col]}</span>
            </li>
          );
        })}
      </ol>
    </Link>
  );
}

function Stat({ label, value, hint, href }: { label: string; value: number; hint?: string; href?: string }) {
  const body = (
    <>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-display text-3xl font-bold tabular-nums">{value}</dd>
      {hint && <dd className="mt-0.5 text-xs text-muted-foreground">{hint}</dd>}
    </>
  );
  return href ? (
    <Link href={href} className="block bg-card p-4 transition-colors hover:bg-accent/40 sm:p-5">{body}</Link>
  ) : (
    <div className="bg-card p-4 sm:p-5">{body}</div>
  );
}

function ScorePill({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  return (
    <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums">
      <span className="text-muted-foreground">{label} </span>
      <span className="font-semibold">{Math.round(value)}</span>
    </span>
  );
}

function NeedsReview({ items }: { items: HiringOverview["needsReview"] }) {
  return (
    <section aria-labelledby="review-heading" className="rounded-2xl border bg-card">
      <div className="flex items-baseline justify-between gap-3 px-5 pt-5">
        <h2 id="review-heading" className="text-lg font-semibold">Waiting for review</h2>
        <span className="text-sm text-muted-foreground">Oldest first</span>
      </div>
      {items.length === 0 ? (
        <p className="px-5 pb-5 pt-2 text-sm text-muted-foreground">
          You're up to date. Finished interviews show up here until someone moves the candidate on.
        </p>
      ) : (
        <ul className="mt-2 divide-y">
          {items.map((c) => (
            <li key={c.id}>
              <Link
                href={`/hiring/candidates/${c.id}`}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
                data-testid={`link-review-${c.id}`}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground" aria-hidden="true">
                  {initials(c.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {c.jobTitle}, finished {timeAgo(c.completedAt)}
                  </span>
                </span>
                <span className="hidden shrink-0 gap-1.5 sm:flex">
                  <ScorePill label="AI" value={c.aiScore} />
                  <ScorePill label="CV" value={c.resumeScore} />
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Activity({ items }: { items: HiringOverview["activity"] }) {
  return (
    <section aria-labelledby="activity-heading" className="rounded-2xl border bg-card p-5">
      <h2 id="activity-heading" className="text-lg font-semibold">Team activity</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Invites, reviews and stage changes from your team appear here.</p>
      ) : (
        <ol className="mt-4 space-y-4">
          {items.map((e) => (
            <li key={e.id} className="relative pl-5 text-sm before:absolute before:left-0 before:top-1.5 before:h-2 before:w-2 before:rounded-full before:bg-primary/60">
              <FeedLine event={e} />
              <p className="mt-0.5 text-xs text-muted-foreground">
                {e.candidate ? `${e.candidate.jobTitle}, ` : ""}
                <time dateTime={e.at}>{timeAgo(e.at)}</time>
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function FeedLine({ event: e }: { event: HiringOverview["activity"][number] }) {
  const { before, after } = feedSentence(e);
  return (
    <p className="text-muted-foreground">
      {before}
      {e.candidate && (
        <>
          {before && " "}
          <Link href={`/hiring/candidates/${e.candidate.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
            {e.candidate.name}
          </Link>
        </>
      )}
      {after && ` ${after}`}
    </p>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

export default function HiringHome() {
  const { data: org, isLoading } = useOrganization();
  const { data: jobs, isLoading: jobsLoading } = useQuery<Job[]>({ queryKey: ["/api/v1/jobs"], enabled: !!org });
  const { data: overview } = useQuery<HiringOverview>({ queryKey: ["/api/v1/hiring/overview"], enabled: !!org });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-8 h-32 w-full" />
      </div>
    );
  }
  if (!org) return <CreateCompany />;

  const stats = overview?.stats;
  const openJobs = jobs?.filter((j) => j.status === "open") ?? [];
  const closedJobs = jobs?.filter((j) => j.status === "closed") ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{org.name}</p>
          <h1 className="text-3xl font-bold sm:text-4xl">Hiring</h1>
        </div>
        <Button asChild data-testid="button-new-job">
          <Link href="/hiring/jobs/new">
            <Plus />
            New job
          </Link>
        </Button>
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border lg:grid-cols-4">
        {stats ? (
          <>
            <Stat label="Open jobs" value={stats.openJobs} />
            <Stat label="Waiting for review" value={stats.toReview} href={overview.needsReview[0] ? `/hiring/candidates/${overview.needsReview[0].id}` : undefined} />
            <Stat label="In interviews" value={stats.interviewing} />
            <Stat label="Offers out" value={stats.offers} hint={stats.hiredRecently ? `${stats.hiredRecently} hired in the last 30 days` : undefined} />
          </>
        ) : (
          [0, 1, 2, 3].map((i) => <div key={i} className="h-[6.5rem] bg-card" />)
        )}
      </dl>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {overview && <NeedsReview items={overview.needsReview} />}

          <section aria-labelledby="jobs-heading">
            <h2 id="jobs-heading" className="text-lg font-semibold">Open jobs</h2>
            <div className="mt-3 space-y-3">
              {jobsLoading && [0, 1].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
              {openJobs.map((job) => <JobCard key={job.id} job={job} columns={overview?.columns[job.id]} />)}
            </div>
            {jobs && openJobs.length === 0 && (
              <div className="mt-3 rounded-2xl border border-dashed p-8 text-center">
                <p className="font-semibold">No open jobs</p>
                <p className="mt-1 text-sm text-muted-foreground">Create a job, choose its questions, then invite candidates.</p>
                <Button asChild className="mt-5">
                  <Link href="/hiring/jobs/new">
                    <Plus />
                    New job
                  </Link>
                </Button>
              </div>
            )}
            {closedJobs.length > 0 && (
              <details className="group mt-6">
                <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                  Closed jobs ({closedJobs.length})
                </summary>
                <div className="mt-3 space-y-3">
                  {closedJobs.map((job) => <JobCard key={job.id} job={job} columns={overview?.columns[job.id]} />)}
                </div>
              </details>
            )}
          </section>
        </div>

        <div className="space-y-6">
          {overview && <UpcomingMeetings meetings={overview.upcomingMeetings} />}
          {overview && <Activity items={overview.activity} />}
          <nav aria-label="Hiring settings" className="rounded-2xl border bg-card p-2">
            <Link href="/hiring/team" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-accent/40">
              <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1">Team</span>
              <span className="text-muted-foreground tabular-nums">{org.members.length}</span>
            </Link>
            <Link href="/hiring/templates" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-accent/40">
              <Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1">Email templates</span>
            </Link>
          </nav>
        </div>
      </div>
    </div>
  );
}
