import { useCallback, useEffect, useRef, useState } from "react";

type RecorderState = "idle" | "starting" | "recording" | "error";

// Microphone-only recorder for a single answer. stop() resolves with the audio.
export function useRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    release();
  }, [release]);

  useEffect(() => {
    if (state !== "recording") return;
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [state]);

  const start = useCallback(async () => {
    setError(null);
    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data?.size) chunksRef.current.push(e.data);
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      setElapsed(0);
      setState("recording");
    } catch {
      release();
      setError("Nexora needs your microphone. Allow access in your browser's address bar, then try again.");
      setState("error");
    }
  }, [release]);

  const stop = useCallback(
    (): Promise<Blob | null> =>
      new Promise((resolve) => {
        const recorder = recorderRef.current;
        recorderRef.current = null;
        setState("idle");
        if (!recorder || recorder.state === "inactive") {
          release();
          return resolve(null);
        }
        recorder.onstop = () => {
          const blob = chunksRef.current.length ? new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }) : null;
          chunksRef.current = [];
          release();
          resolve(blob);
        };
        recorder.stop();
      }),
    [release],
  );

  return { state, error, elapsed, start, stop };
}
