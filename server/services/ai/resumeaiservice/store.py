"""
Session store for in-progress AI interviews and quizzes.

Sessions are plain JSON state. With DATABASE_URL set they live in the shared
Postgres database (table `ai_sessions`), so they survive restarts and several
workers can serve the same interview. Without it (tests, quick local runs)
they live in process memory.

Usage:
    with STORE.open(session_id, kind, owner) as entry:   # raises SessionNotFound
        obj = Thing.from_state(entry.state)
        ...
        entry.state = obj.to_state()                       # saved on exit

`open` holds a row lock (Postgres) or a per-session lock (memory) for the
duration of the block, so two requests for the same session never interleave.
This file is shared verbatim by resumeaiservice and interview_feedback.
"""

import json
import logging
import os
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Iterator, Optional

logger = logging.getLogger("ai.store")


class SessionNotFound(Exception):
    pass


class Entry:
    def __init__(self, session_id: str, state: dict):
        self.id = session_id
        self.state = state


def _now() -> datetime:
    return datetime.now(timezone.utc)


class MemoryStore:
    def __init__(self):
        self._rows: dict = {}
        self._lock = threading.Lock()
        self._session_locks: dict = {}

    def create(self, kind: str, owner: Optional[str], state: dict, max_per_owner: int) -> str:
        with self._lock:
            if owner and max_per_owner > 0:
                owned = sorted(
                    (sid for sid, r in self._rows.items() if r["owner"] == owner and r["kind"] == kind),
                    key=lambda sid: self._rows[sid]["created_at"],
                )
                for sid in owned[: max(0, len(owned) - max_per_owner + 1)]:
                    self._rows.pop(sid, None)
            session_id = str(uuid.uuid4())
            now = _now()
            self._rows[session_id] = {
                "kind": kind, "owner": owner, "state": json.dumps(state),
                "created_at": now, "last_accessed": now,
            }
            return session_id

    @contextmanager
    def open(self, session_id: str, kind: str, owner: Optional[str]) -> Iterator[Entry]:
        with self._lock:
            lock = self._session_locks.setdefault(session_id, threading.Lock())
        with lock:
            row = self._rows.get(session_id)
            if not row or row["kind"] != kind or (row["owner"] and row["owner"] != owner):
                raise SessionNotFound(session_id)
            entry = Entry(session_id, json.loads(row["state"]))
            yield entry
            if session_id in self._rows:
                row["state"] = json.dumps(entry.state)
                row["last_accessed"] = _now()

    def delete(self, session_id: str, kind: str, owner: Optional[str]) -> bool:
        with self._lock:
            row = self._rows.get(session_id)
            if not row or row["kind"] != kind or (row["owner"] and row["owner"] != owner):
                return False
            self._rows.pop(session_id, None)
            self._session_locks.pop(session_id, None)
            return True

    def purge_expired(self, kind: str, ttl_minutes: int) -> int:
        cutoff = _now() - timedelta(minutes=ttl_minutes)
        with self._lock:
            expired = [sid for sid, r in self._rows.items() if r["kind"] == kind and r["last_accessed"] < cutoff]
            for sid in expired:
                self._rows.pop(sid, None)
                self._session_locks.pop(sid, None)
            return len(expired)

    def count(self, kind: str) -> int:
        return sum(1 for r in self._rows.values() if r["kind"] == kind)


class PostgresStore:
    def __init__(self, url: str):
        from psycopg_pool import ConnectionPool

        self._pool = ConnectionPool(url, min_size=1, max_size=int(os.getenv("AI_DB_POOL_SIZE", 20)), open=True)
        self._ensure_table()

    def _ensure_table(self):
        try:
            with self._pool.connection() as conn:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS ai_sessions (
                      id uuid PRIMARY KEY,
                      kind text NOT NULL,
                      owner text,
                      state jsonb NOT NULL,
                      created_at timestamptz NOT NULL DEFAULT now(),
                      last_accessed timestamptz NOT NULL DEFAULT now()
                    )
                    """
                )
                conn.execute("CREATE INDEX IF NOT EXISTS index_ai_sessions_on_owner_and_kind ON ai_sessions (owner, kind)")
        except Exception as e:
            # Both services start at once and may race on CREATE TABLE; the loser
            # gets a unique-violation on pg_type, which is harmless.
            logger.info("ai_sessions setup: %s", e)

    @staticmethod
    def _valid_uuid(session_id: str) -> bool:
        try:
            uuid.UUID(session_id)
            return True
        except (ValueError, TypeError):
            return False

    def create(self, kind: str, owner: Optional[str], state: dict, max_per_owner: int) -> str:
        from psycopg.types.json import Jsonb

        session_id = str(uuid.uuid4())
        with self._pool.connection() as conn:
            if owner and max_per_owner > 0:
                conn.execute(
                    """
                    DELETE FROM ai_sessions WHERE id IN (
                      SELECT id FROM ai_sessions WHERE owner = %s AND kind = %s
                      ORDER BY created_at DESC OFFSET %s
                    )
                    """,
                    (owner, kind, max_per_owner - 1),
                )
            conn.execute(
                "INSERT INTO ai_sessions (id, kind, owner, state) VALUES (%s, %s, %s, %s)",
                (session_id, kind, owner, Jsonb(state)),
            )
        return session_id

    @contextmanager
    def open(self, session_id: str, kind: str, owner: Optional[str]) -> Iterator[Entry]:
        from psycopg.types.json import Jsonb

        if not self._valid_uuid(session_id):
            raise SessionNotFound(session_id)
        with self._pool.connection() as conn:
            with conn.transaction():
                row = conn.execute(
                    "SELECT owner, state FROM ai_sessions WHERE id = %s AND kind = %s FOR UPDATE",
                    (session_id, kind),
                ).fetchone()
                if not row or (row[0] and row[0] != owner):
                    raise SessionNotFound(session_id)
                entry = Entry(session_id, row[1])
                yield entry
                conn.execute(
                    "UPDATE ai_sessions SET state = %s, last_accessed = now() WHERE id = %s",
                    (Jsonb(entry.state), session_id),
                )

    def delete(self, session_id: str, kind: str, owner: Optional[str]) -> bool:
        if not self._valid_uuid(session_id):
            return False
        with self._pool.connection() as conn:
            cur = conn.execute(
                "DELETE FROM ai_sessions WHERE id = %s AND kind = %s AND (owner IS NULL OR owner = %s)",
                (session_id, kind, owner),
            )
            return cur.rowcount > 0

    def purge_expired(self, kind: str, ttl_minutes: int) -> int:
        with self._pool.connection() as conn:
            cur = conn.execute(
                "DELETE FROM ai_sessions WHERE kind = %s AND last_accessed < now() - make_interval(mins => %s)",
                (kind, ttl_minutes),
            )
            return cur.rowcount

    def count(self, kind: str) -> int:
        with self._pool.connection() as conn:
            return conn.execute("SELECT count(*) FROM ai_sessions WHERE kind = %s", (kind,)).fetchone()[0]


def build_store():
    backend = os.getenv("AI_SESSION_STORE", "postgres" if os.getenv("DATABASE_URL") else "memory")
    if backend == "postgres":
        url = os.getenv("AI_DATABASE_URL") or os.getenv("DATABASE_URL")
        if not url:
            raise RuntimeError("AI_SESSION_STORE=postgres needs DATABASE_URL (or AI_DATABASE_URL).")
        return PostgresStore(url)
    return MemoryStore()
