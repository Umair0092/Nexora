"""
ws_server.py
------------
FastAPI WebSocket microservice for real-time nonverbal cue detection.

Each client connection gets its own FrameProcessor instance so that
blink counts, temporal smoothing, and hand-motion history are isolated
per interview session.

Start:
    uvicorn ws_server:app --host 0.0.0.0 --port 8765 --reload

The React frontend connects to ws://localhost:8765/ws/nonverbal and
exchanges JSON messages (see protocol below).

──────────────────────────────────────────────────────────────────────
CLIENT → SERVER  (frame)
{
  "type": "frame",
  "sessionId": "abc-uuid",
  "timestamp": 1711234567.891,
  "frameData": "<raw base64 JPEG, no data-URI prefix>"
}

SERVER → CLIENT  (result — face detected)
{
  "type": "result",
  "faceDetected": true,
  "attentionScore": 78,
  "attentionState": "ATTENTIVE",      // ATTENTIVE | PARTIALLY ATTENTIVE | DISENGAGED
  "reason": "",                        // human-readable when DISENGAGED
  "scores": {
    "gaze": 25, "head_pose": 20, "eye_open": 18,
    "blink_rate": 15, "expression": 10, "total": 78,
    "blink_rate_pm": 14
  },
  "handActivity": { "level": "calm", "score": 1.0, "avg_speed": 23.4 },
  "timestamp": 1711234567.921
}

SERVER → CLIENT  (result — no face)
{
  "type": "result",
  "faceDetected": false,
  "reason": "no_face",
  "handActivity": { ... }
}

CLIENT → SERVER  (session end)
{
  "type": "end_session",
  "sessionId": "abc-uuid"
}

SERVER → CLIENT  (session report — sent in response to end_session)
{
  "type": "session_report",
  "sessionId": "abc-uuid",
  "durationSeconds": 120.4,
  "totalFrames": 361,
  "faceDetectedFrames": 340,
  "attentionSummary": {
    "averageScore": 72.4,
    "minScore": 45.0,
    "maxScore": 95.0,
    "stateDistribution": {
      "ATTENTIVE":           { "frames": 200, "percentage": 58.8, "seconds": 70.8 },
      "PARTIALLY ATTENTIVE": { "frames": 100, "percentage": 29.4, "seconds": 35.4 },
      "DISENGAGED":          { "frames":  40, "percentage": 11.8, "seconds": 14.2 }
    }
  },
  "handActivitySummary": {
    "calm":      { "frames": 250, "percentage": 73.5, "seconds": 88.5 },
    "moderate":  { "frames":  70, "percentage": 20.6, "seconds": 24.8 },
    "excessive": { "frames":  20, "percentage":  5.9, "seconds":  7.1 }
  },
  "disengagementReasons": [
    { "reason": "looking down (phone?)", "count": 3 },
    { "reason": "yawning", "count": 1 }
  ],
  "timeline": [
    { "t": 1711234567.0, "state": "ATTENTIVE", "score": 82, "hand": "calm" }
  ]
}
──────────────────────────────────────────────────────────────────────
"""

import asyncio
import base64
import json
import logging
import os
import time

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from frame_processor import FrameProcessor

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("ws_server")

# ── Limits ────────────────────────────────────────────────────────────────────
# A base64 frame larger than this is rejected (error sent, connection kept).
MAX_FRAME_B64_BYTES = 2 * 1024 * 1024
# Any single WS message larger than this closes the connection (1009).
MAX_MESSAGE_BYTES = 4 * 1024 * 1024
# Frames arriving sooner than this after the last processed one are dropped
# (caps processing at ~6-7 fps per client; the frontend sends ~3 fps).
MIN_FRAME_INTERVAL_S = 0.15

# ── Origins ───────────────────────────────────────────────────────────────────
DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",   # Vite dev server
    "http://127.0.0.1:5173",
    "http://localhost:5000",   # Express / prod static
    "http://127.0.0.1:5000",
]


