import json
import time
import logging
from typing import List, Optional
from dotenv import load_dotenv
from pathlib import Path
from llm import new_llm
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from pydantic import BaseModel

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

logger = logging.getLogger("resumeaiservice.session")

STYLES = ("standard", "behavioral")
LANGUAGE_NAMES = {"en": "English", "ur": "Urdu", "fr": "French", "es": "Spanish"}


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


def _is_quota_error(error: Exception) -> bool:
    return any(k in str(error).lower() for k in ["quota", "resource", "rate", "429"])


# ─── Evaluation schemas ───────────────────────────────────────────────────────

class StarCoverage(BaseModel):
    situation: bool             # set the scene: when, where, who
    task: bool                  # their own responsibility or goal
    action: bool                # what THEY did, in first person
    result: bool                # the outcome, ideally measured
    note: str                   # one sentence on what was missing or strong


class QuestionEvaluation(BaseModel):
    question: str
    answer: str
    score: int                  # 1–10
    strengths: List[str]        # what the candidate did well
    improvements: List[str]     # what could be better
    feedback: str               # 1-2 sentence evaluation of this answer
    recommendation: str         # actionable advice specific to this answer
    star: Optional[StarCoverage] = None   # behavioral interviews only


class EvaluationResult(BaseModel):
    per_question: List[QuestionEvaluation]
    overall_score: int              # 1–10
    communication_score: int        # 1–10 (clarity, structure)
    technical_score: int            # 1–10 (depth, accuracy)
    top_strengths: List[str]        # 2-3 best things overall
    areas_to_improve: List[str]     # 2-3 things to work on
    summary: str                    # 3-5 sentence overall assessment
    hire_recommendation: str        # "Strong Yes" | "Yes" | "Maybe" | "No"
    recommendation_summary: str     # detailed paragraph on what to focus on
    improvement_points: List[str]   # specific actionable bullet points
    job_fit: Optional[str] = None   # only when a job description was given


class AnswerScore(BaseModel):
    score: int
    strengths: List[str]
    improvements: List[str]
    feedback: str
    recommendation: str
    star: Optional[StarCoverage] = None


class ImprovedAnswer(BaseModel):
    improved_answer: str
    changes: List[str]              # 2-4 short notes on what was changed and why


# ─── Shared prompt pieces ─────────────────────────────────────────────────────

def _job_section(job_description: Optional[str]) -> str:
    if not job_description:
        return ""
    return f"""
JOB DESCRIPTION (the candidate is applying for this job):
\"\"\"
{job_description}
\"\"\"
"""


STAR_CRITERIA = """STAR coverage for each answer:
- situation: did they set the scene (when, where, who was involved)?
- task: did they state their own responsibility or goal?
- action: did they describe what THEY personally did (not "we"), step by step?
- result: did they give the outcome, ideally measured, and what they learned?
- note: one sentence on the most important missing or strong STAR element."""


