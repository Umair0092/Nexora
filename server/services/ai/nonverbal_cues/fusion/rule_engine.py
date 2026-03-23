from config import *


# State colors (BGR for OpenCV)
STATE_COLORS = {
    "ATTENTIVE":           (100, 200, 60),
    "PARTIALLY ATTENTIVE": (0,   165, 255),
    "DISENGAGED":          (60,   60, 220),
}


def get_disengagement_reason(scores: dict, face_data: dict) -> str:
    """
    Returns a human-readable reason when disengaged.
    Used for logging and on-screen debug info.
    """
    bs    = face_data["blendshapes"]
    pitch = face_data["pitch"]

    if scores["gaze"] == 0 and scores["head_pose"] == 0:
        if pitch > HEAD_DOWN_PITCH:
            return "looking down (phone?)"
        return "looking away"

    if scores["eye_open"] == 0:
        return "eyes closed / drowsy"

    if bs.get("jawOpen", 0) > EXPR_YAWN_THRESHOLD:
        return "yawning"

    if scores["blink_rate"] == 0:
        return "abnormal blink rate"

    return "multiple weak signals"
