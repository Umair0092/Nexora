import { api } from "@/lib/api";
import type { RawSpeechMetrics, SpeechMetrics } from "@/lib/types";

export interface Transcription {
  text: string;
  speech: RawSpeechMetrics | null;
}

// Sends one recorded answer to Whisper. `speech` carries pace, fillers and pauses.
export function transcribe(blob: Blob, language: string) {
  const form = new FormData();
  form.append("file", blob, "answer.webm");
  form.append("language", language);
  return api<Transcription>("/api/ai/v1/transcribe", { method: "POST", body: form });
}

// A comfortable interview pace is roughly 120–160 words per minute.
export function paceVerdict(wpm: number | null | undefined) {
  if (!wpm) return null;
  if (wpm < 110) return { label: "A little slow", tone: "text-warning" };
  if (wpm > 170) return { label: "Fast", tone: "text-warning" };
  return { label: "Comfortable", tone: "text-success" };
}

export function fillersPerMinute(m: Pick<SpeechMetrics, "fillerCount" | "durationSeconds">) {
  return m.durationSeconds > 0 ? (m.fillerCount / m.durationSeconds) * 60 : 0;
}

export function fillerVerdict(perMinute: number) {
  if (perMinute <= 2) return { label: "Rarely", tone: "text-success" };
  if (perMinute <= 5) return { label: "Noticeable", tone: "text-warning" };
  return { label: "Distracting", tone: "text-destructive" };
}

// Totals across answers, weighting pace by speaking time.
export function combineSpeech(items: (SpeechMetrics | null | undefined)[]): SpeechMetrics | null {
  const list = items.filter((m): m is SpeechMetrics => !!m && m.durationSeconds > 0);
  if (!list.length) return null;
  const durationSeconds = list.reduce((s, m) => s + m.durationSeconds, 0);
  const wordCount = list.reduce((s, m) => s + m.wordCount, 0);
  const fillers: Record<string, number> = {};
  list.forEach((m) => Object.entries(m.fillers || {}).forEach(([w, c]) => (fillers[w] = (fillers[w] || 0) + c)));
  return {
    durationSeconds,
    wordCount,
    wordsPerMinute: durationSeconds >= 3 ? Math.round(wordCount / (durationSeconds / 60)) : null,
    fillerCount: list.reduce((s, m) => s + m.fillerCount, 0),
    fillers,
    longPauses: list.reduce((s, m) => s + m.longPauses, 0),
    longestPauseSeconds: Math.max(...list.map((m) => m.longestPauseSeconds)),
  };
}
