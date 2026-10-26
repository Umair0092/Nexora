"""
Tests for the quiz service (interview_feedback).

No network: every LLM call goes through session._new_llm(), which these
tests replace with fakes.

Run:
    cd server/services/ai/interview_feedback && python -m pytest tests -q
"""

import json
import os
import sys
from pathlib import Path

import pandas as pd
import pytest

SERVICE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVICE_DIR))
os.environ.setdefault("FEEDBACK_OPENROUTER_API_KEY", "test-key")

from fastapi.testclient import TestClient  # noqa: E402

import api  # noqa: E402
import session  # noqa: E402
from session import EvaluationResult, QuestionEvaluation, QuizSession  # noqa: E402

ROLE = "SQL"
OWNER = {"X-User-Id": "42"}


# ─── Fakes ────────────────────────────────────────────────────────────────────

class _Msg:
    def __init__(self, content):
        self.content = content


class FakeTranslateLLM:
    """Translates a JSON array of questions by prefixing each with '[lang] '."""

    def __init__(self, prefix):
        self.prefix = prefix

    def invoke(self, prompt):
        arr = json.loads(prompt[prompt.index("["):])
        return _Msg("```json\n" + json.dumps([f"{self.prefix} {q}" for q in arr]) + "\n```")


class FakeEvalLLM:
    """Returns an EvaluationResult with out-of-range scores and junk text."""

    def __init__(self, n_items):
        self.n_items = n_items
        self.prompt = None

    def with_structured_output(self, _schema):
        return self

    def invoke(self, prompt):
        self.prompt = prompt
        return EvaluationResult(
            per_question=[
                QuestionEvaluation(
                    question="hallucinated", answer="hallucinated", ideal_answer="x",
                    score=15 if i % 2 else -3, strengths=["s"], improvements=["i"], feedback="f",
                )
                for i in range(self.n_items)
            ],
            overall_score=11, communication_score=0, technical_score=7,
            top_strengths=["a"], areas_to_improve=["b"], summary="ok", hire_recommendation="Yes",
        )


@pytest.fixture(autouse=True)
def _isolate(monkeypatch):
    api.SESSION_STORE.clear()

    def _no_llm():
        raise AssertionError("LLM must not be called in this test")

    monkeypatch.setattr(session, "_new_llm", _no_llm)
    yield
    api.SESSION_STORE.clear()


@pytest.fixture
def client():
    return TestClient(api.app)


