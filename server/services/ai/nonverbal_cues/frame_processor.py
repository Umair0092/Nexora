"""
frame_processor.py
------------------
Adapts the existing detector pipeline from a webcam loop to a
per-frame callable. Instantiate once per client connection; call
process(jpeg_bytes) on each received frame.

No OpenCV window, no webcam capture — those belong in main.py only.
"""

import os
import time
from collections import deque

import cv2
import numpy as np

from detectors.face_analyzer import FaceAnalyzer
from detectors.hand_detector import HandDetector
from detectors.attention_scorer import AttentionScorer
from fusion.temporal_smoother import TemporalSmoother
from fusion.rule_engine import get_disengagement_reason
from config import FRAME_WIDTH, FRAME_HEIGHT

# The original SMOOTHING_WINDOW_FRAMES=30 is tuned for 30fps (≈1s window).
# At 1-3 fps that becomes 10-30s of lag — states never visibly change.
# 5 frames gives a ~2-5s smoothing window across 1-3fps, which is
# responsive enough for live feedback without flickering.
_WS_SMOOTH_WINDOW = 5

# Resolve model paths relative to this file so uvicorn can be started
# from any working directory.
_MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
_FACE_MODEL = os.path.join(_MODELS_DIR, "face_landmarker.task")
_HAND_MODEL = os.path.join(_MODELS_DIR, "hand_landmarker.task")


