import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import { ArrowLeft, Check, Columns3, Copy, Kanban, List, Loader2, Mail, Pencil, Send, Trash2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PipelineBoard } from "@/components/hiring/pipeline-board";
import { EmailDialog } from "@/components/hiring/email-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { api, errorMessage } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { COLUMN_LABELS, formatSeconds, STATUS_LABELS, useOrganization, type CandidateRow, type Job, type Stage } from "@/lib/hiring";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<CandidateRow["status"], string> = {
  invited: "bg-muted text-muted-foreground",
  in_progress: "bg-warning/15 text-warning",
  completed: "bg-primary/15 text-primary",
  withdrawn: "bg-muted text-muted-foreground line-through",
};

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Copy the candidate's interview link"
      title="Copy interview link"
      onClick={async () => {
        await navigator.clipboard.writeText(`${window.location.origin}${link}`).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  );
}

type View = "board" | "list";
type Sort = "newest" | "ai" | "team" | "cv";

const SORTS: Record<Sort, { label: string; value: (c: CandidateRow) => number }> = {
  newest: { label: "Newest", value: (c) => Date.parse(c.invitedAt) },
  ai: { label: "AI interview score", value: (c) => c.aiScore ?? -1 },
  team: { label: "Team score", value: (c) => c.scorecardAverage ?? -1 },
  cv: { label: "CV match", value: (c) => c.resumeScore ?? -1 },
};

