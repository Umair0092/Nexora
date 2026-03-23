import time
from collections import deque
import numpy as np
from config import *


class TemporalSmoother:
    """
    Applies rolling mean to score + debounce to state transitions.
    Prevents flickering between states on noisy frames.
    """

    def __init__(self):
        self.score_buffer    = deque(maxlen=SMOOTHING_WINDOW_FRAMES)
        self.current_state   = "ATTENTIVE"
        self.state_since     = time.time()
        self._last_change    = 0.0
        self._disengage_start = None

    def update(self, raw_score: int) -> tuple[int, str]:
        self.score_buffer.append(raw_score)
        smooth = int(np.mean(self.score_buffer)) if self.score_buffer else 0
        state  = self._classify(smooth)
        return smooth, state

    def _classify(self, score: int) -> str:
        now = time.time()

        if score >= ATTENTIVE_THRESHOLD:
            candidate = "ATTENTIVE"
            self._disengage_start = None
        elif score >= PARTIAL_THRESHOLD:
            candidate = "PARTIALLY ATTENTIVE"
            self._disengage_start = None
        else:
            # Require sustained disengagement before confirming
            if self._disengage_start is None:
                self._disengage_start = now
            if now - self._disengage_start >= DISENGAGE_CONFIRM_SEC:
                candidate = "DISENGAGED"
            else:
                candidate = self.current_state  # hold current state

        # Debounce state changes
        if candidate != self.current_state:
            if now - self._last_change >= STATE_CHANGE_DEBOUNCE_SEC:
                self.current_state = candidate
                self.state_since   = now
                self._last_change  = now

        return self.current_state

    def seconds_in_state(self) -> float:
        return time.time() - self.state_since
