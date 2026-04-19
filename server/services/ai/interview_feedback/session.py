import os
import json
import unicodedata
import pandas as pd
from typing import List, Optional
from dotenv import load_dotenv
from pathlib import Path
from langchain_openai import ChatOpenAI
from pydantic import BaseModel

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

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

SUPPORTED_LANGUAGES = {"en", "ur"}

LANGUAGE_NAMES = {
    "en": "English",
    "ur": "Urdu",
}


class QuizSession:

    def __init__(self, df: pd.DataFrame, role: str, num_questions: int, difficulty: str, language: str = "en"):
        self.target_role = role
        self.num_questions = num_questions
        self.difficulty = difficulty
        self.language = language if language in SUPPORTED_LANGUAGES else "en"
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

        # Translation cache — populated once at init for non-English sessions
        self._translation_cache: dict = {}
        if self.language != "en":
            self._translate_all_questions()

    # ── Public helpers ────────────────────────────────────────────────────────

    @property
    def current_question(self) -> Optional[str]:
        """The question the candidate should answer right now."""
        idx = self.questions_asked  # 0-based index of current unanswered question
        if idx >= len(self._questions):
            return None
        return self._questions[idx]["question"]

    def _translate_all_questions(self) -> None:
        """
        Pre-translate every question in one LLM call at session creation time.
        Uses a JSON array response to guarantee index alignment.
        Populates self._translation_cache so get_translated_question() is instant.
        """
        if self.language == "en":
            return

        lang_name = LANGUAGE_NAMES[self.language]
        questions = [q["question"] for q in self._questions]
        input_json = json.dumps(questions, ensure_ascii=False)

        prompt = (
            f"Translate each question in the following JSON array into {lang_name}. "
            f"Return ONLY a valid JSON array of the same length in the same order. "
            f"Do not add any explanation, markdown, or extra text — just the JSON array.\n\n"
            f"{input_json}"
        )

        llm = ChatOpenAI(
            model=os.getenv("FEEDBACK_GEMINI_MODEL", "google/gemini-2.0-flash-001"),
            api_key=os.getenv("FEEDBACK_OPENROUTER_API_KEY"),
            base_url=os.getenv("FEEDBACK_OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        )
        response = llm.invoke(prompt)
        raw = response.content.strip() if hasattr(response, "content") else str(response).strip()

        # Strip markdown code fences if the LLM wrapped the JSON
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        translated_list: list = json.loads(raw)

        # Map each original question to its translation by index
        for orig, translated in zip(questions, translated_list):
            if translated and isinstance(translated, str):
                self._translation_cache[orig] = translated.strip()

    def get_translated_question(self, question: Optional[str]) -> Optional[str]:
        """
        Return the question in the session's language.
        English questions are returned as-is.
        Translated questions come from the pre-populated cache.
        """
        if not question or self.language == "en":
            return question
        return self._translation_cache.get(question, question)

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

        return self._questions[self.questions_asked]["question"], False  # raw English — api.py calls get_translated_question()

    def get_transcript(self) -> List[dict]:
        """Return answered Q&A pairs so far, with questions in the session language."""
        pairs = []
        for i in range(self.questions_asked):
            pairs.append({
                "question":     self.get_translated_question(self._questions[i]["question"]),
                "ideal_answer": self._questions[i]["ideal_answer"],
                "answer":       self._answers[i] or "",
            })
        return pairs

    # ── Evaluation ────────────────────────────────────────────────────────────

    def evaluate(self) -> EvaluationResult:
        # Use raw English questions for LLM evaluation (better technical accuracy)
        # but keep translated versions to replace back into the result afterward
        raw_transcript = []
        for i in range(self.questions_asked):
            raw_transcript.append({
                "question":     self._questions[i]["question"],
                "ideal_answer": self._questions[i]["ideal_answer"],
                "answer":       self._answers[i] or "",
            })

        if not raw_transcript:
            raise ValueError("No answers submitted yet.")

        formatted = "\n\n".join(
            f"Q{i + 1}: {t['question']}\n"
            f"Ideal Answer: {t['ideal_answer']}\n"
            f"Candidate Answer: {t['answer']}"
            for i, t in enumerate(raw_transcript)
        )

        lang_name = LANGUAGE_NAMES.get(self.language, "English")
        prompt = f"""You are an expert technical interviewer evaluating a {self.target_role} quiz.

LANGUAGE INSTRUCTION:
Write ALL text fields in your evaluation in {lang_name}.
This includes: strengths, improvements, feedback, top_strengths,
areas_to_improve, and summary. ideal_answer should be copied exactly as-is.

QUIZ TRANSCRIPT (each entry shows the question, the ideal answer, and the candidate's answer):
{formatted}

For EACH question-answer pair evaluate the candidate's answer against the ideal answer and provide:
- score (1-10)
- strengths (list of what they did well, in {lang_name})
- improvements (list of what could be better, in {lang_name})
- feedback (1-2 sentence evaluation, in {lang_name})
- ideal_answer (copy the ideal answer exactly as given above)

Then provide an overall evaluation:
- overall_score (1-10)
- communication_score (1-10 — clarity and structure of answers)
- technical_score (1-10 — technical depth and accuracy vs ideal answers)
- top_strengths (2-3 highlights across the whole quiz, in {lang_name})
- areas_to_improve (2-3 things to work on overall, in {lang_name})
- summary (3-5 sentence overall assessment of the candidate, in {lang_name})
- hire_recommendation: one of "Strong Yes", "Yes", "Maybe", "No"

Scoring criteria per answer:
- Relevance to the question (vs ideal answer)
- Technical depth and accuracy
- Clarity and communication
- Use of specific examples and outcomes
"""

        eval_llm = ChatOpenAI(
            model=os.getenv("FEEDBACK_GEMINI_MODEL", "google/gemini-2.0-flash-001"),
            api_key=os.getenv("FEEDBACK_OPENROUTER_API_KEY"),
            base_url=os.getenv("FEEDBACK_OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        ).with_structured_output(EvaluationResult)

        try:
            result: EvaluationResult = eval_llm.invoke(prompt)
        except Exception as e:
            error_msg = str(e).lower()
            if any(k in error_msg for k in ["quota", "resource", "rate", "429"]):
                raise RuntimeError("API quota exhausted. Please try again later.")
            raise RuntimeError(f"Evaluation failed: {str(e)}")

        # Replace English question text in per_question with the translated version
        if self.language != "en":
            for i, qe in enumerate(result.per_question):
                if i < len(raw_transcript):
                    qe.question = self.get_translated_question(raw_transcript[i]["question"])

        return result
