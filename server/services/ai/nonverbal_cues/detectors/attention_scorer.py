import time
from collections import deque
from config import *


class AttentionScorer:
    """
    Computes all 5 signal scores and tracks blink rate with timestamps.
    """

    def __init__(self):
        self.blink_times      = deque(maxlen=100)
        self.last_blink_high  = False
        self._last_blink_time = 0.0

    def update(self, face_data: dict, now: float) -> dict:
        """
        face_data: output from FaceAnalyzer.analyze()
        Returns dict of individual scores + total.
        """
        bs    = face_data["blendshapes"]
        pitch = face_data["pitch"]
        yaw   = face_data["yaw"]
        roll  = face_data["roll"]
        ix    = face_data["iris_gaze_x"]
        iy    = face_data["iris_gaze_y"]

        self._detect_blink(bs, now)

        s_gaze  = self._score_gaze(yaw, pitch, ix, iy)
        s_pose  = self._score_head_pose(yaw, pitch)
        s_eye   = self._score_eye_openness(bs)
        s_blink = self._score_blink_rate(now)
        s_expr  = self._score_expression(bs)

        total = s_gaze + s_pose + s_eye + s_blink + s_expr

        # Compound penalty: if both gaze AND head pose are non-full,
        # the person is clearly looking away — reduce total by 35%
        if s_gaze < WEIGHT_GAZE and s_pose < WEIGHT_HEAD_POSE:
            total = int(total * 0.65)

        return {
            "gaze":        s_gaze,
            "head_pose":   s_pose,
            "eye_open":    s_eye,
            "blink_rate":  s_blink,
            "expression":  s_expr,
            "total":       total,
            "blink_rate_pm": self._blink_rate_per_min(now),
        }

    # ── Private signal scorers ───────────────────────────────────────────

    def _score_gaze(self, yaw, pitch, iris_x, iris_y) -> int:
        iris_yaw   = iris_x * 20.0
        iris_pitch = iris_y * 15.0
        fy = yaw   * 0.65 + iris_yaw   * 0.35
        fp = pitch * 0.65 + iris_pitch * 0.35

        if abs(fy) < GAZE_ATTENTIVE_YAW and abs(fp) < GAZE_ATTENTIVE_PITCH:
            return WEIGHT_GAZE
        elif abs(fy) < GAZE_PARTIAL_YAW and abs(fp) < GAZE_PARTIAL_PITCH:
            return WEIGHT_GAZE // 2
        return 0

    def _score_head_pose(self, yaw, pitch) -> int:
        if abs(yaw) < POSE_FORWARD_YAW and abs(pitch) < POSE_FORWARD_PITCH:
            return WEIGHT_HEAD_POSE
        elif abs(yaw) < POSE_PARTIAL_YAW and abs(pitch) < POSE_PARTIAL_PITCH:
            return int(WEIGHT_HEAD_POSE * 0.5)
        return 0

    def _score_eye_openness(self, bs: dict) -> int:
        blink = (bs.get("eyeBlinkLeft",  0) +
                 bs.get("eyeBlinkRight", 0)) / 2
        # openness = 1 when fully open, 0 when fully closed
        eff = max(0.0, 1.0 - blink)

        if eff > EYE_OPEN_ATTENTIVE:
            return WEIGHT_EYE_OPENNESS
        elif eff > EYE_OPEN_PARTIAL:
            return int(WEIGHT_EYE_OPENNESS * 0.5)
        return 0

    def _score_blink_rate(self, now: float) -> int:
        rate = self._blink_rate_per_min(now)
        if BLINK_NORMAL_MIN <= rate <= BLINK_NORMAL_MAX:
            return WEIGHT_BLINK_RATE
        elif BLINK_PARTIAL_MIN <= rate <= BLINK_PARTIAL_MAX:
            return int(WEIGHT_BLINK_RATE * 0.5)
        return 0

    def _score_expression(self, bs: dict) -> int:
        yawn   = bs.get("jawOpen",        0)
        smile  = (bs.get("mouthSmileLeft",  0) +
                  bs.get("mouthSmileRight", 0)) / 2
        frown  = (bs.get("mouthFrownLeft",  0) +
                  bs.get("mouthFrownRight", 0)) / 2
        brow_d = (bs.get("browDownLeft",    0) +
                  bs.get("browDownRight",   0)) / 2
        brow_u = bs.get("browInnerUp", 0)

        if yawn > EXPR_YAWN_THRESHOLD:
            return 0
        if smile > EXPR_SMILE_THRESHOLD:
            return WEIGHT_EXPRESSION                    # engaged/positive
        if brow_u > 0.3 and brow_d < 0.2:
            return int(WEIGHT_EXPRESSION * 0.8)         # curious/attentive
        if frown > EXPR_FROWN_THRESHOLD:
            return int(WEIGHT_EXPRESSION * 0.4)         # displeasure
        return int(WEIGHT_EXPRESSION * 0.7)             # neutral

    def _detect_blink(self, bs: dict, now: float):
        avg = (bs.get("eyeBlinkLeft",  0) +
               bs.get("eyeBlinkRight", 0)) / 2
        is_blink = avg > BLINK_SCORE_THRESHOLD

        # Rising edge + refractory period
        if is_blink and not self.last_blink_high:
            if now - self._last_blink_time > BLINK_REFRACTORY_SEC:
                self.blink_times.append(now)
                self._last_blink_time = now

        self.last_blink_high = is_blink

    def _blink_rate_per_min(self, now: float) -> float:
        recent = [t for t in self.blink_times
                  if now - t < BLINK_WINDOW_SEC]
        return len(recent)
