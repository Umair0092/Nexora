"""
Delivery metrics for one spoken answer, computed from Whisper word timestamps.

    speech_metrics(words, duration, text) -> {
        "duration_seconds": 41.2,     # first word start → last word end
        "word_count": 96,
        "words_per_minute": 140,
        "filler_count": 5,
        "fillers": {"um": 3, "you know": 2},
        "long_pauses": 1,             # silences of LONG_PAUSE_SECONDS or more
        "longest_pause_seconds": 2.8,
    }
"""

import re
from typing import Iterable, Optional

LONG_PAUSE_SECONDS = 2.0

# Hesitation sounds plus the verbal tics interviewers notice most. Ambiguous words
# ("like", "so", "kind of") are only counted where Whisper marks them as asides
# with a following comma, e.g. "we had to, like, rebuild it".
FILLER_WORDS = {
    "um": "um", "umm": "um", "uh": "uh", "uhh": "uh", "uhm": "um", "er": "er", "erm": "um",
    "ah": "ah", "hmm": "hmm", "mm": "hmm", "basically": "basically", "literally": "literally",
    "actually": "actually",
}
COMMA_FILLERS = {"like": "like", "so": "so"}
FILLER_PHRASES = {("you", "know"): "you know", ("i", "mean"): "i mean"}

# Whisper keeps disfluencies when its prompt contains them.
WHISPER_PROMPT = "Umm, let me think like, hmm... Okay, here's what I'm, like, thinking. Uh, so, you know."


def _clean(token: str) -> str:
    return re.sub(r"[^\w']", "", token.lower())


def _count_fillers(tokens: list) -> dict:
    counts: dict = {}
    cleaned = [_clean(t) for t in tokens]
    i = 0
    while i < len(tokens):
        word = cleaned[i]
        pair = (word, cleaned[i + 1]) if i + 1 < len(tokens) else None
        if pair in FILLER_PHRASES and tokens[i + 1].rstrip().endswith((",", ".", "?", "!")):
            label = FILLER_PHRASES[pair]
            counts[label] = counts.get(label, 0) + 1
            i += 2
            continue
        if word in FILLER_WORDS:
            label = FILLER_WORDS[word]
            counts[label] = counts.get(label, 0) + 1
        elif word in COMMA_FILLERS and tokens[i].rstrip().endswith(","):
            label = COMMA_FILLERS[word]
            counts[label] = counts.get(label, 0) + 1
        i += 1
    return counts


def speech_metrics(words: Optional[Iterable], duration: Optional[float], text: str) -> dict:
    """`words` are dicts or objects with `word`, `start`, `end` (seconds)."""
    timed = []
    for w in words or []:
        get = w.get if isinstance(w, dict) else lambda k, _w=w: getattr(_w, k, None)
        token, start, end = get("word"), get("start"), get("end")
        if token and start is not None and end is not None:
            timed.append((str(token).strip(), float(start), float(end)))

    if timed:
        tokens = [t for t, _, _ in timed]
        span = max(timed[-1][2] - timed[0][1], 0.0)
        gaps = [nxt[1] - cur[2] for cur, nxt in zip(timed, timed[1:])]
    else:
        tokens = text.split()
        span = float(duration or 0.0)
        gaps = []

    long_gaps = [g for g in gaps if g >= LONG_PAUSE_SECONDS]
    fillers = _count_fillers(tokens)
    word_count = len(tokens)
    minutes = span / 60 if span > 0 else 0
    return {
        "duration_seconds": round(span, 1),
        "word_count": word_count,
        "words_per_minute": round(word_count / minutes) if minutes >= 0.05 else None,
        "filler_count": sum(fillers.values()),
        "fillers": fillers,
        "long_pauses": len(long_gaps),
        "longest_pause_seconds": round(max(gaps), 1) if gaps else 0.0,
    }