class FrameProcessor:
    """
    Stateful per-client frame processor.

    State held across frames (necessary for correct scoring):
      - AttentionScorer  : blink timestamps, blink rising-edge flag
      - TemporalSmoother : rolling score buffer, state debounce timers
      - HandDetector     : rolling wrist-position history, speed samples

    Session statistics are accumulated every frame and returned via
    get_report() when the session ends.
    """

    def __init__(self):
        self.face_analyzer = FaceAnalyzer(model_path=_FACE_MODEL)
        self.hand_detector = HandDetector(
            frame_width=FRAME_WIDTH,
            frame_height=FRAME_HEIGHT,
            model_path=_HAND_MODEL,
        )
        self.scorer = AttentionScorer()
        self.smoother = TemporalSmoother()
        # Override the frame-count-based buffer with a smaller window
        # suited for low-fps WebSocket streaming (see _WS_SMOOTH_WINDOW above)
        self.smoother.score_buffer = deque(maxlen=_WS_SMOOTH_WINDOW)

        # ── Session statistics ─────────────────────────────────────────────
        self._session_start: float = time.time()
        self._total_frames: int = 0
        self._face_frames: int = 0

        # state → frame count
        self._state_counts: dict = {
            "ATTENTIVE": 0,
            "PARTIALLY ATTENTIVE": 0,
            "DISENGAGED": 0,
        }
        # hand level → frame count (face-detected frames only)
        self._hand_counts: dict = {"calm": 0, "moderate": 0, "excessive": 0}
        # disengagement reason → count
        self._disengagement_reasons: dict = {}

        # Running totals for average
        self._score_sum: float = 0.0
        self._score_min: float = 100.0
        self._score_max: float = 0.0

        # Lightweight timeline: one entry per face-detected frame
        self._timeline: list = []

    def _record(self, result: dict) -> None:
        """Accumulate per-frame statistics for the final session report."""
        self._total_frames += 1

        if not result.get("faceDetected"):
            return

        self._face_frames += 1
        score = result.get("attentionScore", 0)
        state = result.get("attentionState", "ATTENTIVE")
        reason = result.get("reason", "")
        hand_level = result.get("handActivity", {}).get("level", "calm")
        ts = result.get("timestamp", time.time())

        # State counts
        if state in self._state_counts:
            self._state_counts[state] += 1

        # Hand counts
        if hand_level in self._hand_counts:
            self._hand_counts[hand_level] += 1

        # Disengagement reasons
        if reason:
            self._disengagement_reasons[reason] = (
                self._disengagement_reasons.get(reason, 0) + 1
            )

        # Score running stats
        self._score_sum += score
        if score < self._score_min:
            self._score_min = score
        if score > self._score_max:
            self._score_max = score

        # Timeline (capped at 1 entry per second to keep payload small)
        if not self._timeline or ts - self._timeline[-1]["t"] >= 1.0:
            self._timeline.append({
                "t": round(ts, 1),
                "state": state,
                "score": score,
                "hand": hand_level,
            })

    def process(self, jpeg_bytes: bytes) -> dict:
        """
        Decode a JPEG frame and run the full detection pipeline.

        Returns a result dict with:
          faceDetected  : bool
          attentionScore: int (0-100, smoothed)
          attentionState: str  ATTENTIVE | PARTIALLY ATTENTIVE | DISENGAGED
          reason        : str  human-readable disengagement reason (or "")
          scores        : dict individual signal scores
          handActivity  : dict level / score / avg_speed
          timestamp     : float unix time
        """
        now = time.time()

        # ── Decode JPEG → numpy RGB ───────────────────────────────────────
        nparr = np.frombuffer(jpeg_bytes, dtype=np.uint8)
        bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if bgr is None:
            return {
                "faceDetected": False,
                "reason": "decode_failed",
                "timestamp": now,
            }
        # MediaPipe requires a contiguous, writable RGB array
        rgb = np.ascontiguousarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))

        # ── Run detectors ─────────────────────────────────────────────────
        face_data = self.face_analyzer.analyze(rgb)
        hand_data = self.hand_detector.analyze(rgb, now)

        # Strip the landmarks list — not needed by the client
        hand_activity = {
            k: v for k, v in hand_data.get("activity", {}).items()
        }

        if face_data is None:
            return {
                "faceDetected": False,
                "reason": "no_face",
                "handActivity": hand_activity,
                "timestamp": now,
            }

        # ── Score and smooth ──────────────────────────────────────────────
        scores = self.scorer.update(face_data, now)
        smooth_score, state = self.smoother.update(scores["total"])

        reason = ""
        if state == "DISENGAGED":
            reason = get_disengagement_reason(scores, face_data)

        result = {
            "faceDetected": True,
            "attentionScore": smooth_score,
            "attentionState": state,
            "reason": reason,
            "scores": {
                "gaze":          scores["gaze"],
                "head_pose":     scores["head_pose"],
                "eye_open":      scores["eye_open"],
                "blink_rate":    scores["blink_rate"],
                "expression":    scores["expression"],
                "total":         scores["total"],
                "blink_rate_pm": scores.get("blink_rate_pm", 0),
            },
            "handActivity": hand_activity,
            "timestamp": now,
        }
        self._record(result)
        return result

    def get_report(self) -> dict:
        """
        Build the end-of-session summary report.
        Call this once, just before close().
        """
        duration = time.time() - self._session_start
        face_f   = self._face_frames or 1  # avoid division by zero

        def pct(n):
            return round(n / face_f * 100, 1)

        def secs(n):
            return round(n / face_f * duration, 1)

        avg_score = round(self._score_sum / face_f, 1) if self._face_frames else 0

        # State distribution
        state_dist = {}
        for s, count in self._state_counts.items():
            state_dist[s] = {
                "frames":     count,
                "percentage": pct(count),
                "seconds":    secs(count),
            }

        # Hand activity distribution
        hand_dist = {}
        for level, count in self._hand_counts.items():
            hand_dist[level] = {
                "frames":     count,
                "percentage": pct(count),
                "seconds":    secs(count),
            }

        # Disengagement reasons sorted by frequency
        reasons_sorted = sorted(
            [{"reason": r, "count": c}
             for r, c in self._disengagement_reasons.items()],
            key=lambda x: x["count"], reverse=True,
        )

        return {
            "durationSeconds":    round(duration, 1),
            "totalFrames":        self._total_frames,
            "faceDetectedFrames": self._face_frames,
            "attentionSummary": {
                "averageScore": avg_score,
                "minScore":     round(self._score_min, 1) if self._face_frames else 0,
                "maxScore":     round(self._score_max, 1) if self._face_frames else 0,
                "stateDistribution": state_dist,
            },
            "handActivitySummary":   hand_dist,
            "disengagementReasons":  reasons_sorted,
            "timeline":              self._timeline,
        }

    def close(self):
        """Release MediaPipe resources."""
        self.hand_detector.close()
