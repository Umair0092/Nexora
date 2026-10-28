import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { CheckCircle2, FileText, Loader2, Mic, Square, Upload, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
import { BrandMark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { useRecorder } from "@/hooks/use-recorder";
import { api, ApiError, errorMessage } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { formatSeconds, type ApplyState } from "@/lib/hiring";
import { narrate } from "@/lib/narrator";

const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

function Shell({ children, company }: { children: React.ReactNode; company?: string }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 items-center justify-between border-b px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <BrandMark className="h-7 w-7" />
          <span className="text-sm text-muted-foreground">{company ? `Screening interview for ${company}` : "Screening interview"}</span>
        </div>
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">{children}</main>
    </div>
  );
}

function Intro({ state, token }: { state: ApplyState; token: string }) {
  const [agreed, setAgreed] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const start = useMutation({
    mutationFn: async () => {
      setProblem(null);
      // Check the microphone before starting the clock on anything.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        throw new Error("We need your microphone. Allow access in your browser's address bar, then press Start again.");
      }
      return api<ApplyState>(`/api/v1/apply/${token}/consent`, { method: "POST" });
    },
    onSuccess: (s) => queryClient.setQueryData(["/api/v1/apply", token], s),
    onError: (error) => setProblem(errorMessage(error)),
  });
  const minutes = Math.ceil((state.questionCount * state.answerSeconds) / 60) + 5;

  if (!state.jobOpen) {
    return (
      <>
        <h1 className="text-3xl font-bold">{state.jobTitle}</h1>
        <p className="mt-4 text-muted-foreground">{state.company} is no longer taking interviews for this job. Nothing was recorded.</p>
      </>
    );
  }

  return (
    <>
      <p className="text-muted-foreground">Hi {state.candidateName},</p>
      <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{state.jobTitle}</h1>
      <p className="mt-3 text-lg text-muted-foreground">{state.company} would like to hear from you before the next stage.</p>

      <section aria-labelledby="how-heading" className="mt-8 rounded-2xl border bg-card p-5 sm:p-6">
        <h2 id="how-heading" className="text-lg font-semibold">How it works</h2>
        <ul className="mt-3 space-y-2 text-muted-foreground">
          <li>{state.questionCount} questions, read out one at a time. You answer out loud, with up to {formatSeconds(state.answerSeconds)} each.</li>
          <li>Each question is answered once. Take a moment to think before you start speaking: the timer starts after the question is read.</li>
          <li>It takes about {minutes} minutes. Find a quiet place; you'll need a microphone. Your camera isn't used.</li>
        </ul>
      </section>

      <section aria-labelledby="data-heading" className="mt-4 rounded-2xl border bg-card p-5 sm:p-6">
        <h2 id="data-heading" className="text-lg font-semibold">How your answers are used</h2>
        <ul className="mt-3 space-y-2 text-muted-foreground">
          <li>Your voice is turned into text. The audio isn't kept; {state.company}'s hiring team reads the text of your answers.</li>
          <li>An AI tool summarises your answers for the team. It assesses only what you said, not your accent or how you speak, and people make every decision.</li>
          {state.collectResume && (
            <li>You can add your CV if you like. Its text is extracted and compared with the job for the team; the file itself isn't kept.</li>
          )}
          <li>You can withdraw at any time from this page, which deletes your answers{state.collectResume ? " and CV" : ""}.</li>
        </ul>
      </section>

      <div className="mt-6 flex items-start gap-3">
        <Checkbox id="consent" checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5" />
        <Label htmlFor="consent" className="font-normal leading-relaxed">
          I agree to my answers being recorded, transcribed and shared with {state.company} as described above.
        </Label>
      </div>
      {problem && <p className="mt-4 text-sm text-destructive" role="alert">{problem}</p>}
      <Button size="lg" className="mt-6 w-full sm:w-auto" disabled={!agreed || start.isPending} onClick={() => start.mutate()} data-testid="button-start-screening">
        {start.isPending && <Loader2 className="animate-spin" />}
        Start the interview
      </Button>
    </>
  );
}

