import os
import json
import time
from typing import List
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from pydantic import BaseModel

load_dotenv()


# ─── Evaluation schemas ───────────────────────────────────────────────────────

class QuestionEvaluation(BaseModel):
    question: str
    answer: str
    score: int                  # 1–10
    strengths: List[str]        # what the candidate did well
    improvements: List[str]     # what could be better
    feedback: str               # 1-2 sentence evaluation of this answer
    recommendation: str         # actionable advice specific to this answer


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


class Interview:

    def __init__(self, candidate_data, target_role='Data Scientist', num_questions=10):
        self.candidate_data = candidate_data
        self.target_role = target_role
        self.num_questions = num_questions
        self.conversation_history = []
        self.questions_asked = 0
        self.api_call_times = []
        self.is_complete = False

        api_key = os.getenv("OPENROUTER_API_KEY")
        if not api_key:
            raise ValueError("OPENROUTER_API_KEY not found in environment variables")

        self.model = ChatOpenAI(
            model=os.getenv("GEMINI_MODEL", "google/gemini-2.0-flash-001"),
            api_key=os.getenv("OPENROUTER_API_KEY"),
            base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        )
        self.system_context = self._build_system_context()
        self.conversation_history.append(SystemMessage(content=self.system_context))

    def _build_system_context(self):
        try:
            candidate_dict = self.candidate_data.model_dump()
        except AttributeError:
            candidate_dict = self.candidate_data  # already a dict

        return f"""You are an expert technical interviewer conducting a {self.target_role} interview.

CANDIDATE PROFILE:
{json.dumps(candidate_dict, indent=2)}

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

Current question count: {self.questions_asked}/{self.num_questions}
"""

    def _extract_text_from_response(self, response):
        if hasattr(response, 'content'):
            content = response.content
            if isinstance(content, str):
                return content
            if isinstance(content, list) and content:
                item = content[0]
                if isinstance(item, dict):
                    return item.get('text') or item.get('content') or str(item)
                return str(item)
        if isinstance(response, dict):
            return response.get('text') or response.get('content') or str(response)
        return str(response)

    def _generate_fallback_question(self):
        fallback_questions = [
            "Can you tell me about a challenging project you've worked on?",
            "What's your experience with machine learning or data analysis?",
            "Describe a time when you had to learn a new technology quickly.",
            "What interests you most about this role?",
            "Can you walk me through your problem-solving approach?",
            "Tell me about a time you worked in a team to solve a difficult problem.",
            "What are your strongest technical skills?",
            "Describe a situation where you had to handle conflicting priorities."
        ]
        index = min(self.questions_asked, len(fallback_questions) - 1)
        return fallback_questions[index]

    def start_interview(self):
        prompt = f"""{self.system_context}

This is the start of the interview. Greet the candidate warmly and ask your first question.
Make it a classic opener like "Tell me about yourself" or "Walk me through your background"
but personalize it based on their profile.

Your opening:"""

        try:
            start_time = time.time()
            response = self.model.invoke([HumanMessage(content=prompt)])
            self.api_call_times.append(time.time() - start_time)
        except Exception as api_error:
            error_msg = str(api_error).lower()
            if any(k in error_msg for k in ["quota", "resource", "rate", "429"]):
                raise RuntimeError("API quota exhausted. Please try again later.")
            # Fallback opening on other errors
            opening = f"Hello! Welcome to this {self.target_role} interview. Could you tell me about yourself?"
            self.conversation_history.append(AIMessage(content=opening))
            self.questions_asked = 1
            return opening

        opening = self._extract_text_from_response(response)
        if not opening or len(opening.strip()) < 10:
            opening = f"Hello! Welcome to this {self.target_role} interview. Could you tell me about your background?"

        self.conversation_history.append(AIMessage(content=opening))
        self.questions_asked = 1
        return opening

    def process_answer_and_get_next_question(self, user_answer):
        if not user_answer or not user_answer.strip():
            return "I didn't receive your answer. Could you please share your thoughts?", False

        self.conversation_history.append(HumanMessage(content=user_answer.strip()))

        if self.questions_asked >= self.num_questions:
            closing = "Thank you for your time! That completes our interview. Best of luck!"
            self.conversation_history.append(AIMessage(content=closing))
            self.is_complete = True
            return closing, True

        instruction = f"""Based on the candidate's answer and conversation so far, generate your next question.

DECISION MAKING:
- If their answer was interesting/detailed: Ask a follow-up to dig deeper
- If their answer was complete: Move to a different topic/question type
- Vary between behavioral, technical, and situational questions
- Make it feel natural

Remember: You've asked {self.questions_asked}. You need {self.num_questions - self.questions_asked} more.

Your next question (just the question, keep it conversational):"""

        messages = self.conversation_history + [HumanMessage(content=instruction)]

        try:
            start_time = time.time()
            response = self.model.invoke(messages)
            self.api_call_times.append(time.time() - start_time)
        except Exception as api_error:
            error_msg = str(api_error).lower()
            if any(k in error_msg for k in ["quota", "resource", "rate", "429"]):
                raise RuntimeError("API quota exhausted. Interview ended.")
            fallback = self._generate_fallback_question()
            self.conversation_history.append(AIMessage(content=fallback))
            self.questions_asked += 1
            return fallback, False

        next_question = self._extract_text_from_response(response)
        if not next_question or len(next_question.strip()) < 10:
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

    def evaluate_interview(self) -> EvaluationResult:
        conversation = self.get_conversation_for_display()

        # Pair up interviewer questions with candidate answers
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

        if not qa_pairs:
            raise ValueError("No Q&A pairs found to evaluate.")

        formatted_transcript = "\n\n".join(
            f"Q{idx + 1}: {pair['question']}\nA{idx + 1}: {pair['answer']}"
            for idx, pair in enumerate(qa_pairs)
        )

        prompt = f"""You are an expert technical interviewer evaluating a {self.target_role} interview.

INTERVIEW TRANSCRIPT:
{formatted_transcript}

Evaluate EVERY question-answer pair listed above. For each one provide:
- score (1-10)
- strengths (list)
- improvements (list)
- feedback (1-2 sentences)
- recommendation (specific actionable advice for that answer)

Then provide an overall evaluation with:
- overall_score, communication_score, technical_score (all 1-10)
- top_strengths (2-3 overall)
- areas_to_improve (2-3 overall)
- summary (3-5 sentences)
- hire_recommendation: one of "Strong Yes", "Yes", "Maybe", "No"
- recommendation_summary (detailed paragraph on what to focus on to improve)
- improvement_points (4-6 specific actionable bullet points)

Scoring criteria per answer:
- Relevance to the question
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
