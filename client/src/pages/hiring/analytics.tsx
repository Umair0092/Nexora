import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Info } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Funnel, ScoreHistogram, WeeklyChart } from "@/components/hiring/analytics-charts";
import type { Job } from "@/lib/hiring";
import { cn } from "@/lib/utils";

interface Analytics {
  periodDays: number | null;
  funnel: { key: string; label: string; count: number; ofPrevious: number | null; ofInvited: number | null }[];
  rates: { completion: number | null; withdrawn: number | null; reviewed: number | null; hired: number };
  timing: { inviteToFinish: number | null; finishToFirstDecision: number | null; inviteToOffer: number | null; inviteToHire: number | null };
  weekly: { weekStart: string; invited: number; completed: number }[];
  scores: { bins: { from: number; to: number; count: number }[]; medianAi: number | null; medianCv: number | null; scored: number };
  jobs: { id: number; title: string; status: string; invited: number; completed: number; completion: number | null; medianAi: number | null; inPipeline: number; hired: number; daysToFirstDecision: number | null }[];
}

const PERIODS = [
  ["30", "30 days"],
  ["90", "90 days"],
  ["365", "12 months"],
  ["all", "All time"],
] as const;

const days = (n: number | null) => (n == null ? "–" : n < 1 ? "<1" : String(n % 1 === 0 ? n : n.toFixed(1)));

function Tile({ label, value, unit, hint }: { label: string; value: string; unit?: string; hint: string }) {
  return (
    <div className="bg-card p-4 sm:p-5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-display text-3xl font-bold tabular-nums">
        {value}
        {unit && value !== "–" && <span className="ml-1 text-base font-medium text-muted-foreground">{unit}</span>}
      </dd>
      <dd className="mt-0.5 text-xs text-muted-foreground">{hint}</dd>
    </div>
  );
}

function Panel({ title, hint, children, className }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-5 sm:p-6", className)} aria-label={title}>
      <h2 className="text-lg font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<string>("90");
  const [jobId, setJobId] = useState<string>("all");
  const { data: jobs } = useQuery<Job[]>({ queryKey: ["/api/v1/jobs"] });
  const query = `/api/v1/hiring/analytics?days=${period}${jobId === "all" ? "" : `&jobId=${jobId}`}`;
  const { data, isLoading } = useQuery<Analytics>({ queryKey: [query], placeholderData: (previous) => previous });
  const scope = jobId === "all" ? "all jobs" : (jobs?.find((j) => String(j.id) === jobId)?.title ?? "this job");
  const periodText = PERIODS.find(([v]) => v === period)?.[1].toLowerCase();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <Link href="/hiring" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Hiring
      </Link>
      <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Analytics</h1>
      <p className="mt-2 text-muted-foreground">
        Candidates invited {period === "all" ? "at any time" : `in the last ${periodText}`}, for {scope}.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <ToggleGroup type="single" variant="outline" value={period} onValueChange={(v) => v && setPeriod(v)} aria-label="Period">
          {PERIODS.map(([value, label]) => (
            <ToggleGroupItem key={value} value={value} className="px-3 text-sm">{label}</ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Select value={jobId} onValueChange={setJobId}>
          <SelectTrigger className="h-9 w-56" aria-label="Job">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All jobs</SelectItem>
            {jobs?.map((j) => (
              <SelectItem key={j.id} value={String(j.id)}>{j.title}{j.status === "closed" ? " (closed)" : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading || !data ? (
        <div className="mt-8 space-y-6">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      ) : data.funnel[0].count === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed p-10 text-center">
          <p className="font-semibold">Nobody invited in this period</p>
          <p className="mt-1 text-sm text-muted-foreground">Pick a longer period or another job.</p>
        </div>
      ) : (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border lg:grid-cols-4">
            <Tile label="Finish the screening" value={data.rates.completion == null ? "–" : `${data.rates.completion}%`} hint={`${data.rates.withdrawn ?? 0}% withdrew`} />
            <Tile label="To a first decision" value={days(data.timing.finishToFirstDecision)} unit="days" hint="Median, after they finish" />
            <Tile label="Invite to offer" value={days(data.timing.inviteToOffer)} unit="days" hint="Median" />
            <Tile label="Hired" value={String(data.rates.hired)} hint={data.timing.inviteToHire != null ? `Median ${days(data.timing.inviteToHire)} days from invite` : "None yet in this period"} />
          </dl>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
            <Panel title="Pipeline" hint="How many candidates reached each stage, and the share of the stage before.">
              <Funnel steps={data.funnel} />
            </Panel>
            <Panel title="AI screening scores" hint={`${data.scores.scored} scored. Median CV match ${data.scores.medianCv ?? "–"}%.`}>
              <div className="pt-4">
                <ScoreHistogram bins={data.scores.bins} median={data.scores.medianAi} />
              </div>
              <p className="mt-4 flex gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Scores are advisory. Nexora doesn't collect demographic data, so it can't check scores for adverse impact on its own; compare outcomes with your applicant data before relying on any cut-off.
              </p>
            </Panel>
          </div>

          <Panel title="Weekly activity" hint="Invitations sent and screening interviews finished." className="mt-6">
            <WeeklyChart weeks={data.weekly} />
          </Panel>

          <Panel title="By job" className="mt-6">
            <div className="-mx-5 overflow-x-auto sm:-mx-6">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-5 py-2 font-medium sm:px-6">Job</th>
                    <th className="py-2 text-right font-medium">Invited</th>
                    <th className="py-2 text-right font-medium">Finished</th>
                    <th className="py-2 text-right font-medium">Median AI</th>
                    <th className="py-2 text-right font-medium">In pipeline</th>
                    <th className="py-2 text-right font-medium">Hired</th>
                    <th className="px-5 py-2 text-right font-medium sm:px-6">Days to decide</th>
                  </tr>
                </thead>
                <tbody>
                  {data.jobs.map((j) => (
                    <tr key={j.id} className="border-b last:border-0">
                      <td className="px-5 py-2.5 sm:px-6">
                        <Link href={`/hiring/jobs/${j.id}`} className="font-medium hover:text-primary">{j.title}</Link>
                        {j.status === "closed" && <span className="ml-2 text-xs text-muted-foreground">Closed</span>}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{j.invited}</td>
                      <td className="py-2.5 text-right tabular-nums">{j.completed} <span className="text-muted-foreground">({j.completion ?? 0}%)</span></td>
                      <td className="py-2.5 text-right tabular-nums">{j.medianAi ?? "–"}</td>
                      <td className="py-2.5 text-right tabular-nums">{j.inPipeline}</td>
                      <td className="py-2.5 text-right tabular-nums">{j.hired}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums sm:px-6">{days(j.daysToFirstDecision)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
