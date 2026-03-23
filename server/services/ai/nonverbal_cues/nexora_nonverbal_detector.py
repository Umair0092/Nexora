"""
nexora_nonverbal_detector.py

Real-time nonverbal cue detector with interview hand-movement scoring.

Features:
- Captures webcam feed with OpenCV
- Uses MediaPipe Pose, Hands, FaceMesh to extract keypoints
- Detects body posture, leaning, gestures, and head movements
- Scores hand movement intensity for interview feedback

Requirements:
pip install mediapipe opencv-python numpy

Run:
python nexora_nonverbal_detector.py
"""

import time
import collections
import math
from statistics import mean

import cv2
import numpy as np
import mediapipe as mp

# ------------------------- CONFIG -------------------------
CAMERA_ID = 0
FRAME_WIDTH = 1280
FRAME_HEIGHT = 720

SAMPLE_FPS = 30

# Pose thresholds (normalized coordinates)
SLOUCH_HEAD_DROP_THRESHOLD = 0.06
LEAN_Z_FORWARD_THRESHOLD = 0.08
LEAN_Z_BACK_THRESHOLD = -0.08

# Arms-crossed detection threshold (normalized distance)
ARMS_CROSSED_DIST_THRESHOLD = 0.15

# Hand movement thresholds (pixels/frame at 30fps)
HAND_RIGID_SPEED_THRESH = 2.0
HAND_CHAOTIC_VAR_THRESH = 800.0
HAND_NATURAL_SPEED_LOW = 5.0
HAND_NATURAL_SPEED_HIGH = 100.0

# Hand movement interview scoring (pixels/second, averaged over rolling window)
HAND_ACTIVITY_WINDOW_SEC   = 5       # rolling window for activity scoring
HAND_CALM_THRESH           = 40.0    # avg px/s → calm
HAND_MODERATE_THRESH       = 120.0   # avg px/s → moderate; above → excessive
HAND_EXCESSIVE_BURST_COUNT = 3       # number of "excessive" samples in window to trigger alert

# Head nod / shake thresholds (normalized movement per frame)
NOD_Y_THRESHOLD = 0.01
SHAKE_X_THRESHOLD = 0.01
NOD_COUNT_WINDOW = 30
SHAKE_COUNT_WINDOW = 30
TILT_ANGLE_THRESHOLD_DEG = 12

# Smoothing history lengths
HISTORY_LEN = 60

# ----------------------- HELPERS --------------------------

mp_drawing = mp.solutions.drawing_utils
mp_pose = mp.solutions.pose
mp_hands = mp.solutions.hands
mp_face = mp.solutions.face_mesh


def norm_dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def vec(a, b):
    return (b[0] - a[0], b[1] - a[1])


def angle_between(v1, v2):
    dot = v1[0] * v2[0] + v1[1] * v2[1]
    mag1 = math.hypot(v1[0], v1[1])
    mag2 = math.hypot(v2[0], v2[1])
    if mag1 == 0 or mag2 == 0:
        return 0.0
    cos = max(-1.0, min(1.0, dot / (mag1 * mag2)))
    return math.degrees(math.acos(cos))


# -------------------- HAND ACTIVITY SCORER ----------------

class HandActivityScorer:
    """
    Tracks hand movement speed over a rolling time window and produces
    an interview-relevant activity level: calm / moderate / excessive.
    """

    def __init__(self, window_sec: float = HAND_ACTIVITY_WINDOW_SEC,
                 frame_width: int = FRAME_WIDTH, frame_height: int = FRAME_HEIGHT):
        self.window_sec = window_sec
        self.w = frame_width
        self.h = frame_height
        # Each entry: (timestamp, speed_px_per_frame)
        self._samples: collections.deque = collections.deque()
        self._last_pos: dict[str, tuple] = {}   # 'left' / 'right' → (x, y)

    def update(self, left_pos, right_pos, now: float):
        """
        Call once per frame with pixel positions (or None if hand not visible).
        Returns dict with activity level and score.
        """
        for label, pos in (('left', left_pos), ('right', right_pos)):
            if pos is not None:
                if label in self._last_pos:
                    speed = norm_dist(self._last_pos[label], pos)
                    self._samples.append((now, speed))
                self._last_pos[label] = pos
            else:
                self._last_pos.pop(label, None)

        # Prune old samples
        cutoff = now - self.window_sec
        while self._samples and self._samples[0][0] < cutoff:
            self._samples.popleft()

        if not self._samples:
            return {'level': 'calm', 'score': 1.0, 'avg_speed': 0.0, 'burst_count': 0}

        speeds = [s for _, s in self._samples]
        avg_speed = mean(speeds)
        burst_count = sum(1 for s in speeds if s > HAND_MODERATE_THRESH)

        if avg_speed > HAND_MODERATE_THRESH or burst_count >= HAND_EXCESSIVE_BURST_COUNT:
            level = 'excessive'
            score = 0.2
        elif avg_speed > HAND_CALM_THRESH:
            level = 'moderate'
            score = 0.7
        else:
            level = 'calm'
            score = 1.0

        return {
            'level': level,
            'score': score,
            'avg_speed': avg_speed,
            'burst_count': burst_count,
        }