// Optional, once, before the first question.
function ResumeStep({ state, token }: { state: ApplyState; token: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: (skip: boolean) => {
      setProblem(null);
      if (skip) return api<ApplyState>(`/api/v1/apply/${token}/resume`, { method: "POST", body: { skip: true } });
      const form = new FormData();
      form.append("file", file as File);
      return api<ApplyState>(`/api/v1/apply/${token}/resume`, { method: "POST", body: form });
    },
    onSuccess: (s) => queryClient.setQueryData(["/api/v1/apply", token], s),
    onError: (error) => setProblem(errorMessage(error)),
  });
  const tooBig = file != null && file.size > 5 * 1024 * 1024;

  return (
    <>
      <p className="text-sm text-muted-foreground">Before the questions</p>
      <h1 className="mt-2 text-3xl font-bold">Add your CV?</h1>
      <p className="mt-3 text-muted-foreground">
        It helps {state.company} see your experience next to your answers. It's optional, and skipping it doesn't count against you.
      </p>

      <label
        htmlFor="cv-file"
        className="mt-8 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed bg-card p-8 text-center transition-colors hover:border-primary/50 focus-within:border-primary"
      >
        {file ? <FileText className="h-8 w-8 text-primary" aria-hidden="true" /> : <Upload className="h-8 w-8 text-muted-foreground" aria-hidden="true" />}
        <span className="font-medium">{file ? file.name : "Choose a PDF"}</span>
        <span className="text-sm text-muted-foreground">{file ? "Choose a different file" : "Up to 5 MB"}</span>
        <input
          id="cv-file"
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setProblem(null);
          }}
        />
      </label>
      {tooBig && <p className="mt-3 text-sm text-destructive" role="alert">That file is over 5 MB. Choose a smaller PDF.</p>}
      {problem && <p className="mt-3 text-sm text-destructive" role="alert">{problem}</p>}

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button variant="ghost" onClick={() => send.mutate(true)} disabled={send.isPending}>
          Skip
        </Button>
        <Button size="lg" onClick={() => send.mutate(false)} disabled={!file || tooBig || send.isPending} data-testid="button-upload-cv">
          {send.isPending && <Loader2 className="animate-spin" />}
          {send.isPending ? "Reading your CV…" : "Add CV and continue"}
        </Button>
      </div>
    </>
  );
}

type Phase = "reading" | "recording" | "sending";

