import cv2
import numpy as np
from fusion.rule_engine import STATE_COLORS
from config import *

_ACTIVITY_COLORS = {
    'calm':      (100, 200, 60),
    'moderate':  (0,   165, 255),
    'excessive': (60,   60, 220),
}


class HUDOverlay:
    """Draws all on-screen information onto the frame."""

    def draw(self, frame: np.ndarray, smooth_score: int,
             state: str, scores: dict,
             seconds_in_state: float, reason: str = "",
             hand_activity: dict = None) -> np.ndarray:

        h, w = frame.shape[:2]
        color = STATE_COLORS.get(state, (200, 200, 200))

        # ── Top banner ────────────────────────────────────────────────
        cv2.rectangle(frame, (0, 0), (w, 52), (15, 15, 15), -1)
        cv2.putText(frame, state, (12, 36),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, color, 2)
        cv2.putText(frame, f"{seconds_in_state:.1f}s", (w - 80, 36),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (160, 160, 160), 1)
        if reason:
            cv2.putText(frame, reason, (12, 50),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.38,
                        (160, 160, 160), 1)

        # ── Score ring (top right) ────────────────────────────────────
        cx, cy, r = w - 55, 95, 38
        cv2.circle(frame, (cx, cy), r, (30, 30, 30), -1)
        angle = int(360 * smooth_score / 100)
        for a in range(angle):
            rad = np.radians(a - 90)
            x   = int(cx + r * np.cos(rad))
            y   = int(cy + r * np.sin(rad))
            cv2.circle(frame, (x, y), 2, color, -1)
        cv2.putText(frame, str(smooth_score),
                    (cx - (20 if smooth_score >= 100 else 14), cy + 6),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.75, color, 2)
        cv2.putText(frame, "/100", (cx - 16, cy + 18),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.32, (130, 130, 130), 1)

        # ── Signal bars (bottom left) ─────────────────────────────────
        bar_items = [
            ("Gaze",  scores["gaze"],       WEIGHT_GAZE),
            ("Pose",  scores["head_pose"],   WEIGHT_HEAD_POSE),
            ("Eyes",  scores["eye_open"],    WEIGHT_EYE_OPENNESS),
            ("Blink", scores["blink_rate"],  WEIGHT_BLINK_RATE),
            ("Expr",  scores["expression"],  WEIGHT_EXPRESSION),
        ]
        for i, (label, val, max_val) in enumerate(bar_items):
            y0    = h - 165 + i * 26
            ratio = val / max_val if max_val else 0
            bar_color = (100, 200, 60)  if ratio > 0.6 else \
                        (0,   165, 255) if ratio > 0.3 else \
                        (60,   60, 220)
            cv2.rectangle(frame, (10, y0),      (160, y0 + 14), (35, 35, 35), -1)
            cv2.rectangle(frame, (10, y0),
                          (10 + int(150 * ratio), y0 + 14), bar_color, -1)
            cv2.putText(frame, f"{label} {val}/{max_val}",
                        (166, y0 + 11),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.38, (190, 190, 190), 1)

        # ── Hand activity bar ─────────────────────────────────────────
        if hand_activity:
            level     = hand_activity.get('level', 'calm')
            avg_speed = hand_activity.get('avg_speed', 0.0)
            act_color = _ACTIVITY_COLORS.get(level, (100, 200, 60))
            act_ratio = min(1.0, avg_speed / 240.0)   # 240 px/s = full bar

            y_bar = h - 38
            cv2.rectangle(frame, (10, y_bar), (160, y_bar + 14), (35, 35, 35), -1)
            cv2.rectangle(frame, (10, y_bar),
                          (10 + int(150 * act_ratio), y_bar + 14), act_color, -1)
            cv2.putText(frame, f"Hands {level}  {avg_speed:.0f}px/s",
                        (166, y_bar + 11),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.38, act_color, 1)

        # ── Blink rate badge ──────────────────────────────────────────
        blink_rpm = scores.get("blink_rate_pm", 0)
        cv2.putText(frame, f"Blinks/min: {blink_rpm:.0f}",
                    (10, h - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.40, (130, 130, 130), 1)

        return frame
