import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation, useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
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
import { queryClient } from "@/lib/queryClient";
import { api, getToken, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Loader2,
  Volume2,
  Pause,
  Play,
  SkipForward,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

type Phase = "cv" | "role";
type Status = "loading" | "speaking" | "recording" | "transcribing" | "paused" | "finishing" | "finished" | "error";

interface AttentionReading {
  score: number | null;
  state: "ATTENTIVE" | "PARTIALLY ATTENTIVE" | "DISENGAGED" | null;
  faceDetected: boolean;
}

const ATTENTION_COPY: Record<string, { label: string; tone: string }> = {
  ATTENTIVE: { label: "Engaged", tone: "text-success" },
  "PARTIALLY ATTENTIVE": { label: "Drifting a little", tone: "text-warning" },
  DISENGAGED: { label: "Look at the camera", tone: "text-destructive" },
};

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;

export default function InterviewSessionPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const search = new URLSearchParams(window.location.search);
  const interviewType = (search.get("type") || "cv") as "cv" | "role" | "complete" | "behavioral";
  const isRoleBased = interviewType === "role";
  const isCompleteMode = interviewType === "complete";
  const quizSessionId = search.get("quizSessionId") || "";
  const lang = search.get("lang") || "en";

  const cvEndpoint = `/api/ai/v1/interviews/${params.id}`;
  const quizEndpoint = `/api/quiz/${isRoleBased ? params.id : quizSessionId}`;

  const [phase, setPhase] = useState<Phase>(isRoleBased ? "role" : "cv");
  const [status, setStatus] = useState<Status>("loading");
  const [question, setQuestion] = useState("");
  const [questionNumber, setQuestionNumber] = useState(1);
  const [totalQuestions, setTotalQuestions] = useState(isCompleteMode ? 10 : 5);
  const [targetRole, setTargetRole] = useState("");
  const [cvAnswered, setCvAnswered] = useState(0);
  const [quizAnswered, setQuizAnswered] = useState(0);

  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [attention, setAttention] = useState<AttentionReading>({ score: null, state: null, faceDetected: false });
  const [confirmEnd, setConfirmEnd] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const frameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reportRef = useRef<any>(null);
  const speechTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef(new Date().toISOString());
  const statusRef = useRef<Status>(status);
  statusRef.current = status;

  // ── Speech ──────────────────────────────────────────────────────────────────

  const stopSpeaking = useCallback(() => {
    if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  // Reads the question, then hands over to recording. Some browsers never fire `onend`,
  // so a timeout based on the question's length guarantees we move on.
  const askQuestion = useCallback(
    (text: string) => {
      stopSpeaking();
      setQuestion(text);
      statusRef.current = "speaking";
      setStatus("speaking");
      const done = () => {
        if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
        if (statusRef.current === "speaking") setStatus("recording");
      };
      if (!("speechSynthesis" in window) || !text) return done();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 1;
      utterance.onend = done;
      utterance.onerror = done;
      window.speechSynthesis.speak(utterance);
      speechTimeoutRef.current = setTimeout(done, 2500 + text.split(/\s+/).length * 450);
    },
    [stopSpeaking],
  );

  // ── Nonverbal WebSocket (one per interview) ────────────────────────────────

  const connectNonverbal = useCallback(() => {
    if (wsRef.current) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/nonverbal?token=${encodeURIComponent(getToken() || "")}`);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "result") {
        setAttention(
          msg.faceDetected
            ? { score: msg.attentionScore, state: msg.attentionState, faceDetected: true }
            : { score: null, state: "DISENGAGED", faceDetected: false },
        );
      } else if (msg.type === "session_report") {
        reportRef.current = msg;
      }
    };
    ws.onerror = () => console.warn("Nonverbal analysis unavailable");
    wsRef.current = ws;

    frameTimerRef.current = setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const track = streamRef.current?.getVideoTracks()[0];
      if (!video || !canvas || ws.readyState !== WebSocket.OPEN || !track?.enabled) return;
      if (statusRef.current === "paused" || statusRef.current === "finishing") return;
      canvas.width = 320;
      canvas.height = 240;
      canvas.getContext("2d")?.drawImage(video, 0, 0, 320, 240);
      const frameData = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
      ws.send(JSON.stringify({ type: "frame", sessionId: params.id, timestamp: Date.now() / 1000, frameData }));
    }, 500);
  }, [params.id]);

  // Ask the service for its session summary, wait up to 3s, then close.
  const finishNonverbal = useCallback((): Promise<any> => {
    if (frameTimerRef.current) clearInterval(frameTimerRef.current);
    const ws = wsRef.current;
    wsRef.current = null;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      ws?.close();
      return Promise.resolve(reportRef.current);
    }
    return new Promise((resolve) => {
      const finish = () => {
        ws.close();
        resolve(reportRef.current);
      };
      const timeout = setTimeout(finish, 3000);
      ws.addEventListener("message", (e) => {
        if (JSON.parse(e.data).type === "session_report") {
          clearTimeout(timeout);
          finish();
        }
      });
      ws.send(JSON.stringify({ type: "end_session", sessionId: params.id }));
    });
  }, [params.id]);

  // ── Media ───────────────────────────────────────────────────────────────────

  const releaseMedia = useCallback(() => {
    stopSpeaking();
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, [stopSpeaking]);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || (recorderRef.current && recorderRef.current.state !== "inactive")) return;
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) return;
    try {
      const recorder = new MediaRecorder(new MediaStream(audioTracks));
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data?.size) chunksRef.current.push(e.data);
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      setElapsed(0);
    } catch {
      setMediaError("This browser can't record audio. Try the latest Chrome, Edge or Firefox.");
    }
  }, []);

  const stopRecording = useCallback(
    (): Promise<Blob | null> =>
      new Promise((resolve) => {
        const recorder = recorderRef.current;
        recorderRef.current = null;
        if (!recorder || recorder.state === "inactive") return resolve(null);
        recorder.onstop = () => {
          const blob = chunksRef.current.length ? new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }) : null;
          chunksRef.current = [];
          resolve(blob);
        };
        recorder.stop();
      }),
    [],
  );

  // ── Load the session state (also restores after a page refresh) ────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let startPhase: Phase = isRoleBased ? "role" : "cv";
        let cvTrans: any = null;
        let quizTrans: any = null;

        if (!isRoleBased) cvTrans = await api(`${cvEndpoint}/transcript`);
        if (isRoleBased || isCompleteMode) quizTrans = await api(`${quizEndpoint}/transcript`);
        if (cancelled) return;

        const cvDone = cvTrans ? cvTrans.conversation.filter((m: any) => m.role === "candidate").length : 0;
        const quizDone = quizTrans?.questions_answered ?? 0;
        setCvAnswered(cvDone);
        setQuizAnswered(quizDone);

        if (isCompleteMode && cvTrans?.is_complete) startPhase = "role";
        setPhase(startPhase);
        setTargetRole(cvTrans?.target_role || quizTrans?.target_role || "");
        setTotalQuestions(
          isCompleteMode ? cvTrans.num_questions + quizTrans.num_questions : (cvTrans || quizTrans).num_questions,
        );

        const finished = isCompleteMode ? !!quizTrans.is_complete : !!(cvTrans || quizTrans).is_complete;
        if (finished) {
          setQuestionNumber(isCompleteMode ? cvTrans.num_questions + quizTrans.num_questions : (cvTrans || quizTrans).num_questions);
          setStatus("finished");
          return;
        }

        let text = "";
        if (startPhase === "cv") {
          text = [...cvTrans.conversation].reverse().find((m: any) => m.role === "interviewer")?.content || "";
          setQuestionNumber(cvDone + 1);
        } else {
          text = quizTrans.current_question || "";
          setQuestionNumber((isCompleteMode ? cvDone : 0) + quizDone + 1);
        }

        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: 640, height: 480 },
            audio: { echoCancellation: true, noiseSuppression: true },
          });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          if (videoRef.current) videoRef.current.srcObject = stream;
          connectNonverbal();
        } catch {
          setMediaError("Nexora needs your camera and microphone. Allow access in your browser's address bar, then reload.");
          setStatus("error");
          return;
        }

        askQuestion(text);
      } catch (error) {
        if (!cancelled) {
          setMediaError(errorMessage(error));
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (frameTimerRef.current) clearInterval(frameTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      releaseMedia();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recording runs exactly while status is "recording".
  useEffect(() => {
    if (status === "recording") startRecording();
  }, [status, startRecording]);

  useEffect(() => {
    if (status !== "recording") return;
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);

  // Warn before leaving mid-interview.
  useEffect(() => {
    const inProgress = status === "speaking" || status === "recording" || status === "transcribing" || status === "paused";
    if (!inProgress) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [status]);

  // ── Finishing: evaluate, collect the camera summary, save to Rails ─────────

  const finish = useMutation({
    mutationFn: async ({ cvCount, quizCount }: { cvCount: number; quizCount: number }) => {
      releaseMedia();
      const useCv = !isRoleBased && cvCount > 0;
      const useQuiz = (isRoleBased || isCompleteMode) && quizCount > 0;
      if (!useCv && !useQuiz) return null;

      const [cvEval, quizEval] = await Promise.all([
        useCv ? api(`${cvEndpoint}/evaluate`) : Promise.resolve(null),
        useQuiz ? api(`${quizEndpoint}/evaluate`) : Promise.resolve(null),
      ]);

      let evaluation: any = cvEval || quizEval;
      if (cvEval && quizEval) {
        const avg = (a: number, b: number) => Math.round((a + b) / 2);
        evaluation = {
          target_role: cvEval.target_role,
          overall_score: avg(cvEval.overall_score, quizEval.overall_score),
          communication_score: avg(cvEval.communication_score, quizEval.communication_score),
          technical_score: avg(cvEval.technical_score, quizEval.technical_score),
          hire_recommendation: cvEval.hire_recommendation,
          top_strengths: [...cvEval.top_strengths, ...quizEval.top_strengths].slice(0, 5),
          areas_to_improve: [...cvEval.areas_to_improve, ...quizEval.areas_to_improve].slice(0, 5),
          summary: `${cvEval.summary} ${quizEval.summary}`.trim(),
          recommendation_summary: cvEval.recommendation_summary || "",
          improvement_points: [...(cvEval.improvement_points || []), ...(quizEval.areas_to_improve || [])].slice(0, 6),
          per_question: [...cvEval.per_question, ...quizEval.per_question],
        };
      }

      const nonverbalReport = await finishNonverbal();

      const saved = await api<{ session_id: number }>("/api/v1/sessions/sync_ai_session", {
        method: "POST",
        body: {
          interviewType,
          title: interviewType === "behavioral" ? "Behavioral interview" : evaluation.target_role || targetRole,
          startedAt: startedAtRef.current,
          evaluation: { ...evaluation, language: lang },
          nonverbalReport,
        },
      });

      // Free the in-memory AI sessions; failures here don't matter to the user.
      if (!isRoleBased) api(cvEndpoint, { method: "DELETE" }).catch(() => {});
      if (isRoleBased || isCompleteMode) api(quizEndpoint, { method: "DELETE" }).catch(() => {});
      return saved;
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/sessions/stats"] });
      setLocation(saved ? `/report/${saved.session_id}` : "/dashboard");
    },
    onError: (error) => {
      setStatus("finished");
      toast({ title: "Couldn't build your report", description: errorMessage(error), variant: "destructive" });
    },
  });

  const runFinish = (cvCount = cvAnswered, quizCount = quizAnswered) => {
    setStatus("finishing");
    finish.mutate({ cvCount, quizCount });
  };

  // ── Answering ───────────────────────────────────────────────────────────────

  const submitAnswer = async (text: string) => {
    const endpoint = phase === "cv" ? `${cvEndpoint}/answer` : `${quizEndpoint}/answer`;
    const data = await api<{ next_question: string | null; is_complete: boolean }>(endpoint, {
      method: "POST",
      body: { answer: text },
    });

    const cvCount = cvAnswered + (phase === "cv" ? 1 : 0);
    const quizCount = quizAnswered + (phase === "role" ? 1 : 0);
    setCvAnswered(cvCount);
    setQuizAnswered(quizCount);

    if (!data.is_complete && data.next_question) {
      setQuestionNumber((n) => n + 1);
      askQuestion(data.next_question);
      return;
    }

    if (isCompleteMode && phase === "cv") {
      // CV half done: move to the technical half.
      const quiz = await api<{ current_question: string | null }>(`${quizEndpoint}/transcript`);
      setPhase("role");
      setQuestionNumber((n) => n + 1);
      askQuestion(quiz.current_question || "");
      return;
    }

    runFinish(cvCount, quizCount);
  };

  const handleNext = async ({ skip = false } = {}) => {
    if (status !== "recording" && status !== "speaking") return;
    stopSpeaking();
    setStatus("transcribing");
    const blob = await stopRecording();

    let text = skip ? "(The candidate skipped this question.)" : "";
    if (!skip) {
      if (!blob || blob.size < 2000) {
        toast({ title: "We didn't hear an answer", description: "Check your microphone is on, then answer again." });
        setStatus("recording");
        return;
      }
      try {
        const form = new FormData();
        form.append("file", blob, "answer.webm");
        form.append("language", lang);
        const result = await api<{ text: string }>("/api/ai/v1/transcribe", { method: "POST", body: form });
        text = result.text?.trim() || "";
      } catch (error) {
        toast({ title: "Couldn't transcribe that answer", description: `${errorMessage(error)} Please answer again.`, variant: "destructive" });
        setStatus("recording");
        return;
      }
      if (!text) {
        toast({ title: "We couldn't make out any words", description: "Speak a little closer to the microphone and try again." });
        setStatus("recording");
        return;
      }
    }

    try {
      await submitAnswer(text);
    } catch (error) {
      toast({ title: "Couldn't send your answer", description: errorMessage(error), variant: "destructive" });
      setStatus("recording");
    }
  };

  const togglePause = async () => {
    const tracks = streamRef.current?.getTracks() ?? [];
    if (status === "paused") {
      tracks.forEach((t) => {
        t.enabled = t.kind === "video" ? cameraOn : micOn;
      });
      askQuestion(question);
    } else {
      stopSpeaking();
      await stopRecording();
      tracks.forEach((t) => (t.enabled = false));
      setStatus("paused");
    }
  };

  const toggleCamera = () => {
    const next = !cameraOn;
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = next));
    setCameraOn(next);
  };

  const toggleMic = () => {
    const next = !micOn;
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicOn(next);
  };

  const endEarly = () => {
    setConfirmEnd(false);
    stopSpeaking();
    stopRecording();
    if (cvAnswered + quizAnswered === 0) {
      releaseMedia();
      finishNonverbal();
      setLocation("/dashboard");
      return;
    }
    runFinish();
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (status === "finishing") {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center" role="status">
        <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden="true" />
        <h1 className="mt-6 text-2xl font-bold">Scoring your interview</h1>
        <p className="mt-2 text-muted-foreground">Reviewing each answer and your camera summary. This takes up to a minute.</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mx-auto max-w-lg px-4 py-20">
        <h1 className="text-2xl font-bold">This interview can't continue</h1>
        <p className="mt-3 text-muted-foreground">{mediaError}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button onClick={() => window.location.reload()}>Try again</Button>
          <Button asChild variant="outline">
            <Link href="/interview/setup">Start a new interview</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (status === "finished") {
    return (
      <div className="mx-auto max-w-lg px-4 py-20">
        <CheckCircle2 className="h-10 w-10 text-success" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-bold">You've answered every question</h1>
        <p className="mt-3 text-muted-foreground">Generate your report to see your scores and feedback.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button onClick={() => runFinish()} disabled={finish.isPending}>
            Get my report
            <ArrowRight />
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to overview</Link>
          </Button>
        </div>
      </div>
    );
  }

  const progress = ((questionNumber - 1) / totalQuestions) * 100;
  const isLast = questionNumber >= totalQuestions;
  const attentionCopy = attention.state ? ATTENTION_COPY[attention.state] : null;
  const phaseLabel = isCompleteMode ? (phase === "cv" ? "CV questions" : "Technical questions") : null;

  const statusLine = {
    loading: "Preparing your interview…",
    speaking: "Interviewer is asking",
    recording: micOn ? `Recording your answer, ${formatTime(elapsed)}` : "Your microphone is muted",
    transcribing: "Listening back to your answer…",
    paused: "Paused",
  }[status as "loading" | "speaking" | "recording" | "transcribing" | "paused"];

  return (
    <div className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold sm:text-2xl">
            {interviewType === "behavioral" ? "Behavioral interview" : targetRole ? `${targetRole} interview` : "Interview"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Question {Math.min(questionNumber, totalQuestions)} of {totalQuestions}
            {phaseLabel ? `, ${phaseLabel.toLowerCase()}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={togglePause}
            disabled={status === "loading" || status === "transcribing"}
            data-testid="button-pause"
          >
            {status === "paused" ? <Play /> : <Pause />}
            {status === "paused" ? "Resume" : "Pause"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirmEnd(true)} disabled={status === "transcribing"} data-testid="button-end-session">
            End
          </Button>
        </div>
      </div>

      <div
        className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Interview progress"
      >
        <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.45fr_1fr] lg:gap-6">
        {/* The cue card: the question, large, with the live state above it */}
        <section
          aria-label="Current question"
          className="flex min-h-[16rem] flex-col rounded-2xl bg-[hsl(224_48%_16%)] dark:ring-1 dark:ring-[hsl(216_33%_95%/.1)] p-6 text-[hsl(216_33%_95%)] sm:p-8 lg:min-h-[28rem] lg:p-10"
        >
          <div className="flex items-center justify-between gap-3 text-sm text-[hsl(216_33%_95%/.75)]" aria-live="polite">
            <span className="flex items-center gap-3">
              {status === "recording" && micOn && <span className="tally-light" aria-hidden="true" />}
              {status === "speaking" && <Volume2 className="h-4 w-4 text-signal" aria-hidden="true" />}
              {status === "transcribing" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {status === "paused" && <Pause className="h-4 w-4" aria-hidden="true" />}
              {status === "recording" && !micOn && <MicOff className="h-4 w-4 text-signal" aria-hidden="true" />}
              <span className="tabular-nums">{statusLine}</span>
            </span>
            {(status === "recording" || status === "speaking") && (
              <button
                type="button"
                onClick={() => {
                  if (status === "speaking") {
                    stopSpeaking();
                    setStatus("recording");
                  } else {
                    // Throw away the partial answer so the read-out isn't transcribed with it.
                    stopRecording().then(() => askQuestion(question));
                  }
                }}
                className="rounded-md px-2 py-1 text-xs underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(216_33%_95%)]"
              >
                {status === "speaking" ? "Skip reading" : "Read again"}
              </button>
            )}
          </div>

          <p className={cn("cue-card mt-6 flex-1 text-2xl sm:text-3xl lg:mt-10 lg:text-[2.6rem]", status === "paused" && "opacity-40")}>
            {question || "…"}
          </p>

          <p className="mt-6 text-sm text-[hsl(216_33%_95%/.6)]">
            {status === "paused"
              ? "Take your time. Resume when you're ready and the question will be read again."
              : "Answer as you would in the room. Press the button when you've finished your answer."}
          </p>
        </section>

        <aside className="flex flex-col gap-4">
          <div className="relative overflow-hidden rounded-2xl bg-muted">
            <video ref={videoRef} autoPlay muted playsInline className="aspect-video w-full -scale-x-100 object-cover lg:aspect-[4/3]" aria-label="Your camera preview" />
            <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
            {(!cameraOn || status === "paused") && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted text-sm text-muted-foreground">
                {status === "paused" ? <Pause className="h-8 w-8" aria-hidden="true" /> : <VideoOff className="h-8 w-8" aria-hidden="true" />}
                {status === "paused" ? "Paused" : "Camera off. Body language isn't being scored."}
              </div>
            )}
            <div className="absolute bottom-3 left-3 flex gap-2">
              <Button
                size="icon"
                variant={cameraOn ? "secondary" : "destructive"}
                onClick={toggleCamera}
                aria-pressed={!cameraOn}
                aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}
                disabled={status === "paused"}
              >
                {cameraOn ? <Video /> : <VideoOff />}
              </Button>
              <Button
                size="icon"
                variant={micOn ? "secondary" : "destructive"}
                onClick={toggleMic}
                aria-pressed={!micOn}
                aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
                disabled={status === "paused"}
              >
                {micOn ? <Mic /> : <MicOff />}
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-4 sm:p-5">
            <p className="text-sm text-muted-foreground">Presence</p>
            {cameraOn && attentionCopy ? (
              <div className="mt-1 flex items-baseline justify-between gap-3" aria-live="polite">
                <p className={cn("font-display text-xl font-semibold", attentionCopy.tone)}>
                  {attention.faceDetected ? attentionCopy.label : "We can't see your face"}
                </p>
                {attention.score !== null && (
                  <p className="font-display text-2xl font-semibold tabular-nums">{Math.round(attention.score)}</p>
                )}
              </div>
            ) : (
              <p className="mt-1 text-muted-foreground">{cameraOn ? "Starting analysis…" : "Camera is off"}</p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Based on eye contact, head position and blinking. Video is never saved.
            </p>
          </div>
        </aside>
      </div>

      {/* Primary action: sticky on phones so it's always under the thumb */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-4 backdrop-blur lg:static lg:mt-6 lg:border-0 lg:bg-transparent lg:p-0">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-3">
          <Button
            variant="ghost"
            onClick={() => handleNext({ skip: true })}
            disabled={status !== "recording"}
            className="text-muted-foreground"
          >
            <SkipForward />
            Skip
          </Button>
          <Button
            size="lg"
            className="h-12 flex-1 text-base sm:flex-none sm:px-8"
            onClick={() => handleNext()}
            disabled={status !== "recording" || elapsed < 2}
            data-testid="button-next-question"
          >
            {status === "transcribing" ? <Loader2 className="animate-spin" /> : null}
            {status === "transcribing" ? "Sending…" : isLast ? "Finish interview" : "Done, next question"}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End the interview now?</AlertDialogTitle>
            <AlertDialogDescription>
              {cvAnswered + quizAnswered > 0
                ? `You'll get a report for the ${cvAnswered + quizAnswered} ${cvAnswered + quizAnswered === 1 ? "answer" : "answers"} you've given. The current question won't be scored.`
                : "You haven't answered anything yet, so there's nothing to score. The interview will be discarded."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep going</AlertDialogCancel>
            <AlertDialogAction onClick={endEarly}>
              {cvAnswered + quizAnswered > 0 ? "End and get report" : "Discard interview"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
