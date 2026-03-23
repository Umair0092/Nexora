import os
import json
import pandas as pd
from typing import List, Optional
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from pydantic import BaseModel

load_dotenv()

# ─── Evaluation schemas ───────────────────────────────────────────────────────

class QuestionEvaluation(BaseModel):
    question: str
    answer: str
    ideal_answer: str           # ideal answer from dataset
    score: int                  # 1–10
    strengths: List[str]        # what the candidate did well
    improvements: List[str]     # what could be better
    feedback: str               # 1-2 sentence evaluation


class EvaluationResult(BaseModel):
    per_question: List[QuestionEvaluation]
    overall_score: int              # 1–10
    communication_score: int        # 1–10 (clarity, structure)
    technical_score: int            # 1–10 (depth, accuracy)
    top_strengths: List[str]        # 2-3 best things overall
    areas_to_improve: List[str]     # 2-3 things to work on
    summary: str                    # 3-5 sentence overall assessment
    hire_recommendation: str        # "Strong Yes" | "Yes" | "Maybe" | "No"


# ─── Difficulty weights ───────────────────────────────────────────────────────

DIFFICULTY_WEIGHTS = {
    "easy":   {"Easy": 0.70, "Medium": 0.20, "Hard": 0.10},
    "medium": {"Easy": 0.20, "Medium": 0.60, "Hard": 0.20},
    "hard":   {"Easy": 0.10, "Medium": 0.20, "Hard": 0.70},
}


def _select_questions(df: pd.DataFrame, role: str, num_questions: int, difficulty: str) -> pd.DataFrame:
    """Filter and select questions with a weighted difficulty mix."""
    cat_df = df[df["Category"].str.strip() == role].copy()
    if cat_df.empty:
        raise ValueError(f"No questions found for role: '{role}'")

    pools = {
        "Easy":   cat_df[cat_df["Difficulty"] == "Easy"],
        "Medium": cat_df[cat_df["Difficulty"] == "Medium"],
        "Hard":   cat_df[cat_df["Difficulty"] == "Hard"],
    }
    weights = DIFFICULTY_WEIGHTS[difficulty]
    target = {lvl: max(1, round(num_questions * w)) for lvl, w in weights.items()}

    selected = []
    for lvl, pool in pools.items():
        n = min(target[lvl], len(pool))
        if n > 0:
            selected.append(pool.sample(n=n, random_state=42))

    if not selected:
        raise ValueError(f"No questions available for role '{role}' at difficulty '{difficulty}'")

    result = pd.concat(selected).drop_duplicates(subset=["ID"])

    if len(result) < num_questions and len(cat_df) >= num_questions:
        extra_pool = cat_df[~cat_df["ID"].isin(result["ID"])]
        need = num_questions - len(result)
        extra = extra_pool.sample(n=min(need, len(extra_pool)), random_state=99)
        result = pd.concat([result, extra]).drop_duplicates(subset=["ID"])
    elif len(result) > num_questions:
        result = result.sample(n=num_questions, random_state=7)

    return result.sample(frac=1, random_state=5).reset_index(drop=True)


# ─── Quiz session ─────────────────────────────────────────────────────────────

class QuizSession:

    def __init__(self, df: pd.DataFrame, role: str, num_questions: int, difficulty: str):
        self.target_role = role
        self.num_questions = num_questions
        self.difficulty = difficulty
        self.questions_asked = 0
        self.is_complete = False

        questions_df = _select_questions(df, role, num_questions, difficulty)
        # Build internal list of {question, ideal_answer}
        self._questions: List[dict] = [
            {"question": row["Question"], "ideal_answer": row["Answer"]}
            for _, row in questions_df.iterrows()
        ]
        # Stores candidate answers as they come in
        self._answers: List[Optional[str]] = [None] * len(self._questions)

    # ── Public helpers ────────────────────────────────────────────────────────

    @property
    def current_question(self) -> Optional[str]:
        """The question the candidate should answer right now."""
        idx = self.questions_asked  # 0-based index of current unanswered question
        if idx >= len(self._questions):
            return None
        return self._questions[idx]["question"]

    def submit_answer(self, answer: str) -> tuple[Optional[str], bool]:
        """
        Record the answer for the current question and advance.
        Returns (next_question_text | None, is_complete).
        """
        if self.is_complete:
            return None, True

        idx = self.questions_asked
        if idx >= len(self._questions):
            self.is_complete = True
            return None, True

        self._answers[idx] = answer.strip()
        self.questions_asked += 1

        if self.questions_asked >= len(self._questions):
            self.is_complete = True
            return None, True

        return self._questions[self.questions_asked]["question"], False

    def get_transcript(self) -> List[dict]:
        """Return answered Q&A pairs so far."""
        pairs = []
        for i in range(self.questions_asked):
            pairs.append({
                "question":     self._questions[i]["question"],
                "ideal_answer": self._questions[i]["ideal_answer"],
                "answer":       self._answers[i] or "",
            })
        return pairs

    # ── Evaluation ────────────────────────────────────────────────────────────

    def evaluate(self) -> EvaluationResult:
        transcript = self.get_transcript()
        if not transcript:
            raise ValueError("No answers submitted yet.")

        formatted = "\n\n".join(
            f"Q{i + 1}: {t['question']}\n"
            f"Ideal Answer: {t['ideal_answer']}\n"
            f"Candidate Answer: {t['answer']}"
            for i, t in enumerate(transcript)
        )

        prompt = f"""You are an expert technical interviewer evaluating a {self.target_role} quiz.

QUIZ TRANSCRIPT (each entry shows the question, the ideal answer, and the candidate's answer):
{formatted}

For EACH question-answer pair evaluate the candidate's answer against the ideal answer and provide:
- score (1-10)
- strengths (list of what they did well)
- improvements (list of what could be better)
- feedback (1-2 sentence evaluation)
- ideal_answer (copy the ideal answer exactly as given above)

Then provide an overall evaluation:
- overall_score (1-10)
- communication_score (1-10 — clarity and structure of answers)
- technical_score (1-10 — technical depth and accuracy vs ideal answers)
- top_strengths (2-3 highlights across the whole quiz)
- areas_to_improve (2-3 things to work on overall)
- summary (3-5 sentence overall assessment of the candidate)
- hire_recommendation: one of "Strong Yes", "Yes", "Maybe", "No"

Scoring criteria per answer:
- Relevance to the question (vs ideal answer)
- Technical depth and accuracy
- Clarity and communication
- Use of specific examples and outcomes
"""

        eval_llm = ChatOpenAI(
            model=os.getenv("GEMINI_MODEL", "google/gemini-2.0-flash-001"),
            api_key=os.getenv("OPENROUTER_API_KEY"),
            base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        ).with_structured_output(EvaluationResult)

        try:
            result: EvaluationResult = eval_llm.invoke(prompt)
        except Exception as e:
            error_msg = str(e).lower()
            if any(k in error_msg for k in ["quota", "resource", "rate", "429"]):
                raise RuntimeError("API quota exhausted. Please try again later.")
            raise RuntimeError(f"Evaluation failed: {str(e)}")

        return result
