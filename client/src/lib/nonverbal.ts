// Camera-based presence analysis, run entirely in the browser with MediaPipe.
// Video never leaves the device: only the end-of-interview summary is sent with
// the report. Ported from the former Python nonverbal service, with the same
// thresholds, scoring and summary shape.
//
//   const analyzer = await startNonverbal(videoElement, (reading) => setAttention(reading));
//   const summary = analyzer.finish(); // { attentionSummary, handActivitySummary, ... } or null
//
// Frames are skipped while the camera track is disabled (camera off or paused).

// ── Thresholds (degrees, blendshape scores 0–1, blinks per minute) ──────────

const GAZE_ATTENTIVE_YAW = 12;
const GAZE_ATTENTIVE_PITCH = 10;
const GAZE_PARTIAL_YAW = 22;
const GAZE_PARTIAL_PITCH = 18;
const POSE_FORWARD_YAW = 12;
const POSE_FORWARD_PITCH = 10;
const POSE_PARTIAL_YAW = 25;
const POSE_PARTIAL_PITCH = 20;
const HEAD_DOWN_PITCH = 20;
const BLINK_NORMAL = [10, 20] as const;
const BLINK_PARTIAL = [5, 30] as const;
const BLINK_SCORE_THRESHOLD = 0.5;
const BLINK_REFRACTORY_SEC = 0.15;
const BLINK_WINDOW_SEC = 60;
const EYE_OPEN_ATTENTIVE = 0.6;
const EYE_OPEN_PARTIAL = 0.3;
const EXPR_SMILE = 0.3;
const EXPR_FROWN = 0.4;
const EXPR_YAWN = 0.5;

// Score weights (sum to 100) and attention bands.
const WEIGHT_GAZE = 25;
const WEIGHT_HEAD_POSE = 20;
const WEIGHT_EYE_OPENNESS = 25;
const WEIGHT_BLINK_RATE = 15;
const WEIGHT_EXPRESSION = 15;
const ATTENTIVE_THRESHOLD = 75;
const PARTIAL_THRESHOLD = 55;

// At ~2 frames a second, 5 frames smooths over a few seconds without lagging.
const SMOOTH_WINDOW = 5;
const DISENGAGE_CONFIRM_SEC = 2;
const STATE_CHANGE_DEBOUNCE_SEC = 0.5;
const FRAME_INTERVAL_MS = 500;

// Hand motion, in pixels of a 640×480 frame.
const FRAME_WIDTH = 640;
const FRAME_HEIGHT = 480;
const HAND_WINDOW_SEC = 5;
const HAND_CALM = 40;
const HAND_MODERATE = 120;
const HAND_BURST_COUNT = 3;

export type AttentionState = "ATTENTIVE" | "PARTIALLY ATTENTIVE" | "DISENGAGED";
type HandLevel = "calm" | "moderate" | "excessive";

export interface AttentionReading {
  score: number | null;
  state: AttentionState | null;
  faceDetected: boolean;
}

export interface FaceSignals {
  blendshapes: Record<string, number>;
  pitch: number;
  yaw: number;
  irisX: number;
  irisY: number;
}

interface SignalScores {
  gaze: number;
  headPose: number;
  eyeOpen: number;
  blinkRate: number;
  expression: number;
  total: number;
}

type Distribution<K extends string> = Record<K, { frames: number; percentage: number; seconds: number }>;

// The summary sent with the report (Rails reads attentionSummary,
// handActivitySummary and disengagementReasons).
export interface NonverbalSummary {
  durationSeconds: number;
  totalFrames: number;
  faceDetectedFrames: number;
  attentionSummary: {
    averageScore: number;
    minScore: number;
    maxScore: number;
    stateDistribution: Distribution<AttentionState>;
  };
  handActivitySummary: Distribution<HandLevel>;
  disengagementReasons: { reason: string; count: number }[];
}

const avg = (a: number, b: number) => (a + b) / 2;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

// ── Pure scoring (no MediaPipe; unit-testable) ──────────────────────────────

/** Scores one frame's face signals; keeps blink history between frames. */
export class AttentionScorer {
  private blinkTimes: number[] = [];
  private blinkHigh = false;
  private lastBlink = 0;

  update(face: FaceSignals, now: number): SignalScores {
    const bs = face.blendshapes;
    this.detectBlink(bs, now);

    const gaze = this.scoreGaze(face);
    const headPose = this.scoreHeadPose(face.yaw, face.pitch);
    const eyeOpen = this.scoreEyeOpenness(bs);
    const blinkRate = this.scoreBlinkRate(now);
    const expression = this.scoreExpression(bs);

    let total = gaze + headPose + eyeOpen + blinkRate + expression;
    // Both gaze and head turned away: clearly looking elsewhere.
    if (gaze < WEIGHT_GAZE && headPose < WEIGHT_HEAD_POSE) total = Math.trunc(total * 0.65);
    return { gaze, headPose, eyeOpen, blinkRate, expression, total };
  }

