"""
Tests for store.py (shared by both AI services).

The Postgres tests run only when TEST_DATABASE_URL points at a disposable
database, e.g.:
    createdb nexora_ai_test
    TEST_DATABASE_URL=postgresql:///nexora_ai_test python -m pytest tests -q
"""

import os
import sys
import threading
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from store import MemoryStore, SessionNotFound  # noqa: E402


def _stores():
    stores = [pytest.param(MemoryStore, id="memory")]
    url = os.getenv("TEST_DATABASE_URL")
    if url:
        from store import PostgresStore

        def postgres():
            store = PostgresStore(url)
            with store._pool.connection() as conn:
                conn.execute("DELETE FROM ai_sessions")
            return store

        stores.append(pytest.param(postgres, id="postgres"))
    return stores


@pytest.fixture(params=_stores())
def store(request):
    return request.param()


def test_create_open_save(store):
    sid = store.create("quiz", "42", {"n": 1}, max_per_owner=5)
    with store.open(sid, "quiz", "42") as entry:
        assert entry.state == {"n": 1}
        entry.state = {"n": 2}
    with store.open(sid, "quiz", "42") as entry:
        assert entry.state == {"n": 2}
    assert store.count("quiz") == 1


def test_state_not_saved_when_block_raises(store):
    sid = store.create("quiz", "42", {"n": 1}, max_per_owner=5)
    with pytest.raises(ValueError):
        with store.open(sid, "quiz", "42") as entry:
            entry.state = {"n": 99}
            raise ValueError("boom")
    with store.open(sid, "quiz", "42") as entry:
        assert entry.state == {"n": 1}


def test_owner_and_kind_are_enforced(store):
    sid = store.create("quiz", "42", {}, max_per_owner=5)
    for kind, owner in [("quiz", "7"), ("quiz", None), ("interview", "42")]:
        with pytest.raises(SessionNotFound):
            with store.open(sid, kind, owner):
                pass
    with pytest.raises(SessionNotFound):
        with store.open("not-a-uuid", "quiz", "42"):
            pass
    assert store.delete(sid, "quiz", "7") is False
    assert store.delete(sid, "quiz", "42") is True
    assert store.delete(sid, "quiz", "42") is False


def test_per_owner_cap_evicts_oldest(store):
    ids = []
    for i in range(4):
        ids.append(store.create("quiz", "42", {"i": i}, max_per_owner=3))
        time.sleep(0.01)
    other = store.create("quiz", "7", {}, max_per_owner=3)
    with pytest.raises(SessionNotFound):
        with store.open(ids[0], "quiz", "42"):
            pass
    for sid in ids[1:] + [other]:
        owner = "7" if sid == other else "42"
        with store.open(sid, "quiz", owner):
            pass


def test_purge_expired(store):
    sid = store.create("quiz", "42", {}, max_per_owner=5)
    assert store.purge_expired("quiz", ttl_minutes=60) == 0
    assert store.purge_expired("quiz", ttl_minutes=0) == 1
    with pytest.raises(SessionNotFound):
        with store.open(sid, "quiz", "42"):
            pass


def test_concurrent_updates_do_not_lose_writes(store):
    sid = store.create("quiz", "42", {"n": 0}, max_per_owner=5)

    def bump():
        for _ in range(10):
            with store.open(sid, "quiz", "42") as entry:
                n = entry.state["n"]
                time.sleep(0.001)
                entry.state = {"n": n + 1}

    threads = [threading.Thread(target=bump) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    with store.open(sid, "quiz", "42") as entry:
        assert entry.state["n"] == 40