class Interview:

    def __init__(self, candidate_data, target_role='Software Engineer', num_questions=10, language='en',
                 style='standard', job_description: Optional[str] = None):
        try:
            self.candidate_data = candidate_data.model_dump()
        except AttributeError:
            self.candidate_data = candidate_data
        self.target_role = target_role
        self.num_questions = num_questions
        # Questions are always asked in English. `language` only governs the
        # candidate's answer transcription language and the evaluation language.
        self.language = language if language in LANGUAGE_NAMES else "en"
        self.style = style if style in STYLES else "standard"
        self.job_description = (job_description or "").strip() or None
        self.conversation_history = [SystemMessage(content=self._build_system_context())]
        self.questions_asked = 0
        self.api_call_times = []
        self.is_complete = False
        # Delivery metrics per candidate answer, in answer order (None when unknown).
        self.answer_speech: List[Optional[dict]] = []
        # Cached evaluation and the number of answers it covered.
        self.evaluation: Optional[dict] = None
        self.evaluated_answers = 0
        self._model = None

    # ─── Persistence ──────────────────────────────────────────────────────────

    def to_state(self) -> dict:
        return {
            "candidate_data": self.candidate_data,
            "target_role": self.target_role,
            "num_questions": self.num_questions,
            "language": self.language,
            "style": self.style,
            "job_description": self.job_description,
            "questions_asked": self.questions_asked,
            "is_complete": self.is_complete,
            # The system prompt is rebuilt on load, so prompt fixes reach live sessions.
            "history": [
                {"role": "ai" if isinstance(m, AIMessage) else "human", "content": m.content}
                for m in self.conversation_history
                if not isinstance(m, SystemMessage)
            ],
            "answer_speech": self.answer_speech,
            "evaluation": self.evaluation,
            "evaluated_answers": self.evaluated_answers,
        }

    @classmethod
    def from_state(cls, state: dict) -> "Interview":
        interview = cls(
            candidate_data=state["candidate_data"],
            target_role=state["target_role"],
            num_questions=state["num_questions"],
            language=state.get("language", "en"),
            style=state.get("style", "standard"),
            job_description=state.get("job_description"),
        )
        for m in state.get("history", []):
            message = AIMessage if m["role"] == "ai" else HumanMessage
            interview.conversation_history.append(message(content=m["content"]))
        interview.questions_asked = state.get("questions_asked", 0)
        interview.is_complete = state.get("is_complete", False)
        interview.answer_speech = state.get("answer_speech", [])
        interview.evaluation = state.get("evaluation")
        interview.evaluated_answers = state.get("evaluated_answers", 0)
        return interview

    @property
    def model(self):
        # Created on first use: loading a session just to read its transcript
        # shouldn't need an LLM key. One spoken question per call (plus reasoning tokens).
        if self._model is None:
            self._model = new_llm(max_tokens=1500)
        return self._model

    @property
    def answers_given(self) -> int:
        return sum(1 for m in self.conversation_history if isinstance(m, HumanMessage))

    # ─── System context (always English) ─────────────────────────────────────

    def _build_system_context(self):
        if self.style == "behavioral":
            return self._build_behavioral_context()

        job = ""
        if self.job_description:
            job = _job_section(self.job_description) + """
USING THE JOB DESCRIPTION:
- At least half of your questions must target requirements from the job description.
- Prioritise requirements the CV covers thinly or not at all, and ask how their experience transfers.
- Name the requirement you are probing in plain words, e.g. "This role leans on Kubernetes..."
"""

        return f"""You are an expert technical interviewer conducting a {self.target_role} interview.

CANDIDATE PROFILE:
{json.dumps(self.candidate_data, indent=2, ensure_ascii=False)}
{job}
YOUR INTERVIEWING STYLE:
- Professional but friendly
- Ask follow-up questions based on their answers
- Reference their specific experience/projects/skills from the profile above
- Mix behavioral, technical, and situational questions
- Keep questions concise and clear
- Show genuine interest in their answers
- Ask {self.num_questions} questions total

IMPORTANT RULES:
1. Ask ONE question at a time
2. Wait for their answer before asking next
3. Sometimes ask follow-ups based on their answer
4. Reference their resume when relevant
5. Keep track: you need to ask {self.num_questions} total questions
6. After {self.num_questions} questions, say "That completes our interview. Thank you!"

HANDLING INVALID ANSWERS:
If the candidate provides a gibberish or clearly invalid response, respond with:
"I didn't quite understand that response. Let me ask you something else instead."
Then immediately move to the next question.

OUTPUT FORMAT:
- Output ONLY the spoken text — the exact words you would say to the candidate
- Write in short, clear sentences — one idea per sentence
- Do NOT include any labels, counts, notes, meta-text, or formatting markers
- Do NOT include phrases like "(Current question count: ...)" or "Your opening:" or any annotations
- Do NOT use bullet points, numbered lists, or line breaks within a single question
"""

    def _build_behavioral_context(self):
        return f"""You are an experienced hiring manager running a behavioral interview for a {self.target_role} role.

CANDIDATE PROFILE (use it for context; ask about situations they are likely to have faced):
{json.dumps(self.candidate_data, indent=2, ensure_ascii=False)}
{_job_section(self.job_description)}
WHAT A BEHAVIORAL INTERVIEW IS:
- Every question asks for a specific past situation: "Tell me about a time...", "Describe a situation where...",
  "Give me an example of...". Never ask hypotheticals ("What would you do if...") or technical knowledge questions.
- Cover different competencies across the interview: teamwork, conflict or disagreement, ownership,
  a failure or mistake and what they learned, working under pressure or ambiguity, influencing others,
  and leadership or mentoring.
- Tie questions to their CV where natural (a project, team or job they listed), and to the job description if given.
- If an answer is vague or says "we" throughout, ask one short follow-up that pins down what THEY did
  or what the measurable result was. Otherwise move to a new competency.
- Ask {self.num_questions} questions total, one at a time.

OUTPUT FORMAT:
- Output ONLY the spoken words: one question, one or two short sentences, no labels, counts or line breaks.
"""

    # ─── Helpers ──────────────────────────────────────────────────────────────

    def _extract_text_from_response(self, response) -> str:
        if hasattr(response, 'content'):
            content = response.content
            if isinstance(content, str):
                return content.strip()
            if isinstance(content, list) and content:
                item = content[0]
                if isinstance(item, dict):
                    return (item.get('text') or item.get('content') or str(item)).strip()
                return str(item).strip()
        if isinstance(response, dict):
            return (response.get('text') or response.get('content') or str(response)).strip()
        return str(response).strip()

    def _generate_fallback_question(self) -> str:
        if self.style == "behavioral":
            questions = [
                "Tell me about a time you disagreed with a teammate. How did you handle it?",
                "Describe a project where something went wrong. What did you do?",
                "Give me an example of a time you took ownership of a problem nobody else wanted.",
                "Tell me about a time you had to deliver under a tight deadline.",
                "Describe a time you changed someone's mind about a decision.",
                "Tell me about a mistake you made and what you learned from it.",
            ]
        else:
            questions = [
                "Can you tell me about a challenging project you've worked on?",
                "What's your experience with machine learning or data analysis?",
                "Describe a time when you had to learn a new technology quickly.",
                "What interests you most about this role?",
                "Can you walk me through your problem-solving approach?",
                "Tell me about a time you worked in a team to solve a difficult problem.",
                "What are your strongest technical skills?",
                "Describe a situation where you had to handle conflicting priorities.",
            ]
        index = min(self.questions_asked, len(questions) - 1)
        return questions[index]

    # ─── Interview flow ───────────────────────────────────────────────────────

    def start_interview(self) -> str:
        if self.style == "behavioral":
            prompt = (
                "Start the interview now. Greet the candidate warmly using only their first name, "
                "then ask your first behavioral question (a specific past situation), ideally tied to "
                "something in their CV. Output exactly one or two sentences, no line breaks, no labels."
            )
        else:
            prompt = (
                "Start the interview now. "
                "Greet the candidate warmly using only their first name (no titles, no 'Mr.', no 'Ms.'). "
                "Then immediately ask ONE specific question about something concrete in their resume — "
                "a project they built, a technology they used, a challenge they solved, or a result they achieved. "
                + ("If a job description was given, pick the CV detail most relevant to it. " if self.job_description else "")
                + "Do NOT ask them to introduce themselves or walk through their background. "
                "Do NOT use 'Tell me about yourself' — go straight to a specific resume detail. "
                "Output exactly ONE sentence that is the greeting + question combined, "
                "no line breaks, no labels, no extra text."
            )

        try:
            start_time = time.time()
            response = self.model.invoke(self.conversation_history + [HumanMessage(content=prompt)])
            self.api_call_times.append(time.time() - start_time)
        except Exception as api_error:
            if _is_quota_error(api_error):
                raise RuntimeError("API quota exhausted. Please try again later.")
            opening = f"Hello! Welcome to this {self.target_role} interview. " + self._generate_fallback_question()
            self.conversation_history.append(AIMessage(content=opening))
            self.questions_asked = 1
            return opening

        opening = " ".join(self._extract_text_from_response(response).splitlines()).strip()
        if not opening or len(opening) < 10:
            opening = f"Hello! Welcome to this {self.target_role} interview. " + self._generate_fallback_question()

        self.conversation_history.append(AIMessage(content=opening))
        self.questions_asked = 1
        return opening

    def process_answer_and_get_next_question(self, user_answer: str, speech: Optional[dict] = None):
        if not user_answer or not user_answer.strip():
            return "I didn't receive your answer. Could you please share your thoughts?", False

        self.conversation_history.append(HumanMessage(content=user_answer.strip()))
        self.answer_speech.append(speech)

        if self.questions_asked >= self.num_questions:
            closing = "Thank you for your time! That completes our interview. Best of luck!"
            self.conversation_history.append(AIMessage(content=closing))
            self.is_complete = True
            return closing, True

        if self.style == "behavioral":
            guidance = """- If their last answer was vague or only said "we", ask one short follow-up about what THEY did or the measurable result
- Otherwise ask about a different competency than any question so far
- It must ask about a specific past situation, never a hypothetical"""
        else:
            guidance = """- If their answer was interesting: ask a follow-up to dig deeper into that specific point
- If their answer was complete: move to a different topic (technical, behavioral, or situational)
- Reference their resume when relevant — mention specific projects, tools, or experiences they listed""" + (
                "\n- Make sure the job description's key requirements get covered before the interview ends"
                if self.job_description else ""
            )

        instruction = f"""Based on the candidate's last answer and the conversation so far, ask your next interview question.

RULES:
- Output ONE question only — a single sentence, no line breaks, no labels, no counts, no extra text
{guidance}
- Keep the question concise and conversational

You have asked {self.questions_asked} of {self.num_questions} questions. {self.num_questions - self.questions_asked} remaining."""

        messages = self.conversation_history + [HumanMessage(content=instruction)]

        try:
            start_time = time.time()
            response = self.model.invoke(messages)
            self.api_call_times.append(time.time() - start_time)
        except Exception as api_error:
            if _is_quota_error(api_error):
                # Roll back so the same answer can be resent once the quota recovers.
                self.conversation_history.pop()
                self.answer_speech.pop()
                raise RuntimeError("API quota exhausted. Interview ended.")
            fallback = self._generate_fallback_question()
            self.conversation_history.append(AIMessage(content=fallback))
            self.questions_asked += 1
            return fallback, False

        next_question = " ".join(self._extract_text_from_response(response).splitlines()).strip()
        if not next_question or len(next_question) < 10:
            next_question = self._generate_fallback_question()

        self.conversation_history.append(AIMessage(content=next_question))
        self.questions_asked += 1
        return next_question, False

    def get_conversation_for_display(self):
        return [
            {
                "role": "interviewer" if isinstance(msg, AIMessage) else "candidate",
                "content": msg.content
            }
            for msg in self.conversation_history
            if not isinstance(msg, SystemMessage)
        ]

    def _qa_pairs(self) -> List[dict]:
        conversation = self.get_conversation_for_display()
        qa_pairs = []
        i = 0
        while i < len(conversation) - 1:
            if conversation[i]["role"] == "interviewer" and conversation[i + 1]["role"] == "candidate":
                qa_pairs.append({
                    "question": conversation[i]["content"],
                    "answer": conversation[i + 1]["content"],
                })
                i += 2
            else:
                i += 1
        return qa_pairs

    # ─── Evaluation ───────────────────────────────────────────────────────────

    def evaluate_interview(self) -> dict:
        """
        Evaluate every answered question. Returns the EvaluationResult as a dict
        with each per_question entry's `speech` metrics attached. The result is
        cached until another answer arrives, so repeat calls cost nothing.
        """
        qa_pairs = self._qa_pairs()
        if not qa_pairs:
            raise ValueError("No Q&A pairs found to evaluate.")
        if self.evaluation and self.evaluated_answers == len(qa_pairs):
            return self.evaluation

        formatted_transcript = "\n\n".join(
            f"Q{idx + 1}: {pair['question']}\nA{idx + 1}: {pair['answer']}"
            for idx, pair in enumerate(qa_pairs)
        )

        lang_name = LANGUAGE_NAMES.get(self.language, "English")
        behavioral = self.style == "behavioral"
        role_line = (
            f"an experienced hiring manager evaluating a behavioral interview for a {self.target_role} role"
            if behavioral else f"an expert technical interviewer evaluating a {self.target_role} interview"
        )
        prompt = f"""You are {role_line}.

LANGUAGE INSTRUCTION:
Write ALL text fields in your evaluation in {lang_name}.
This includes: strengths, improvements, feedback, recommendation, top_strengths,
areas_to_improve, summary, recommendation_summary, improvement_points{", star notes" if behavioral else ""}{" and job_fit" if self.job_description else ""}.
{_job_section(self.job_description)}
INTERVIEW TRANSCRIPT:
{formatted_transcript}

Evaluate EVERY question-answer pair listed above. For each one provide:
- score (1-10)
- strengths (list)
- improvements (list)
- feedback (1-2 sentences)
- recommendation (specific actionable advice for that answer)
{"- star (see STAR coverage below)" if behavioral else "- star: null"}

Then provide an overall evaluation with:
- overall_score, communication_score, technical_score (all 1-10){" — for a behavioral interview, technical_score rates the substance and specificity of the examples" if behavioral else ""}
- top_strengths (2-3 overall)
- areas_to_improve (2-3 overall)
- summary (3-5 sentences)
- hire_recommendation: one of "Strong Yes", "Yes", "Maybe", "No"
- recommendation_summary (detailed paragraph on what to focus on to improve)
- improvement_points (4-6 specific actionable bullet points)
- job_fit: {"2-3 sentences on how well the answers showed the requirements in the job description, naming the requirements that were and weren't demonstrated" if self.job_description else "null"}

Scoring criteria per answer:
- Relevance to the question
- {"Specificity: a real situation, their own actions, a concrete result" if behavioral else "Technical depth and accuracy"}
- Clarity and communication
- Use of specific examples and outcomes
{STAR_CRITERIA if behavioral else ""}
"""

        eval_llm = new_llm(max_tokens=8000).with_structured_output(EvaluationResult)

        try:
            result: EvaluationResult = eval_llm.invoke(prompt)
        except Exception as e:
            logger.exception("Interview evaluation LLM call failed")
            if _is_quota_error(e):
                raise RuntimeError("API quota exhausted. Please try again later.")
            raise RuntimeError("Evaluation failed. Please try again later.")

        # Never trust the model's numeric output — keep every score in 1–10, keep
        # exactly one entry per answer and restore the real question/answer text.
        per_question = list(result.per_question)[: len(qa_pairs)]
        for qe, pair in zip(per_question, qa_pairs):
            qe.question = pair["question"]
            qe.answer = pair["answer"]
            qe.score = _clamp_score(qe.score)
            if not behavioral:
                qe.star = None
        result.per_question = per_question
        result.overall_score = _clamp_score(result.overall_score)
        result.communication_score = _clamp_score(result.communication_score)
        result.technical_score = _clamp_score(result.technical_score)
        if not self.job_description:
            result.job_fit = None

        data = result.model_dump()
        for idx, qe in enumerate(data["per_question"]):
            qe["speech"] = self.answer_speech[idx] if idx < len(self.answer_speech) else None

        self.evaluation = data
        self.evaluated_answers = len(qa_pairs)
        return data