  private scoreGaze({ yaw, pitch, irisX, irisY }: FaceSignals) {
    // Head pose 65%, iris offset 35% (iris offset scaled to rough degrees).
    const fy = yaw * 0.65 + irisX * 20 * 0.35;
    const fp = pitch * 0.65 + irisY * 15 * 0.35;
    if (Math.abs(fy) < GAZE_ATTENTIVE_YAW && Math.abs(fp) < GAZE_ATTENTIVE_PITCH) return WEIGHT_GAZE;
    if (Math.abs(fy) < GAZE_PARTIAL_YAW && Math.abs(fp) < GAZE_PARTIAL_PITCH) return Math.floor(WEIGHT_GAZE / 2);
    return 0;
  }

  private scoreHeadPose(yaw: number, pitch: number) {
    if (Math.abs(yaw) < POSE_FORWARD_YAW && Math.abs(pitch) < POSE_FORWARD_PITCH) return WEIGHT_HEAD_POSE;
    if (Math.abs(yaw) < POSE_PARTIAL_YAW && Math.abs(pitch) < POSE_PARTIAL_PITCH) return Math.trunc(WEIGHT_HEAD_POSE * 0.5);
    return 0;
  }

  private scoreEyeOpenness(bs: Record<string, number>) {
    const openness = Math.max(0, 1 - avg(bs.eyeBlinkLeft ?? 0, bs.eyeBlinkRight ?? 0));
    if (openness > EYE_OPEN_ATTENTIVE) return WEIGHT_EYE_OPENNESS;
    if (openness > EYE_OPEN_PARTIAL) return Math.trunc(WEIGHT_EYE_OPENNESS * 0.5);
    return 0;
  }

  private scoreBlinkRate(now: number) {
    const rate = this.blinksPerMinute(now);
    if (rate >= BLINK_NORMAL[0] && rate <= BLINK_NORMAL[1]) return WEIGHT_BLINK_RATE;
    if (rate >= BLINK_PARTIAL[0] && rate <= BLINK_PARTIAL[1]) return Math.trunc(WEIGHT_BLINK_RATE * 0.5);
    return 0;
  }

  private scoreExpression(bs: Record<string, number>) {
    const smile = avg(bs.mouthSmileLeft ?? 0, bs.mouthSmileRight ?? 0);
    const frown = avg(bs.mouthFrownLeft ?? 0, bs.mouthFrownRight ?? 0);
    const browDown = avg(bs.browDownLeft ?? 0, bs.browDownRight ?? 0);
    if ((bs.jawOpen ?? 0) > EXPR_YAWN) return 0;
    if (smile > EXPR_SMILE) return WEIGHT_EXPRESSION;
    if ((bs.browInnerUp ?? 0) > 0.3 && browDown < 0.2) return Math.trunc(WEIGHT_EXPRESSION * 0.8);
    if (frown > EXPR_FROWN) return Math.trunc(WEIGHT_EXPRESSION * 0.4);
    return Math.trunc(WEIGHT_EXPRESSION * 0.7);
  }

  private detectBlink(bs: Record<string, number>, now: number) {
    const isBlink = avg(bs.eyeBlinkLeft ?? 0, bs.eyeBlinkRight ?? 0) > BLINK_SCORE_THRESHOLD;
    if (isBlink && !this.blinkHigh && now - this.lastBlink > BLINK_REFRACTORY_SEC) {
      this.blinkTimes.push(now);
      if (this.blinkTimes.length > 100) this.blinkTimes.shift();
      this.lastBlink = now;
    }
    this.blinkHigh = isBlink;
  }

  private blinksPerMinute(now: number) {
    return this.blinkTimes.filter((t) => now - t < BLINK_WINDOW_SEC).length;
  }
}

/** Rolling mean of the score, with debounced state changes. */
export class TemporalSmoother {
  private buffer: number[] = [];
  private state: AttentionState = "ATTENTIVE";
  private lastChange = 0;
  private disengagedSince: number | null = null;

