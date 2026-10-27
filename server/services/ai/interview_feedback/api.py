"""
Interview Feedback — FastAPI Microservice
==========================================
Endpoints:
  GET    /health
  GET    /api/v1/quiz/categories
  POST   /api/v1/quiz
  POST   /api/v1/quiz/{session_id}/answer
  GET    /api/v1/quiz/{session_id}/transcript
  GET    /api/v1/quiz/{session_id}/evaluate
  DELETE /api/v1/quiz/{session_id}
"""

import os
import asyncio
import logging
from contextlib import asynccontextmanager, contextmanager
from typing import List, Optional, Literal

import pandas as pd
from fastapi import Depends, FastAPI, Header, HTTPException, Response, status
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from session import QuizSession
from store import build_store, SessionNotFound

# ─── Config ───────────────────────────────────────────────────────────────────

SESSION_TTL_MINUTES = int(os.getenv("FEEDBACK_SESSION_TTL_MINUTES", 180))
# Max concurrently active quiz sessions per owner (X-User-Id). Creating one
# more evicts that owner's oldest session.
MAX_SESSIONS_PER_OWNER = int(os.getenv("FEEDBACK_MAX_SESSIONS_PER_OWNER", 5))

logger = logging.getLogger("interview_feedback.api")

CSV_PATH = os.path.join(os.path.dirname(__file__), "new_interview_questions.csv")

VALID_DIFFICULTIES = ["easy", "medium", "hard"]

# ─── Load dataset once at startup ────────────────────────────────────────────

def _load_df() -> pd.DataFrame:
    df = pd.read_csv(CSV_PATH)
    df.columns = df.columns.str.strip()
    df["Difficulty"] = df["Difficulty"].str.strip().str.title()
    return df

DF: pd.DataFrame = _load_df()
VALID_ROLES: List[str] = sorted(DF["Category"].unique().tolist())

# ─── Session store ────────────────────────────────────────────────────────────
# Postgres when DATABASE_URL is set (survives restarts), in-memory otherwise.
# Each session records its `owner`: the trusted X-User-Id header injected by the
# gateway (or by Rails for server-to-server calls).
STORE = build_store()
KIND = "quiz"


# ─── Background cleanup ───────────────────────────────────────────────────────

async def cleanup_expired_sessions():
    while True:
        await asyncio.sleep(300)
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
    title="Interview Feedback API",
    description="REST API for CSV-based technical interview quizzes with AI evaluation",
    version="1.0.0",
    lifespan=lifespan,
)


# ─── Pydantic models ──────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    active_sessions: int


class CategoriesResponse(BaseModel):
    categories: List[str]
    difficulties: List[str]


class CreateQuizRequest(BaseModel):
    target_role: str = Field(..., description="One of the available categories")
    num_questions: int = Field(default=5, ge=1, le=20, description="Number of questions (1–20)")
    difficulty: str = Field(default="medium", description="easy | medium | hard")
    language: Literal["en", "ur", "fr", "es"] = Field(
        default="en",
        description="Quiz language: 'en' English, 'ur' Urdu, 'fr' French, 'es' Spanish",
    )


class CreateQuizResponse(BaseModel):
    session_id: str
    target_role: str
    difficulty: str
    num_questions: int
    first_question: str
    questions_asked: int
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
    answer: str = Field(..., min_length=1, max_length=10000, description="Candidate's answer")
    speech: Optional[SpeechMetrics] = Field(default=None, description="Delivery metrics from /transcribe for this answer")


class AnswerResponse(BaseModel):
    next_question: Optional[str]
    questions_asked: int
    num_questions: int
    is_complete: bool


class TranscriptEntry(BaseModel):
    question: str
    answer: str
    ideal_answer: Optional[str] = None   # only revealed once the quiz is complete


class TranscriptResponse(BaseModel):
    session_id: str
    target_role: str
    difficulty: str
    language: str
    questions_answered: int              # answered so far
    questions_asked: int                 # shown so far, incl. the current one
    num_questions: int
    is_complete: bool
    current_question: Optional[str]      # current unanswered question (None when complete)
    transcript: List[TranscriptEntry]


class QuestionEvaluationOut(BaseModel):
    question: str
    answer: str
    ideal_answer: str
    score: int
    strengths: List[str]
    improvements: List[str]
    feedback: str
    speech: Optional[SpeechMetrics] = None


class EvaluationResponse(BaseModel):
    session_id: str
    target_role: str
    language: str
    questions_asked: int
    is_complete: bool
    overall_score: int
    communication_score: int
    technical_score: int
    hire_recommendation: str
    top_strengths: List[str]
    areas_to_improve: List[str]
    summary: str
    per_question: List[QuestionEvaluationOut]


# ─── Helpers ──────────────────────────────────────────────────────────────────

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
        detail=f"Session '{session_id}' not found. It may have expired (TTL: {SESSION_TTL_MINUTES} min).",
    )


