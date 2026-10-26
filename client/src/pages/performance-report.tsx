import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ArrowLeft, Printer, Link2, Mic } from "lucide-react";
import { ScoreDial, scoreTone, scoreVerdict } from "@/components/score-dial";
import { api } from "@/lib/api";
import { INTERVIEW_TYPE_LABELS, sessionTitle, type Answer, type Report } from "@/lib/types";
import { cn } from "@/lib/utils";

function Bullets({ items, empty, tone }: { items: string[] | undefined | null; empty: string; tone: "good" | "fix" }) {
  if (!items?.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-sm leading-relaxed">
          <span
            aria-hidden="true"
            className={cn("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", tone === "good" ? "bg-success" : "bg-warning")}
          />
          {item}
        </li>
      ))}
    </ul>
  );
}

function SubScore({ label, value, hint }: { label: string; value: number | null | undefined; hint: string }) {
  const has = typeof value === "number" && Number.isFinite(value);
  return (
    <div className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
      <ScoreDial score={has ? value : null} size="sm" label={label} />
      <div>
        <p className="font-semibold">{label}</p>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

function AnswerItem({ answer, index }: { answer: Answer; index: number }) {
  const score = answer.score;
  return (
    <AccordionItem value={`q-${index}`} className="border-b last:border-b-0">
      <AccordionTrigger className="gap-4 px-4 py-4 text-left hover:no-underline sm:px-5" data-testid={`accordion-answer-${index}`}>
        <span className="flex min-w-0 flex-1 items-start gap-4">
          <span
            className={cn(
              "mt-0.5 w-10 shrink-0 font-display text-lg font-semibold tabular-nums",
              score !== null ? scoreTone(score) : "text-muted-foreground",
            )}
            aria-label={score !== null ? `Score ${Math.round(score)}` : "Not scored"}
          >
            {score !== null ? Math.round(score) : "–"}
          </span>
          <span className="min-w-0">
            <span className="block text-xs text-muted-foreground">Question {index + 1}</span>
            <span className="mt-0.5 block font-medium leading-snug">{answer.question?.text || "Question"}</span>
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-6 sm:pl-[4.75rem] sm:pr-5">
        <div className="space-y-5">
          <div>
            <p className="text-sm font-semibold">What you said</p>
            <blockquote className="mt-2 border-l-2 pl-4 text-sm leading-relaxed text-muted-foreground">
              {answer.transcript || "No answer recorded."}
            </blockquote>
          </div>
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
      <div className="flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
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

export default function PerformanceReport() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const [open, setOpen] = useState<string[]>([]);

  const { data: report, isLoading, error } = useQuery<Report>({
    queryKey: ["/api/v1/sessions", params.id, "report"],
    queryFn: () => api<Report>(`/api/v1/sessions/${params.id}/report`),
  });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({ title: "Link copied", description: "Only you can open it while signed in." });
    } catch {
      toast({ title: "Couldn't copy the link", description: window.location.href });
    }
  };

  const printReport = () => {
    // Expand every answer so the printout / PDF contains the full feedback.
    setOpen((report?.answers ?? []).map((_, i) => `q-${i}`));
    setTimeout(() => window.print(), 150);
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-4 h-10 w-80 max-w-full" />
        <Skeleton className="mt-8 h-64 rounded-2xl" />
        <Skeleton className="mt-6 h-96 rounded-2xl" />
      </div>
    );
  }

  if (!report || error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20">
        <h1 className="text-2xl font-bold">We couldn't find that report</h1>
        <p className="mt-3 text-muted-foreground">It may belong to another account, or the link is incomplete.</p>
        <Button asChild className="mt-8">
          <Link href="/history">See your past interviews</Link>
        </Button>
      </div>
    );
  }

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

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="ghost" size="sm" className="-ml-3" data-testid="button-back-dashboard">
          <Link href="/history">
            <ArrowLeft />
            Past interviews
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyLink} data-testid="button-share-report">
            <Link2 />
            Copy link
          </Button>
          <Button variant="outline" size="sm" onClick={printReport} data-testid="button-download-report">
            <Printer />
            Print or save PDF
          </Button>
        </div>
      </div>

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
              <SubScore label="Technical depth" value={tenToHundred(evaluation?.technicalScore)} hint="Accuracy and detail" />
            </div>
          </div>
        </div>
      </section>

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
          <Accordion type="multiple" value={open} onValueChange={setOpen} className="mt-4 overflow-hidden rounded-2xl border bg-card">
            {answers.map((answer, i) => (
              <AnswerItem key={answer.id} answer={answer} index={i} />
            ))}
          </Accordion>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No answers were recorded for this interview.</p>
        )}
      </section>

      <div className="mt-10 flex flex-col gap-3 border-t pt-8 sm:flex-row print:hidden">
        <Button asChild size="lg" data-testid="button-practice-again">
          <Link href="/interview/setup">
            <Mic />
            Practise again
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg" data-testid="button-view-dashboard">
          <Link href="/dashboard">Back to overview</Link>
        </Button>
      </div>
    </div>
  );
}
