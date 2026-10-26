"""
Nexora AI Interview — FastAPI Microservice
==========================================
Endpoints:
  GET  /health
  POST /api/v1/parse-resume
  POST /api/v1/interviews
  POST /api/v1/interviews/{session_id}/answer
  GET  /api/v1/interviews/{session_id}/transcript
  GET  /api/v1/interviews/{session_id}/evaluate
  DELETE /api/v1/interviews/{session_id}
"""

import io
import os
import uuid
import asyncio
import logging
import tempfile
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Literal

from fastapi import Depends, FastAPI, UploadFile, File, Form, Header, HTTPException, Response, status
from pydantic import BaseModel, Field

from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# ─── Import project modules ──────────────────────────────────────────────────
from helper import pdf_to_structure, Candidate, WorkExperience, Education, NO_TEXT_ERROR
from session import Interview, EvaluationResult, QuestionEvaluation

# ─── In-memory session store ─────────────────────────────────────────────────
# { session_id: { "interview": Interview, "owner": str | None,
#                  "created_at": datetime, "last_accessed": datetime } }
# `owner` is the trusted X-User-Id header injected by the gateway.
SESSION_STORE: dict = {}
SESSION_TTL_MINUTES = int(os.getenv("RESUME_SESSION_TTL_MINUTES", 60))
MAX_FILE_SIZE_MB = int(os.getenv("RESUME_MAX_FILE_SIZE_MB", 10))
MAX_AUDIO_MB = int(os.getenv("RESUME_MAX_AUDIO_MB", 15))
# Max concurrently active interview sessions per owner (X-User-Id). Creating
# one more evicts that owner's oldest session.
MAX_SESSIONS_PER_OWNER = int(os.getenv("RESUME_MAX_SESSIONS_PER_OWNER", 5))

ALLOWED_AUDIO_SUFFIXES = {".webm", ".ogg", ".wav", ".mp3", ".m4a", ".mp4"}
DEFAULT_TARGET_ROLE = "Software Engineer"

logger = logging.getLogger("resumeaiservice.api")

# ─── Background task: clean expired sessions ─────────────────────────────────
async def cleanup_expired_sessions():
    while True:
        await asyncio.sleep(300)  # run every 5 minutes
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=SESSION_TTL_MINUTES)
        expired = [sid for sid, data in SESSION_STORE.items() if data["last_accessed"] < cutoff]
        for sid in expired:
            SESSION_STORE.pop(sid, None)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(cleanup_expired_sessions())
    yield
    task.cancel()


# ─── FastAPI app ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="Nexora AI Interview API",
    description="REST API for resume parsing and AI-powered interview sessions",
    version="1.0.0",
    lifespan=lifespan,
)


# ─── Pydantic models ──────────────────────────────────────────────────────────

class WorkExperienceOut(BaseModel):
    company: str
    role: str
    duration: Optional[str] = None
    description: Optional[str] = None


class EducationOut(BaseModel):
    institution: str
    course: str
    duration: Optional[str] = None
    score: Optional[str] = None


class CandidateOut(BaseModel):
    name: str
    degree: str
    summary: Optional[str] = None
    skills: List[str]
    work_experience: Optional[List[WorkExperienceOut]] = None
    projects_done: Optional[List[str]] = None
    education: Optional[List[EducationOut]] = None
    achievements: Optional[List[str]] = None


class ParseResumeResponse(BaseModel):
    candidate_data: CandidateOut
    target_role: str = Field(default="Software Engineer", description="The role to interview for (any free-form job title, e.g. 'Ruby on Rails Developer')")
    num_questions: int = Field(default=10, description="Change to your desired number of questions (5–15)")
    language: Literal["en", "ur", "fr", "es"] = Field(default="en", description="Interview language: 'en' English, 'ur' Urdu, 'fr' French, 'es' Spanish")


class CreateInterviewRequest(BaseModel):
    candidate_data: CandidateOut
    target_role: str = Field(default="Software Engineer", description="The role to interview for (any free-form job title, e.g. 'Ruby on Rails Developer')")
    num_questions: int = Field(default=10, ge=5, le=15, description="Number of interview questions (5–15)")
    language: Literal["en", "ur", "fr", "es"] = Field(default="en", description="Interview language: 'en' English, 'ur' Urdu, 'fr' French, 'es' Spanish")


class CreateInterviewResponse(BaseModel):
    session_id: str
    opening_question: str
    questions_asked: int
    num_questions: int
    is_complete: bool
    language: str


