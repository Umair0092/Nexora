import math
import collections
from statistics import mean

import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# ── Thresholds ────────────────────────────────────────────────────────────────
HAND_RIGID_SPEED_THRESH    = 2.0    # px/frame → still / rigid
HAND_CHAOTIC_VAR_THRESH    = 800.0  # variance above this → chaotic
HAND_NATURAL_SPEED_LOW     = 5.0
HAND_NATURAL_SPEED_HIGH    = 100.0

HAND_ACTIVITY_WINDOW_SEC   = 5      # rolling window (seconds)
HAND_CALM_THRESH           = 40.0   # avg px/s → calm
HAND_MODERATE_THRESH       = 120.0  # avg px/s → moderate; above → excessive
HAND_EXCESSIVE_BURST_COUNT = 3      # fast-burst samples that also trigger excessive

HISTORY_LEN = 60


def _norm_dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


# ── Pure logic (no mediapipe dependency — easily testable) ────────────────────

class HandMotionAnalyzer:
    """
    Pure-Python hand movement scorer.
    No mediapipe dependency — can be unit tested without a model file.
    """

    def __init__(self, frame_width: int, frame_height: int):
        self.w = frame_width
        self.h = frame_height

        self._left_hist:  collections.deque = collections.deque(maxlen=HISTORY_LEN)
        self._right_hist: collections.deque = collections.deque(maxlen=HISTORY_LEN)
        self._samples:    collections.deque = collections.deque()
        self._last_pos:   dict              = {}

    def update(self, left_px, right_px, now: float) -> dict:
        """
        Call each frame with pixel positions (or None if hand not visible).
        Returns motion labels + activity level/score.
        """
        if left_px is not None:
            self._left_hist.append(left_px)
        if right_px is not None:
            self._right_hist.append(right_px)

        activity = self._score_activity(left_px, right_px, now)

        return {
            'left_motion':  self.motion_label(self._left_hist),
            'right_motion': self.motion_label(self._right_hist),
            'activity':     activity,
        }

    def motion_label(self, history) -> str:
        if len(history) < 3:
            return 'unknown'
        speeds    = [_norm_dist(history[i-1], history[i]) for i in range(1, len(history))]
        avg_speed = mean(speeds)
        var_speed = float(np.var(speeds)) if len(speeds) > 1 else 0.0

        if avg_speed < HAND_RIGID_SPEED_THRESH:
            return 'rigid'
        if var_speed > HAND_CHAOTIC_VAR_THRESH and avg_speed > HAND_NATURAL_SPEED_LOW:
            return 'chaotic'
        return 'natural'

    def _score_activity(self, left_px, right_px, now: float) -> dict:
        for label, pos in (('left', left_px), ('right', right_px)):
            if pos is not None:
                if label in self._last_pos:
                    self._samples.append((now, _norm_dist(self._last_pos[label], pos)))
                self._last_pos[label] = pos
            else:
                self._last_pos.pop(label, None)

        cutoff = now - HAND_ACTIVITY_WINDOW_SEC
        while self._samples and self._samples[0][0] < cutoff:
            self._samples.popleft()

        if not self._samples:
            return {'level': 'calm', 'score': 1.0, 'avg_speed': 0.0}

        speeds      = [s for _, s in self._samples]
        avg_speed   = mean(speeds)
        burst_count = sum(1 for s in speeds if s > HAND_MODERATE_THRESH)

        if avg_speed > HAND_MODERATE_THRESH or burst_count >= HAND_EXCESSIVE_BURST_COUNT:
            return {'level': 'excessive', 'score': 0.2, 'avg_speed': avg_speed}
        if avg_speed > HAND_CALM_THRESH:
            return {'level': 'moderate',  'score': 0.7, 'avg_speed': avg_speed}
        return     {'level': 'calm',      'score': 1.0, 'avg_speed': avg_speed}


# ── MediaPipe wrapper ─────────────────────────────────────────────────────────

class HandDetector:
    """
    Wraps MediaPipe HandLandmarker (Tasks API) and delegates
    scoring to HandMotionAnalyzer.
    """

    def __init__(self, frame_width: int, frame_height: int,
                 model_path: str = "models/hand_landmarker.task"):
        self.w = frame_width
        self.h = frame_height

        base_opts = python.BaseOptions(model_asset_path=model_path)
        opts = vision.HandLandmarkerOptions(
            base_options=base_opts,
            num_hands=2,
            min_hand_detection_confidence=0.5,
            min_hand_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self._detector = vision.HandLandmarker.create_from_options(opts)
        self._analyzer = HandMotionAnalyzer(frame_width, frame_height)

    def analyze(self, rgb_frame, now: float) -> dict:
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
        result = self._detector.detect(mp_img)

        left_px = right_px = None
        landmarks_for_draw = []

        if result.hand_landmarks and result.handedness:
            for hand_lms, handedness in zip(result.hand_landmarks, result.handedness):
                wrist = hand_lms[0]
                pos   = (wrist.x * self.w, wrist.y * self.h)
                label = handedness[0].category_name   # 'Left' or 'Right'
                if label == 'Left':
                    left_px = pos
                else:
                    right_px = pos
                landmarks_for_draw.append(hand_lms)

        motion = self._analyzer.update(left_px, right_px, now)
        motion['landmarks'] = landmarks_for_draw
        return motion

    def close(self):
        self._detector.close()