def _env_list(name: str) -> list:
    """
    Parse a comma-separated env var into a list of non-empty, stripped items.

    Example:
        NONVERBAL_CORS_ORIGINS="https://a.com, https://b.com"
        _env_list("NONVERBAL_CORS_ORIGINS") -> ["https://a.com", "https://b.com"]
    """
    return [item.strip() for item in os.getenv(name, "").split(",") if item.strip()]


CORS_ORIGINS = _env_list("NONVERBAL_CORS_ORIGINS") or DEFAULT_CORS_ORIGINS
# When set, WS handshakes whose Origin header isn't listed are rejected.
# Unset (default) = no Origin check, so the same-origin gateway proxy and
# local tools keep working.
WS_ALLOWED_ORIGINS = set(_env_list("NONVERBAL_ALLOWED_ORIGINS"))

# ── App setup ─────────────────────────────────────────────────────────────────
app = FastAPI(title="Nexora Nonverbal Cue WS Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health check (HTTP GET) ───────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "nexora-nonverbal-ws"}


# ── WebSocket endpoint ────────────────────────────────────────────────────────
@app.websocket("/ws/nonverbal")
async def nonverbal_endpoint(websocket: WebSocket):
    if WS_ALLOWED_ORIGINS:
        origin = websocket.headers.get("origin")
        if origin not in WS_ALLOWED_ORIGINS:
            logger.warning("Rejected WS handshake from origin %r", origin)
            await websocket.close(code=1008)  # policy violation
            return

    await websocket.accept()
    logger.info("Client connected: %s", websocket.client)

    # One FrameProcessor per connection — isolated detector state per session
    processor = FrameProcessor()
    loop = asyncio.get_running_loop()
    last_processed_at = 0.0

    try:
        while True:
            raw = await websocket.receive_text()

            # ── Size guard ────────────────────────────────────────────────
            if len(raw) > MAX_MESSAGE_BYTES:
                logger.warning("Closing %s: message of %d bytes exceeds limit", websocket.client, len(raw))
                await websocket.close(code=1009)  # message too big
                break

            # ── Parse envelope ────────────────────────────────────────────
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "Invalid JSON",
                }))
                continue

            msg_type = msg.get("type")

            # ── Frame message ─────────────────────────────────────────────
            if msg_type == "frame":
                b64 = msg.get("frameData", "")
                if not isinstance(b64, str):
                    b64 = ""
                if len(b64) > MAX_FRAME_B64_BYTES:
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "message": "frame too large",
                    }))
                    continue

                # Throttle: drop frames that arrive faster than we process them
                now = time.monotonic()
                if now - last_processed_at < MIN_FRAME_INTERVAL_S:
                    continue
                last_processed_at = now

                try:
                    jpeg_bytes = base64.b64decode(b64)
                except Exception:
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "message": "base64 decode failed",
                    }))
                    continue

                # Run CPU-bound inference in a thread so the event loop
                # stays responsive (especially if multiple clients connect).
                result = await loop.run_in_executor(
                    None, processor.process, jpeg_bytes
                )
                result["type"] = "result"
                await websocket.send_text(json.dumps(result))

            # ── Session end ───────────────────────────────────────────────
            elif msg_type == "end_session":
                session_id = msg.get("sessionId", "unknown")
                logger.info("Session ended: %s", session_id)
                report = processor.get_report()
                processor.close()
                await websocket.send_text(json.dumps({
                    "type":      "session_report",
                    "sessionId": session_id,
                    **report,
                }))
                # Reset processor so the connection can be reused for
                # a subsequent session without the client reconnecting.
                processor = FrameProcessor()

            # ── Unknown type ──────────────────────────────────────────────
            else:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": f"Unknown message type: {msg_type!r}",
                }))

    except WebSocketDisconnect:
        logger.info("Client disconnected: %s", websocket.client)
    except Exception as exc:
        logger.exception("Unexpected error in WS handler: %s", exc)
    finally:
        processor.close()