@contextmanager
def open_quiz(session_id: str, owner: Optional[str]):
    """
    Load a quiz for this owner, yield it, and save its state afterwards.

    A session created with an owner is only visible to that same owner; any
    other caller gets the same 404 as for a missing session so ids can't be
    probed. Nothing is saved when the block raises.
    """
    try:
        with STORE.open(session_id, KIND, owner) as entry:
            quiz = QuizSession.from_state(entry.state)
            yield quiz
            entry.state = quiz.to_state()
    except SessionNotFound:
        raise not_found(session_id)


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse, tags=["System"], summary="Health check")
def health():
    """
    Returns service status and number of active quiz sessions.

    **Example response:**
    ```json
    { "status": "ok", "active_sessions": 2 }
    ```
    """
    return {"status": "ok", "active_sessions": STORE.count(KIND)}


@app.get(
    "/api/v1/quiz/categories",
    response_model=CategoriesResponse,
    tags=["Quiz"],
    summary="List available categories and difficulties",
)
def list_categories():
    """
    Returns all available question categories (roles) and difficulty levels.

    **Example response:**
    ```json
    {
      "categories": ["AI (Data Science)", "Containers and Cloud", "DevOps", "General Software Engineering", "SQL"],
      "difficulties": ["easy", "medium", "hard"]
    }
    ```
    """
    return {"categories": VALID_ROLES, "difficulties": VALID_DIFFICULTIES}


@app.post(
    "/api/v1/quiz",
    response_model=CreateQuizResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Quiz"],
    summary="Start a new quiz session",
)
def create_quiz(body: CreateQuizRequest, owner: Optional[str] = Depends(current_owner)):
    """
    Create a new quiz session. Returns a `session_id` and the first question.

    **Example request:**
    ```json
    {
      "target_role": "SQL",
      "num_questions": 5,
      "difficulty": "medium",
      "language": "en"
    }
    ```

    `language` is one of `en`, `ur`, `fr`, `es`. If translating the questions
    fails, the quiz silently falls back to English questions.

    **Example response `201 Created`:**
    ```json
    {
      "session_id": "f3a2c1b4-9e8d-4f7a-b2c1-1a2b3c4d5e6f",
      "target_role": "SQL",
      "difficulty": "medium",
      "num_questions": 5,
      "first_question": "What is the purpose of the HAVING clause?",
      "questions_asked": 1,
      "is_complete": false,
      "language": "en"
    }
    ```

    `num_questions` is the number of questions actually selected, which can be
    lower than requested when the category pool is small. `questions_asked`
    counts questions shown so far, including the current one.

    **Error responses:**
    - `400` — Invalid target_role or difficulty
    """
    if body.target_role not in VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid target_role '{body.target_role}'. Must be one of: {', '.join(VALID_ROLES)}",
        )
    if body.difficulty.lower() not in VALID_DIFFICULTIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid difficulty '{body.difficulty}'. Must be one of: {', '.join(VALID_DIFFICULTIES)}",
        )

    try:
        quiz = QuizSession(
            df=DF,
            role=body.target_role,
            num_questions=body.num_questions,
            difficulty=body.difficulty.lower(),
            language=body.language,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    first_question = quiz.get_translated_question(quiz.current_question)
    session_id = STORE.create(KIND, owner, quiz.to_state(), MAX_SESSIONS_PER_OWNER)

    return {
        "session_id": session_id,
        "target_role": quiz.target_role,
        "difficulty": quiz.difficulty,
        "num_questions": quiz.num_questions,
        "first_question": first_question,
        "questions_asked": quiz.questions_asked,
        "is_complete": quiz.is_complete,
        "language": quiz.language,
    }


@app.post(
    "/api/v1/quiz/{session_id}/answer",
    response_model=AnswerResponse,
    status_code=status.HTTP_200_OK,
    tags=["Quiz"],
    summary="Submit an answer and get the next question",
)
def submit_answer(session_id: str, body: AnswerRequest, owner: Optional[str] = Depends(current_owner)):
    """
    Submit the candidate's answer to the current question.
    Returns the next question, or signals completion when all questions are answered.
    The Nth answer submitted is always stored against the Nth question shown.

    **Example response — still in progress:**
    ```json
    {
      "next_question": "How do you perform a SQL self-join?",
      "questions_asked": 3,
      "num_questions": 5,
      "is_complete": false
    }
    ```

    **Example response — quiz complete:**
    ```json
    {
      "next_question": null,
      "questions_asked": 5,
      "num_questions": 5,
      "is_complete": true
    }
    ```

    **Error responses:**
    - `404` — Session not found or expired
    - `410` — Quiz already complete
    """
    with open_quiz(session_id, owner) as quiz:
        if quiz.is_complete:
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail="This quiz is already complete. Fetch evaluation via GET /api/v1/quiz/{session_id}/evaluate",
            )

        next_q, is_complete = quiz.submit_answer(body.answer, body.speech.model_dump() if body.speech else None)
        translated_q = quiz.get_translated_question(next_q) if next_q else None

        return {
            "next_question": translated_q,
            "questions_asked": quiz.questions_asked,
            "num_questions": quiz.num_questions,
            "is_complete": is_complete,
        }


