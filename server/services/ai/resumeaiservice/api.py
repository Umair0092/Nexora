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

import os
import uuid
import asyncio
import tempfile
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Optional, List, Literal

from fastapi import FastAPI, UploadFile, File, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# ─── Import project modules ──────────────────────────────────────────────────
from helper import pdf_to_structure, Candidate, WorkExperience, Education
from session import Interview, EvaluationResult, QuestionEvaluation

# ─── In-memory session store ─────────────────────────────────────────────────
# { session_id: { "interview": Interview, "last_accessed": datetime } }
SESSION_STORE: dict = {}
SESSION_TTL_MINUTES = int(os.getenv("RESUME_SESSION_TTL_MINUTES", 60))
MAX_FILE_SIZE_MB = int(os.getenv("RESUME_MAX_FILE_SIZE_MB", 10))

VALID_ROLES = [
    "Data Scientist",
    "ML Engineer",
    "Data Analyst",
    "AI Engineer",
    "Software Engineer",
    "Behavioral Interview",
]


# ─── Background task: clean expired sessions ─────────────────────────────────
async def cleanup_expired_sessions():
    while True:
        await asyncio.sleep(300)  # run every 5 minutes
        cutoff = datetime.utcnow() - timedelta(minutes=SESSION_TTL_MINUTES)
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
    target_role: str = Field(default="Data Scientist", description="Change to one of: Data Scientist, ML Engineer, Data Analyst, AI Engineer, Software Engineer")
    num_questions: int = Field(default=10, description="Change to your desired number of questions (5–15)")
    language: Literal["en", "ur", "fr", "es"] = Field(default="en", description="Interview language: 'en' English, 'ur' Urdu, 'fr' French, 'es' Spanish")


class CreateInterviewRequest(BaseModel):
    candidate_data: CandidateOut
    target_role: str = Field(default="Data Scientist", description="One of: Data Scientist, ML Engineer, Data Analyst, AI Engineer, Software Engineer")
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


# ─── Helper ──────────────────────────────────────────────────────────────────

def get_session(session_id: str) -> dict:
    """Fetch a session or raise 404. Updates last_accessed timestamp."""
    entry = SESSION_STORE.get(session_id)
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{session_id}' not found. It may have expired (TTL: {SESSION_TTL_MINUTES} min)."
        )
    entry["last_accessed"] = datetime.utcnow()
    return entry


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
import os

groq_api_key = os.getenv("GROQ_API_KEY")
openai_client = AsyncOpenAI(api_key=groq_api_key, base_url="https://api.groq.com/openai/v1") if groq_api_key else None

@app.post(
    "/api/v1/transcribe",
    status_code=status.HTTP_200_OK,
    summary="Transcribe audio using Whisper",
    tags=["Audio"],
)
async def transcribe_audio(file: UploadFile = File(...)):
    """
    Takes an audio file (e.g., .webm from the browser) and transcribes it using Groq's Whisper API.
    """
    if not openai_client:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured in .env. Please add it to use Voice Transcription.")

    suffix = ".webm"
    if file.filename:
        _, ext = os.path.splitext(file.filename)
        if ext:
            suffix = ext
            
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        with open(tmp_path, "rb") as audio_file:
            transcript = await openai_client.audio.transcriptions.create(
                model="whisper-large-v3",
                file=audio_file,
                response_format="json"
            )
        return {"text": transcript.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Whisper transcription failed: {str(e)}")
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
      "target_role": "Data Scientist",
      "num_questions": 10
    }
    ```

    Take this response, change `target_role` and `num_questions`, then POST it to `/api/v1/interviews`.

    **Valid roles:** `Data Scientist`, `ML Engineer`, `Data Analyst`, `AI Engineer`, `Software Engineer`

    **Error responses:**
    - `415` — File is not a PDF
    - `413` — File exceeds 10 MB
    - `400` — PDF could not be parsed
    """
    # Validate file type
    if file.content_type not in ("application/pdf", "application/octet-stream") and \
       not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF files are accepted."
        )

    # Read and check file size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum allowed size is {MAX_FILE_SIZE_MB} MB."
        )

    # Write to a temp file so pdf_to_structure can read it
    try:
        import io
        file_like = io.BytesIO(content)
        candidate: Candidate = pdf_to_structure(file_like)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse resume. Make sure the file is a valid PDF with readable text. ({str(e)})"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error during resume parsing: {str(e)}"
        )

    return {
        "candidate_data": candidate.model_dump(),
        "target_role": "Data Scientist",
        "num_questions": 10,
    }


@app.post(
    "/api/v1/interviews",
    response_model=CreateInterviewResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Start a new interview session",
    tags=["Interview"],
)
def create_interview(body: CreateInterviewRequest):
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
    - `400` — Invalid target_role
    - `500` — AI service unavailable or quota exhausted
    """
    if body.target_role not in VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid target_role '{body.target_role}'. Must be one of: {', '.join(VALID_ROLES)}"
        )

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
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start interview: {str(e)}"
        )

    session_id = str(uuid.uuid4())
    SESSION_STORE[session_id] = {
        "interview": interview,
        "last_accessed": datetime.utcnow(),
    }

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
def submit_answer(session_id: str, body: AnswerRequest):
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
    entry = get_session(session_id)
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
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

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
def get_transcript(session_id: str):
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
    entry = get_session(session_id)
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
def delete_session(session_id: str):
    """
    Manually remove a session from memory. Call this when the user is done.

    **Response `204 No Content`** — session deleted (empty body)

    **Error responses:**
    - `404` — Session not found
    """
    if session_id not in SESSION_STORE:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{session_id}' not found."
        )
    SESSION_STORE.pop(session_id)
    return JSONResponse(status_code=status.HTTP_204_NO_CONTENT, content=None)


@app.get(
    "/api/v1/interviews/{session_id}/evaluate",
    response_model=EvaluationResponse,
    status_code=status.HTTP_200_OK,
    summary="Evaluate all interview answers",
    tags=["Interview"],
)
def evaluate_interview(session_id: str):
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
    entry = get_session(session_id)
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
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

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
