import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import numpy as np
from config import *


class FaceAnalyzer:
    """
    Wraps FaceLandmarker Task API.
    Returns: landmarks, blendshapes dict, pitch/yaw/roll from matrix.
    """

    def __init__(self, model_path: str = "models/face_landmarker.task"):
        base_opts = python.BaseOptions(model_asset_path=model_path)
        opts = vision.FaceLandmarkerOptions(
            base_options=base_opts,
            output_face_blendshapes=True,
            output_facial_transformation_matrixes=True,
            num_faces=1,
            min_face_detection_confidence=0.5,
            min_face_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self.detector = vision.FaceLandmarker.create_from_options(opts)

    def analyze(self, rgb_frame: np.ndarray) -> dict | None:
        """
        Returns a dict with all extracted signals, or None if no face.
        """
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
        result = self.detector.detect(mp_img)

        if not result.face_landmarks:
            return None

        # ── Blendshapes → flat dict ──────────────────────────────────────
        bs = {}
        if result.face_blendshapes:
            bs = {b.category_name: b.score
                  for b in result.face_blendshapes[0]}

        # ── Head pose from 4×4 transform matrix ─────────────────────────
        pitch, yaw, roll = 0.0, 0.0, 0.0
        if result.facial_transformation_matrixes:
            mat   = np.array(
                result.facial_transformation_matrixes[0].data
            ).reshape(4, 4)
            pitch = float(np.degrees(np.arcsin(-mat[2][1])))
            yaw   = float(np.degrees(np.arctan2(mat[2][0], mat[2][2])))
            roll  = float(np.degrees(np.arctan2(mat[1][0], mat[0][0])))

        # ── Iris position for gaze refinement ───────────────────────────
        # Landmark indices: 468 = left iris center, 473 = right iris center
        landmarks = result.face_landmarks[0]
        iris_gaze = self._iris_gaze(landmarks)

        return {
            "blendshapes": bs,
            "pitch": pitch,
            "yaw":   yaw,
            "roll":  roll,
            "iris_gaze_x": iris_gaze[0],   # -1 (left) to +1 (right)
            "iris_gaze_y": iris_gaze[1],   # -1 (up)   to +1 (down)
            "landmarks": landmarks,
        }

    def _iris_gaze(self, landmarks) -> tuple[float, float]:
        """
        Compute normalized iris offset within the eye socket.
        Returns (gaze_x, gaze_y) in range [-1, 1].
        Landmark indices for left eye corners: 33 (outer), 133 (inner)
        Left iris center: 468
        """
        try:
            # Left eye
            outer_l = landmarks[33]
            inner_l = landmarks[133]
            iris_l  = landmarks[468]

            eye_w = abs(inner_l.x - outer_l.x)
            eye_cx = (inner_l.x + outer_l.x) / 2
            eye_cy = (inner_l.y + outer_l.y) / 2

            gaze_x = (iris_l.x - eye_cx) / (eye_w + 1e-6)
            gaze_y = (iris_l.y - eye_cy) / (eye_w + 1e-6)
            return float(np.clip(gaze_x * 2, -1, 1)), \
                   float(np.clip(gaze_y * 2, -1, 1))
        except (IndexError, AttributeError):
            return 0.0, 0.0
