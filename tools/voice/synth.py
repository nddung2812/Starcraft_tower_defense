"""Render a list of lines to WAV files with Piper (https://github.com/OHF-Voice/piper1-gpl).

    python synth.py jobs.json <models dir> [espeak-ng-data dir]

jobs.json is a list of {"model", "speaker", "text", "out", "length", "noise", "noise_w"}.
Jobs are grouped by model so each voice model is loaded once. The optional third argument works
around espeak-ng's 160-character limit on its data path (copy piper/espeak-ng-data somewhere
short and pass that).
"""
import json
import sys
import wave
from pathlib import Path

from piper import PiperVoice, SynthesisConfig


def main():
    jobs = json.loads(Path(sys.argv[1]).read_text())
    models = Path(sys.argv[2])
    extra = {"espeak_data_dir": sys.argv[3]} if len(sys.argv) > 3 else {}
    by_model = {}
    for job in jobs:
        by_model.setdefault(job["model"], []).append(job)
    for model, batch in by_model.items():
        voice = PiperVoice.load(str(models / f"{model}.onnx"), **extra)
        for job in batch:
            config = SynthesisConfig(
                speaker_id=job.get("speaker"),
                length_scale=job.get("length"),
                noise_scale=job.get("noise"),
                noise_w_scale=job.get("noise_w"),
            )
            out = Path(job["out"])
            out.parent.mkdir(parents=True, exist_ok=True)
            with wave.open(str(out), "wb") as wav:
                voice.synthesize_wav(job["text"], wav, syn_config=config)
        print(f"{model}: {len(batch)} lines", flush=True)


if __name__ == "__main__":
    main()