class AnswerRequest(BaseModel):
    answer: str = Field(..., min_length=1, description="Candidate's answer to the current question")


class AnswerResponse(BaseModel):
    next_question: str
    questions_asked: int
    num_questions: int
    is_complete: bool


class ConversationMessage(BaseModel):
    role: str   # "interviewer" or "candidate"
    content: str


class TranscriptResponse(BaseModel):
    session_id: str
    target_role: str
    language: str
    questions_asked: int
    num_questions: int
    is_complete: bool
    conversation: List[ConversationMessage]


class HealthResponse(BaseModel):
    status: str
    active_sessions: int


class QuestionEvaluationOut(BaseModel):
    question: str
    answer: str
    score: int
    strengths: List[str]
    improvements: List[str]
    feedback: str
    recommendation: str


class EvaluationResponse(BaseModel):
    session_id: str
    target_role: str
    questions_asked: int
    is_complete: bool
    overall_score: int
    communication_score: int
    technical_score: int
    hire_recommendation: str
    top_strengths: List[str]
    areas_to_improve: List[str]
    summary: str
    recommendation_summary: str
    improvement_points: List[str]
    per_question: List[QuestionEvaluationOut]


# ─── Helpers ─────────────────────────────────────────────────────────────────

def current_owner(x_user_id: Optional[str] = Header(None, alias="X-User-Id")) -> Optional[str]:
    """
    The caller's user id, as forwarded by the gateway after JWT verification.
    The gateway strips any client-supplied X-User-Id, so this value is trusted.
    Returns None when the header is absent (e.g. direct local calls).
    """
    return x_user_id.strip() if x_user_id and x_user_id.strip() else None


def get_session(session_id: str, owner: Optional[str]) -> dict:
    """
    Fetch a session or raise 404. Updates last_accessed timestamp.

    A session created with an owner is only visible to that same owner; any
    other caller gets the same 404 as for a missing session.
    """
    entry = SESSION_STORE.get(session_id)
    if not entry or (entry.get("owner") and entry["owner"] != owner):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{session_id}' not found. It may have expired (TTL: {SESSION_TTL_MINUTES} min)."
        )
    entry["last_accessed"] = datetime.now(timezone.utc)
    return entry


def store_session(interview: "Interview", owner: Optional[str]) -> str:
    """
    Save a new session and return its id. If the owner already has
    MAX_SESSIONS_PER_OWNER active sessions, their oldest ones are evicted.
    """
    if owner and MAX_SESSIONS_PER_OWNER > 0:
        owned = sorted(
            (sid for sid, d in SESSION_STORE.items() if d.get("owner") == owner),
            key=lambda sid: SESSION_STORE[sid]["created_at"],
        )
        for sid in owned[: max(0, len(owned) - MAX_SESSIONS_PER_OWNER + 1)]:
            SESSION_STORE.pop(sid, None)

    now = datetime.now(timezone.utc)
    session_id = str(uuid.uuid4())
    SESSION_STORE[session_id] = {
        "interview": interview,
        "owner": owner,
        "created_at": now,
        "last_accessed": now,
    }
    return session_id


# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    tags=["System"],
)
def health():
    """
    Returns service status and number of active interview sessions.

    **Example response:**
    ```json
    {
      "status": "ok",
      "active_sessions": 2
    }
    ```
    """
    return {"status": "ok", "active_sessions": len(SESSION_STORE)}


from openai import AsyncOpenAI

groq_api_key = os.getenv("GROQ_API_KEY")
openai_client = AsyncOpenAI(api_key=groq_api_key, base_url="https://api.groq.com/openai/v1") if groq_api_key else None