# -------------------- DETECTION LOGIC ---------------------

class NonverbalDetector:
    def __init__(self, width, height):
        self.w = width
        self.h = height

        self.shoulder_mid_history = collections.deque(maxlen=HISTORY_LEN)
        self.hip_mid_history = collections.deque(maxlen=HISTORY_LEN)
        self.head_history = collections.deque(maxlen=HISTORY_LEN)

        self.left_wrist_history = collections.deque(maxlen=HISTORY_LEN)
        self.right_wrist_history = collections.deque(maxlen=HISTORY_LEN)

        self.nod_directions = collections.deque(maxlen=NOD_COUNT_WINDOW)
        self.shake_directions = collections.deque(maxlen=SHAKE_COUNT_WINDOW)

        self.last_nose = None

        self.hand_scorer = HandActivityScorer(frame_width=width, frame_height=height)

    def process(self, pose_landmarks, face_landmarks, hands_landmarks, now: float):
        result = {
            'posture': None,
            'lean': 'neutral',
            'arms_crossed': False,
            'left_hand_motion': 'unknown',
            'right_hand_motion': 'unknown',
            'head_nod': False,
            'head_shake': False,
            'head_tilt': False,
            'hand_activity': {'level': 'calm', 'score': 1.0, 'avg_speed': 0.0, 'burst_count': 0},
            'scores': {}
        }

        pose = None
        if pose_landmarks:
            pose = {i: (lm.x, lm.y, lm.z) for i, lm in enumerate(pose_landmarks.landmark)}

        face = None
        if face_landmarks:
            face = {i: (lm.x, lm.y, lm.z) for i, lm in enumerate(face_landmarks.landmark)}

        # ---------------- Body posture ----------------
        if pose:
            left_sh = pose.get(11)
            right_sh = pose.get(12)
            left_hip = pose.get(23)
            right_hip = pose.get(24)
            left_ear = pose.get(7)
            right_ear = pose.get(8)

            if left_sh and right_sh and left_hip and right_hip:
                shoulder_mid = ((left_sh[0] + right_sh[0]) / 2.0,
                                (left_sh[1] + right_sh[1]) / 2.0,
                                (left_sh[2] + right_sh[2]) / 2.0)
                hip_mid = ((left_hip[0] + right_hip[0]) / 2.0,
                           (left_hip[1] + right_hip[1]) / 2.0,
                           (left_hip[2] + right_hip[2]) / 2.0)

                self.shoulder_mid_history.append(shoulder_mid)
                self.hip_mid_history.append(hip_mid)

                if left_ear and right_ear:
                    ear_y = (left_ear[1] + right_ear[1]) / 2.0
                    shoulder_y = (left_sh[1] + right_sh[1]) / 2.0
                    head_drop = ear_y - shoulder_y
                    result['posture'] = 'slouched' if head_drop > SLOUCH_HEAD_DROP_THRESHOLD else 'upright'

                delta_z = shoulder_mid[2] - hip_mid[2]
                if delta_z > LEAN_Z_FORWARD_THRESHOLD:
                    result['lean'] = 'forward'
                elif delta_z < LEAN_Z_BACK_THRESHOLD:
                    result['lean'] = 'back'
                else:
                    result['lean'] = 'neutral'

            lw = pose.get(15)
            rw = pose.get(16)
            le = pose.get(13)
            re = pose.get(14)

            if lw and rw and le and re:
                leftw  = (lw[0], lw[1])
                rightw = (rw[0], rw[1])
                leftel = (le[0], le[1])
                rightel = (re[0], re[1])

                if (norm_dist(leftw, rightel) < ARMS_CROSSED_DIST_THRESHOLD and
                        norm_dist(rightw, leftel) < ARMS_CROSSED_DIST_THRESHOLD):
                    result['arms_crossed'] = True

        # ---------------- Hand gesture motion ----------------
        left_pos_px = None
        right_pos_px = None

        if hands_landmarks:
            for hand_landmarks, handedness in hands_landmarks:
                wrist_lm = hand_landmarks.landmark[0]
                pos = (wrist_lm.x * self.w, wrist_lm.y * self.h)
                label = handedness.classification[0].label
                if label == 'Left':
                    self.left_wrist_history.append(pos)
                    left_pos_px = pos
                else:
                    self.right_wrist_history.append(pos)
                    right_pos_px = pos

        result['left_hand_motion']  = self._evaluate_hand_motion(self.left_wrist_history)
        result['right_hand_motion'] = self._evaluate_hand_motion(self.right_wrist_history)

        # ---------------- Hand activity scoring ----------------
        result['hand_activity'] = self.hand_scorer.update(left_pos_px, right_pos_px, now)

        # ---------------- Head movements ----------------
        nose_point = None
        if face and 4 in face:
            nose_point = face[4]
        elif pose and 0 in pose:
            nose_point = pose[0]

        if nose_point:
            cur = (nose_point[0], nose_point[1])
            self.head_history.append(cur)

            if self.last_nose is not None:
                dx = cur[0] - self.last_nose[0]
                dy = cur[1] - self.last_nose[1]

                if abs(dy) > NOD_Y_THRESHOLD:
                    self.nod_directions.append(1 if dy > 0 else -1)
                if abs(dx) > SHAKE_X_THRESHOLD:
                    self.shake_directions.append(1 if dx > 0 else -1)

            if len(self.nod_directions) >= 4:
                changes = sum(1 for i in range(1, len(self.nod_directions))
                              if self.nod_directions[i] != self.nod_directions[i - 1])
                if changes >= 2:
                    result['head_nod'] = True

            if len(self.shake_directions) >= 4:
                changes = sum(1 for i in range(1, len(self.shake_directions))
                              if self.shake_directions[i] != self.shake_directions[i - 1])
                if changes >= 2:
                    result['head_shake'] = True

            if self.shoulder_mid_history:
                shoulder_mid = self.shoulder_mid_history[-1]
                v = (cur[0] - shoulder_mid[0], cur[1] - shoulder_mid[1])
                if angle_between(v, (0.0, 1.0)) > TILT_ANGLE_THRESHOLD_DEG:
                    result['head_tilt'] = True

            self.last_nose = cur

        # ---------------- Composite score ----------------
        score_posture = 1.0 if result.get('posture') == 'upright' else 0.3
        score_arms    = 0.5 if result.get('arms_crossed') else 1.0

        def hand_motion_score(kind):
            return {'rigid': 0.4, 'chaotic': 0.3, 'natural': 1.0}.get(kind, 0.7)

        score_lh       = hand_motion_score(result['left_hand_motion'])
        score_rh       = hand_motion_score(result['right_hand_motion'])
        score_activity = result['hand_activity']['score']  # calm=1.0, moderate=0.7, excessive=0.2

        # Combine per-hand motion quality with overall activity level
        score_hands = ((score_lh + score_rh) / 2.0) * score_activity

        score_head = 1.0
        if result['head_shake']:
            score_head = 0.5
        if result['head_tilt']:
            score_head = 0.7

        weights = {'posture': 0.25, 'arms': 0.10, 'hands': 0.30, 'head': 0.35}
        composite = (
            score_posture * weights['posture'] +
            score_arms    * weights['arms']    +
            score_hands   * weights['hands']   +
            score_head    * weights['head']
        )

        result['scores'] = {
            'score_posture':  score_posture,
            'score_arms':     score_arms,
            'score_lh':       score_lh,
            'score_rh':       score_rh,
            'score_activity': score_activity,
            'score_hands':    score_hands,
            'score_head':     score_head,
            'composite':      composite,
        }

        return result

    def _evaluate_hand_motion(self, history):
        if not history or len(history) < 3:
            return 'unknown'
        speeds = [norm_dist(history[i - 1], history[i]) for i in range(1, len(history))]
        avg_speed = mean(speeds)
        var_speed = float(np.var(speeds)) if len(speeds) > 1 else 0.0

        if avg_speed < HAND_RIGID_SPEED_THRESH:
            return 'rigid'
        if var_speed > HAND_CHAOTIC_VAR_THRESH and avg_speed > HAND_NATURAL_SPEED_LOW:
            return 'chaotic'
        return 'natural'


