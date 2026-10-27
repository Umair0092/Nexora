import json
import logging
import pandas as pd
from typing import List, Optional
from dotenv import load_dotenv
from pathlib import Path
from langchain_openai import ChatOpenAI
from llm import new_llm
from pydantic import BaseModel

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

logger = logging.getLogger("interview_feedback.session")

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
    """
    Filter and select questions with a weighted difficulty mix.

    Sampling is deliberately unseeded so every session gets a fresh selection
    and ordering. The result may contain fewer than `num_questions` rows when
    the category pool is small.
    """
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
            selected.append(pool.sample(n=n))

    if not selected:
        raise ValueError(f"No questions available for role '{role}' at difficulty '{difficulty}'")

    result = pd.concat(selected).drop_duplicates(subset=["ID"])

    if len(result) < num_questions:
        extra_pool = cat_df[~cat_df["ID"].isin(result["ID"])]
        need = num_questions - len(result)
        extra = extra_pool.sample(n=min(need, len(extra_pool)))
        result = pd.concat([result, extra]).drop_duplicates(subset=["ID"])
    elif len(result) > num_questions:
        result = result.sample(n=num_questions)

    return result.sample(frac=1).reset_index(drop=True)


# ─── Quiz session ─────────────────────────────────────────────────────────────

SUPPORTED_LANGUAGES = {"en", "ur", "fr", "es"}

LANGUAGE_NAMES = {
    "en": "English",
    "ur": "Urdu",
    "fr": "French",
    "es": "Spanish",
}


def _clamp_score(value, low: int = 1, high: int = 10) -> int:
    """
    Coerce an LLM-produced score into the [low, high] range.

    Examples:
        _clamp_score(0)    -> 1
        _clamp_score(12)   -> 10
        _clamp_score("7")  -> 7
        _clamp_score(None) -> 1
    """
    try:
        n = int(round(float(value)))
    except (TypeError, ValueError):
        return low
    return max(low, min(high, n))


def _new_llm() -> ChatOpenAI:
    # Translation and evaluation both fit well under this, reasoning tokens included.
    return new_llm(max_tokens=8000)


