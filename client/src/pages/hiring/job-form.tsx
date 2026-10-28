import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import { ArrowLeft, Loader2, Lock, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { api, errorMessage } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { ANSWER_SECONDS, formatSeconds, type Job } from "@/lib/hiring";
import { cn } from "@/lib/utils";

const LIMITS = { questions: [3, 10], criteria: [2, 6] } as const;

function ListEditor({
  id,
  label,
  hint,
  items,
  onChange,
  limits,
  placeholder,
  disabled,
}: {
  id: string;
  label: string;
  hint: string;
  items: string[];
  onChange: (items: string[]) => void;
  limits: readonly [number, number];
  placeholder: string;
  disabled: boolean;
}) {
  const set = (i: number, value: string) => onChange(items.map((item, j) => (j === i ? value : item)));
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="text-base font-semibold">{label}</legend>
      <p className="text-sm text-muted-foreground">{hint}</p>
      <ol className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-2.5 w-6 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{i + 1}.</span>
            <Textarea
              id={i === 0 ? id : undefined}
              aria-label={`${label} ${i + 1}`}
              value={item}
              onChange={(e) => set(i, e.target.value)}
              rows={item.length > 90 ? 3 : 1}
              maxLength={500}
              placeholder={placeholder}
              className="min-h-10 resize-y"
            />
            {!disabled && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                disabled={items.length <= limits[0]}
              >
                <X />
              </Button>
            )}
          </li>
        ))}
      </ol>
      {!disabled && items.length < limits[1] && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, ""])}>
          <Plus />
          Add
        </Button>
      )}
    </fieldset>
  );
}

export default function JobForm() {
  const params = useParams<{ id?: string }>();
  const editing = !!params.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: job, isLoading } = useQuery<Job>({ queryKey: ["/api/v1/jobs", params.id], enabled: editing });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<string[]>(["", "", ""]);
  const [criteria, setCriteria] = useState<string[]>(["", ""]);
  const [answerSeconds, setAnswerSeconds] = useState(120);
  const [collectResume, setCollectResume] = useState(true);

  useEffect(() => {
    if (!job) return;
    setTitle(job.title);
    setDescription(job.description);
    setQuestions(job.questions);
    setCriteria(job.criteria);
    setAnswerSeconds(job.answerSeconds);
    setCollectResume(job.collectResume);
  }, [job]);

  const suggest = useMutation({
    mutationFn: () => api<{ questions: string[]; criteria: string[] }>("/api/v1/jobs/suggest", { method: "POST", body: { title, description } }),
    onSuccess: (draft) => {
      if (draft.questions.length) setQuestions(draft.questions.slice(0, LIMITS.questions[1]));
      if (draft.criteria.length) setCriteria(draft.criteria.slice(0, LIMITS.criteria[1]));
      toast({ title: "Draft ready", description: "Edit the questions and criteria until they fit the role." });
    },
    onError: (error) => toast({ title: "Couldn't draft questions", description: errorMessage(error), variant: "destructive" }),
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title,
        description,
        questions: questions.map((q) => q.trim()).filter(Boolean),
        criteria: criteria.map((c) => c.trim()).filter(Boolean),
        answerSeconds,
        collectResume,
      };
      return editing
        ? api<Job>(`/api/v1/jobs/${params.id}`, { method: "PATCH", body })
        : api<Job>("/api/v1/jobs", { method: "POST", body });
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/jobs"] });
      toast({ title: editing ? "Job saved" : "Job created" });
      setLocation(`/hiring/jobs/${saved.id}`);
    },
    onError: (error) => toast({ title: "Couldn't save the job", description: errorMessage(error), variant: "destructive" }),
  });

  if (editing && (isLoading || !job)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Skeleton className="h-10 w-64" />
      </div>
    );
  }

  const locked = !!job?.questionsLocked;
  const filledQuestions = questions.filter((q) => q.trim()).length;
  const filledCriteria = criteria.filter((c) => c.trim()).length;
  const valid =
    title.trim().length > 0 &&
    filledQuestions >= LIMITS.questions[0] &&
    filledCriteria >= LIMITS.criteria[0];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
      <Link href={editing ? `/hiring/jobs/${params.id}` : "/hiring"} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {editing ? job?.title : "Hiring"}
      </Link>
      <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{editing ? "Edit job" : "New job"}</h1>

      <form
        className="mt-8 space-y-10"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <section className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="job-title" className="text-base font-semibold">Job title</Label>
            <Input id="job-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required placeholder="Backend Engineer" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="job-description" className="text-base font-semibold">Job description</Label>
            <p className="text-sm text-muted-foreground">Used to draft questions and to give the AI summary context. Candidates don't see it.</p>
            <Textarea id="job-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={7} maxLength={6000} placeholder="Paste the job advert or describe the role and its requirements." />
          </div>
          {!locked && (
            <Button
              type="button"
              variant="outline"
              onClick={() => suggest.mutate()}
              disabled={!title.trim() || description.trim().length < 30 || suggest.isPending}
              data-testid="button-suggest"
            >
              {suggest.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {suggest.isPending ? "Drafting…" : "Draft questions and criteria from the description"}
            </Button>
          )}
        </section>

        {locked && (
          <p className="flex items-start gap-2 rounded-xl bg-muted p-4 text-sm">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            A candidate has already started, so the questions, criteria and time limit are locked. Every candidate answers the same interview.
          </p>
        )}

        <ListEditor
          id="questions"
          label="Questions"
          hint={`Every candidate answers these, in this order, out loud and once each. ${LIMITS.questions[0]}–${LIMITS.questions[1]} questions.`}
          items={questions}
          onChange={setQuestions}
          limits={LIMITS.questions}
          placeholder="Tell me about a time you…"
          disabled={locked}
        />

        <ListEditor
          id="criteria"
          label="Scoring criteria"
          hint={`Job-related skills your team scores from 1 to 5. ${LIMITS.criteria[0]}–${LIMITS.criteria[1]} criteria. Avoid personality or "culture fit".`}
          items={criteria}
          onChange={setCriteria}
          limits={LIMITS.criteria}
          placeholder="System design"
          disabled={locked}
        />

        <fieldset disabled={locked} className="space-y-3">
          <legend className="text-base font-semibold">Time for each answer</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Time for each answer">
            {ANSWER_SECONDS.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={answerSeconds === s}
                onClick={() => setAnswerSeconds(s)}
                className={cn(
                  "min-h-10 rounded-full border px-4 text-sm transition-colors disabled:opacity-50",
                  answerSeconds === s ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/50",
                )}
              >
                {formatSeconds(s)}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex items-start gap-3">
          <Checkbox id="collect-resume" checked={collectResume} onCheckedChange={(v) => setCollectResume(v === true)} className="mt-0.5" />
          <div>
            <Label htmlFor="collect-resume" className="text-base font-semibold">Ask for a CV</Label>
            <p className="text-sm text-muted-foreground">
              Candidates can add a PDF before the questions (they can skip it). It's matched against this job to help you sort; only its text is kept.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t pt-6">
          <Button asChild variant="outline">
            <Link href={editing ? `/hiring/jobs/${params.id}` : "/hiring"}>Cancel</Link>
          </Button>
          <Button type="submit" disabled={!valid || save.isPending} data-testid="button-save-job">
            {save.isPending && <Loader2 className="animate-spin" />}
            {editing ? "Save job" : "Create job"}
          </Button>
        </div>
      </form>
    </div>
  );
}
