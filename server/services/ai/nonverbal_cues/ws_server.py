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

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from frame_processor import FrameProcessor

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("ws_server")

# ── App setup ─────────────────────────────────────────────────────────────────
app = FastAPI(title="Nexora Nonverbal Cue WS Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "http://127.0.0.1:5173",
        "http://localhost:5000",   # Express / prod static
        "http://127.0.0.1:5000",
    ],
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
    await websocket.accept()
    logger.info("Client connected: %s", websocket.client)

    # One FrameProcessor per connection — isolated detector state per session
    processor = FrameProcessor()
    loop = asyncio.get_event_loop()

    try:
        while True:
            raw = await websocket.receive_text()

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
