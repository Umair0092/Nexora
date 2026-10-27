// Reads interview questions aloud. Uses the server's natural-sounding voice
// (POST /api/v1/speech) and falls back to the best voice the browser has when
// that's unavailable.
//
//   const stop = narrate("Tell me about a time...", () => setStatus("recording"));
//   stop(); // cancels playback; onDone is not called after a stop
import { getToken } from "@/lib/api";

// Once the server voice fails, stop asking for it until the page reloads.
let serverVoiceDown = false;

// Chrome loads its voice list lazily; ask early so it's ready for the fallback.
if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.getVoices();

// Voices that sound human, best first. Edge's "Natural" voices, Chrome's
// Google voices and Apple's Premium/Enhanced voices are far better than defaults.
const NATURAL_HINTS = [/natural/i, /neural/i, /premium/i, /enhanced/i, /^google us english$/i, /^google uk english female$/i, /samantha|ava|serena|allison|karen/i];

function bestBrowserVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
  for (const hint of NATURAL_HINTS) {
    const match = voices.find((v) => hint.test(v.name) && v.lang === "en-US") ?? voices.find((v) => hint.test(v.name));
    if (match) return match;
  }
  return voices.find((v) => v.lang === "en-US" && v.localService) ?? voices[0] ?? null;
}

function speakInBrowser(text: string, done: () => void): () => void {
  if (!("speechSynthesis" in window)) {
    done();
    return () => {};
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = bestBrowserVoice();
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? "en-US";
  // A touch slower than default reads as calmer and more conversational.
  utterance.rate = 0.95;
  utterance.onend = done;
  utterance.onerror = done;
  synth.speak(utterance);
  // Some browsers never fire onend; give up after a generous estimate.
  const timer = setTimeout(done, 3000 + text.split(/\s+/).length * 500);
  return () => {
    clearTimeout(timer);
    synth.cancel();
  };
}

export function narrate(text: string, onDone: () => void = () => {}): () => void {
  let finished = false;
  let cancelled = false;
  let stopFallback: (() => void) | null = null;
  let audio: HTMLAudioElement | null = null;
  let url: string | null = null;
  const controller = new AbortController();

  const done = () => {
    if (finished || cancelled) return;
    finished = true;
    if (url) URL.revokeObjectURL(url);
    onDone();
  };
  const fallback = () => {
    if (!cancelled && !finished) stopFallback = speakInBrowser(text, done);
  };

  if (!text.trim()) {
    done();
    return () => {};
  }

  if (serverVoiceDown) {
    fallback();
  } else {
    fetch("/api/v1/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`speech ${res.status}`);
        if (cancelled) return;
        url = URL.createObjectURL(await res.blob());
        audio = new Audio(url);
        audio.onended = done;
        audio.onerror = () => fallback();
        await audio.play();
      })
      .catch((error) => {
        if (cancelled || (error as Error).name === "AbortError") return;
        // Autoplay blocks are per-play; anything else means the service is down.
        if ((error as Error).name !== "NotAllowedError") serverVoiceDown = true;
        fallback();
      });
  }

  return () => {
    cancelled = true;
    controller.abort();
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    if (url) URL.revokeObjectURL(url);
    stopFallback?.();
  };
}