def _create(client, headers=OWNER, **overrides):
    body = {"target_role": ROLE, "num_questions": 5, "difficulty": "medium", "language": "en"}
    body.update(overrides)
    r = client.post("/api/v1/quiz", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


# ─── Question/answer alignment (off-by-one) ───────────────────────────────────

def test_answers_map_to_the_question_that_was_shown(client):
    created = _create(client)
    sid = created["session_id"]
    assert created["questions_asked"] == 1
    assert created["is_complete"] is False

    shown = [created["first_question"]]
    for i in range(created["num_questions"]):
        r = client.post(f"/api/v1/quiz/{sid}/answer", json={"answer": f"answer {i + 1}"}, headers=OWNER)
        assert r.status_code == 200, r.text
        if r.json()["next_question"] is not None:
            shown.append(r.json()["next_question"])

    t = client.get(f"/api/v1/quiz/{sid}/transcript", headers=OWNER).json()
    assert [e["question"] for e in t["transcript"]] == shown
    assert [e["answer"] for e in t["transcript"]] == [f"answer {i + 1}" for i in range(len(shown))]


def test_question_count_matches_request(client):
    created = _create(client, num_questions=5)
    sid = created["session_id"]
    assert created["num_questions"] == 5

    asked = [created["questions_asked"]]
    submits = 0
    while True:
        r = client.post(f"/api/v1/quiz/{sid}/answer", json={"answer": "x"}, headers=OWNER).json()
        submits += 1
        asked.append(r["questions_asked"])
        if r["is_complete"]:
            assert r["next_question"] is None
            break
        assert r["next_question"]

    assert submits == 5
    assert asked == [1, 2, 3, 4, 5, 5]

    t = client.get(f"/api/v1/quiz/{sid}/transcript", headers=OWNER).json()
    assert t["questions_answered"] == 5
    assert len(t["transcript"]) == 5

    r = client.post(f"/api/v1/quiz/{sid}/answer", json={"answer": "late"}, headers=OWNER)
    assert r.status_code == 410


def test_num_questions_reports_actual_count_for_small_pool():
    df = pd.DataFrame({
        "ID": [1, 2, 3],
        "Category": ["Tiny"] * 3,
        "Question": ["q1", "q2", "q3"],
        "Answer": ["a1", "a2", "a3"],
        "Difficulty": ["Easy", "Medium", "Hard"],
    })
    quiz = QuizSession(df=df, role="Tiny", num_questions=10, difficulty="medium")
    assert quiz.num_questions == 3
    for _ in range(3):
        quiz.submit_answer("x")
    assert quiz.is_complete
    assert quiz.questions_asked == 3


# ─── Transcript ───────────────────────────────────────────────────────────────

def test_transcript_hides_ideal_answer_until_complete(client):
    created = _create(client, num_questions=3)
    sid = created["session_id"]

    t = client.get(f"/api/v1/quiz/{sid}/transcript", headers=OWNER).json()
    assert t["transcript"] == []
    assert t["questions_answered"] == 0
    assert t["questions_asked"] == 1
    assert t["current_question"] == created["first_question"]

    nxt = client.post(f"/api/v1/quiz/{sid}/answer", json={"answer": "one"}, headers=OWNER).json()
    t = client.get(f"/api/v1/quiz/{sid}/transcript", headers=OWNER).json()
    assert t["questions_answered"] == 1
    assert t["current_question"] == nxt["next_question"]
    assert all(e.get("ideal_answer") is None for e in t["transcript"])

    for _ in range(2):
        client.post(f"/api/v1/quiz/{sid}/answer", json={"answer": "more"}, headers=OWNER)
    t = client.get(f"/api/v1/quiz/{sid}/transcript", headers=OWNER).json()
    assert t["is_complete"] is True
    assert t["current_question"] is None
    assert len(t["transcript"]) == 3
    assert all(e["ideal_answer"] for e in t["transcript"])


# ─── Languages ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("lang", ["fr", "es", "ur"])
def test_non_english_languages_are_translated(client, monkeypatch, lang):
    monkeypatch.setattr(session, "_new_llm", lambda: FakeTranslateLLM(f"[{lang}]"))
    created = _create(client, language=lang)
    assert created["language"] == lang
    assert created["first_question"].startswith(f"[{lang}] ")

    sid = created["session_id"]
    nxt = client.post(f"/api/v1/quiz/{sid}/answer", json={"answer": "x"}, headers=OWNER).json()
    assert nxt["next_question"].startswith(f"[{lang}] ")
    t = client.get(f"/api/v1/quiz/{sid}/transcript", headers=OWNER).json()
    assert t["transcript"][0]["question"] == created["first_question"]
    assert t["current_question"] == nxt["next_question"]


def test_translation_failure_falls_back_to_english(client, monkeypatch):
    class Boom:
        def invoke(self, _prompt):
            raise RuntimeError("upstream exploded")

    monkeypatch.setattr(session, "_new_llm", lambda: Boom())
    created = _create(client, language="fr")
    assert created["language"] == "fr"
    english = set(api.DF[api.DF["Category"] == ROLE]["Question"])
    assert created["first_question"] in english


def test_translation_garbage_falls_back_to_english(client, monkeypatch):
    class Garbage:
        def invoke(self, _prompt):
            return _Msg("sorry, I can't do that")

    monkeypatch.setattr(session, "_new_llm", lambda: Garbage())
    created = _create(client, language="es")
    english = set(api.DF[api.DF["Category"] == ROLE]["Question"])
    assert created["first_question"] in english


def test_unsupported_language_rejected(client):
    r = client.post("/api/v1/quiz", json={"target_role": ROLE, "language": "de"}, headers=OWNER)
    assert r.status_code == 422


# ─── Ownership ────────────────────────────────────────────────────────────────

def test_other_user_gets_404(client):
    sid = _create(client)["session_id"]
    other = {"X-User-Id": "99"}

    assert client.get(f"/api/v1/quiz/{sid}/transcript", headers=other).status_code == 404
    assert client.post(f"/api/v1/quiz/{sid}/answer", json={"answer": "x"}, headers=other).status_code == 404
    assert client.get(f"/api/v1/quiz/{sid}/evaluate", headers=other).status_code == 404
    assert client.delete(f"/api/v1/quiz/{sid}", headers=other).status_code == 404
    # Missing header is also "someone else"
    assert client.get(f"/api/v1/quiz/{sid}/transcript").status_code == 404

    assert client.get(f"/api/v1/quiz/{sid}/transcript", headers=OWNER).status_code == 200
    r = client.delete(f"/api/v1/quiz/{sid}", headers=OWNER)
    assert r.status_code == 204
    assert r.content == b""
    assert client.get(f"/api/v1/quiz/{sid}/transcript", headers=OWNER).status_code == 404


def test_per_owner_session_cap_evicts_oldest(client, monkeypatch):
    monkeypatch.setattr(api, "MAX_SESSIONS_PER_OWNER", 3)
    sids = [_create(client)["session_id"] for _ in range(4)]
    other = _create(client, headers={"X-User-Id": "7"})["session_id"]

    assert client.get(f"/api/v1/quiz/{sids[0]}/transcript", headers=OWNER).status_code == 404
    for sid in sids[1:]:
        assert client.get(f"/api/v1/quiz/{sid}/transcript", headers=OWNER).status_code == 200
    assert client.get(f"/api/v1/quiz/{other}/transcript", headers={"X-User-Id": "7"}).status_code == 200


# ─── Randomness ───────────────────────────────────────────────────────────────

def test_question_selection_is_not_fixed(client):
    orderings = set()
    for _ in range(20):
        sid = _create(client, num_questions=5)["session_id"]
        quiz = api.SESSION_STORE[sid]["quiz"]
        orderings.add(tuple(q["question"] for q in quiz._questions))
    # With fixed seeds every session was identical; now they should vary.
    assert len(orderings) > 1


# ─── Evaluation ───────────────────────────────────────────────────────────────

def test_evaluate_requires_an_answer(client):
    sid = _create(client)["session_id"]
    assert client.get(f"/api/v1/quiz/{sid}/evaluate", headers=OWNER).status_code == 400


def test_evaluate_only_answered_and_clamps_scores(client, monkeypatch):
    created = _create(client, num_questions=5)
    sid = created["session_id"]
    for a in ("first", "second"):
        client.post(f"/api/v1/quiz/{sid}/answer", json={"answer": a}, headers=OWNER)

    fake = FakeEvalLLM(n_items=4)  # model returns more items than answered
    monkeypatch.setattr(session, "_new_llm", lambda: fake)
    r = client.get(f"/api/v1/quiz/{sid}/evaluate", headers=OWNER)
    assert r.status_code == 200, r.text
    body = r.json()

    assert "Q3:" not in fake.prompt  # only answered questions are sent
    assert body["questions_asked"] == 2
    assert len(body["per_question"]) == 2
    assert [q["answer"] for q in body["per_question"]] == ["first", "second"]
    assert body["per_question"][0]["question"] == created["first_question"]
    assert all(1 <= q["score"] <= 10 for q in body["per_question"])
    assert body["overall_score"] == 10
    assert body["communication_score"] == 1
    assert body["technical_score"] == 7


def test_evaluate_internal_error_is_generic(client, monkeypatch):
    sid = _create(client)["session_id"]
    client.post(f"/api/v1/quiz/{sid}/answer", json={"answer": "x"}, headers=OWNER)

    def _bad(self):
        raise KeyError("secret internal detail")

    monkeypatch.setattr(QuizSession, "evaluate", _bad)
    r = client.get(f"/api/v1/quiz/{sid}/evaluate", headers=OWNER)
    assert r.status_code == 500
    assert "secret" not in r.text
