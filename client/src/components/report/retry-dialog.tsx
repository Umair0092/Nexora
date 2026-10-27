import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Loader2, Mic, RotateCcw, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRecorder } from "@/hooks/use-recorder";
import { api, errorMessage } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { narrate } from "@/lib/narrator";
import { transcribe } from "@/lib/speech";
import type { Answer, AnswerAttempt } from "@/lib/types";
import { Bullets, ScoreNumber, StarChecklist } from "@/components/report/report-parts";

const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

// Record one new answer to a report question and get it scored (by Rails, via the AI service).
export function RetryDialog({
  answer,
  sessionId,
  language,
  open,
  onOpenChange,
}: {
  answer: Answer | null;
  sessionId: string;
  language: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const recorder = useRecorder();
  const [result, setResult] = useState<AnswerAttempt | null>(null);
  // The score to compare against, fixed when scoring starts: the report refetches
  // afterwards and its latest attempt becomes this one.
  const [baseline, setBaseline] = useState<number | null | undefined>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const stopNarration = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!open) {
      setResult(null);
      setProblem(null);
      if (recorder.state === "recording") recorder.stop();
      stopNarration.current?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const score = useMutation({
    mutationFn: async () => {
      setProblem(null);
      setBaseline(before);
      const blob = await recorder.stop();
      if (!blob || blob.size < 2000) throw new Error("We didn't hear an answer. Check your microphone and record again.");
      const { text, speech } = await transcribe(blob, language);
      if (!text?.trim()) throw new Error("We couldn't make out any words. Speak a little closer to the microphone and try again.");
      return api<AnswerAttempt>(`/api/v1/sessions/${sessionId}/answers/${answer!.id}/attempts`, {
        method: "POST",
        body: { transcript: text, speech: speech ?? undefined },
      });
    },
    onSuccess: (attempt) => {
      setResult(attempt);
      queryClient.invalidateQueries({ queryKey: ["/api/v1/sessions", sessionId, "report"] });
    },
    onError: (error) => setProblem(errorMessage(error)),
  });

  const readAloud = () => {
    if (!answer?.question?.text) return;
    stopNarration.current?.();
    stopNarration.current = narrate(answer.question.text);
  };

  const before = answer?.attempts?.length ? answer.attempts[answer.attempts.length - 1].score : answer?.score;
  const compared = result ? baseline : before;
  const recording = recorder.state === "recording";

  return (
    <Dialog open={open} onOpenChange={(o) => !score.isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Try this question again</DialogTitle>
          <DialogDescription>Answer out loud as you would in the room. Your new answer is scored on its own.</DialogDescription>
        </DialogHeader>

        {answer && (
          <div className="space-y-5">
            <div className="rounded-xl bg-[hsl(224_48%_16%)] p-5 text-[hsl(216_33%_95%)] dark:ring-1 dark:ring-[hsl(216_33%_95%/.1)] sm:p-6">
              <p className="cue-card text-xl sm:text-2xl">{answer.question?.text}</p>
              <button
                type="button"
                onClick={readAloud}
                className="mt-4 inline-flex items-center gap-2 rounded-md text-sm text-[hsl(216_33%_95%/.75)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(216_33%_95%)]"
              >
                <Volume2 className="h-4 w-4" aria-hidden="true" />
                Read it to me
              </button>
            </div>

            {!result && (
              <div className="flex flex-col items-center gap-3 py-2 text-center" aria-live="polite">
                {score.isPending ? (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
                    <p className="font-semibold">Scoring your answer…</p>
                  </>
                ) : recording ? (
                  <>
                    <p className="flex items-center gap-3 font-semibold tabular-nums">
                      <span className="tally-light" aria-hidden="true" />
                      Recording, {formatTime(recorder.elapsed)}
                    </p>
                    <Button size="lg" onClick={() => score.mutate()} disabled={recorder.elapsed < 2} data-testid="button-retry-stop">
                      <Square />
                      Done, score it
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Your last score on this question: <ScoreNumber score={before} />
                    </p>
                    <Button size="lg" onClick={() => recorder.start()} disabled={recorder.state === "starting"} data-testid="button-retry-record">
                      {recorder.state === "starting" ? <Loader2 className="animate-spin" /> : <Mic />}
                      Start recording
                    </Button>
                  </>
                )}
                {(problem || recorder.error) && (
                  <p className="max-w-md text-sm text-destructive" role="alert">{problem || recorder.error}</p>
                )}
              </div>
            )}

            {result && (
              <div className="space-y-5" aria-live="polite">
                <div className="flex items-center justify-center gap-6 rounded-xl border bg-card p-5 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Before</p>
                    <ScoreNumber score={compared} className="text-3xl" />
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <p className="text-xs text-muted-foreground">This attempt</p>
                    <ScoreNumber score={result.score} className="text-4xl" />
                  </div>
                </div>
                <p className="text-center text-sm font-semibold">
                  {typeof compared === "number" && typeof result.score === "number"
                    ? result.score > compared
                      ? `Up ${Math.round(result.score - compared)} points.`
                      : result.score === compared
                        ? "Same score as before."
                        : "Not quite as strong as last time. Check the feedback and try once more."
                    : null}
                </p>
                {result.feedback && <p className="text-sm leading-relaxed">{result.feedback}</p>}
                {result.star && <StarChecklist star={result.star} compact />}
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-sm font-semibold text-success">What worked</p>
                    <Bullets items={result.strengths} empty="Nothing stood out." tone="good" />
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-semibold text-warning">Change next time</p>
                    <Bullets items={result.improvements} empty="No changes suggested." tone="fix" />
                  </div>
                </div>
                {result.recommendation && (
                  <p className="rounded-lg bg-accent/60 p-3 text-sm">{result.recommendation}</p>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={() => setResult(null)}>
                    <RotateCcw />
                    Try again
                  </Button>
                  <Button onClick={() => onOpenChange(false)}>Done</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
