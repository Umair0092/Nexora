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
import uuid
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import List, Optional

import pandas as pd
from fastapi import FastAPI, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()

from session import QuizSession, EvaluationResult, QuestionEvaluation

# ─── Config ───────────────────────────────────────────────────────────────────

SESSION_TTL_MINUTES = int(os.getenv("SESSION_TTL_MINUTES", 60))

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
# { session_id: { "quiz": QuizSession, "last_accessed": datetime } }
SESSION_STORE: dict = {}


# ─── Background cleanup ───────────────────────────────────────────────────────

async def cleanup_expired_sessions():
    while True:
        await asyncio.sleep(300)
        cutoff = datetime.utcnow() - timedelta(minutes=SESSION_TTL_MINUTES)
        expired = [sid for sid, d in SESSION_STORE.items() if d["last_accessed"] < cutoff]
        for sid in expired:
            SESSION_STORE.pop(sid, None)


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


class CreateQuizResponse(BaseModel):
    session_id: str
    target_role: str
    difficulty: str
    num_questions: int
    first_question: str
    questions_asked: int
    is_complete: bool


class AnswerRequest(BaseModel):
    answer: str = Field(..., min_length=1, description="Candidate's answer")


class AnswerResponse(BaseModel):
    next_question: Optional[str]
    questions_asked: int
    num_questions: int
    is_complete: bool


class TranscriptEntry(BaseModel):
    question: str
    ideal_answer: str
    answer: str


class TranscriptResponse(BaseModel):
    session_id: str
    target_role: str
    difficulty: str
    questions_asked: int
    num_questions: int
    is_complete: bool
    transcript: List[TranscriptEntry]


class QuestionEvaluationOut(BaseModel):
    question: str
    answer: str
    ideal_answer: str
    score: int
    strengths: List[str]
    improvements: List[str]
    feedback: str


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
    per_question: List[QuestionEvaluationOut]


# ─── Helper ───────────────────────────────────────────────────────────────────

def get_session(session_id: str) -> dict:
    entry = SESSION_STORE.get(session_id)
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{session_id}' not found. It may have expired (TTL: {SESSION_TTL_MINUTES} min).",
        )
    entry["last_accessed"] = datetime.utcnow()
    return entry


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
    return {"status": "ok", "active_sessions": len(SESSION_STORE)}


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
def create_quiz(body: CreateQuizRequest):
    """
    Create a new quiz session. Returns a `session_id` and the first question.

    **Example request:**
    ```json
    {
      "target_role": "SQL",
      "num_questions": 5,
      "difficulty": "medium"
    }
    ```

    **Example response `201 Created`:**
    ```json
    {
      "session_id": "f3a2c1b4-9e8d-4f7a-b2c1-1a2b3c4d5e6f",
      "target_role": "SQL",
      "difficulty": "medium",
      "num_questions": 5,
      "first_question": "What is the purpose of the HAVING clause?",
      "questions_asked": 1,
      "is_complete": false
    }
    ```

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
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    first_question = quiz.current_question
    quiz.questions_asked = 1  # mark first question as "asked"

    session_id = str(uuid.uuid4())
    SESSION_STORE[session_id] = {"quiz": quiz, "last_accessed": datetime.utcnow()}

    return {
        "session_id": session_id,
        "target_role": quiz.target_role,
        "difficulty": quiz.difficulty,
        "num_questions": quiz.num_questions,
        "first_question": first_question,
        "questions_asked": quiz.questions_asked,
        "is_complete": quiz.is_complete,
    }


@app.post(
    "/api/v1/quiz/{session_id}/answer",
    response_model=AnswerResponse,
    status_code=status.HTTP_200_OK,
    tags=["Quiz"],
    summary="Submit an answer and get the next question",
)
def submit_answer(session_id: str, body: AnswerRequest):
    """
    Submit the candidate's answer to the current question.
    Returns the next question, or signals completion when all questions are answered.

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
    entry = get_session(session_id)
    quiz: QuizSession = entry["quiz"]

    if quiz.is_complete:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This quiz is already complete. Fetch evaluation via GET /api/v1/quiz/{session_id}/evaluate",
        )

    next_q, is_complete = quiz.submit_answer(body.answer)

    return {
        "next_question": next_q,
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
def get_transcript(session_id: str):
    """
    Returns all answered Q&A pairs including the ideal answer for each question.

    **Error responses:**
    - `404` — Session not found or expired
    """
    entry = get_session(session_id)
    quiz: QuizSession = entry["quiz"]

    return {
        "session_id": session_id,
        "target_role": quiz.target_role,
        "difficulty": quiz.difficulty,
        "questions_asked": quiz.questions_asked - 1,  # answered = asked - 1 (current unanswered)
        "num_questions": quiz.num_questions,
        "is_complete": quiz.is_complete,
        "transcript": quiz.get_transcript(),
    }


@app.get(
    "/api/v1/quiz/{session_id}/evaluate",
    response_model=EvaluationResponse,
    status_code=status.HTTP_200_OK,
    tags=["Quiz"],
    summary="Evaluate all answers with AI feedback",
)
def evaluate_quiz(session_id: str):
    """
    Send all answered Q&A pairs (with ideal answers) to Gemini and receive a
    structured evaluation with per-question scores and an overall summary.

    Can be called mid-quiz or after completion.

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
    entry = get_session(session_id)
    quiz: QuizSession = entry["quiz"]

    answered = len(quiz.get_transcript())
    if answered == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No answers submitted yet. Answer at least one question before evaluating.",
        )

    try:
        result: EvaluationResult = quiz.evaluate()
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    return {
        "session_id": session_id,
        "target_role": quiz.target_role,
        "questions_asked": answered,
        "is_complete": quiz.is_complete,
        "overall_score": result.overall_score,
        "communication_score": result.communication_score,
        "technical_score": result.technical_score,
        "hire_recommendation": result.hire_recommendation,
        "top_strengths": result.top_strengths,
        "areas_to_improve": result.areas_to_improve,
        "summary": result.summary,
        "per_question": [q.model_dump() for q in result.per_question],
    }


@app.delete(
    "/api/v1/quiz/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Quiz"],
    summary="End and clean up a quiz session",
)
def delete_session(session_id: str):
    """
    Manually remove a session from memory.

    **Response `204 No Content`** — session deleted

    **Error responses:**
    - `404` — Session not found
    """
    if session_id not in SESSION_STORE:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{session_id}' not found.",
        )
    SESSION_STORE.pop(session_id)
    return JSONResponse(status_code=status.HTTP_204_NO_CONTENT, content=None)


# ─── Run ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="127.0.0.1", port=8001, reload=True, workers=1)
