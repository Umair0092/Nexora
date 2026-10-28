import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { ArrowLeft, Check, FileText, Info, Loader2, Mail, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Notes } from "@/components/hiring/notes";
import { EmailDialog } from "@/components/hiring/email-dialog";
import { useToast } from "@/hooks/use-toast";
import { api, errorMessage } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import {
  ACTIVITY_LABELS,
  BOARD_COLUMNS,
  COLUMN_LABELS,
  RECOMMENDATION_LABELS,
  STATUS_LABELS,
  activityText,
  stageFor,
  useOrganization,
  type CandidateDetail,
  type Column,
  type Recommendation,
  type Stage,
} from "@/lib/hiring";
import { cn } from "@/lib/utils";

const formatDate = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function RatingScale({ label, value, onChange }: { label: string; value: number | undefined; onChange: (v: number) => void }) {
  return (
    <div>
      <p className="text-sm font-medium" id={`rating-${label}`}>{label}</p>
      <div className="mt-2 flex gap-1.5" role="radiogroup" aria-labelledby={`rating-${label}`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} out of 5`}
            onClick={() => onChange(n)}
            className={cn(
              "h-10 w-10 rounded-lg border text-sm font-semibold tabular-nums transition-colors",
              value === n ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/50",
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function Scorecard({ candidate }: { candidate: CandidateDetail }) {
  const { toast } = useToast();
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);

  useEffect(() => {
    setRatings(candidate.myScorecard?.ratings ?? {});
    setNotes(candidate.myScorecard?.notes ?? "");
    setRecommendation(candidate.myScorecard?.recommendation ?? null);
  }, [candidate.myScorecard]);

  const save = useMutation({
    mutationFn: () => api<CandidateDetail>(`/api/v1/candidates/${candidate.id}/scorecard`, { method: "PUT", body: { ratings, notes, recommendation } }),
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/v1/candidates", String(candidate.id)], data);
      queryClient.invalidateQueries({ queryKey: ["/api/v1/jobs", String(candidate.job.id)] });
      toast({ title: "Scorecard saved" });
    },
    onError: (error) => toast({ title: "Couldn't save your scorecard", description: errorMessage(error), variant: "destructive" }),
  });

  return (
    <form
      className="space-y-5 rounded-2xl border bg-card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div>
        <h2 className="text-lg font-semibold">Your scorecard</h2>
        <p className="text-sm text-muted-foreground">Rate what the answers showed for each criterion. Others on the team see your scores.</p>
      </div>
      {candidate.job.criteria.map((c) => (
        <RatingScale key={c} label={c} value={ratings[c]} onChange={(v) => setRatings((r) => ({ ...r, [c]: v }))} />
      ))}
      <div>
        <p className="text-sm font-medium" id="recommendation-label">Recommendation</p>
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-labelledby="recommendation-label">
          {(Object.keys(RECOMMENDATION_LABELS) as Recommendation[]).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={recommendation === r}
              onClick={() => setRecommendation(r)}
              className={cn(
                "min-h-10 rounded-full border px-4 text-sm transition-colors",
                recommendation === r ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/50",
              )}
            >
              {RECOMMENDATION_LABELS[r]}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="scorecard-notes">Notes</Label>
        <Textarea id="scorecard-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} maxLength={5000} placeholder="Evidence from the answers for your scores" />
      </div>
      <Button type="submit" disabled={save.isPending || Object.keys(ratings).length === 0} data-testid="button-save-scorecard">
        {save.isPending && <Loader2 className="animate-spin" />}
        Save scorecard
      </Button>
    </form>
  );
}

function AiSummary({ candidate, onRetry, retrying }: { candidate: CandidateDetail; onRetry: () => void; retrying: boolean }) {
  const ai = candidate.aiEvaluation;
  return (
    <section aria-labelledby="ai-heading" className="rounded-2xl border bg-card p-5">
      <h2 id="ai-heading" className="text-lg font-semibold">AI summary</h2>
      <p className="mt-1 flex items-start gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Advisory only. It looks at what was said, not how. Read the answers before you decide.
      </p>
      {candidate.evaluationStatus === "pending" && (
        <p className="mt-4 flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Writing the summary…</p>
      )}
      {candidate.evaluationStatus === "failed" && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-sm text-destructive">The summary couldn't be written.</p>
          <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
            <RotateCcw />
            Try again
          </Button>
        </div>
      )}
      {ai && (
        <div className="mt-4 space-y-4 text-sm">
          <p className="leading-relaxed">{ai.summary}</p>
          <dl className="space-y-3">
            {ai.criteria.map((c) => (
              <div key={c.criterion}>
                <dt className="flex items-baseline justify-between gap-3 font-medium">
                  {c.criterion}
                  <span className="tabular-nums text-muted-foreground">{c.rating ? `${c.rating} / 5` : "Not enough evidence"}</span>
                </dt>
                <dd className="mt-0.5 text-muted-foreground">{c.evidence}</dd>
              </div>
            ))}
          </dl>
          {ai.strengths.length > 0 && (
            <div>
              <p className="font-medium">Strengths</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">{ai.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          )}
          {ai.gaps.length > 0 && (
            <div>
              <p className="font-medium">Gaps</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">{ai.gaps.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          )}
        </div>
      )}
      {!ai && candidate.status !== "completed" && candidate.evaluationStatus == null && (
        <p className="mt-4 text-sm text-muted-foreground">Written once the candidate submits.</p>
      )}
    </section>
  );
}

function Glance({ label, value, suffix, hint }: { label: string; value: string | null; suffix?: string; hint?: string }) {
  return (
    <div className="bg-card px-4 py-3.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-display text-2xl font-bold tabular-nums">
        {value ?? <span className="text-muted-foreground">–</span>}
        {value != null && suffix && <span className="ml-0.5 text-sm font-medium text-muted-foreground">{suffix}</span>}
      </dd>
      {hint && <dd className="truncate text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}

function Resume({ candidate, onRetry, retrying }: { candidate: CandidateDetail; onRetry: () => void; retrying: boolean }) {
  const cv = candidate.resume;
  const match = candidate.resumeMatch;
  if (!cv) return null;
  return (
    <section aria-labelledby="cv-heading" className="rounded-2xl border bg-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="cv-heading" className="flex items-center gap-2 text-lg font-semibold">
          <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          CV match
        </h2>
        {candidate.resumeScore != null && <span className="text-2xl font-bold tabular-nums">{candidate.resumeScore}%</span>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Advisory. Compares the CV's skills and experience with the job, nothing personal.</p>
      {candidate.resumeStatus === "pending" && (
        <p className="mt-4 flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Matching the CV…</p>
      )}
      {candidate.resumeStatus === "failed" && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-sm text-destructive">The CV couldn't be matched.</p>
          <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
            <RotateCcw />
            Try again
          </Button>
        </div>
      )}
      {match && (
        <div className="mt-4 space-y-3 text-sm">
          <p className="leading-relaxed">{match.summary}</p>
          {match.met.length > 0 && (
            <ul className="space-y-1.5">
              {match.met.map((m) => (
                <li key={m.requirement} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="Shows" />
                  <span><span className="font-medium">{m.requirement}.</span> <span className="text-muted-foreground">{m.evidence}</span></span>
                </li>
              ))}
            </ul>
          )}
          {match.missing.length > 0 && (
            <ul className="space-y-1.5">
              {match.missing.map((m) => (
                <li key={m} className="flex gap-2">
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label="Not shown" />
                  <span className="text-muted-foreground">{m}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-medium">Read the CV</summary>
        <div className="mt-3 space-y-3">
          {cv.summary && <p className="leading-relaxed">{cv.summary}</p>}
          {cv.work_experience.length > 0 && (
            <div>
              <p className="font-medium">Experience</p>
              <ul className="mt-1 space-y-2">
                {cv.work_experience.map((w, i) => (
                  <li key={i}>
                    {w.role}, {w.company}{w.duration && <span className="text-muted-foreground"> ({w.duration})</span>}
                    {w.description && <p className="text-muted-foreground">{w.description}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {cv.education.length > 0 && (
            <div>
              <p className="font-medium">Education</p>
              <ul className="mt-1 space-y-1">
                {cv.education.map((e, i) => <li key={i}>{e.course}, {e.institution}{e.duration && <span className="text-muted-foreground"> ({e.duration})</span>}</li>)}
              </ul>
            </div>
          )}
          {cv.skills.length > 0 && (
            <div>
              <p className="font-medium">Skills</p>
              <p className="mt-1 text-muted-foreground">{cv.skills.join(", ")}</p>
            </div>
          )}
          {cv.projects_done.length > 0 && (
            <div>
              <p className="font-medium">Projects</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">{cv.projects_done.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}

export default function CandidatePage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { data: org } = useOrganization();
  const [emailing, setEmailing] = useState(false);
  const key = ["/api/v1/candidates", id];
  const { data: c, isLoading } = useQuery<CandidateDetail>({
    queryKey: key,
    refetchInterval: (q) => (q.state.data?.evaluationStatus === "pending" || q.state.data?.resumeStatus === "pending" ? 4000 : false),
  });
  const replace = (data: CandidateDetail) => {
    queryClient.setQueryData(key, data);
    queryClient.invalidateQueries({ queryKey: ["/api/v1/jobs", String(data.job.id)] });
  };

  const move = useMutation({
    mutationFn: (stage: Stage | null) => api<CandidateDetail>(`/api/v1/candidates/${id}/stage`, { method: "POST", body: { stage } }),
    onSuccess: replace,
    onError: (error) => toast({ title: "Couldn't move the candidate", description: errorMessage(error), variant: "destructive" }),
  });
  const rematch = useMutation({
    mutationFn: () => api<CandidateDetail>(`/api/v1/candidates/${id}/match`, { method: "POST" }),
    onSuccess: replace,
    onError: (error) => toast({ title: "Couldn't start the match", description: errorMessage(error), variant: "destructive" }),
  });
  const retry = useMutation({
    mutationFn: () => api<CandidateDetail>(`/api/v1/candidates/${id}/evaluate`, { method: "POST" }),
    onSuccess: replace,
    onError: (error) => toast({ title: "Couldn't start the summary", description: errorMessage(error), variant: "destructive" }),
  });

  if (isLoading || !c) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-8 h-64 w-full" />
      </div>
    );
  }

  const others = c.scorecards.filter((s) => s.userId !== c.myScorecard?.userId);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <Link href={`/hiring/jobs/${c.job.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {c.job.title}
      </Link>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold sm:text-4xl">{c.name}</h1>
          <p className="mt-1 text-muted-foreground">
            {c.email}, {STATUS_LABELS[c.status].toLowerCase()}
            {c.completedAt ? `, ${formatDate(c.completedAt)}` : ""}
          </p>
        </div>
        {c.status !== "withdrawn" && (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={c.column}
              onValueChange={(col) => move.mutate(stageFor(col as Column))}
              disabled={move.isPending}
            >
              <SelectTrigger className="w-44" aria-label="Stage" data-testid="select-stage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BOARD_COLUMNS.filter((col) => stageFor(col) !== null || col === (c.status === "completed" ? "review" : "invited")).map((col) => (
                  <SelectItem key={col} value={col}>{COLUMN_LABELS[col]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => setEmailing(true)}>
              <Mail />
              Email
            </Button>
          </div>
        )}
      </div>

      {c.status === "completed" && (
        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-4" aria-label="Scores at a glance">
          <Glance label="AI summary" value={c.aiScore != null ? `${Math.round(c.aiScore)}` : null} suffix="/100" hint="Advisory" />
          <Glance label="CV match" value={c.resumeScore != null ? `${Math.round(c.resumeScore)}` : null} suffix="%" hint={c.resumeStatus === "skipped" ? "No CV added" : "Advisory"} />
          <Glance label="Team average" value={c.scorecardAverage != null ? c.scorecardAverage.toFixed(1) : null} suffix="/5" hint={`${c.scorecardCount} scorecard${c.scorecardCount === 1 ? "" : "s"}`} />
          <Glance label="Answers" value={`${c.answers.length}`} hint={`Finished ${c.completedAt ? formatDate(c.completedAt) : ""}`} />
        </dl>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="answers-heading" className="space-y-4">
          <h2 id="answers-heading" className="text-xl font-semibold">Answers</h2>
          {c.answers.length === 0 && (
            <p className="text-muted-foreground">
              {c.status === "withdrawn" ? "The candidate withdrew and their answers were deleted." : "No answers yet."}
            </p>
          )}
          {c.answers.map((a, i) => {
            const note = c.aiEvaluation?.answers[i];
            return (
              <article key={a.position} className="rounded-2xl border bg-card p-5">
                <p className="text-sm text-muted-foreground">Question {a.position + 1}</p>
                <h3 className="mt-1 font-semibold">{a.question}</h3>
                <p className="mt-3 whitespace-pre-line leading-relaxed">{a.transcript}</p>
                {a.durationSeconds != null && <p className="mt-2 text-xs text-muted-foreground">Spoke for {a.durationSeconds} seconds</p>}
                {note && (
                  <p className="mt-3 rounded-lg bg-muted/60 p-3 text-sm">
                    <span className="font-medium">AI note, {note.score}/10: </span>
                    {note.summary}
                  </p>
                )}
              </article>
            );
          })}
        </section>

        <div className="space-y-6">
          <AiSummary candidate={c} onRetry={() => retry.mutate()} retrying={retry.isPending} />
          <Resume candidate={c} onRetry={() => rematch.mutate()} retrying={rematch.isPending} />
          {c.answers.length > 0 && <Scorecard candidate={c} />}
          {others.length > 0 && (
            <section aria-labelledby="team-heading" className="rounded-2xl border bg-card p-5">
              <h2 id="team-heading" className="text-lg font-semibold">Team scorecards</h2>
              <ul className="mt-3 space-y-4 text-sm">
                {others.map((s) => (
                  <li key={s.userId}>
                    <p className="font-medium">
                      {s.by}
                      {s.recommendation && <span className="font-normal text-muted-foreground">: {RECOMMENDATION_LABELS[s.recommendation]}</span>}
                    </p>
                    <p className="text-muted-foreground">{Object.entries(s.ratings).map(([k, v]) => `${k} ${v}/5`).join(", ")}</p>
                    {s.notes && <p className="mt-1 whitespace-pre-line">{s.notes}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <Notes candidate={c} />
          <section aria-labelledby="activity-heading" className="rounded-2xl border bg-card p-5">
            <h2 id="activity-heading" className="text-lg font-semibold">Activity</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {c.activity.map((e, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>
                    {activityText(e)}
                    {e.by && <span className="text-muted-foreground"> by {e.by}</span>}
                  </span>
                  <time className="shrink-0 text-muted-foreground" dateTime={e.at}>{formatDate(e.at)}</time>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
      <EmailDialog
        jobId={c.job.id}
        jobTitle={c.job.title}
        company={org?.name ?? ""}
        candidates={[c]}
        open={emailing}
        onOpenChange={setEmailing}
        onSent={() => queryClient.invalidateQueries({ queryKey: key })}
      />
    </div>
  );
}