@app.post(
    "/api/v1/transcribe",
    status_code=status.HTTP_200_OK,
    summary="Transcribe audio using Whisper",
    tags=["Audio"],
)
async def transcribe_audio(
    file: UploadFile = File(...),
    language: str = Form("en"),
):
    """
    Takes an audio file (e.g., .webm from the browser) and transcribes it using Groq's Whisper API.
    The `language` form field is an ISO-639-1 code (e.g. "en", "ur", "fr", "es") that pins
    Whisper to that language. Without it, Whisper auto-detects and frequently confuses
    Urdu (Arabic script) with Ukrainian (Cyrillic).

    **Error responses:**
    - `413` — Audio exceeds `RESUME_MAX_AUDIO_MB` (default 15 MB)
    - `500` — Transcription not configured or failed
    """
    if not openai_client:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured in .env. Please add it to use Voice Transcription.")

    # Read at most limit+1 bytes so an oversized upload is rejected without
    # buffering all of it.
    max_bytes = MAX_AUDIO_MB * 1024 * 1024
    content = await file.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Audio too large. Maximum allowed size is {MAX_AUDIO_MB} MB."
        )

    # Only pass through known audio suffixes (Whisper infers the format from it)
    suffix = ".webm"
    if file.filename:
        _, ext = os.path.splitext(file.filename)
        if ext.lower() in ALLOWED_AUDIO_SUFFIXES:
            suffix = ext.lower()

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    allowed_langs = {"en", "ur", "fr", "es"}
    lang_code = language if language in allowed_langs else "en"

    try:
        with open(tmp_path, "rb") as audio_file:
            transcript = await openai_client.audio.transcriptions.create(
                model="whisper-large-v3",
                file=audio_file,
                language=lang_code,
                response_format="json"
            )
        return {"text": transcript.text}
    except Exception:
        logger.exception("Whisper transcription failed")
        raise HTTPException(status_code=500, detail="Transcription failed. Please try again.")
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@app.post(
    "/api/v1/parse-resume",
    response_model=ParseResumeResponse,
    status_code=status.HTTP_200_OK,
    summary="Parse a PDF resume",
    tags=["Resume"],
)
async def parse_resume(file: UploadFile = File(...)):
    """
    Upload a PDF resume and receive a response you can send **directly** to `POST /api/v1/interviews`.
    Just change `target_role` and `num_questions` before sending.

    **Request:** `multipart/form-data` with field `file` (PDF, max 10 MB)

    **Example response `200 OK`:**
    ```json
    {
      "candidate_data": {
        "name": "Ali Hassan",
        "degree": "BS Computer Science",
        "summary": "ML engineer with 3 years of NLP and deployment experience.",
        "skills": ["Python", "TensorFlow", "Docker", "SQL", "LangChain"],
        "work_experience": [
          {
            "company": "TechCorp",
            "role": "ML Engineer",
            "duration": "Jan 2022 - Present",
            "description": "Built BERT-based text classifiers deployed via FastAPI."
          }
        ],
        "projects_done": [
          "Resume parser using LangChain and Gemini",
          "Real-time stock prediction dashboard"
        ],
        "education": [
          {
            "institution": "FAST-NUCES",
            "course": "BS Computer Science",
            "duration": "2019 - 2023",
            "score": "3.7 GPA"
          }
        ],
        "achievements": ["Dean's List 2022", "1st place university hackathon"]
      },
      "target_role": "Software Engineer",
      "num_questions": 10,
      "language": "en"
    }
    ```

    Take this response, change `target_role` (any free-form job title) and
    `num_questions`, then POST it to `/api/v1/interviews`.

    **Error responses:**
    - `415` — File is not a PDF (checked via the `%PDF-` magic bytes)
    - `413` — File exceeds `RESUME_MAX_FILE_SIZE_MB` (default 10 MB)
    - `400` — PDF could not be parsed or has no readable text
    """
    # Read and check file size (read at most limit+1 bytes)
    max_bytes = MAX_FILE_SIZE_MB * 1024 * 1024
    content = await file.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum allowed size is {MAX_FILE_SIZE_MB} MB."
        )

    # Validate file type by content, not by the client-supplied content-type
    if not content.lstrip()[:5].startswith(b"%PDF-"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF files are accepted."
        )

    try:
        candidate: Candidate = pdf_to_structure(io.BytesIO(content))
    except ValueError as e:
        logger.warning("Resume parsing failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e) if str(e) == NO_TEXT_ERROR else
                   "Failed to parse resume. Make sure the file is a valid PDF with readable text."
        )
    except Exception:
        logger.exception("Unexpected error during resume parsing")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected error during resume parsing. Please try again."
        )

    return {
        "candidate_data": candidate.model_dump(),
        "target_role": DEFAULT_TARGET_ROLE,
        "num_questions": 10,
        "language": "en",
    }