class QuizSession:
    """
    One candidate's quiz run.

    Progress is tracked with a single counter, `answered`:
      - the current (unanswered) question is `_questions[answered]`
      - the Nth call to submit_answer() stores its answer against question N
      - the quiz is complete once `answered == num_questions`

    `questions_asked` is a derived, read-only view kept for API compatibility:
    the number of questions shown to the candidate so far, including the
    current one (1 right after creation, `num_questions` at the last one).
    """

    def __init__(self, df: Optional[pd.DataFrame], role: str, num_questions: int, difficulty: str, language: str = "en"):
        self.target_role = role
        self.difficulty = difficulty
        self.language = language if language in SUPPORTED_LANGUAGES else "en"
        self.answered = 0
        # Delivery metrics per answer (None when unknown) and the cached evaluation.
        self._speech: List[Optional[dict]] = []
        self.evaluation: Optional[dict] = None
        self.evaluated_answers = 0
        self._translation_cache: dict = {}

        if df is None:  # from_state() fills in the rest
            self._questions: List[dict] = []
            self._answers: List[Optional[str]] = []
            self.num_questions = 0
            return

        questions_df = _select_questions(df, role, num_questions, difficulty)
        # Build internal list of {question, ideal_answer}
        self._questions = [
            {"question": row["Question"], "ideal_answer": row["Answer"]}
            for _, row in questions_df.iterrows()
        ]
        # Report the real count — the pool may hold fewer than requested.
        self.num_questions = len(self._questions)
        # Stores candidate answers as they come in
        self._answers = [None] * len(self._questions)
        self._speech = [None] * len(self._questions)

        # Translation cache — populated once at init for non-English sessions
        if self.language != "en":
            self._translate_all_questions()

    # ── Persistence ───────────────────────────────────────────────────────────

    def to_state(self) -> dict:
        return {
            "target_role": self.target_role,
            "difficulty": self.difficulty,
            "language": self.language,
            "answered": self.answered,
            "questions": self._questions,
            "answers": self._answers,
            "speech": self._speech,
            "translations": self._translation_cache,
            "evaluation": self.evaluation,
            "evaluated_answers": self.evaluated_answers,
        }

    @classmethod
    def from_state(cls, state: dict) -> "QuizSession":
        quiz = cls(None, state["target_role"], 0, state["difficulty"], state.get("language", "en"))
        quiz._questions = state["questions"]
        quiz.num_questions = len(quiz._questions)
        quiz._answers = state.get("answers") or [None] * quiz.num_questions
        quiz._speech = state.get("speech") or [None] * quiz.num_questions
        quiz.answered = state.get("answered", 0)
        quiz._translation_cache = state.get("translations") or {}
        quiz.evaluation = state.get("evaluation")
        quiz.evaluated_answers = state.get("evaluated_answers", 0)
        return quiz

    # ── Progress ──────────────────────────────────────────────────────────────

    @property
    def is_complete(self) -> bool:
        return self.answered >= len(self._questions)

    @property
    def questions_asked(self) -> int:
        """Questions shown so far, including the current unanswered one."""
        return min(self.answered + 1, len(self._questions))

    @property
    def current_question(self) -> Optional[str]:
        """The (English) question the candidate should answer right now, or None when complete."""
        if self.is_complete:
            return None
        return self._questions[self.answered]["question"]

    # ── Translation ───────────────────────────────────────────────────────────

    def _translate_all_questions(self) -> None:
        """
        Pre-translate every question in one LLM call at session creation time.
        Uses a JSON array response to guarantee index alignment.
        Populates self._translation_cache so get_translated_question() is instant.

        Never raises: if the LLM call or JSON parsing fails, the cache stays
        empty and questions are served in English.
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

        try:
            response = _new_llm().invoke(prompt)
            raw = response.content.strip() if hasattr(response, "content") else str(response).strip()

            # Strip markdown code fences if the LLM wrapped the JSON
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip()

            translated_list = json.loads(raw)
            if not isinstance(translated_list, list):
                raise ValueError("translation response is not a JSON array")
        except Exception as e:
            logger.warning(
                "Question translation to %s failed; falling back to English: %s",
                lang_name, e,
            )
            return

        if len(translated_list) != len(questions):
            logger.warning(
                "Translation returned %d items for %d questions; unmatched ones stay in English",
                len(translated_list), len(questions),
            )

        # Map each original question to its translation by index
        for orig, translated in zip(questions, translated_list):
            if translated and isinstance(translated, str):
                self._translation_cache[orig] = translated.strip()

    def get_translated_question(self, question: Optional[str]) -> Optional[str]:
        """
        Return the question in the session's language.
        English questions are returned as-is.
        Translated questions come from the pre-populated cache (English fallback).
        """
        if not question or self.language == "en":
            return question
        return self._translation_cache.get(question, question)

    # ── Answers ───────────────────────────────────────────────────────────────

    def submit_answer(self, answer: str, speech: Optional[dict] = None) -> tuple[Optional[str], bool]:
        """
        Record the answer (and its delivery metrics) for the current question and advance.
        Returns (next_question_text | None, is_complete). The next question is
        raw English — api.py calls get_translated_question().
        """
        if self.is_complete:
            return None, True

        self._answers[self.answered] = answer.strip()
        self._speech[self.answered] = speech
        self.answered += 1

        return self.current_question, self.is_complete

    def _answered_pairs(self) -> List[dict]:
        """Raw (English) {question, ideal_answer, answer} for answered questions only."""
        return [
            {
                "question":     self._questions[i]["question"],
                "ideal_answer": self._questions[i]["ideal_answer"],
                "answer":       self._answers[i] or "",
            }
            for i in range(self.answered)
        ]

    def get_transcript(self, include_ideal: Optional[bool] = None) -> List[dict]:
        """
        Return answered Q&A pairs, with questions in the session language.

        `ideal_answer` is only revealed once the quiz is complete (or when
        `include_ideal=True` is passed explicitly); otherwise it is None so it
        cannot leak while the candidate is still answering.
        """
        if include_ideal is None:
            include_ideal = self.is_complete
        return [
            {
                "question":     self.get_translated_question(p["question"]),
                "answer":       p["answer"],
                "ideal_answer": p["ideal_answer"] if include_ideal else None,
            }
            for p in self._answered_pairs()
        ]

    # ── Evaluation ────────────────────────────────────────────────────────────

    def evaluate(self) -> dict:
        """
        Evaluate every answered question. Returns the EvaluationResult as a dict
        with each per_question entry's `speech` metrics attached, cached until
        another answer arrives.
        """
        # Use raw English questions for LLM evaluation (better technical accuracy)
        # but keep translated versions to replace back into the result afterward.
        # Only answered questions are evaluated.
        raw_transcript = self._answered_pairs()

        if not raw_transcript:
            raise ValueError("No answers submitted yet.")
        if self.evaluation and self.evaluated_answers == len(raw_transcript):
            return self.evaluation

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

        eval_llm = _new_llm().with_structured_output(EvaluationResult)

        try:
            result: EvaluationResult = eval_llm.invoke(prompt)
        except Exception as e:
            logger.exception("Quiz evaluation LLM call failed")
            error_msg = str(e).lower()
            if any(k in error_msg for k in ["quota", "resource", "rate", "429"]):
                raise RuntimeError("API quota exhausted. Please try again later.")
            raise RuntimeError("Evaluation failed. Please try again later.")

        data = self._sanitize_result(result, raw_transcript).model_dump()
        for i, qe in enumerate(data["per_question"]):
            qe["speech"] = self._speech[i] if i < len(self._speech) else None
        self.evaluation = data
        self.evaluated_answers = len(raw_transcript)
        return data

    def _sanitize_result(self, result: EvaluationResult, raw_transcript: List[dict]) -> EvaluationResult:
        """
        Make the LLM output trustworthy: keep one entry per answered question
        (drop extras), restore the real question/answer/ideal_answer text
        (translated question for non-English sessions), clamp scores to 1–10.
        """
        per_question = list(result.per_question)[: len(raw_transcript)]
        for qe, t in zip(per_question, raw_transcript):
            qe.question = self.get_translated_question(t["question"])
            qe.answer = t["answer"]
            qe.ideal_answer = t["ideal_answer"]
            qe.score = _clamp_score(qe.score)
        result.per_question = per_question

        result.overall_score = _clamp_score(result.overall_score)
        result.communication_score = _clamp_score(result.communication_score)
        result.technical_score = _clamp_score(result.technical_score)
        return result