# -------------------- OVERLAY DRAWING ---------------------

_ACTIVITY_COLORS = {
    'calm':      (0, 200, 80),
    'moderate':  (0, 165, 255),
    'excessive': (60, 60, 220),
}


def _draw_bar(frame, x, y, w, h, ratio, color, bg=(50, 50, 50)):
    cv2.rectangle(frame, (x, y), (x + w, y + h), bg, -1)
    filled = int(w * max(0.0, min(1.0, ratio)))
    if filled > 0:
        cv2.rectangle(frame, (x, y), (x + filled, y + h), color, -1)


def draw_overlay(frame, det_result):
    scores  = det_result.get('scores', {})
    ha      = det_result.get('hand_activity', {})
    level   = ha.get('level', 'calm')
    avg_spd = ha.get('avg_speed', 0.0)
    comp    = scores.get('composite', 0.0)

    # Background panel
    cv2.rectangle(frame, (5, 5), (420, 260), (0, 0, 0), -1)

    font  = cv2.FONT_HERSHEY_SIMPLEX
    white = (255, 255, 255)

    cv2.putText(frame, f"Posture: {det_result.get('posture')}",         (12, 28),  font, 0.65, white, 2)
    cv2.putText(frame, f"Lean:    {det_result.get('lean')}",            (12, 53),  font, 0.65, white, 2)
    cv2.putText(frame, f"Arms Crossed: {det_result.get('arms_crossed')}",  (12, 78),  font, 0.60, white, 2)
    cv2.putText(frame, f"Left Hand:  {det_result.get('left_hand_motion')}",  (12, 103), font, 0.60, white, 2)
    cv2.putText(frame, f"Right Hand: {det_result.get('right_hand_motion')}", (12, 128), font, 0.60, white, 2)
    cv2.putText(frame, f"Head Nod:   {det_result.get('head_nod')}",     (12, 153), font, 0.60, white, 2)

    # Hand activity section
    act_color = _ACTIVITY_COLORS[level]
    cv2.putText(frame, f"Hand Activity: {level.upper()}  ({avg_spd:.0f} px/s)",
                (12, 183), font, 0.65, act_color, 2)

    # Activity bar (ratio: 0=calm, 1=max at 2×moderate threshold)
    bar_ratio = min(1.0, avg_spd / (HAND_MODERATE_THRESH * 2))
    _draw_bar(frame, 12, 192, 200, 12, bar_ratio, act_color)

    # Alert if excessive
    if level == 'excessive':
        cv2.putText(frame, "! Too much hand movement !", (12, 220),
                    font, 0.65, (60, 60, 220), 2)

    # Composite score
    comp_color = (0, 220, 80) if comp > 0.7 else (0, 165, 255) if comp > 0.45 else (60, 60, 220)
    cv2.putText(frame, f"Composite: {comp:.2f}", (12, 248), font, 0.70, comp_color, 2)


