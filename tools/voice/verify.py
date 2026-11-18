"""Listen to every rendered line with a speech recogniser and report the ones that do not match.

    python verify.py <assets/voice folder> [speaker ...]

Needs `faster-whisper` and ffmpeg. A line is reported when fewer than about two thirds of its words
come back, or when it runs far longer than its text should take. Short shouted lines are often
misheard, so read the report as "listen to these", not as a list of failures.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
from faster_whisper import WhisperModel

RATE = 16000


def words(text):
    return re.sub(r"[^a-z0-9 ]", "", text.lower().replace("-", " ")).split()


def main():
    folder = Path(sys.argv[1])
    only = set(sys.argv[2:])
    manifest = json.loads((folder / "manifest.json").read_text())
    model = WhisperModel("small.en", device="cpu", compute_type="int8")
    bad = total = 0
    for speaker, entry in manifest["speakers"].items():
        if only and speaker not in only:
            continue
        raw = subprocess.run(
            ["ffmpeg", "-v", "error", "-i", str(folder / entry["file"]), "-ac", "1", "-ar", str(RATE), "-f", "f32le", "-"],
            capture_output=True, check=True).stdout
        audio = np.frombuffer(raw, dtype=np.float32)
        for key, clips in entry["clips"].items():
            for start, dur, text in clips:
                total += 1
                a, b = int((start - 0.05) * RATE), int((start + dur + 0.05) * RATE)
                piece = np.concatenate([np.zeros(RATE // 4, np.float32), audio[max(0, a):b], np.zeros(RATE // 4, np.float32)])
                segments, _ = model.transcribe(piece, language="en", beam_size=5, condition_on_previous_text=False,
                                               initial_prompt="Military radio: troopers, the relay, the canyon, bugs, the swarm.")
                heard = " ".join(s.text.strip() for s in segments)
                want, got = words(text), words(heard)
                hit = sum(1 for w in want if w in got) / max(1, len(want))
                slow = dur > 0.6 + 0.1 * len(text)
                if hit < 0.67 or slow:
                    bad += 1
                    print(f"{speaker:9s} {key:10s} {dur:5.2f}s {hit:4.0%} want={text!r} heard={heard!r}", flush=True)
    print(f"{total - bad} of {total} lines heard as written")


if __name__ == "__main__":
    main()