@app.post(
    "/api/v1/interviews",
    response_model=CreateInterviewResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Start a new interview session",
    tags=["Interview"],
)
def create_interview(body: CreateInterviewRequest, owner: Optional[str] = Depends(current_owner)):
    """
    Create a new interview session. Returns a `session_id` and the first question.

    **Example request:**
    ```json
    {
      "candidate_data": {
        "name": "Ali Hassan",
        "degree": "BS Computer Science",
        "summary": "ML engineer with NLP experience.",
        "skills": ["Python", "TensorFlow", "SQL"],
        "work_experience": [
          { "company": "TechCorp", "role": "ML Engineer", "duration": "2022-Present", "description": "NLP pipelines." }
        ],
        "projects_done": ["Resume parser"],
        "education": [{ "institution": "FAST-NUCES", "course": "BS CS", "duration": "2019-2023", "score": "3.7 GPA" }],
        "achievements": ["Dean's List 2022"]
      },
      "target_role": "ML Engineer",
      "num_questions": 8
    }
    ```

    **Example response `201 Created`:**
    ```json
    {
      "session_id": "f3a2c1b4-9e8d-4f7a-b2c1-1a2b3c4d5e6f",
      "opening_question": "Hello Ali! Welcome to your ML Engineer interview. Can you walk me through your experience building NLP pipelines at TechCorp?",
      "questions_asked": 1,
      "num_questions": 8,
      "is_complete": false
    }
    ```

    **Error responses:**
    - `400` — Empty target_role
    - `500` — AI service unavailable or quota exhausted
    """
    target_role = (body.target_role or "").strip()
    if not target_role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="target_role must be a non-empty string"
        )
    body.target_role = target_role

    # Convert CandidateOut (Pydantic) to a Candidate-like object session.py expects
    # session.py calls .model_dump() on candidate_data — CandidateOut supports that
    try:
        interview = Interview(
            candidate_data=body.candidate_data,
            target_role=body.target_role,
            num_questions=body.num_questions,
            language=body.language,
        )
        opening_question = interview.start_interview()
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e)
        )
    except Exception:
        logger.exception("Failed to start interview")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start interview. Please try again later."
        )

    session_id = store_session(interview, owner)

    return {
        "session_id": session_id,
        "opening_question": opening_question,
        "questions_asked": interview.questions_asked,
        "num_questions": interview.num_questions,
        "is_complete": interview.is_complete,
        "language": interview.language,
    }


@app.post(
    "/api/v1/interviews/{session_id}/answer",
    response_model=AnswerResponse,
    status_code=status.HTTP_200_OK,
    summary="Submit an answer and get the next question",
    tags=["Interview"],
)
def submit_answer(session_id: str, body: AnswerRequest, owner: Optional[str] = Depends(current_owner)):
    """
    Submit the candidate's answer and receive the next interview question.

    **Example request:**
    ```json
    {
      "answer": "At TechCorp I built a BERT-based classifier for customer support tickets with 91% accuracy, deployed via Docker and FastAPI."
    }
    ```

    **Example response `200 OK`** (interview still in progress):
    ```json
    {
      "next_question": "Impressive results! How did you handle class imbalance in that dataset?",
      "questions_asked": 3,
      "num_questions": 8,
      "is_complete": false
    }
    ```

    **Example response `200 OK`** (interview complete):
    ```json
    {
      "next_question": "Thank you Ali, that was a great interview! Best of luck with your application!",
      "questions_asked": 8,
      "num_questions": 8,
      "is_complete": true
    }
    ```

    **Error responses:**
    - `404` — Session not found or expired
    - `410` — Interview already complete
    - `503` — AI quota exhausted
    """
    entry = get_session(session_id, owner)
    interview: Interview = entry["interview"]

    if interview.is_complete:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This interview is already complete. Fetch the transcript via GET /api/v1/interviews/{session_id}/transcript"
        )

    try:
        next_question, is_complete = interview.process_answer_and_get_next_question(body.answer)
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except Exception:
        logger.exception("Failed to process answer for interview %s", session_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process your answer. Please try again."
        )

    return {
        "next_question": next_question,
        "questions_asked": interview.questions_asked,
        "num_questions": interview.num_questions,
        "is_complete": is_complete,
    }