  update(raw: number, now: number): [number, AttentionState] {
    this.buffer.push(raw);
    if (this.buffer.length > SMOOTH_WINDOW) this.buffer.shift();
    const smooth = Math.trunc(mean(this.buffer));

    let candidate: AttentionState;
    if (smooth >= ATTENTIVE_THRESHOLD) {
      candidate = "ATTENTIVE";
      this.disengagedSince = null;
    } else if (smooth >= PARTIAL_THRESHOLD) {
      candidate = "PARTIALLY ATTENTIVE";
      this.disengagedSince = null;
    } else {
      // Only call it disengaged once it has lasted a couple of seconds.
      this.disengagedSince ??= now;
      candidate = now - this.disengagedSince >= DISENGAGE_CONFIRM_SEC ? "DISENGAGED" : this.state;
    }

    if (candidate !== this.state && now - this.lastChange >= STATE_CHANGE_DEBOUNCE_SEC) {
      this.state = candidate;
      this.lastChange = now;
    }
    return [smooth, this.state];
  }
}

/** How busy the hands are, from wrist movement between frames. */
export class HandMotion {
  private samples: { t: number; speed: number }[] = [];
  private last: Partial<Record<"left" | "right", [number, number]>> = {};

  update(positions: Partial<Record<"left" | "right", [number, number]>>, now: number): HandLevel {
    (["left", "right"] as const).forEach((side) => {
      const pos = positions[side];
      const prev = this.last[side];
      if (pos) {
        if (prev) this.samples.push({ t: now, speed: Math.hypot(pos[0] - prev[0], pos[1] - prev[1]) });
        this.last[side] = pos;
      } else {
        delete this.last[side];
      }
    });

    this.samples = this.samples.filter((s) => s.t >= now - HAND_WINDOW_SEC);
    if (!this.samples.length) return "calm";
    const speeds = this.samples.map((s) => s.speed);
    const average = mean(speeds);
    const bursts = speeds.filter((s) => s > HAND_MODERATE).length;
    if (average > HAND_MODERATE || bursts >= HAND_BURST_COUNT) return "excessive";
    if (average > HAND_CALM) return "moderate";
    return "calm";
  }
}

export function disengagementReason(scores: SignalScores, face: FaceSignals): string {
  if (scores.gaze === 0 && scores.headPose === 0) {
    return face.pitch > HEAD_DOWN_PITCH ? "looking down (phone?)" : "looking away";
  }
  if (scores.eyeOpen === 0) return "eyes closed / drowsy";
  if ((face.blendshapes.jawOpen ?? 0) > EXPR_YAWN) return "yawning";
  if (scores.blinkRate === 0) return "abnormal blink rate";
  return "multiple weak signals";
}

/** Combines the scorers per frame and builds the end-of-interview summary. */
export class NonverbalSession {
  private scorer = new AttentionScorer();
  private smoother = new TemporalSmoother();
  private hands = new HandMotion();
  private startedAt: number;
  private totalFrames = 0;
  private faceFrames = 0;
  private states: Record<AttentionState, number> = { ATTENTIVE: 0, "PARTIALLY ATTENTIVE": 0, DISENGAGED: 0 };
  private handLevels: Record<HandLevel, number> = { calm: 0, moderate: 0, excessive: 0 };
  private reasons: Record<string, number> = {};
  private scoreSum = 0;
  private scoreMin = 100;
  private scoreMax = 0;

  constructor(now: number) {
    this.startedAt = now;
  }

  /** `face` is null when no face was found. Times are in seconds. */
  frame(face: FaceSignals | null, hands: Partial<Record<"left" | "right", [number, number]>>, now: number): AttentionReading {
    this.totalFrames += 1;
    const handLevel = this.hands.update(hands, now);
    if (!face) return { score: null, state: "DISENGAGED", faceDetected: false };

    const scores = this.scorer.update(face, now);
    const [score, state] = this.smoother.update(scores.total, now);
    this.faceFrames += 1;
    this.states[state] += 1;
    this.handLevels[handLevel] += 1;
    if (state === "DISENGAGED") {
      const reason = disengagementReason(scores, face);
      this.reasons[reason] = (this.reasons[reason] ?? 0) + 1;
    }
    this.scoreSum += score;
    this.scoreMin = Math.min(this.scoreMin, score);
    this.scoreMax = Math.max(this.scoreMax, score);
    return { score, state, faceDetected: true };
  }

  /** null when the face was never seen, so the report says "not analysed" rather than 0. */
  summary(now: number): NonverbalSummary | null {
    if (!this.faceFrames) return null;
    const duration = now - this.startedAt;
    const round1 = (n: number) => Math.round(n * 10) / 10;
    const distribution = <K extends string>(counts: Record<K, number>) =>
      Object.fromEntries(
        Object.entries<number>(counts).map(([k, n]) => [
          k,
          { frames: n, percentage: round1((n / this.faceFrames) * 100), seconds: round1((n / this.faceFrames) * duration) },
        ]),
      ) as Distribution<K>;

    return {
      durationSeconds: round1(duration),
      totalFrames: this.totalFrames,
      faceDetectedFrames: this.faceFrames,
      attentionSummary: {
        averageScore: round1(this.scoreSum / this.faceFrames),
        minScore: round1(this.scoreMin),
        maxScore: round1(this.scoreMax),
        stateDistribution: distribution(this.states),
      },
      handActivitySummary: distribution(this.handLevels),
      disengagementReasons: Object.entries(this.reasons)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
    };
  }
}

