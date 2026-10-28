import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearch } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api";
import { COLUMN_LABELS, RECOMMENDATION_LABELS, type ComparedCandidate, type Job, type Recommendation } from "@/lib/hiring";
import { cn } from "@/lib/utils";

const score = (v: number | null | undefined, suffix = "") => (v == null ? "–" : `${v}${suffix}`);

// 2–4 candidates of one job in columns: scores per criterion, then every
// answer to the same question side by side.
export default function ComparePage() {
  const { id } = useParams<{ id: string }>();
  const ids = new URLSearchParams(useSearch()).get("ids") ?? "";
  const { data, isLoading, error } = useQuery<{ job: Job; candidates: ComparedCandidate[] }>({
    queryKey: [`/api/v1/jobs/${id}/compare?ids=${encodeURIComponent(ids)}`],
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-8 h-96 w-full" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link href={`/hiring/jobs/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to the job
        </Link>
        <p className="mt-6">{errorMessage(error)}</p>
      </div>
    );
  }

  const { job, candidates } = data;
  const cols = { gridTemplateColumns: `minmax(9rem, 12rem) repeat(${candidates.length}, minmax(0, 1fr))` };
  // The highest value in a row is marked, so differences stand out.
  const best = (values: (number | null)[]) => {
    const nums = values.filter((v): v is number => v != null);
    return nums.length > 1 ? Math.max(...nums) : null;
  };
  const Row = ({ label, values, suffix }: { label: string; values: (number | null)[]; suffix?: string }) => {
    const top = best(values);
    return (
      <div className="grid gap-3 border-t py-2.5 text-sm" style={cols} role="row">
        <div className="text-muted-foreground" role="rowheader">{label}</div>
        {values.map((v, i) => (
          <div key={i} role="cell" className={cn("tabular-nums", v != null && v === top && "font-semibold text-primary")}>
            {score(v, suffix)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <Link href={`/hiring/jobs/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {job.title}
      </Link>
      <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Compare candidates</h1>
      <p className="mt-2 text-muted-foreground">The best score in each row is highlighted. Scores are a guide; read the answers.</p>

      <div className="-mx-4 mt-8 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="rounded-2xl border bg-card p-5" style={{ minWidth: `${12 + candidates.length * 16}rem` }} role="table" aria-label="Candidate comparison">
          <div className="grid gap-3 pb-3" style={cols} role="row">
            <div role="columnheader"><span className="sr-only">Measure</span></div>
            {candidates.map((c) => (
              <div key={c.id} role="columnheader">
                <Link href={`/hiring/candidates/${c.id}`} className="text-lg font-semibold hover:text-primary hover:underline">{c.name}</Link>
                <p className="text-sm text-muted-foreground">{COLUMN_LABELS[c.column]}</p>
              </div>
            ))}
          </div>

          <Row label="Team score" values={candidates.map((c) => c.scorecardAverage)} suffix=" / 5" />
          <Row label="AI interview score" values={candidates.map((c) => (c.aiScore == null ? null : Math.round(c.aiScore)))} />
          <Row label="CV match" values={candidates.map((c) => c.resumeScore)} suffix="%" />
          <div className="grid gap-3 border-t py-2.5 text-sm" style={cols} role="row">
            <div className="text-muted-foreground" role="rowheader">Recommendations</div>
            {candidates.map((c) => (
              <div key={c.id} role="cell">
                {(Object.keys(RECOMMENDATION_LABELS) as Recommendation[]).filter((r) => c.recommendations[r] > 0).map((r) => `${c.recommendations[r]} ${RECOMMENDATION_LABELS[r].toLowerCase()}`).join(", ") || "–"}
              </div>
            ))}
          </div>

          <h2 className="mt-6 pb-1 text-sm font-semibold">Team rating by criterion</h2>
          {job.criteria.map((name) => (
            <Row key={name} label={name} values={candidates.map((c) => c.teamRatings[name] ?? null)} suffix=" / 5" />
          ))}

          <h2 className="mt-6 pb-1 text-sm font-semibold">AI summary</h2>
          <div className="grid gap-3 border-t py-2.5 text-sm" style={cols} role="row">
            <div className="text-muted-foreground" role="rowheader">Interview</div>
            {candidates.map((c) => <p key={c.id} role="cell" className="leading-relaxed">{c.summary ?? "–"}</p>)}
          </div>
          <div className="grid gap-3 border-t py-2.5 text-sm" style={cols} role="row">
            <div className="text-muted-foreground" role="rowheader">CV</div>
            {candidates.map((c) => <p key={c.id} role="cell" className="leading-relaxed">{c.resumeSummary ?? "–"}</p>)}
          </div>

          <h2 className="mt-6 pb-1 text-sm font-semibold">Answers</h2>
          {job.questions.map((q, i) => (
            <div key={i} className="grid gap-3 border-t py-3 text-sm" style={cols} role="row">
              <p className="font-medium" role="rowheader">{i + 1}. {q}</p>
              {candidates.map((c) => (
                <p key={c.id} role="cell" className="whitespace-pre-line leading-relaxed">
                  {c.answers[String(i)] ?? <span className="text-muted-foreground">Not answered</span>}
                </p>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
