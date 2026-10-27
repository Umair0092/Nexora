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
  POST /api/v1/transcribe
  POST /api/v1/score-answer
  POST /api/v1/improve-answer
"""

import io
import os
import asyncio
import logging
import tempfile
from contextlib import asynccontextmanager, contextmanager
from typing import Optional, List, Literal

from fastapi import Depends, FastAPI, UploadFile, File, Form, Header, HTTPException, Response, status
from pydantic import BaseModel, Field

from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# ─── Import project modules ──────────────────────────────────────────────────
from helper import pdf_to_structure, Candidate, WorkExperience, Education, NO_TEXT_ERROR, AIServiceError
from session import Interview, score_answer, improve_answer
from speech import speech_metrics, WHISPER_PROMPT
from store import build_store, SessionNotFound

# ─── Session store ───────────────────────────────────────────────────────────
# Postgres when DATABASE_URL is set (survives restarts), in-memory otherwise.
# Each session records its `owner`: the trusted X-User-Id header injected by the
# gateway (or by Rails for server-to-server calls).
STORE = build_store()
KIND = "interview"
SESSION_TTL_MINUTES = int(os.getenv("RESUME_SESSION_TTL_MINUTES", 180))
MAX_FILE_SIZE_MB = int(os.getenv("RESUME_MAX_FILE_SIZE_MB", 10))
MAX_AUDIO_MB = int(os.getenv("RESUME_MAX_AUDIO_MB", 15))
# Max concurrently active interview sessions per owner (X-User-Id). Creating
# one more evicts that owner's oldest session.
MAX_SESSIONS_PER_OWNER = int(os.getenv("RESUME_MAX_SESSIONS_PER_OWNER", 5))

ALLOWED_AUDIO_SUFFIXES = {".webm", ".ogg", ".wav", ".mp3", ".m4a", ".mp4"}
DEFAULT_TARGET_ROLE = "Software Engineer"
MAX_JOB_DESCRIPTION = 6000
Language = Literal["en", "ur", "fr", "es"]
Style = Literal["standard", "behavioral"]

logger = logging.getLogger("resumeaiservice.api")

# ─── Background task: clean expired sessions ─────────────────────────────────
async def cleanup_expired_sessions():
    while True:
        await asyncio.sleep(300)  # run every 5 minutes
        try:
            await asyncio.to_thread(STORE.purge_expired, KIND, SESSION_TTL_MINUTES)
        except Exception:
            logger.exception("Expired session cleanup failed")


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
    language: Language = Field(default="en", description="Interview language: 'en' English, 'ur' Urdu, 'fr' French, 'es' Spanish")


class CreateInterviewRequest(BaseModel):
    candidate_data: CandidateOut
    target_role: str = Field(default="Software Engineer", max_length=100, description="The role to interview for (any free-form job title, e.g. 'Ruby on Rails Developer')")
    num_questions: int = Field(default=10, ge=5, le=15, description="Number of interview questions (5–15)")
    language: Language = Field(default="en", description="Interview language: 'en' English, 'ur' Urdu, 'fr' French, 'es' Spanish")
    interview_style: Style = Field(default="standard", description="'standard' CV interview, or 'behavioral' STAR-style questions")
    job_description: Optional[str] = Field(default=None, max_length=MAX_JOB_DESCRIPTION, description="Optional job advert text; questions then target its requirements")


class CreateInterviewResponse(BaseModel):
    session_id: str
    opening_question: str
    questions_asked: int
    num_questions: int
    is_complete: bool
    language: str


class SpeechMetrics(BaseModel):
    duration_seconds: float = Field(ge=0, le=3600)
    word_count: int = Field(ge=0, le=20000)
    words_per_minute: Optional[int] = Field(default=None, ge=0, le=1000)
    filler_count: int = Field(ge=0, le=5000)
    fillers: dict[str, int] = Field(default_factory=dict, max_length=20)
    long_pauses: int = Field(ge=0, le=1000)
    longest_pause_seconds: float = Field(ge=0, le=3600)


class AnswerRequest(BaseModel):
    answer: str = Field(..., min_length=1, max_length=10000, description="Candidate's answer to the current question")
    speech: Optional[SpeechMetrics] = Field(default=None, description="Delivery metrics from /transcribe for this answer")


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
    interview_style: str
    has_job_description: bool
    questions_asked: int
    num_questions: int
    is_complete: bool
    conversation: List[ConversationMessage]


class HealthResponse(BaseModel):
    status: str
    active_sessions: int


class StarOut(BaseModel):
    situation: bool
    task: bool
    action: bool
    result: bool
    note: str


class QuestionEvaluationOut(BaseModel):
    question: str
    answer: str
    score: int
    strengths: List[str]
    improvements: List[str]
    feedback: str
    recommendation: str
    star: Optional[StarOut] = None
    speech: Optional[SpeechMetrics] = None


class EvaluationResponse(BaseModel):
    session_id: str
    target_role: str
    language: str
    interview_style: str
    job_description: Optional[str]
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
    job_fit: Optional[str] = None
    per_question: List[QuestionEvaluationOut]


class TranscribeResponse(BaseModel):
    text: str
    speech: Optional[SpeechMetrics] = None


class SingleAnswerRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    answer: str = Field(..., min_length=1, max_length=10000)
    target_role: str = Field(default=DEFAULT_TARGET_ROLE, max_length=100)
    interview_style: Style = "standard"
    ideal_answer: Optional[str] = Field(default=None, max_length=10000, description="Model answer, for quiz questions")
    job_description: Optional[str] = Field(default=None, max_length=MAX_JOB_DESCRIPTION)
    language: Language = "en"


class AnswerScoreResponse(BaseModel):
    score: int
    strengths: List[str]
    improvements: List[str]
    feedback: str
    recommendation: str
    star: Optional[StarOut] = None


class ImprovedAnswerResponse(BaseModel):
    improved_answer: str
    changes: List[str]


# ─── Helpers ─────────────────────────────────────────────────────────────────

def current_owner(x_user_id: Optional[str] = Header(None, alias="X-User-Id")) -> Optional[str]:
    """
    The caller's user id, as forwarded by the gateway after JWT verification.
    The gateway strips any client-supplied X-User-Id, so this value is trusted.
    Returns None when the header is absent (e.g. direct local calls).
    """
    return x_user_id.strip() if x_user_id and x_user_id.strip() else None


def not_found(session_id: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Session '{session_id}' not found. It may have expired (TTL: {SESSION_TTL_MINUTES} min)."
    )


@contextmanager
def open_interview(session_id: str, owner: Optional[str]):
    """
    Load an interview for this owner, yield it, and save its state afterwards.
    A session created with an owner is only visible to that same owner; any other
    caller gets the same 404 as for a missing session. Nothing is saved when the
    block raises.
    """
    try:
        with STORE.open(session_id, KIND, owner) as entry:
            interview = Interview.from_state(entry.state)
            yield interview
            entry.state = interview.to_state()
    except SessionNotFound:
        raise not_found(session_id)


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
    return {"status": "ok", "active_sessions": STORE.count(KIND)}


from openai import AsyncOpenAI

groq_api_key = os.getenv("GROQ_API_KEY")
openai_client = AsyncOpenAI(api_key=groq_api_key, base_url="https://api.groq.com/openai/v1") if groq_api_key else None

@app.post(
    "/api/v1/transcribe",
    response_model=TranscribeResponse,
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

    Also returns delivery metrics from Whisper's word timestamps. Send them with the
    answer so the report can show pace, filler words and pauses:
    ```json
    {
      "text": "Um, so I rebuilt the queue...",
      "speech": {
        "duration_seconds": 41.2, "word_count": 96, "words_per_minute": 140,
        "filler_count": 3, "fillers": {"um": 2, "you know": 1},
        "long_pauses": 1, "longest_pause_seconds": 2.8
      }
    }
    ```

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
                response_format="verbose_json",
                timestamp_granularities=["word"],
                # The filler-word prompt only makes sense for English audio.
                **({"prompt": WHISPER_PROMPT} if lang_code == "en" else {}),
            )
        text = (getattr(transcript, "text", "") or "").strip()
    except Exception:
        logger.exception("Whisper transcription failed")
        raise HTTPException(status_code=500, detail="Transcription failed. Please try again.")
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    speech = None
    if text:
        try:
            speech = speech_metrics(getattr(transcript, "words", None), getattr(transcript, "duration", None), text)
        except Exception:
            logger.exception("Speech metrics failed; returning the transcript without them")
    return {"text": text, "speech": speech}


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
    except AIServiceError as e:
        logger.error("Resume parsing failed at the AI provider: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The AI service couldn't read your CV right now. Try again in a few minutes."
        )
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
      "num_questions": 8,
      "interview_style": "standard",
      "job_description": "We're hiring an ML Engineer to ship ranking models... (optional)"
    }
    ```

    `interview_style: "behavioral"` asks STAR-style "Tell me about a time..." questions
    and scores STAR coverage at evaluation. `job_description` (optional, up to 6,000
    characters) makes the interviewer probe the job's requirements.

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
    - `422` — Job description too long
    - `503` — AI service unavailable or quota exhausted
    """
    target_role = (body.target_role or "").strip()
    if not target_role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="target_role must be a non-empty string"
        )

    try:
        interview = Interview(
            candidate_data=body.candidate_data,
            target_role=target_role,
            num_questions=body.num_questions,
            language=body.language,
            style=body.interview_style,
            job_description=body.job_description,
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

    session_id = STORE.create(KIND, owner, interview.to_state(), MAX_SESSIONS_PER_OWNER)

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
      "answer": "At TechCorp I built a BERT-based classifier for customer support tickets with 91% accuracy, deployed via Docker and FastAPI.",
      "speech": { "duration_seconds": 32.5, "word_count": 74, "words_per_minute": 137, "filler_count": 2,
                  "fillers": {"um": 2}, "long_pauses": 0, "longest_pause_seconds": 1.1 }
    }
    ```
    `speech` is optional: pass the metrics `/transcribe` returned for this answer.

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
    with open_interview(session_id, owner) as interview:
        if interview.is_complete:
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail="This interview is already complete. Fetch the transcript via GET /api/v1/interviews/{session_id}/transcript"
            )

        try:
            next_question, is_complete = interview.process_answer_and_get_next_question(
                body.answer, body.speech.model_dump() if body.speech else None
            )
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
      "language": "en",
      "interview_style": "standard",
      "has_job_description": false,
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
    with open_interview(session_id, owner) as interview:
        return {
            "session_id": session_id,
            "target_role": interview.target_role,
            "language": interview.language,
            "interview_style": interview.style,
            "has_job_description": bool(interview.job_description),
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
    Remove a session. Called once the report has been saved.

    **Response `204 No Content`** — session deleted (empty body)

    **Error responses:**
    - `404` — Session not found
    """
    if not STORE.delete(session_id, KIND, owner):
        raise not_found(session_id)
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
    Send the full interview transcript to the LLM and receive a structured evaluation
    with per-question scores and an overall performance summary.

    Can be called at any point — mid-interview or after completion. The result is
    cached until another answer arrives, so calling it twice costs one LLM call.
    Rails calls this server-to-server when saving the report, so scores never pass
    through the browser.

    **Example response `200 OK`:**
    ```json
    {
      "session_id": "f3a2c1b4-...",
      "target_role": "Software Engineer",
      "language": "en",
      "interview_style": "behavioral",
      "job_description": null,
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
      "improvement_points": ["Practice explaining system design trade-offs", "Quantify achievements"],
      "job_fit": null,
      "per_question": [
        {
          "question": "Tell me about a time a release went wrong...",
          "answer": "Our payments deploy failed on Black Friday...",
          "score": 8,
          "strengths": ["Concrete example with measurable result"],
          "improvements": ["Could mention what they changed afterwards"],
          "feedback": "Strong answer with specific technical details.",
          "recommendation": "Close with the lesson you took from it.",
          "star": { "situation": true, "task": true, "action": true, "result": false,
                    "note": "Say how the incident ended and what it cost." },
          "speech": { "duration_seconds": 48.0, "word_count": 120, "words_per_minute": 150,
                      "filler_count": 4, "fillers": {"um": 3, "you know": 1},
                      "long_pauses": 0, "longest_pause_seconds": 1.4 }
        }
      ]
    }
    ```
    `star` is only filled for behavioral interviews, `job_fit` only when a job
    description was given, and `speech` only when the answer was sent with metrics.

    **Error responses:**
    - `404` — Session not found or expired
    - `400` — No answers submitted yet
    - `503` — LLM unavailable
    """
    with open_interview(session_id, owner) as interview:
        if interview.answers_given == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No answers have been submitted yet. Complete at least one question before evaluating."
            )

        try:
            result = interview.evaluate_interview()
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
            **result,
            "session_id": session_id,
            "target_role": interview.target_role,
            "language": interview.language,
            "interview_style": interview.style,
            "job_description": interview.job_description,
            "questions_asked": interview.questions_asked,
            "is_complete": interview.is_complete,
        }


# ─── Single answers: retry practice and rewrites ─────────────────────────────

def _single_answer(fn, body: SingleAnswerRequest, action: str):
    try:
        return fn(
            question=body.question,
            answer=body.answer,
            target_role=(body.target_role or "").strip() or DEFAULT_TARGET_ROLE,
            style=body.interview_style,
            ideal_answer=body.ideal_answer,
            job_description=body.job_description,
            language=body.language,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except Exception:
        logger.exception("Unexpected error during %s", action)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"{action.capitalize()} failed due to an internal error. Please try again later."
        )


@app.post(
    "/api/v1/score-answer",
    response_model=AnswerScoreResponse,
    summary="Score one answer to one question",
    tags=["Practice"],
)
def score_single_answer(body: SingleAnswerRequest, _owner: Optional[str] = Depends(current_owner)):
    """
    Score a single answer, e.g. a retry of a question from a past report.
    Pass `ideal_answer` for quiz questions so the answer is marked against it.

    **Example request:**
    ```json
    {
      "question": "Tell me about a time you disagreed with your manager.",
      "answer": "On my internship I pushed back on shipping without load tests...",
      "target_role": "Backend Developer",
      "interview_style": "behavioral",
      "language": "en"
    }
    ```

    **Example response `200 OK`:**
    ```json
    {
      "score": 7,
      "strengths": ["Clear disagreement and reasoning"],
      "improvements": ["Give the measurable result"],
      "feedback": "A specific, honest example with a sensible approach.",
      "recommendation": "Finish with what the load tests caught and how the launch went.",
      "star": { "situation": true, "task": true, "action": true, "result": false, "note": "No outcome given." }
    }
    ```

    **Error responses:**
    - `422` — Missing question or answer
    - `503` — LLM unavailable
    """
    return _single_answer(score_answer, body, "scoring")


@app.post(
    "/api/v1/improve-answer",
    response_model=ImprovedAnswerResponse,
    summary="Rewrite an answer into a stronger version",
    tags=["Practice"],
)
def improve_single_answer(body: SingleAnswerRequest, _owner: Optional[str] = Depends(current_owner)):
    """
    Rewrite the candidate's own answer: same facts, better structure (STAR for
    behavioral questions), no invented achievements. Missing numbers become
    bracketed placeholders such as `[cut load time by X%]`.

    **Example response `200 OK`:**
    ```json
    {
      "improved_answer": "During my internship at Arbisoft, the team planned to launch...",
      "changes": ["Opened with the situation in one sentence", "Moved to first person for your actions"]
    }
    ```

    **Error responses:**
    - `422` — Missing question or answer
    - `503` — LLM unavailable
    """
    return _single_answer(improve_answer, body, "rewrite")


# ─── Run ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="127.0.0.1", port=8000, reload=True, workers=1)
