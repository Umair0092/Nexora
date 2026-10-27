"""
Tests for the CV interview service (resumeaiservice).

No network: the LLM behind session.Interview is a fake (FakeLLM), the
Groq/Whisper client is a fake, and pdf_to_structure is stubbed where an LLM
would run.

Run:
    cd server/services/ai/resumeaiservice && python -m pytest tests -q
"""

import io
import os
import sys
from pathlib import Path

import pytest

SERVICE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVICE_DIR))
os.environ.setdefault("GROQ_API_KEY", "test-key")
os.environ["AI_SESSION_STORE"] = "memory"

from fastapi.testclient import TestClient  # noqa: E402
from pypdf import PdfWriter  # noqa: E402

import api  # noqa: E402
import helper  # noqa: E402
import session  # noqa: E402
from helper import Candidate  # noqa: E402
from speech import speech_metrics  # noqa: E402
from store import MemoryStore  # noqa: E402

OWNER = {"X-User-Id": "42"}

CANDIDATE = {
    "name": "Ali Hassan",
    "degree": "BS Computer Science",
    "skills": ["Python", "SQL"],
}


# ─── Fakes ────────────────────────────────────────────────────────────────────

class _Msg:
    def __init__(self, content):
        self.content = content


class FakeLLM:
    """
    Stands in for the ChatOpenAI model. Plain invoke() returns a numbered
    question; with_structured_output(schema) returns canned structured data.
    Every prompt it sees is recorded on the class for assertions.
    """

    prompts: list = []
    structured_calls = 0
    asked = 0

    def __init__(self, schema=None):
        self.schema = schema

    def with_structured_output(self, schema):
        return FakeLLM(schema)

    def invoke(self, messages):
        text = messages if isinstance(messages, str) else "\n".join(m.content for m in messages)
        FakeLLM.prompts.append(text)
        if self.schema is None:
            FakeLLM.asked += 1
            return _Msg(f"Question number {FakeLLM.asked} about your work?")
        FakeLLM.structured_calls += 1
        name = self.schema.__name__
        star = session.StarCoverage(situation=True, task=True, action=False, result=False, note="Say what you did.")
        if name == "EvaluationResult":
            n = text.count("\nA")
            return session.EvaluationResult(
                per_question=[
                    session.QuestionEvaluation(
                        question="hallucinated", answer="hallucinated", score=14, strengths=["s"],
                        improvements=["i"], feedback="f", recommendation="r", star=star,
                    )
                    for _ in range(n + 2)  # more items than answers: must be trimmed
                ],
                overall_score=0, communication_score=8, technical_score=7, top_strengths=["a"],
                areas_to_improve=["b"], summary="sum", hire_recommendation="Yes",
                recommendation_summary="rs", improvement_points=["p"], job_fit="Fits the role.",
            )
        if name == "AnswerScore":
            return session.AnswerScore(score=11, strengths=["s"], improvements=["i"], feedback="f",
                                       recommendation="r", star=star)
        if name == "ImprovedAnswer":
            return session.ImprovedAnswer(improved_answer="A stronger answer [X%].", changes=["c"])
        raise AssertionError(f"unexpected schema {name}")


class _FakeTranscriptions:
    def __init__(self):
        self.calls = []

    async def create(self, model, file, language, response_format, timestamp_granularities, prompt=None):
        self.calls.append({"name": file.name, "language": language, "format": response_format, "prompt": prompt})

        class R:
            text = "Um, I built it, you know, in two weeks."
            duration = 6.0
            words = [
                {"word": "Um,", "start": 0.0, "end": 0.4},
                {"word": "I", "start": 0.5, "end": 0.6},
                {"word": "built", "start": 0.6, "end": 0.9},
                {"word": "it,", "start": 0.9, "end": 1.1},
                {"word": "you", "start": 3.5, "end": 3.7},
                {"word": "know,", "start": 3.7, "end": 3.9},
                {"word": "in", "start": 4.0, "end": 4.1},
                {"word": "two", "start": 4.1, "end": 4.3},
                {"word": "weeks.", "start": 4.3, "end": 4.8},
            ]

        return R()