// ── MediaPipe ───────────────────────────────────────────────────────────────

const degrees = (rad: number) => (rad * 180) / Math.PI;

type Landmark = { x: number; y: number };

// Iris offset within the left eye socket, each axis in [-1, 1].
function irisGaze(landmarks: Landmark[]): [number, number] {
  const outer = landmarks[33];
  const inner = landmarks[133];
  const iris = landmarks[468];
  if (!outer || !inner || !iris) return [0, 0];
  const width = Math.abs(inner.x - outer.x) + 1e-6;
  const x = (iris.x - (inner.x + outer.x) / 2) / width;
  const y = (iris.y - (inner.y + outer.y) / 2) / width;
  return [clamp(x * 2, -1, 1), clamp(y * 2, -1, 1)];
}

export interface NonverbalAnalyzer {
  finish(): NonverbalSummary | null;
}

/**
 * Loads the models (served from /models, WebAssembly bundled by Vite) and
 * analyses `video` about twice a second until finish(). Rejects if MediaPipe
 * can't start, e.g. without WebAssembly support.
 */
export async function startNonverbal(
  video: HTMLVideoElement,
  onReading: (reading: AttentionReading) => void,
): Promise<NonverbalAnalyzer> {
  const [{ FaceLandmarker, HandLandmarker }, { default: wasmLoaderPath }, { default: wasmBinaryPath }] = await Promise.all([
    import("@mediapipe/tasks-vision"),
    import("@mediapipe/tasks-vision/vision_wasm_internal.js?url"),
    import("@mediapipe/tasks-vision/vision_wasm_internal.wasm?url"),
  ]);
  const fileset = { wasmLoaderPath, wasmBinaryPath };
  const [face, hand] = await Promise.all([
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: "/models/face_landmarker.task", delegate: "CPU" },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    }),
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: "/models/hand_landmarker.task", delegate: "CPU" },
      runningMode: "VIDEO",
      numHands: 2,
    }),
  ]);

  const seconds = () => performance.now() / 1000;
  const session = new NonverbalSession(seconds());
  let lastTimestamp = 0;

  const tick = () => {
    // Pausing or turning the camera off disables the track: skip those frames.
    const track = (video.srcObject as MediaStream | null)?.getVideoTracks()[0];
    if (!track?.enabled || video.readyState < 2 || !video.videoWidth) return;
    // MediaPipe needs strictly increasing timestamps.
    const ts = Math.max(performance.now(), lastTimestamp + 1);
    lastTimestamp = ts;
    try {
      const faces = face.detectForVideo(video, ts);
      const hands = hand.detectForVideo(video, ts);

      let signals: FaceSignals | null = null;
      const landmarks = faces.faceLandmarks[0];
      if (landmarks) {
        const blendshapes: Record<string, number> = {};
        faces.faceBlendshapes[0]?.categories.forEach((c) => (blendshapes[c.categoryName] = c.score));
        // Head pose from the 4×4 transform, read row-major as the Python service did.
        const m = faces.facialTransformationMatrixes[0]?.data;
        const at = (r: number, c: number) => (m ? m[r * 4 + c] : 0);
        const [irisX, irisY] = irisGaze(landmarks);
        signals = {
          blendshapes,
          pitch: m ? degrees(Math.asin(clamp(-at(2, 1), -1, 1))) : 0,
          yaw: m ? degrees(Math.atan2(at(2, 0), at(2, 2))) : 0,
          irisX,
          irisY,
        };
      }

      const wrists: Partial<Record<"left" | "right", [number, number]>> = {};
      hands.landmarks.forEach((points, i) => {
        const side = hands.handedness[i]?.[0]?.categoryName === "Left" ? "left" : "right";
        wrists[side] = [points[0].x * FRAME_WIDTH, points[0].y * FRAME_HEIGHT];
      });

      onReading(session.frame(signals, wrists, seconds()));
    } catch (error) {
      console.warn("Camera analysis skipped a frame", error);
    }
  };

  const timer = setInterval(tick, FRAME_INTERVAL_MS);
  let finished = false;

  return {
    finish() {
      if (finished) return null;
      finished = true;
      clearInterval(timer);
      const summary = session.summary(seconds());
      face.close();
      hand.close();
      return summary;
    },
  };
}