const VIEW_KEY = "nexora.hiring.view";
const savedView = (): View => {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "board";
  } catch {
    return "board";
  }
};

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [view, setView] = useState<View>(savedView);
  const [sort, setSort] = useState<Sort>("newest");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [emailing, setEmailing] = useState(false);
  const { data: org } = useOrganization();

  const key = ["/api/v1/jobs", id];
  const { data: job, isLoading } = useQuery<Job & { candidates: CandidateRow[] }>({ queryKey: key });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ["/api/v1/jobs"], exact: true });
  };
  const onError = (title: string) => (error: unknown) => toast({ title, description: errorMessage(error), variant: "destructive" });

  const invite = useMutation({
    mutationFn: () => api<CandidateRow>(`/api/v1/jobs/${id}/candidates`, { method: "POST", body: { name, email } }),
    onSuccess: (c) => {
      toast({ title: "Invitation sent", description: `${c.name} will get an email with their interview link.` });
      setName("");
      setEmail("");
      refresh();
    },
    onError: onError("Couldn't invite the candidate"),
  });
  const setStatus = useMutation({
    mutationFn: (status: Job["status"]) => api<Job>(`/api/v1/jobs/${id}`, { method: "PATCH", body: { status } }),
    onSuccess: refresh,
    onError: onError("Couldn't update the job"),
  });
  const resend = useMutation({
    mutationFn: (candidateId: number) => api(`/api/v1/candidates/${candidateId}/resend`, { method: "POST" }),
    onSuccess: () => toast({ title: "Invitation sent again" }),
    onError: onError("Couldn't send the invitation"),
  });
  const move = useMutation({
    mutationFn: ({ candidate, stage }: { candidate: CandidateRow; stage: Stage | null }) =>
      api(`/api/v1/candidates/${candidate.id}/stage`, { method: "POST", body: { stage } }),
    // Move the card straight away; the refetch confirms it.
    onMutate: ({ candidate, stage }) => {
      queryClient.setQueryData<Job & { candidates: CandidateRow[] }>(key, (old) =>
        old && {
          ...old,
          candidates: old.candidates.map((c) =>
            c.id === candidate.id ? { ...c, stage, column: stage ?? (c.status === "completed" ? "review" : "invited") } : c,
          ),
        },
      );
    },
    onSuccess: (_, { candidate, stage }) => toast({ title: `${candidate.name} moved to ${COLUMN_LABELS[stage ?? (candidate.status === "completed" ? "review" : "invited")]}` }),
    onError: onError("Couldn't move the candidate"),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: () => api(`/api/v1/jobs/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/jobs"] });
      toast({ title: "Job deleted", description: "Its candidates and their answers were deleted too." });
      setLocation("/hiring");
    },
    onError: onError("Couldn't delete the job"),
  });

  const candidates = job?.candidates;
  const sorted = useMemo(
    () => [...(candidates ?? [])].sort((a, b) => SORTS[sort].value(b) - SORTS[sort].value(a)),
    [candidates, sort],
  );

  if (isLoading || !job) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-8 h-48 w-full" />
      </div>
    );
  }

  const open = job.status === "open";
  const chosen = job.candidates.filter((c) => selected.has(c.id));
  const emailable = chosen.filter((c) => c.status !== "withdrawn");
  const withdrawn = job.candidates.filter((c) => c.column === "withdrawn");
  const toggle = (cid: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(cid)) next.delete(cid);
      else next.add(cid);
      return next;
    });
  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // The choice just won't be remembered.
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <Link href="/hiring" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Hiring
      </Link>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold sm:text-4xl">{job.title}</h1>
          <p className="mt-2 text-muted-foreground">
            {open ? "Open" : "Closed"}, {job.questions.length} questions, up to {formatSeconds(job.answerSeconds)} each
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setStatus.mutate(open ? "closed" : "open")} disabled={setStatus.isPending}>
            {open ? "Close job" : "Reopen job"}
          </Button>
          <Button asChild variant="outline">
            <Link href={`/hiring/jobs/${id}/edit`}>
              <Pencil />
              Edit
            </Link>
          </Button>
          <Button variant="ghost" size="icon" aria-label="Delete job" onClick={() => setConfirmDelete(true)}>
            <Trash2 />
          </Button>
        </div>
      </div>

      {open ? (
        <form
          className="mt-8 rounded-2xl border bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault();
            invite.mutate();
          }}
        >
          <p className="text-base font-semibold">Invite a candidate</p>
          <p className="mt-1 text-sm text-muted-foreground">They get an email with a personal link. No account needed.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="candidate-name">Name</Label>
              <Input id="candidate-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="candidate-email">Email</Label>
              <Input id="candidate-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <Button type="submit" disabled={!name.trim() || !email || invite.isPending} data-testid="button-invite-candidate">
              {invite.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />}
              Invite
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-8 rounded-xl bg-muted p-4 text-sm">This job is closed: candidates who haven't started can't begin. Reopen it to invite more.</p>
      )}

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Candidates</h2>
        {job.candidates.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {view === "list" && (
              <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
                <SelectTrigger className="h-9 w-48" aria-label="Sort candidates">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SORTS) as Sort[]).map((s) => (
                    <SelectItem key={s} value={s}>Sort by {SORTS[s].label.toLowerCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <ToggleGroup type="single" variant="outline" value={view} onValueChange={(v) => v && changeView(v as View)} aria-label="View">
              <ToggleGroupItem value="board" aria-label="Board">
                <Kanban className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label="List">
                <List className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}
      </div>

      {job.candidates.length === 0 ? (
        <p className="mt-3 text-muted-foreground">Nobody invited yet.</p>
      ) : view === "board" ? (
        <div className="mt-4">
          <PipelineBoard candidates={job.candidates} selected={selected} onToggle={toggle} onMove={(candidate, stage) => move.mutate({ candidate, stage })} />
          {withdrawn.length > 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              Withdrew: {withdrawn.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && ", "}
                  <Link href={`/hiring/candidates/${c.id}`} className="underline underline-offset-2 hover:text-foreground">{c.name}</Link>
                </span>
              ))}
            </p>
          )}
        </div>
      ) : (
        <div className="relative mt-4 overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th scope="col" className="w-10 px-4 py-3"><span className="sr-only">Select</span></th>
                <th scope="col" className="px-4 py-3 font-medium">Candidate</th>
                <th scope="col" className="px-4 py-3 font-medium">Stage</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">AI score</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Team score</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">CV match</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map((c) => (
                <tr key={c.id} className={cn(selected.has(c.id) && "bg-primary/5")}>
                  <td className="px-4 py-3">
                    <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} aria-label={`Select ${c.name}`} />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/hiring/candidates/${c.id}`} className="font-semibold text-primary hover:underline" data-testid={`link-candidate-${c.id}`}>
                      {c.name}
                    </Link>
                    <p className="text-muted-foreground">{c.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", c.stage ? "bg-primary/15 text-primary" : STATUS_TONE[c.status])}>
                      {c.stage || c.column === "withdrawn" ? COLUMN_LABELS[c.column] : STATUS_LABELS[c.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {c.aiScore != null ? Math.round(c.aiScore) : c.evaluationStatus === "pending" ? "…" : "–"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {c.scorecardAverage != null ? `${c.scorecardAverage} / 5` : "–"}
                    {c.scorecardCount > 0 && <span className="block text-xs text-muted-foreground">{c.scorecardCount} {c.scorecardCount === 1 ? "review" : "reviews"}</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {c.resumeScore != null ? `${c.resumeScore}%` : c.resumeStatus === "pending" ? "…" : "–"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      {(c.status === "invited" || c.status === "in_progress") && (
                        <>
                          <CopyLink link={c.link} />
                          <Button variant="ghost" size="icon" aria-label={`Email ${c.name} the link again`} title="Send the invitation again" onClick={() => resend.mutate(c.id)} disabled={resend.isPending}>
                            <Send />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected.size > 0 && (
        <div className="sticky bottom-4 z-10 mt-4 flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3 shadow-lg" role="region" aria-label="Selected candidates">
          <p className="mr-auto px-2 text-sm font-medium">{selected.size} selected</p>
          <Button
            variant="outline"
            disabled={selected.size < 2 || selected.size > 4}
            title={selected.size < 2 || selected.size > 4 ? "Select 2 to 4 candidates to compare" : undefined}
            onClick={() => setLocation(`/hiring/jobs/${id}/compare?ids=${Array.from(selected).join(",")}`)}
            data-testid="button-compare"
          >
            <Columns3 />
            Compare
          </Button>
          <Button onClick={() => setEmailing(true)} disabled={emailable.length === 0} data-testid="button-email-selected">
            <Mail />
            Email
          </Button>
          <Button variant="ghost" size="icon" aria-label="Clear selection" onClick={() => setSelected(new Set())}>
            <X />
          </Button>
        </div>
      )}

      <EmailDialog
        jobId={job.id}
        jobTitle={job.title}
        company={org?.name ?? ""}
        candidates={emailable}
        open={emailing}
        onOpenChange={setEmailing}
        onSent={() => setSelected(new Set())}
      />

      <details className="mt-10 rounded-2xl border bg-card p-5">
        <summary className="cursor-pointer font-semibold">Questions and criteria</summary>
        <ol className="mt-4 list-decimal space-y-2 pl-5">
          {job.questions.map((q, i) => <li key={i}>{q}</li>)}
        </ol>
        <p className="mt-5 text-sm font-semibold">Scored on</p>
        <p className="mt-1 text-sm text-muted-foreground">{job.criteria.join(", ")}</p>
      </details>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {job.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the job, every candidate invited to it, their answers and your team's scorecards. It can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