@app.get(
    "/api/v1/quiz/{session_id}/transcript",
    response_model=TranscriptResponse,
    status_code=status.HTTP_200_OK,
    tags=["Quiz"],
    summary="Get all answered questions so far",
)
def get_transcript(session_id: str, owner: Optional[str] = Depends(current_owner)):
    """
    Returns the answered Q&A pairs so far plus the current unanswered question
    (useful to resume a quiz after a page reload).

    `ideal_answer` is only included once the quiz is complete; while it is in
    progress it is `null` so the expected answers cannot be read ahead.

    **Example response `200 OK`** (in progress):
    ```json
    {
      "session_id": "f3a2c1b4-...",
      "target_role": "SQL",
      "difficulty": "medium",
      "language": "en",
      "questions_answered": 1,
      "questions_asked": 2,
      "num_questions": 5,
      "is_complete": false,
      "current_question": "How do you perform a SQL self-join?",
      "transcript": [
        { "question": "What is the purpose of the HAVING clause?", "answer": "It filters groups...", "ideal_answer": null }
      ]
    }
    ```

    **Error responses:**
    - `404` — Session not found or expired
    """
    with open_quiz(session_id, owner) as quiz:
        return {
            "session_id": session_id,
            "target_role": quiz.target_role,
            "difficulty": quiz.difficulty,
            "language": quiz.language,
            "questions_answered": quiz.answered,
            "questions_asked": quiz.questions_asked,
            "num_questions": quiz.num_questions,
            "is_complete": quiz.is_complete,
            "current_question": quiz.get_translated_question(quiz.current_question),
            "transcript": quiz.get_transcript(),
        }


@app.get(
    "/api/v1/quiz/{session_id}/evaluate",
    response_model=EvaluationResponse,
    status_code=status.HTTP_200_OK,
    tags=["Quiz"],
    summary="Evaluate all answers with AI feedback",
)
def evaluate_quiz(session_id: str, owner: Optional[str] = Depends(current_owner)):
    """
    Send all answered Q&A pairs (with ideal answers) to the LLM and receive a
    structured evaluation with per-question scores and an overall summary.

    Can be called mid-quiz or after completion. The result is cached until another
    answer arrives. Each per_question entry carries the `speech` metrics sent with
    that answer (or null). Rails calls this server-to-server when saving the report.

    **Example response `200 OK`:**
    ```json
    {
      "session_id": "f3a2c1b4-...",
      "target_role": "SQL",
      "questions_asked": 5,
      "is_complete": true,
      "overall_score": 7,
      "communication_score": 8,
      "technical_score": 6,
      "hire_recommendation": "Yes",
      "top_strengths": ["Strong understanding of aggregate functions", "Clear communication"],
      "areas_to_improve": ["Could elaborate on self-joins", "System design knowledge limited"],
      "summary": "The candidate demonstrated solid SQL fundamentals...",
      "per_question": [
        {
          "question": "What is the purpose of the HAVING clause?",
          "answer": "HAVING filters groups after GROUP BY...",
          "ideal_answer": "The HAVING clause filters records after GROUP BY...",
          "score": 9,
          "strengths": ["Accurate and complete", "Mentioned aggregate functions"],
          "improvements": ["Could add a SQL example"],
          "feedback": "Excellent answer covering all key aspects."
        }
      ]
    }
    ```

    **Error responses:**
    - `404` — Session not found or expired
    - `400` — No answers submitted yet
    - `503` — LLM unavailable or quota exhausted
    """
    with open_quiz(session_id, owner) as quiz:
        answered = quiz.answered
        if answered == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No answers submitted yet. Answer at least one question before evaluating.",
            )

        try:
            result = quiz.evaluate()
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
        except RuntimeError as e:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
        except Exception:
            logger.exception("Unexpected error evaluating quiz %s", session_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Evaluation failed due to an internal error. Please try again later.",
            )

        return {
            **result,
            "session_id": session_id,
            "target_role": quiz.target_role,
            "language": quiz.language,
            "questions_asked": answered,
            "is_complete": quiz.is_complete,
        }


@app.delete(
    "/api/v1/quiz/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Quiz"],
    summary="End and clean up a quiz session",
)
def delete_session(session_id: str, owner: Optional[str] = Depends(current_owner)):
    """
    Remove a session. Called once the report has been saved.

    **Response `204 No Content`** — session deleted

    **Error responses:**
    - `404` — Session not found
    """
    if not STORE.delete(session_id, KIND, owner):
        raise not_found(session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ─── Run ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="127.0.0.1", port=8001, reload=True, workers=1)