@app.get(
    "/api/v1/interviews/{session_id}/transcript",
    response_model=TranscriptResponse,
    status_code=status.HTTP_200_OK,
    summary="Get the full interview transcript",
    tags=["Interview"],
)
def get_transcript(session_id: str, owner: Optional[str] = Depends(current_owner)):
    """
    Returns the complete conversation history for a session.

    **Example response `200 OK`:**
    ```json
    {
      "session_id": "f3a2c1b4-9e8d-4f7a-b2c1-1a2b3c4d5e6f",
      "target_role": "ML Engineer",
      "questions_asked": 4,
      "num_questions": 8,
      "is_complete": false,
      "conversation": [
        { "role": "interviewer", "content": "Hello Ali! Can you walk me through your experience at TechCorp?" },
        { "role": "candidate",   "content": "I built a BERT-based classifier deployed via FastAPI..." },
        { "role": "interviewer", "content": "How did you handle class imbalance in that dataset?" },
        { "role": "candidate",   "content": "I used SMOTE oversampling combined with class-weighted loss..." }
      ]
    }
    ```

    **Error responses:**
    - `404` — Session not found or expired
    """
    entry = get_session(session_id, owner)
    interview: Interview = entry["interview"]

    return {
        "session_id": session_id,
        "target_role": interview.target_role,
        "language": interview.language,
        "questions_asked": interview.questions_asked,
        "num_questions": interview.num_questions,
        "is_complete": interview.is_complete,
        "conversation": interview.get_conversation_for_display(),
    }


@app.delete(
    "/api/v1/interviews/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="End and clean up an interview session",
    tags=["Interview"],
)
def delete_session(session_id: str, owner: Optional[str] = Depends(current_owner)):
    """
    Manually remove a session from memory. Call this when the user is done.

    **Response `204 No Content`** — session deleted (empty body)

    **Error responses:**
    - `404` — Session not found
    """
    get_session(session_id, owner)
    SESSION_STORE.pop(session_id, None)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get(
    "/api/v1/interviews/{session_id}/evaluate",
    response_model=EvaluationResponse,
    status_code=status.HTTP_200_OK,
    summary="Evaluate all interview answers",
    tags=["Interview"],
)
def evaluate_interview(session_id: str, owner: Optional[str] = Depends(current_owner)):
    """
    Send the full interview transcript to Gemini and receive a structured evaluation
    with per-question scores and an overall performance summary.

    Can be called at any point — mid-interview or after completion.

    **Example response `200 OK`:**
    ```json
    {
      "session_id": "f3a2c1b4-...",
      "target_role": "Software Engineer",
      "questions_asked": 5,
      "is_complete": true,
      "overall_score": 7,
      "communication_score": 8,
      "technical_score": 6,
      "hire_recommendation": "Yes",
      "top_strengths": ["Strong project experience", "Clear communication"],
      "areas_to_improve": ["System design depth", "Distributed systems knowledge"],
      "summary": "Muhammad demonstrated solid hands-on experience...",
      "recommendation_summary": "To become a stronger candidate, focus on explaining architectural decisions...",
      "improvement_points": [
        "Practice explaining system design trade-offs",
        "Use the STAR method for behavioral questions",
        "Quantify achievements (e.g. 'reduced latency by 40%')"
      ],
      "per_question": [
        {
          "question": "Walk me through your background...",
          "answer": "I built an ASL recognition system...",
          "score": 8,
          "strengths": ["Concrete example with measurable result (92% accuracy)"],
          "improvements": ["Could mention challenges faced"],
          "feedback": "Strong answer with specific technical details.",
          "recommendation": "Also mention a challenge you faced and how you resolved it."
        }
      ]
    }
    ```

    **Error responses:**
    - `404` — Session not found or expired
    - `400` — No answers submitted yet
    - `503` — LLM unavailable
    """
    entry = get_session(session_id, owner)
    interview: Interview = entry["interview"]

    if interview.questions_asked == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No answers have been submitted yet. Complete at least one question before evaluating."
        )

    try:
        result: EvaluationResult = interview.evaluate_interview()
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except Exception:
        logger.exception("Unexpected error evaluating interview %s", session_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Evaluation failed due to an internal error. Please try again later."
        )

    return {
        "session_id": session_id,
        "target_role": interview.target_role,
        "questions_asked": interview.questions_asked,
        "is_complete": interview.is_complete,
        "overall_score": result.overall_score,
        "communication_score": result.communication_score,
        "technical_score": result.technical_score,
        "hire_recommendation": result.hire_recommendation,
        "top_strengths": result.top_strengths,
        "areas_to_improve": result.areas_to_improve,
        "summary": result.summary,
        "recommendation_summary": result.recommendation_summary,
        "improvement_points": result.improvement_points,
        "per_question": [q.model_dump() for q in result.per_question],
    }


# ─── Run ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="127.0.0.1", port=8000, reload=True, workers=1)