# ─── Single-answer tools (retry practice and rewrites) ───────────────────────

def _answer_context(question, answer, target_role, style, ideal_answer, job_description, language) -> str:
    lang_name = LANGUAGE_NAMES.get(language, "English")
    kind = "behavioral interview" if style == "behavioral" else "interview"
    ideal = f"\nMODEL ANSWER (what a strong answer covers):\n{ideal_answer}\n" if ideal_answer else ""
    return f"""This is one question from a {target_role} {kind}. Write every text field in {lang_name}.
{_job_section(job_description)}
QUESTION:
{question}
{ideal}
CANDIDATE'S ANSWER:
{answer}
"""


def score_answer(question: str, answer: str, target_role: str, style: str = "standard",
                 ideal_answer: Optional[str] = None, job_description: Optional[str] = None,
                 language: str = "en") -> dict:
    behavioral = style == "behavioral"
    prompt = _answer_context(question, answer, target_role, style, ideal_answer, job_description, language) + f"""
Score this answer on its own, as a fair but demanding interviewer would:
- score (1-10){" — compare against the model answer for accuracy and completeness" if ideal_answer else ""}
- strengths (1-3), improvements (1-3)
- feedback (1-2 sentences), recommendation (one specific, actionable change)
{STAR_CRITERIA if behavioral else "- star: null"}
"""
    llm = new_llm(max_tokens=3000).with_structured_output(AnswerScore)
    try:
        result: AnswerScore = llm.invoke(prompt)
    except Exception as e:
        logger.exception("Answer scoring LLM call failed")
        if _is_quota_error(e):
            raise RuntimeError("API quota exhausted. Please try again later.")
        raise RuntimeError("Scoring failed. Please try again later.")
    result.score = _clamp_score(result.score)
    if not behavioral:
        result.star = None
    return result.model_dump()


