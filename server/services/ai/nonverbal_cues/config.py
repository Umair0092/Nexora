# ─────────────────────────────────────────────
# GAZE thresholds (degrees)
# ─────────────────────────────────────────────
GAZE_ATTENTIVE_YAW        = 12    # yaw  < 12°  → looking at screen
GAZE_ATTENTIVE_PITCH      = 10    # pitch < 10° → looking at screen
GAZE_PARTIAL_YAW          = 22    # yaw  12–22° → glancing away
GAZE_PARTIAL_PITCH        = 18    # pitch 10–18°
GAZE_AWAY_DURATION_SEC    = 2.0   # sustained away before penalty

# ─────────────────────────────────────────────
# HEAD POSE thresholds (degrees from transform matrix)
# ─────────────────────────────────────────────
POSE_FORWARD_YAW          = 12    # ±12° yaw   → forward
POSE_FORWARD_PITCH        = 10    # ±10° pitch → forward
POSE_PARTIAL_YAW          = 25    # was 45 — 45° is almost profile view
POSE_PARTIAL_PITCH        = 20    # was 35 — 35° is clearly looking down
HEAD_DOWN_PITCH           = 20    # pitch > 20° down → looking at phone

# ─────────────────────────────────────────────
# BLINK thresholds (blinks per minute)
# ─────────────────────────────────────────────
BLINK_NORMAL_MIN          = 10
BLINK_NORMAL_MAX          = 20
BLINK_PARTIAL_MIN         = 5
BLINK_PARTIAL_MAX         = 30
BLINK_SCORE_THRESHOLD     = 0.50  # blendshape score to count as a blink
BLINK_REFRACTORY_SEC      = 0.15  # min time between counted blinks
BLINK_WINDOW_SEC          = 60    # window for rate calculation

# ─────────────────────────────────────────────
# EYE OPENNESS thresholds (blendshape score 0–1)
# ─────────────────────────────────────────────
EYE_OPEN_ATTENTIVE        = 0.6   # (1-blink) > 0.6 → eyes open/alert
EYE_OPEN_PARTIAL          = 0.3   # (1-blink) 0.3–0.6 → drowsy/half-closed

# ─────────────────────────────────────────────
# EXPRESSION thresholds (blendshape scores 0–1)
# ─────────────────────────────────────────────
EXPR_SMILE_THRESHOLD      = 0.30  # mouthSmile → engaged
EXPR_FROWN_THRESHOLD      = 0.40  # mouthFrown → displeased
EXPR_YAWN_THRESHOLD       = 0.50  # jawOpen    → yawning / bored
EXPR_BROW_FURROW          = 0.40  # browDown   → concentrating or angry

# ─────────────────────────────────────────────
# SCORING weights (must sum to 100)
# ─────────────────────────────────────────────
WEIGHT_GAZE               = 25
WEIGHT_HEAD_POSE          = 20
WEIGHT_EYE_OPENNESS       = 25
WEIGHT_BLINK_RATE         = 15
WEIGHT_EXPRESSION         = 15

# ─────────────────────────────────────────────
# ATTENTION STATE thresholds (out of 100)
# ─────────────────────────────────────────────
ATTENTIVE_THRESHOLD       = 75
PARTIAL_THRESHOLD         = 55
# < 55 → DISENGAGED

# ─────────────────────────────────────────────
# TEMPORAL smoothing
# ─────────────────────────────────────────────
SMOOTHING_WINDOW_FRAMES   = 30   # ~1 sec at 30fps
DISENGAGE_CONFIRM_SEC     = 2.0  # must be disengaged for 2s to trigger alert
STATE_CHANGE_DEBOUNCE_SEC = 0.5  # min time between state changes

# ─────────────────────────────────────────────
# CAMERA
# ─────────────────────────────────────────────
CAMERA_INDEX              = 0
FRAME_WIDTH               = 640
FRAME_HEIGHT              = 480
