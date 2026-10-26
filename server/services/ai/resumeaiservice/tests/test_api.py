"""
Tests for the CV interview service (resumeaiservice).

No network: Interview is replaced by a fake, the Groq/Whisper client is
replaced by a fake, and pdf_to_structure is stubbed where an LLM would run.

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
os.environ.setdefault("RESUME_OPENROUTER_API_KEY", "test-key")

from fastapi.testclient import TestClient  # noqa: E402
from pypdf import PdfWriter  # noqa: E402

import api  # noqa: E402
import helper  # noqa: E402
from helper import Candidate  # noqa: E402

OWNER = {"X-User-Id": "42"}

CANDIDATE = {
    "name": "Ali Hassan",
    "degree": "BS Computer Science",
    "skills": ["Python", "SQL"],
}


# ─── Fakes ────────────────────────────────────────────────────────────────────

class FakeInterview:
    """Stands in for session.Interview without touching any LLM."""

    def __init__(self, candidate_data, target_role="Software Engineer", num_questions=10, language="en"):
        self.candidate_data = candidate_data
        self.target_role = target_role
        self.num_questions = num_questions
        self.language = language
        self.questions_asked = 0
        self.is_complete = False
        self._conv = []

    def start_interview(self):
        self.questions_asked = 1
        q = "Tell me about yourself."
        self._conv.append({"role": "interviewer", "content": q})
        return q

    def process_answer_and_get_next_question(self, answer):
        self._conv.append({"role": "candidate", "content": answer})
        self.questions_asked += 1
        q = f"Question {self.questions_asked}?"
        self._conv.append({"role": "interviewer", "content": q})
        return q, False

    def get_conversation_for_display(self):
        return list(self._conv)


class _FakeTranscriptions:
    def __init__(self):
        self.calls = []

    async def create(self, model, file, language, response_format):
        self.calls.append({"name": file.name, "language": language})

        class R:
            text = "hello world"

        return R()


class FakeGroq:
    def __init__(self):
        self.audio = type("Audio", (), {})()
        self.audio.transcriptions = _FakeTranscriptions()


@pytest.fixture(autouse=True)
def _isolate(monkeypatch):
    api.SESSION_STORE.clear()
    monkeypatch.setattr(api, "Interview", FakeInterview)
    yield
    api.SESSION_STORE.clear()


@pytest.fixture
def client():
    return TestClient(api.app)


def _create(client, headers=OWNER):
    r = client.post(
        "/api/v1/interviews",
        json={"candidate_data": CANDIDATE, "target_role": "Rails Developer", "num_questions": 5},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return r.json()["session_id"]


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
    assert r.json() == {"text": "hello world"}
    call = fake.audio.transcriptions.calls[0]
    assert call["name"].endswith(".webm")
    assert call["language"] == "fr"

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
    client.post(f"/api/v1/interviews/{sid}/answer", json={"answer": "I build things"}, headers=OWNER)

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