def improve_answer(question: str, answer: str, target_role: str, style: str = "standard",
                   ideal_answer: Optional[str] = None, job_description: Optional[str] = None,
                   language: str = "en") -> dict:
    structure = (
        "Restructure it as STAR: one or two sentences each for Situation and Task, most of the length on the "
        "candidate's own Actions in first person, then a concrete Result and what they learned."
        if style == "behavioral" else
        "Lead with a direct answer, then support it with the candidate's own specific example, and close with the outcome."
    )
    prompt = _answer_context(question, answer, target_role, style, ideal_answer, job_description, language) + f"""
Rewrite the candidate's answer into a stronger version they could say out loud in about 60-90 seconds.

RULES:
- Keep the candidate's real facts, projects, numbers and voice. Do NOT invent employers, metrics or achievements.
  Where a number or detail would help but wasn't given, write a short placeholder in square brackets, e.g. [cut load time by X%].
- {structure}
{"- Fill technical gaps using the model answer, phrased as the candidate would say it." if ideal_answer else ""}
- Plain spoken language, first person, no headings or bullet points.
- changes: 2-4 short notes on what you changed and why.
"""
    llm = new_llm(max_tokens=3000, temperature=0.4).with_structured_output(ImprovedAnswer)
    try:
        result: ImprovedAnswer = llm.invoke(prompt)
    except Exception as e:
        logger.exception("Answer rewrite LLM call failed")
        if _is_quota_error(e):
            raise RuntimeError("API quota exhausted. Please try again later.")
        raise RuntimeError("Rewrite failed. Please try again later.")
    return result.model_dump()
