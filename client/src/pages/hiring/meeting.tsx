import { useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  CircleDashed,
  CircleHelp,
  FileAudio,
  Info,
  ListChecks,
  Loader2,
  MinusCircle,
  RefreshCw,
  Upload,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { api, errorMessage, getToken } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { meetingTime, NOTETAKER_LABELS, PROVIDER_LABELS, type MeetingDetail, type Signal } from "@/lib/hiring";
import { cn } from "@/lib/utils";

const SIGNALS: Record<Signal, { label: string; icon: typeof CheckCircle2; className: string }> = {
  strong: { label: "Strong", icon: CheckCircle2, className: "text-success bg-success/10" },
  mixed: { label: "Mixed", icon: CircleDashed, className: "text-warning bg-warning/10" },
  weak: { label: "Weak", icon: MinusCircle, className: "text-destructive bg-destructive/10" },
  not_covered: { label: "Didn't come up", icon: CircleHelp, className: "text-muted-foreground bg-muted" },
};

const ACTIVE = ["scheduled", "joining", "waiting_room", "recording", "processing"];

const clock = (seconds: number) => {
  const s = Math.floor(seconds);
  const pad = (n: number) => String(n).padStart(2, "0");
  return s >= 3600 ? `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
};

export default function MeetingPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const key = ["/api/v1/meetings", id];
  const { data: m, isLoading } = useQuery<MeetingDetail>({
    queryKey: key,
    // Keep checking while the notetaker is in the call or the minutes are being written.
    refetchInterval: (q) => {
      const d = q.state.data;
      return d && (d.minutesStatus === "pending" || (d.notetakerStatus && ACTIVE.includes(d.notetakerStatus))) ? 4000 : false;
    },
  });
  const refresh = (data?: MeetingDetail) => {
    if (data) queryClient.setQueryData(key, data);
    queryClient.invalidateQueries({ queryKey: key });
    if (m) queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates", String(m.candidate.id)] });
  };
  const onError = (title: string) => (error: unknown) => toast({ title, description: errorMessage(error), variant: "destructive" });

  const sendNotetaker = useMutation({
    mutationFn: () => api<MeetingDetail>(`/api/v1/meetings/${id}/notetaker`, { method: "POST" }),
    onSuccess: (d) => {
      toast({ title: "Notetaker on its way", description: "Let “Nexora Notetaker” in if your call has a waiting room." });
      refresh(d);
    },
    onError: onError("Couldn't send the notetaker"),
  });
  const rewrite = useMutation({
    mutationFn: () => api<MeetingDetail>(`/api/v1/meetings/${id}/minutes`, { method: "POST" }),
    onSuccess: refresh,
    onError: onError("Couldn't start the minutes"),
  });

  if (isLoading || !m) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="mt-8 h-64 w-full" />
      </div>
    );
  }

  const live = m.status === "scheduled" && new Date(m.endsAt).getTime() > Date.now() - 30 * 60000;
  const minutes = m.minutes;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <Link href={`/hiring/candidates/${m.candidate.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {m.candidate.name}
      </Link>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold sm:text-4xl">Interview minutes</h1>
          <p className="mt-2 text-muted-foreground">
            {m.candidate.name}, {m.candidate.jobTitle}. {meetingTime(m)}
            {m.panel.length > 0 && ` with ${m.panel.map((p) => p.name).join(", ")}`}
          </p>
        </div>
        {m.meetingUrl && live && (
          <Button asChild variant="outline">
            <a href={m.meetingUrl} target="_blank" rel="noreferrer">
              <Video />
              Join {PROVIDER_LABELS[m.provider]}
            </a>
          </Button>
        )}
      </div>

      <NotetakerBar meeting={m} live={live} onSend={() => sendNotetaker.mutate()} sending={sendNotetaker.isPending} />

      {!m.hasTranscript && <RecordingUpload meetingId={m.id} onDone={refresh} />}

      {m.minutesStatus === "pending" && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border bg-card p-5" role="status">
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
          <div>
            <p className="font-medium">Writing the minutes</p>
            <p className="text-sm text-muted-foreground">Usually under a minute; long calls take a few. The panel gets an email when they're ready.</p>
          </div>
        </div>
      )}
      {m.minutesStatus === "failed" && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-5">
          <p className="flex items-center gap-2 text-sm"><AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />The AI service couldn't write the minutes. The transcript is saved.</p>
          <Button size="sm" variant="outline" onClick={() => rewrite.mutate()} disabled={rewrite.isPending}>Try again</Button>
        </div>
      )}

      {minutes && (
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <div className="space-y-6">
            <section aria-labelledby="summary-heading" className="rounded-2xl border bg-card p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 id="summary-heading" className="text-lg font-semibold">Summary</h2>
                <Button size="sm" variant="ghost" onClick={() => rewrite.mutate()} disabled={rewrite.isPending || m.minutesStatus === "pending"} className="text-muted-foreground">
                  <RefreshCw className={cn(rewrite.isPending && "animate-spin")} />
                  Write again
                </Button>
              </div>
              <p className="mt-2 flex gap-2 text-sm text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Written by AI from the {m.transcriptSource === "bot" ? "notetaker's transcript" : "uploaded recording"}. It reports what was said; the decision is the panel's.
              </p>
              <p className="mt-4 leading-relaxed">{minutes.summary}</p>
            </section>

            <section aria-labelledby="topics-heading" className="rounded-2xl border bg-card p-5 sm:p-6">
              <h2 id="topics-heading" className="text-lg font-semibold">Minutes</h2>
              <ol className="mt-4 space-y-5 border-l pl-5">
                {minutes.topics.map((t, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-primary bg-background" aria-hidden="true" />
                    <h3 className="font-semibold">{t.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t.notes}</p>
                  </li>
                ))}
              </ol>
            </section>

            <Transcript meeting={m} />
          </div>

          <div className="space-y-6">
            <section aria-labelledby="criteria-heading" className="rounded-2xl border bg-card p-5">
              <h2 id="criteria-heading" className="text-lg font-semibold">Against the job's criteria</h2>
              <ul className="mt-4 space-y-4">
                {minutes.criteria.map((c) => {
                  const s = SIGNALS[c.signal];
                  return (
                    <li key={c.criterion}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">{c.criterion}</span>
                        <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", s.className)}>
                          <s.icon className="h-3.5 w-3.5" aria-hidden="true" />
                          {s.label}
                        </span>
                      </div>
                      {c.evidence && <p className="mt-1 text-sm text-muted-foreground">{c.evidence}</p>}
                    </li>
                  );
                })}
              </ul>
            </section>

            {minutes.followUps.length > 0 && (
              <section aria-labelledby="followups-heading" className="rounded-2xl border bg-card p-5">
                <h2 id="followups-heading" className="flex items-center gap-2 text-lg font-semibold">
                  <ListChecks className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  Follow-ups
                </h2>
                <ul className="mt-3 space-y-2.5">
                  {minutes.followUps.map((f, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="mt-0.5 h-4 w-4 shrink-0 rounded border" aria-hidden="true" />
                      <span>
                        {f.item}
                        <span className="block text-xs text-muted-foreground">{f.owner}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {minutes.concerns.length > 0 && (
              <section aria-labelledby="concerns-heading" className="rounded-2xl border bg-card p-5">
                <h2 id="concerns-heading" className="text-lg font-semibold">To check next round</h2>
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">
                  {minutes.concerns.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </section>
            )}

            {minutes.candidateQuestions.length > 0 && (
              <section aria-labelledby="questions-heading" className="rounded-2xl border bg-card p-5">
                <h2 id="questions-heading" className="text-lg font-semibold">{m.candidate.name.split(" ")[0]} asked</h2>
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">
                  {minutes.candidateQuestions.map((q, i) => <li key={i}>{q}</li>)}
                </ul>
              </section>
            )}
          </div>
        </div>
      )}

      {!minutes && m.hasTranscript && m.minutesStatus !== "pending" && <div className="mt-6"><Transcript meeting={m} /></div>}
    </div>
  );
}

function NotetakerBar({ meeting: m, live, onSend, sending }: { meeting: MeetingDetail; live: boolean; onSend: () => void; sending: boolean }) {
  if (m.notetakerStatus) {
    const busy = ACTIVE.includes(m.notetakerStatus);
    return (
      <div className={cn("mt-6 flex items-center gap-3 rounded-2xl border p-4", m.notetakerStatus === "failed" ? "border-destructive/40 bg-destructive/5" : "bg-card")} role="status">
        {busy ? <span className="tally-light shrink-0" aria-hidden="true" /> : <Bot className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
        <div className="text-sm">
          <p className="font-medium">{NOTETAKER_LABELS[m.notetakerStatus]}</p>
          <p className="text-muted-foreground">
            {m.notetakerStatus === "failed"
              ? `${m.notetakerError ?? "It couldn't record this call."} You can upload a recording instead.`
              : m.notetakerStatus === "scheduled"
                ? `“Nexora Notetaker” joins ${PROVIDER_LABELS[m.provider]} at the start time.`
                : m.notetakerStatus === "done"
                  ? `Recorded from ${PROVIDER_LABELS[m.provider]}'s captions, with each speaker's name.`
                  : "It leaves when the call ends, then the minutes are written."}
          </p>
        </div>
      </div>
    );
  }
  if (!live || m.hasTranscript || !m.notetakerAvailable || !m.meetingUrl) return null;
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
      <p className="flex items-center gap-2 text-sm">
        <Bot className="h-5 w-5 text-primary" aria-hidden="true" />
        Want minutes? Send Nexora Notetaker into the call to record it.
      </p>
      <Button size="sm" onClick={onSend} disabled={sending} data-testid="button-send-notetaker">
        {sending && <Loader2 className="animate-spin" />}
        Send notetaker now
      </Button>
    </div>
  );
}

function RecordingUpload({ meetingId, onDone }: { meetingId: number; onDone: (d: MeetingDetail) => void }) {
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/v1/meetings/${meetingId}/recording`, { method: "POST", body, headers: { Authorization: `Bearer ${getToken()}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "The recording couldn't be uploaded.");
      return data as MeetingDetail;
    },
    onSuccess: (d) => {
      toast({ title: "Recording transcribed", description: "Now writing the minutes." });
      onDone(d);
    },
    onError: (error) => toast({ title: "Couldn't use that recording", description: errorMessage(error), variant: "destructive" }),
  });
  const pick = (file?: File) => file && upload.mutate(file);

  return (
    <section
      aria-labelledby="upload-heading"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        pick(e.dataTransfer.files[0]);
      }}
      className={cn("mt-6 rounded-2xl border border-dashed bg-card p-6 text-center transition-colors sm:p-8", dragging && "border-primary bg-primary/5")}
    >
      {upload.isPending ? (
        <div role="status" className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          <p className="font-medium">Transcribing the recording</p>
          <p className="text-sm text-muted-foreground">A 45-minute call takes about half a minute.</p>
        </div>
      ) : (
        <>
          <FileAudio className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <h2 id="upload-heading" className="mt-3 font-semibold">Add the recording</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Drop the call's recording here: a Meet, Zoom or Teams export, or audio from your phone. Nexora transcribes it and writes the minutes.
            MP3, M4A, MP4, WAV or WebM, up to 25 MB.
          </p>
          <input ref={input} type="file" accept="audio/*,video/mp4,video/webm,.m4a,.mp3,.wav,.webm,.mp4" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} data-testid="input-recording" />
          <Button className="mt-4" variant="outline" onClick={() => input.current?.click()}>
            <Upload />
            Choose a file
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">Make sure everyone on the call knew it was being recorded.</p>
        </>
      )}
    </section>
  );
}

function Transcript({ meeting: m }: { meeting: MeetingDetail }) {
  if (m.transcript.length === 0) return null;
  return (
    <details className="group rounded-2xl border bg-card">
      <summary className="cursor-pointer list-none p-5 font-semibold [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-3">
          Transcript
          <span className="flex items-center gap-3 text-sm font-normal text-muted-foreground">
            {m.transcript.length} lines, {clock(m.transcript[m.transcript.length - 1].start)}
            <span className="font-medium text-primary"><span className="group-open:hidden">Show</span><span className="hidden group-open:inline">Hide</span></span>
          </span>
        </span>
      </summary>
      <ol className="space-y-3 border-t px-5 py-4 text-sm">
        {m.transcript.map((line, i) => (
          <li key={i} className="grid grid-cols-[3.5rem_1fr] gap-3">
            <span className="pt-0.5 font-mono text-xs tabular-nums text-muted-foreground">{clock(line.start)}</span>
            <p>
              {line.speaker && <span className="font-semibold">{line.speaker}: </span>}
              {line.text}
            </p>
          </li>
        ))}
      </ol>
    </details>
  );
}