class FakeGroq:
    def __init__(self):
        self.audio = type("Audio", (), {})()
        self.audio.transcriptions = _FakeTranscriptions()


@pytest.fixture(autouse=True)
def _isolate(monkeypatch):
    monkeypatch.setattr(api, "STORE", MemoryStore())
    monkeypatch.setattr(session, "new_llm", lambda **_kw: FakeLLM())
    FakeLLM.prompts = []
    FakeLLM.structured_calls = 0
    FakeLLM.asked = 0
    yield


@pytest.fixture
def client():
    return TestClient(api.app)


def _create(client, headers=OWNER, **overrides):
    body = {"candidate_data": CANDIDATE, "target_role": "Rails Developer", "num_questions": 5}
    body.update(overrides)
    r = client.post("/api/v1/interviews", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["session_id"]


def _answer(client, sid, text, **extra):
    r = client.post(f"/api/v1/interviews/{sid}/answer", json={"answer": text, **extra}, headers=OWNER)
    assert r.status_code == 200, r.text
    return r.json()


def _blank_pdf_bytes() -> bytes:
    w = PdfWriter()
    w.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


# ─── Transcribe ───────────────────────────────────────────────────────────────

def test_transcribe_rejects_oversized_audio(client, monkeypatch):
    fake = FakeGroq()
    monkeypatch.setattr(api, "openai_client", fake)
    monkeypatch.setattr(api, "MAX_AUDIO_MB", 1)

    big = b"\0" * (1024 * 1024 + 1)
    r = client.post("/api/v1/transcribe", files={"file": ("a.webm", big, "audio/webm")})
    assert r.status_code == 413
    assert fake.audio.transcriptions.calls == []


def test_transcribe_ok_and_sanitizes_suffix(client, monkeypatch):
    fake = FakeGroq()
    monkeypatch.setattr(api, "openai_client", fake)

    r = client.post(
        "/api/v1/transcribe",
        files={"file": ("evil.php", b"\0" * 100, "audio/webm")},
        data={"language": "fr"},
    )
    assert r.status_code == 200
    assert r.json()["text"] == "Um, I built it, you know, in two weeks."
    call = fake.audio.transcriptions.calls[0]
    assert call["name"].endswith(".webm")
    assert call["language"] == "fr"
    assert call["format"] == "verbose_json"
    assert call["prompt"] is None  # the English filler prompt isn't sent for French

    r = client.post("/api/v1/transcribe", files={"file": ("clip.M4A", b"\0" * 100, "audio/mp4")})
    assert r.status_code == 200
    assert fake.audio.transcriptions.calls[1]["name"].endswith(".m4a")


def test_transcribe_error_is_generic(client, monkeypatch):
    fake = FakeGroq()

    async def boom(**_kwargs):
        raise RuntimeError("groq secret detail")

    fake.audio.transcriptions.create = boom
    monkeypatch.setattr(api, "openai_client", fake)
    r = client.post("/api/v1/transcribe", files={"file": ("a.webm", b"\0" * 10, "audio/webm")})
    assert r.status_code == 500
    assert "secret" not in r.text


# ─── Parse resume ─────────────────────────────────────────────────────────────

def test_parse_resume_rejects_non_pdf_bytes(client):
    # Claims to be a PDF by name and content-type, but isn't one
    r = client.post(
        "/api/v1/parse-resume",
        files={"file": ("resume.pdf", b"<html>not a pdf</html>", "application/pdf")},
    )
    assert r.status_code == 415


def test_parse_resume_returns_default_role(client, monkeypatch):
    monkeypatch.setattr(api, "pdf_to_structure", lambda _f: Candidate(**CANDIDATE))
    r = client.post(
        "/api/v1/parse-resume",
        files={"file": ("cv.bin", b"%PDF-1.7\n...", "application/octet-stream")},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["target_role"] == "Software Engineer"
    assert body["candidate_data"]["name"] == "Ali Hassan"


def test_parse_resume_ai_failure_is_503_not_bad_pdf(client, monkeypatch):
    def boom(_f):
        raise api.AIServiceError("Error code: 402 - insufficient credits")
    monkeypatch.setattr(api, "pdf_to_structure", boom)
    r = client.post(
        "/api/v1/parse-resume",
        files={"file": ("cv.pdf", b"%PDF-1.7\n...", "application/pdf")},
    )
    assert r.status_code == 503
    assert "valid PDF" not in r.json()["detail"]
    assert "402" not in r.json()["detail"]


def test_parse_resume_without_text_gives_clear_400(client):
    r = client.post(
        "/api/v1/parse-resume",
        files={"file": ("blank.pdf", _blank_pdf_bytes(), "application/pdf")},
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "No readable text found in this PDF"


def test_pdf_to_structure_always_removes_temp_file(monkeypatch):
    seen = []
    real_loader = helper.PyPDFLoader

    def spy(path):
        seen.append(path)
        return real_loader(path)

    monkeypatch.setattr(helper, "PyPDFLoader", spy)
    with pytest.raises(ValueError, match="No readable text found in this PDF"):
        helper.pdf_to_structure(io.BytesIO(_blank_pdf_bytes()))
    assert seen and not os.path.exists(seen[0])

    seen.clear()
    with pytest.raises(ValueError):
        helper.pdf_to_structure(io.BytesIO(b"%PDF-garbage"))
    assert seen and not os.path.exists(seen[0])


# ─── Ownership / sessions ─────────────────────────────────────────────────────

def test_transcript_is_owner_only(client):
    sid = _create(client)
    _answer(client, sid, "I build things")

    r = client.get(f"/api/v1/interviews/{sid}/transcript", headers=OWNER)
    assert r.status_code == 200
    assert r.json()["conversation"][1] == {"role": "candidate", "content": "I build things"}
    assert r.json()["target_role"] == "Rails Developer"

    other = {"X-User-Id": "99"}
    assert client.get(f"/api/v1/interviews/{sid}/transcript", headers=other).status_code == 404
    assert client.get(f"/api/v1/interviews/{sid}/transcript").status_code == 404
    assert client.post(
        f"/api/v1/interviews/{sid}/answer", json={"answer": "x"}, headers=other
    ).status_code == 404
    assert client.get(f"/api/v1/interviews/{sid}/evaluate", headers=other).status_code == 404
    assert client.delete(f"/api/v1/interviews/{sid}", headers=other).status_code == 404


def test_delete_returns_204_with_empty_body(client):
    sid = _create(client)
    r = client.delete(f"/api/v1/interviews/{sid}", headers=OWNER)
    assert r.status_code == 204
    assert r.content == b""
    assert client.get(f"/api/v1/interviews/{sid}/transcript", headers=OWNER).status_code == 404
    assert client.delete(f"/api/v1/interviews/{sid}", headers=OWNER).status_code == 404


def test_per_owner_session_cap_evicts_oldest(client, monkeypatch):
    monkeypatch.setattr(api, "MAX_SESSIONS_PER_OWNER", 2)
    first, second, third = (_create(client) for _ in range(3))
    assert client.get(f"/api/v1/interviews/{first}/transcript", headers=OWNER).status_code == 404
    assert client.get(f"/api/v1/interviews/{second}/transcript", headers=OWNER).status_code == 200
    assert client.get(f"/api/v1/interviews/{third}/transcript", headers=OWNER).status_code == 200


# ─── Score clamping ───────────────────────────────────────────────────────────

def test_clamp_score():
    from session import _clamp_score

    assert _clamp_score(0) == 1
    assert _clamp_score(12) == 10
    assert _clamp_score("7") == 7
    assert _clamp_score(None) == 1


# ─── Speech metrics ───────────────────────────────────────────────────────────

def test_transcribe_returns_speech_metrics(client, monkeypatch):
    fake = FakeGroq()
    monkeypatch.setattr(api, "openai_client", fake)
    r = client.post("/api/v1/transcribe", files={"file": ("a.webm", b"\0" * 100, "audio/webm")})
    speech = r.json()["speech"]
    assert fake.audio.transcriptions.calls[0]["prompt"]  # English keeps disfluencies
    assert speech["word_count"] == 9
    assert speech["fillers"] == {"um": 1, "you know": 1}
    assert speech["filler_count"] == 2
    assert speech["long_pauses"] == 1
    assert speech["longest_pause_seconds"] == 2.4
    assert speech["duration_seconds"] == 4.8
    assert speech["words_per_minute"] == round(9 / (4.8 / 60))


def test_speech_metrics_filler_rules():
    words = [{"word": w, "start": i, "end": i + 0.5} for i, w in enumerate(
        "I like Python, like, a lot. So I, uh, basically do you know SQL? You know, I mean, it works.".split()
    )]
    m = speech_metrics(words, None, "")
    # "I like Python" and "do you know SQL" aren't fillers; the comma-marked ones are.
    assert m["fillers"] == {"like": 1, "uh": 1, "basically": 1, "you know": 1, "i mean": 1}
    assert m["long_pauses"] == 0


def test_speech_metrics_without_word_timestamps():
    m = speech_metrics(None, 30.0, "one two three um four")
    assert m["word_count"] == 5
    assert m["words_per_minute"] == 10
    assert m["fillers"] == {"um": 1}


# ─── Interview flow with the real Interview class ─────────────────────────────

SPEECH = {
    "duration_seconds": 30.0, "word_count": 70, "words_per_minute": 140, "filler_count": 2,
    "fillers": {"um": 2}, "long_pauses": 0, "longest_pause_seconds": 1.2,
}


def test_state_survives_a_round_trip_through_the_store(client):
    sid = _create(client)
    _answer(client, sid, "First answer", speech=SPEECH)
    with api.STORE.open(sid, api.KIND, OWNER["X-User-Id"]) as entry:
        state = entry.state
    restored = session.Interview.from_state(state)
    assert restored.questions_asked == 2
    assert restored.answer_speech == [SPEECH]
    assert [m["role"] for m in restored.get_conversation_for_display()] == ["interviewer", "candidate", "interviewer"]
    assert restored.to_state() == state


def test_job_description_reaches_prompts_and_evaluation(client):
    sid = _create(client, job_description="Must have: Kubernetes, Kafka, on-call experience.")
    assert "Kubernetes, Kafka" in FakeLLM.prompts[0]
    assert "job description" in FakeLLM.prompts[0].lower()
    t = client.get(f"/api/v1/interviews/{sid}/transcript", headers=OWNER).json()
    assert t["has_job_description"] is True

    _answer(client, sid, "I ran Kafka at work")
    body = client.get(f"/api/v1/interviews/{sid}/evaluate", headers=OWNER).json()
    assert "Kubernetes, Kafka" in FakeLLM.prompts[-1]
    assert body["job_fit"] == "Fits the role."
    assert body["job_description"].startswith("Must have")


def test_job_description_length_is_limited(client):
    r = client.post(
        "/api/v1/interviews",
        json={"candidate_data": CANDIDATE, "target_role": "Dev", "num_questions": 5, "job_description": "x" * 6001},
        headers=OWNER,
    )
    assert r.status_code == 422


def test_behavioral_style_uses_star_prompt_and_keeps_star_scores(client):
    sid = _create(client, interview_style="behavioral")
    assert "behavioral interview" in FakeLLM.prompts[0]
    assert "Tell me about a time" in FakeLLM.prompts[0]
    _answer(client, sid, "We fixed the outage together", speech=SPEECH)
    body = client.get(f"/api/v1/interviews/{sid}/evaluate", headers=OWNER).json()
    assert "STAR coverage" in FakeLLM.prompts[-1]
    assert body["interview_style"] == "behavioral"
    assert body["per_question"][0]["star"]["note"] == "Say what you did."
    assert body["job_fit"] is None  # no job description given


def test_standard_evaluation_trims_clamps_and_attaches_speech(client):
    sid = _create(client)
    assert "behavioral interview" not in FakeLLM.prompts[0]
    _answer(client, sid, "first", speech=SPEECH)
    _answer(client, sid, "second")
    body = client.get(f"/api/v1/interviews/{sid}/evaluate", headers=OWNER).json()

    assert [q["answer"] for q in body["per_question"]] == ["first", "second"]
    assert body["per_question"][0]["question"].startswith("Question number 1")
    assert all(q["score"] == 10 for q in body["per_question"])
    assert all(q["star"] is None for q in body["per_question"])
    assert body["overall_score"] == 1
    assert body["per_question"][0]["speech"] == SPEECH
    assert body["per_question"][1]["speech"] is None


def test_evaluation_is_cached_until_another_answer(client):
    sid = _create(client)
    _answer(client, sid, "first")
    first = client.get(f"/api/v1/interviews/{sid}/evaluate", headers=OWNER).json()
    assert client.get(f"/api/v1/interviews/{sid}/evaluate", headers=OWNER).json() == first
    assert FakeLLM.structured_calls == 1
    _answer(client, sid, "second")
    assert len(client.get(f"/api/v1/interviews/{sid}/evaluate", headers=OWNER).json()["per_question"]) == 2
    assert FakeLLM.structured_calls == 2


def test_evaluate_before_any_answer_is_400(client):
    sid = _create(client)
    assert client.get(f"/api/v1/interviews/{sid}/evaluate", headers=OWNER).status_code == 400


def test_interview_completes_after_num_questions(client):
    sid = _create(client)
    for i in range(4):
        assert _answer(client, sid, f"a{i}")["is_complete"] is False
    assert _answer(client, sid, "last")["is_complete"] is True
    r = client.post(f"/api/v1/interviews/{sid}/answer", json={"answer": "late"}, headers=OWNER)
    assert r.status_code == 410


def test_quota_error_on_answer_is_503_and_answer_can_be_resent(client, monkeypatch):
    sid = _create(client)

    class Quota(FakeLLM):
        def invoke(self, messages):
            raise RuntimeError("Error code: 429 rate limit")

    monkeypatch.setattr(session, "new_llm", lambda **_kw: Quota())
    r = client.post(f"/api/v1/interviews/{sid}/answer", json={"answer": "x"}, headers=OWNER)
    assert r.status_code == 503
    t = client.get(f"/api/v1/interviews/{sid}/transcript", headers=OWNER).json()
    assert len(t["conversation"]) == 1  # the answer wasn't half-saved


# ─── Single-answer scoring and rewrites ───────────────────────────────────────

def test_score_answer_clamps_and_strips_star_for_standard(client):
    body = {"question": "What is an index?", "answer": "It speeds up reads", "ideal_answer": "A B-tree..."}
    r = client.post("/api/v1/score-answer", json=body, headers=OWNER)
    assert r.status_code == 200, r.text
    assert r.json()["score"] == 10
    assert r.json()["star"] is None
    assert "A B-tree..." in FakeLLM.prompts[-1]

    r = client.post("/api/v1/score-answer", json={**body, "interview_style": "behavioral"}, headers=OWNER)
    assert r.json()["star"]["situation"] is True


def test_improve_answer(client):
    r = client.post(
        "/api/v1/improve-answer",
        json={"question": "Tell me about a conflict", "answer": "We argued", "interview_style": "behavioral"},
        headers=OWNER,
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"improved_answer": "A stronger answer [X%].", "changes": ["c"]}
    assert "STAR" in FakeLLM.prompts[-1]
    assert "Do NOT invent" in FakeLLM.prompts[-1]


def test_single_answer_llm_failure_is_503(client, monkeypatch):
    class Down(FakeLLM):
        def with_structured_output(self, schema):
            return self

        def invoke(self, messages):
            raise RuntimeError("provider down: secret")

    monkeypatch.setattr(session, "new_llm", lambda **_kw: Down())
    for path in ("/api/v1/score-answer", "/api/v1/improve-answer"):
        r = client.post(path, json={"question": "q", "answer": "a"}, headers=OWNER)
        assert r.status_code == 503
        assert "secret" not in r.text


def test_single_answer_requires_text(client):
    assert client.post("/api/v1/score-answer", json={"question": "q", "answer": ""}, headers=OWNER).status_code == 422
