import csv
import json
import time
from pathlib import Path


class AttentionLogger:
    """
    Logs every state change to CSV + optional JSON timeline.
    """

    def __init__(self, out_dir: str = "logs"):
        Path(out_dir).mkdir(exist_ok=True)
        ts       = time.strftime("%Y%m%d_%H%M%S")
        self.csv_path  = f"{out_dir}/attention_{ts}.csv"
        self.json_path = f"{out_dir}/attention_{ts}.json"
        self.events    = []
        self._last_state = None

        with open(self.csv_path, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["timestamp", "state", "score",
                        "gaze", "pose", "eyes", "blink",
                        "expression", "reason"])

    def log(self, state: str, scores: dict, reason: str = ""):
        now = time.time()
        row = [
            time.strftime("%H:%M:%S", time.localtime(now)),
            state,
            scores.get("total", 0),
            scores.get("gaze", 0),
            scores.get("head_pose", 0),
            scores.get("eye_open", 0),
            scores.get("blink_rate", 0),
            scores.get("expression", 0),
            reason,
        ]
        with open(self.csv_path, "a", newline="") as f:
            csv.writer(f).writerow(row)

        if state != self._last_state:
            self.events.append({
                "time": time.strftime("%H:%M:%S"),
                "state": state,
                "score": scores.get("total", 0),
                "reason": reason,
            })
            self._last_state = state

    def save_json(self):
        with open(self.json_path, "w") as f:
            json.dump(self.events, f, indent=2)
        print(f"[logger] saved → {self.json_path}")