# -------------------- MAIN APPLICATION ---------------------

def main():
    cap = cv2.VideoCapture(CAMERA_ID)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  FRAME_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)

    detector = NonverbalDetector(FRAME_WIDTH, FRAME_HEIGHT)

    with mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5) as pose, \
         mp_hands.Hands(max_num_hands=2, min_detection_confidence=0.5,
                        min_tracking_confidence=0.5) as hands, \
         mp_face.FaceMesh(refine_landmarks=True, min_detection_confidence=0.5,
                          min_tracking_confidence=0.5) as face_mesh:

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                print("Failed to grab frame")
                break

            now = time.time()

            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frame_rgb.flags.writeable = False

            pose_res  = pose.process(frame_rgb)
            hands_res = hands.process(frame_rgb)
            face_res  = face_mesh.process(frame_rgb)

            frame_rgb.flags.writeable = True
            frame_out = frame.copy()

            hands_list = []
            if hands_res.multi_hand_landmarks and hands_res.multi_handedness:
                for hlm, hh in zip(hands_res.multi_hand_landmarks, hands_res.multi_handedness):
                    hands_list.append((hlm, hh))
                    mp_drawing.draw_landmarks(frame_out, hlm, mp_hands.HAND_CONNECTIONS)

            if pose_res.pose_landmarks:
                mp_drawing.draw_landmarks(frame_out, pose_res.pose_landmarks,
                                          mp_pose.POSE_CONNECTIONS)

            face_lm = None
            if face_res.multi_face_landmarks:
                face_lm = face_res.multi_face_landmarks[0]
                mp_drawing.draw_landmarks(frame_out, face_lm, mp_face.FACEMESH_TESSELATION)

            det_result = detector.process(
                pose_res.pose_landmarks, face_lm, hands_list, now
            )

            draw_overlay(frame_out, det_result)

            cv2.imshow('Nexora Nonverbal Detector', frame_out)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == '__main__':
    main()
