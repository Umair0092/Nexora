import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScoreDial, scoreVerdict } from "@/components/score-dial";
import { useToast } from "@/hooks/use-toast";
import { api, errorMessage } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { combineSpeech } from "@/lib/speech";
import { INTERVIEW_TYPE_LABELS, sessionTitle, type Answer, type Report } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Bullets, DeliveryStats, ScoreNumber, StarChecklist, SubScore } from "@/components/report/report-parts";

export interface OwnerTools {
  sessionId: string;
  onRetry: (answer: Answer) => void;
}

function StrongerVersion({ answer, sessionId }: { answer: Answer; sessionId: string }) {
  const { toast } = useToast();
  const [shown, setShown] = useState(!!answer.improvedAnswer);
  const improve = useMutation({
    mutationFn: () =>
      api<{ improvedAnswer: string; improvementNotes: string[] }>(`/api/v1/sessions/${sessionId}/answers/${answer.id}/improve`, { method: "POST" }),
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/v1/sessions", sessionId, "report"], (old: Report | undefined) =>
        old && {
          ...old,
          answers: old.answers?.map((a) => (a.id === answer.id ? { ...a, improvedAnswer: data.improvedAnswer, improvementNotes: data.improvementNotes } : a)),
        },
      );
      setShown(true);
    },
    onError: (error) => toast({ title: "Couldn't write a stronger version", description: errorMessage(error), variant: "destructive" }),
  });

  if (shown && answer.improvedAnswer) {
    return (
      <div className="rounded-xl border border-primary/30 bg-accent/40 p-4 sm:p-5">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          A stronger version of your answer
        </p>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">{answer.improvedAnswer}</p>
        {!!answer.improvementNotes?.length && (
          <div className="mt-4 border-t border-primary/20 pt-3">
            <p className="text-xs font-semibold text-muted-foreground">What changed</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {answer.improvementNotes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">Words in [brackets] are details to fill in from your own experience.</p>
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={() => (answer.improvedAnswer ? setShown(true) : improve.mutate())} disabled={improve.isPending} data-testid={`button-improve-${answer.id}`}>
      {improve.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
      {improve.isPending ? "Writing…" : "Show a stronger version"}
    </Button>
  );
}

function AnswerItem({ answer, index, owner }: { answer: Answer; index: number; owner?: OwnerTools }) {
  const latest = answer.attempts?.length ? answer.attempts[answer.attempts.length - 1] : null;
  return (
    <AccordionItem value={`q-${index}`} className="border-b last:border-b-0">
      <AccordionTrigger className="gap-4 px-4 py-4 text-left hover:no-underline sm:px-5" data-testid={`accordion-answer-${index}`}>
        <span className="flex min-w-0 flex-1 items-start gap-4">
          <ScoreNumber score={answer.score} className="mt-0.5 w-10 shrink-0 text-lg" />
          <span className="min-w-0">
            <span className="block text-xs text-muted-foreground">
              Question {index + 1}
              {latest && typeof latest.score === "number" && `, retried: ${Math.round(latest.score)}`}
            </span>
            <span className="mt-0.5 block font-medium leading-snug">{answer.question?.text || "Question"}</span>
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-6 sm:pl-[4.75rem] sm:pr-5">
        <div className="space-y-6">
          <div className={cn("grid gap-5", answer.idealAnswer && "md:grid-cols-2")}>
            <div>
              <p className="text-sm font-semibold">What you said</p>
              <blockquote className="mt-2 border-l-2 pl-4 text-sm leading-relaxed text-muted-foreground">
                {answer.transcript || "No answer recorded."}
              </blockquote>
            </div>
            {answer.idealAnswer && (
              <div>
                <p className="text-sm font-semibold">Model answer</p>
                <blockquote className="mt-2 border-l-2 border-primary pl-4 text-sm leading-relaxed">{answer.idealAnswer}</blockquote>
              </div>
            )}
          </div>

          {answer.star && (
            <div>
              <p className="mb-2 text-sm font-semibold">STAR structure</p>
              <StarChecklist star={answer.star} compact />
            </div>
          )}

          {answer.speechMetrics && (
            <div>
              <p className="mb-2 text-sm font-semibold">Delivery</p>
              <DeliveryStats speech={answer.speechMetrics} size="sm" />
            </div>
          )}

          {answer.feedback && (
            <div>
              <p className="text-sm font-semibold">Feedback</p>
              <p className="mt-2 text-sm leading-relaxed">{answer.feedback}</p>
            </div>
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-semibold text-success">What worked</p>
              <Bullets items={answer.strengths} empty="Nothing stood out." tone="good" />
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-warning">Change next time</p>
              <Bullets items={answer.weaknesses} empty="No changes suggested." tone="fix" />
            </div>
          </div>

          {!!answer.attempts?.length && (
            <div>
              <p className="text-sm font-semibold">Your retries</p>
              <ol className="mt-2 divide-y rounded-xl border">
                {answer.attempts.map((a, i) => (
                  <li key={a.id} className="flex gap-4 p-3 text-sm">
                    <ScoreNumber score={a.score} className="w-8 shrink-0 text-base" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        Retry {i + 1}, {new Date(a.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </p>
                      <p className="mt-0.5 line-clamp-3 text-muted-foreground">{a.transcript}</p>
                      {a.feedback && <p className="mt-1">{a.feedback}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {owner && (
            <div className="flex flex-wrap gap-2 print:hidden">
              <Button size="sm" onClick={() => owner.onRetry(answer)} data-testid={`button-retry-${answer.id}`}>
                <RotateCcw />
                Try this question again
              </Button>
              <StrongerVersion answer={answer} sessionId={owner.sessionId} />
            </div>
          )}
          {!owner && answer.improvedAnswer && <StrongerVersion answer={answer} sessionId="" />}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function PresenceBar({ attentive, partial, disengaged }: { attentive: number; partial: number; disengaged: number }) {
  const parts = [
    { label: "Engaged", value: attentive, cls: "bg-success" },
    { label: "Drifting", value: partial, cls: "bg-signal" },
    { label: "Looked away", value: disengaged, cls: "bg-destructive" },
  ];
  return (
    <div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        {parts.map((p) => (
          <div key={p.label} className={p.cls} style={{ width: `${Math.max(0, p.value) * 100}%` }} />
        ))}
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
        {parts.map((p) => (
          <div key={p.label}>
            <dt className="flex items-center gap-2 text-muted-foreground">
              <span className={cn("h-2 w-2 rounded-full", p.cls)} aria-hidden="true" />
              {p.label}
            </dt>
            <dd className="mt-1 font-display text-xl font-semibold tabular-nums">{Math.round(p.value * 100)}%</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// The whole report. Owner tools (retry, rewrite) only render when `owner` is given;
// the shared read-only view omits them.
export function ReportView({ report, owner, open, onOpenChange }: {
  report: Report;
  owner?: OwnerTools;
  open: string[];
  onOpenChange: (value: string[]) => void;
}) {
  const session = report.session;
  const evaluation = report.evaluation;
  const nonVerbal = report.nonVerbalData;
  const date = new Date(session?.completedAt || report.createdAt).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const type = session?.interviewType ? INTERVIEW_TYPE_LABELS[session.interviewType] : null;
  const tenToHundred = (v: number | undefined) => (typeof v === "number" ? v * 10 : null);
  const answers = report.answers ?? [];
  const reasons = Object.entries(nonVerbal?.disengagementReasons ?? {}).sort((a, b) => b[1] - a[1]);
  const delivery = combineSpeech(answers.map((a) => a.speechMetrics));
  const starred = answers.filter((a) => a.star);
  const starCounts = (["situation", "task", "action", "result"] as const).map((k) => ({
    key: k,
    count: starred.filter((a) => a.star![k]).length,
  }));
  // Weakest first, only answers with room to improve.
  const weakest = owner
    ? answers
        .filter((a) => typeof a.score === "number" && a.score < 75 && !a.transcript?.startsWith("(The candidate skipped"))
        .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
        .slice(0, 2)
    : [];

  return (
    <>
      <header className="mt-4">
        <h1 className="text-3xl font-bold sm:text-4xl" data-testid="text-report-title">
          {session ? sessionTitle(session) : "Interview report"}
        </h1>
        <p className="mt-2 text-muted-foreground">{[type, date].filter(Boolean).join(", ")}</p>
      </header>

      <section className="mt-8 grid gap-6 rounded-2xl border bg-card p-5 sm:p-8 md:grid-cols-[auto_1fr] md:gap-10" aria-label="Overall result">
        <div className="flex flex-col items-center text-center md:items-start md:text-left">
          <ScoreDial score={report.overallScore} size="lg" label="Overall score" />
        </div>
        <div className="min-w-0">
          <p className="font-display text-2xl font-semibold sm:text-3xl">{scoreVerdict(report.overallScore)}</p>
          {evaluation?.hireRecommendation && (
            <p className="mt-2 text-sm">
              Hiring signal: <span className="font-semibold">{evaluation.hireRecommendation}</span>
            </p>
          )}
          {evaluation?.summary && <p className="mt-4 max-w-prose leading-relaxed text-muted-foreground">{evaluation.summary}</p>}
          <div className="mt-6 grid gap-x-8 divide-y sm:grid-cols-2 sm:divide-y-0">
            <div className="divide-y">
              <SubScore label="Answers" value={report.verbalScore} hint="Clarity, relevance and structure" />
              <SubScore label="Presence" value={nonVerbal ? report.nonVerbalScore : null} hint={nonVerbal ? "Eye contact and attention on camera" : "Camera wasn't analysed"} />
            </div>
            <div className="divide-y pt-4 sm:pt-0">
              <SubScore label="Communication" value={tenToHundred(evaluation?.communicationScore)} hint="How clearly you explained" />
              <SubScore
                label={evaluation?.interviewStyle === "behavioral" ? "Substance" : "Technical depth"}
                value={tenToHundred(evaluation?.technicalScore)}
                hint={evaluation?.interviewStyle === "behavioral" ? "Specific situations and results" : "Accuracy and detail"}
              />
            </div>
          </div>
        </div>
      </section>

      {weakest.length > 0 && (
        <section className="mt-6 rounded-2xl border border-primary/40 bg-accent/40 p-5 sm:p-6 print:hidden" aria-labelledby="practise-heading">
          <h2 id="practise-heading" className="text-lg font-semibold">Practise your weakest {weakest.length === 1 ? "answer" : "answers"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Answer the same question again and see your new score next to the old one.</p>
          <ul className="mt-4 space-y-3">
            {weakest.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 rounded-xl bg-card p-4 sm:flex-row sm:items-center">
                <ScoreNumber score={a.score} className="text-2xl sm:w-12" />
                <p className="min-w-0 flex-1 text-sm font-medium leading-snug">{a.question?.text}</p>
                <Button size="sm" className="shrink-0" onClick={() => owner!.onRetry(a)} data-testid={`button-practise-${a.id}`}>
                  <RotateCcw />
                  Try again
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {evaluation?.jobFit && (
        <section className="mt-6 rounded-2xl border bg-card p-5 sm:p-6" data-testid="card-job-fit">
          <h2 className="text-lg font-semibold">Fit for this job</h2>
          <p className="mt-1 text-sm text-muted-foreground">How well your answers showed what the job description asks for.</p>
          <p className="mt-4 max-w-prose leading-relaxed">{evaluation.jobFit}</p>
        </section>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border bg-card p-5 sm:p-6" data-testid="card-strengths">
          <h2 className="text-lg font-semibold">What you did well</h2>
          <div className="mt-4">
            <Bullets items={report.overallStrengths} empty="No clear strengths were identified this time." tone="good" />
          </div>
        </section>
        <section className="rounded-2xl border bg-card p-5 sm:p-6" data-testid="card-weaknesses">
          <h2 className="text-lg font-semibold">What to work on</h2>
          <div className="mt-4">
            <Bullets items={report.overallWeaknesses} empty="Nothing major to fix." tone="fix" />
          </div>
        </section>
      </div>

      {report.recommendations?.length > 0 && (
        <section className="mt-6 rounded-2xl border bg-accent/50 p-5 sm:p-6" data-testid="card-recommendations">
          <h2 className="text-lg font-semibold">Before your next interview</h2>
          {evaluation?.recommendationSummary && (
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">{evaluation.recommendationSummary}</p>
          )}
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {report.recommendations.map((rec, i) => (
              <li key={i} className="rounded-xl bg-card p-4 text-sm leading-relaxed">{rec}</li>
            ))}
          </ul>
        </section>
      )}

      {starred.length > 0 && (
        <section className="mt-6 rounded-2xl border bg-card p-5 sm:p-6" data-testid="card-star">
          <h2 className="text-lg font-semibold">How you structured your stories</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Strong behavioral answers cover all four parts of STAR. Here's how many of your {starred.length} answers did.
          </p>
          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {starCounts.map(({ key, count }) => (
              <div key={key} className="rounded-xl bg-muted/50 p-4">
                <dt className="text-sm capitalize text-muted-foreground">{key}</dt>
                <dd className="mt-1 font-display text-2xl font-semibold tabular-nums">
                  {count}<span className="text-base text-muted-foreground"> of {starred.length}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {delivery && (
        <section className="mt-6 rounded-2xl border bg-card p-5 sm:p-6" data-testid="card-delivery">
          <h2 className="text-lg font-semibold">How you sounded</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {delivery.durationSeconds < 60
              ? "Under a minute of speaking"
              : `About ${Math.round(delivery.durationSeconds / 60)} ${Math.round(delivery.durationSeconds / 60) === 1 ? "minute" : "minutes"} of speaking`}
            , from your recorded answers.
          </p>
          <div className="mt-5">
            <DeliveryStats speech={delivery} />
          </div>
        </section>
      )}

      {nonVerbal && (
        <section className="mt-6 rounded-2xl border bg-card p-5 sm:p-6" data-testid="card-nonverbal-breakdown">
          <h2 className="text-lg font-semibold">How you came across on camera</h2>
          <p className="mt-1 text-sm text-muted-foreground">Share of the interview spent in each state.</p>
          <div className="mt-5 grid gap-8 md:grid-cols-[1.4fr_1fr]">
            <PresenceBar
              attentive={nonVerbal.attentionDistribution.attentive}
              partial={nonVerbal.attentionDistribution.partiallyAttentive}
              disengaged={nonVerbal.attentionDistribution.disengaged}
            />
            <div className="space-y-6">
              {nonVerbal.handActivity && (
                <div>
                  <p className="text-sm font-semibold">Hand movement</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Calm {Math.round(nonVerbal.handActivity.calm * 100)}%, moderate {Math.round(nonVerbal.handActivity.moderate * 100)}%,
                    excessive {Math.round(nonVerbal.handActivity.excessive * 100)}%
                  </p>
                </div>
              )}
              {reasons.length > 0 && (
                <div>
                  <p className="text-sm font-semibold">When you lost focus</p>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {reasons.slice(0, 5).map(([reason, count]) => (
                      <li key={reason} className="flex justify-between gap-4">
                        <span className="first-letter:uppercase">{reason.replace(/_/g, " ")}</span>
                        <span className="tabular-nums text-muted-foreground">{count}×</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="mt-6" data-testid="card-question-breakdown">
        <h2 className="text-xl font-semibold">Answer by answer</h2>
        {answers.length > 0 ? (
          <Accordion type="multiple" value={open} onValueChange={onOpenChange} className="mt-4 overflow-hidden rounded-2xl border bg-card">
            {answers.map((answer, i) => (
              <AnswerItem key={answer.id} answer={answer} index={i} owner={owner} />
            ))}
          </Accordion>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No answers were recorded for this interview.</p>
        )}
      </section>
    </>
  );
}