function Questions({ state, token }: { state: ApplyState; token: string }) {
  const recorder = useRecorder();
  const [phase, setPhase] = useState<Phase>("reading");
  const [problem, setProblem] = useState<string | null>(null);
  const stopNarration = useRef<(() => void) | null>(null);
  const question = state.currentQuestion;
  const remaining = state.answerSeconds - recorder.elapsed;

  const beginRecording = useCallback(() => {
    stopNarration.current?.();
    stopNarration.current = null;
    setPhase("recording");
    recorder.start();
  }, [recorder]);

  // Read each new question, then record.
  useEffect(() => {
    if (!question) return;
    setProblem(null);
    setPhase("reading");
    stopNarration.current = narrate(question, beginRecording, { url: `/api/v1/apply/${token}/speech` });
    return () => stopNarration.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, token]);

  const submit = useMutation({
    mutationFn: async () => {
      setPhase("sending");
      setProblem(null);
      const duration = recorder.elapsed;
      const blob = await recorder.stop();
      if (!blob || blob.size < 2000) throw new Error("We didn't hear an answer. Check your microphone is on, then answer again.");
      const form = new FormData();
      form.append("file", blob, "answer.webm");
      const { text } = await api<{ text: string }>(`/api/v1/apply/${token}/transcriptions`, { method: "POST", body: form });
      if (!text.trim()) throw new Error("We couldn't make out any words. Speak a little closer to the microphone and answer again.");
      return api<ApplyState>(`/api/v1/apply/${token}/answers`, {
        method: "POST",
        body: { position: state.answered, transcript: text, durationSeconds: duration },
      });
    },
    onSuccess: (s) => queryClient.setQueryData(["/api/v1/apply", token], s),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        queryClient.invalidateQueries({ queryKey: ["/api/v1/apply", token] });
        return;
      }
      // Nothing was saved, so the same question can be answered again.
      setProblem(errorMessage(error));
      setPhase("recording");
      recorder.start();
    },
  });

  // The time limit ends the answer automatically.
  useEffect(() => {
    if (phase === "recording" && recorder.state === "recording" && remaining <= 0) submit.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, phase, recorder.state]);

  if (!question) return null;
  const last = state.answered + 1 === state.questionCount;

  return (
    <>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Question {state.answered + 1} of {state.questionCount}</span>
        {phase === "recording" && recorder.state === "recording" && (
          <span className="flex items-center gap-2 font-medium tabular-nums text-foreground" aria-live="polite">
            <span className="tally-light" aria-hidden="true" />
            {formatTime(Math.max(0, remaining))} left
          </span>
        )}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Interview progress" aria-valuemin={0} aria-valuemax={state.questionCount} aria-valuenow={state.answered}>
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(state.answered / state.questionCount) * 100}%` }} />
      </div>

      <section aria-label="Current question" className="mt-6 rounded-2xl bg-[hsl(224_48%_16%)] p-6 text-[hsl(216_33%_95%)] dark:ring-1 dark:ring-[hsl(216_33%_95%/.1)] sm:p-8">
        <p className="flex items-center gap-2 text-sm text-[hsl(216_33%_95%/.75)]" aria-live="polite">
          {phase === "reading" && <><Volume2 className="h-4 w-4" aria-hidden="true" />Reading the question</>}
          {phase === "recording" && recorder.state === "recording" && <><Mic className="h-4 w-4" aria-hidden="true" />Recording your answer</>}
          {phase === "sending" && <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Saving your answer</>}
        </p>
        <p className="cue-card mt-5 text-2xl sm:text-3xl">{question}</p>
      </section>

      {problem && <p className="mt-4 text-sm text-destructive" role="alert">{problem}</p>}
      {recorder.error && <p className="mt-4 text-sm text-destructive" role="alert">{recorder.error}</p>}

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        {phase === "reading" && (
          <Button variant="outline" onClick={beginRecording}>Skip reading and answer</Button>
        )}
        {phase !== "reading" && (
          <Button size="lg" onClick={() => submit.mutate()} disabled={phase !== "recording" || recorder.state !== "recording" || recorder.elapsed < 3} data-testid="button-answer-done">
            {phase === "sending" ? <Loader2 className="animate-spin" /> : <Square />}
            {phase === "sending" ? "Saving…" : last ? "Finish answer" : "Done, next question"}
          </Button>
        )}
      </div>
    </>
  );
}

function Review({ state, token }: { state: ApplyState; token: string }) {
  const complete = useMutation({
    mutationFn: () => api<ApplyState>(`/api/v1/apply/${token}/complete`, { method: "POST" }),
    onSuccess: (s) => queryClient.setQueryData(["/api/v1/apply", token], s),
  });
  return (
    <>
      <CheckCircle2 className="h-10 w-10 text-success" aria-hidden="true" />
      <h1 className="mt-4 text-3xl font-bold">You've answered every question</h1>
      <p className="mt-3 text-muted-foreground">Submit your interview to send your answers to {state.company}.</p>
      {complete.isError && <p className="mt-4 text-sm text-destructive" role="alert">{errorMessage(complete.error)}</p>}
      <Button size="lg" className="mt-6" onClick={() => complete.mutate()} disabled={complete.isPending} data-testid="button-submit-screening">
        {complete.isPending && <Loader2 className="animate-spin" />}
        Submit interview
      </Button>
    </>
  );
}

export default function ApplyPage() {
  const { token } = useParams<{ token: string }>();
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const { data: state, isLoading, error } = useQuery<ApplyState>({ queryKey: ["/api/v1/apply", token] });
  const withdraw = useMutation({
    mutationFn: () => api<ApplyState>(`/api/v1/apply/${token}`, { method: "DELETE" }),
    onSuccess: (s) => queryClient.setQueryData(["/api/v1/apply", token], s),
  });

  if (isLoading) {
    return (
      <Shell>
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading" />
      </Shell>
    );
  }
  if (error || !state) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold">This link doesn't work</h1>
        <p className="mt-3 text-muted-foreground">{errorMessage(error)}</p>
      </Shell>
    );
  }

  const canWithdraw = state.status === "invited" || state.status === "in_progress" || state.status === "completed";

  return (
    <Shell company={state.company}>
      {state.status === "invited" && <Intro state={state} token={token} />}
      {state.status === "in_progress" &&
        (state.resumeStep ? (
          <ResumeStep state={state} token={token} />
        ) : state.currentQuestion ? (
          <Questions state={state} token={token} />
        ) : (
          <Review state={state} token={token} />
        ))}
      {state.status === "completed" && (
        <>
          <CheckCircle2 className="h-10 w-10 text-success" aria-hidden="true" />
          <h1 className="mt-4 text-3xl font-bold">Thanks, {state.candidateName}</h1>
          <p className="mt-3 text-muted-foreground">
            Your answers are with {state.company}'s hiring team for {state.jobTitle}. They'll be in touch about next steps.
          </p>
        </>
      )}
      {state.status === "withdrawn" && (
        <>
          <h1 className="text-3xl font-bold">You've withdrawn</h1>
          <p className="mt-3 text-muted-foreground">Your answers{state.collectResume ? " and any CV you added" : ""} were deleted. {state.company} can see that you withdrew, but nothing you said.</p>
        </>
      )}

      {canWithdraw && (
        <p className="mt-12 border-t pt-6 text-sm text-muted-foreground">
          Changed your mind?{" "}
          <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setConfirmWithdraw(true)}>
            Withdraw and delete my answers
          </button>
        </p>
      )}

      <AlertDialog open={confirmWithdraw} onOpenChange={setConfirmWithdraw}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw from this interview?</AlertDialogTitle>
            <AlertDialogDescription>
              Your answers{state.resumeAdded ? " and CV" : ""} are deleted and {state.company} is told you withdrew. You can't restart with this link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay in</AlertDialogCancel>
            <AlertDialogAction onClick={() => withdraw.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Withdraw
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Shell>
  );
}
