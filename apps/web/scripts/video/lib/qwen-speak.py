"""Speaks an episode's narration by cloning the series' narrator.

Called by `speakAll` in `voice.ts` with one JSON manifest, and deliberately not
once per line: loading the model costs about a minute, so a process per line
would spend three quarters of an hour loading a 43 line episode. This loads
once, builds the clone prompt once, and writes every line the cache is missing.

Reads the manifest from argv[1], writes one wav per entry, and prints a line per
result so the caller has something to log. Levelling and duration probing happen
on the TypeScript side, where they already existed for piper.
"""

import json
import sys
import time
import wave

import numpy as np


def write_wav(path: str, wav, rate: int) -> None:
    """16-bit PCM mono, which is what the rest of the pipeline expects."""
    audio = np.asarray(wav, dtype=np.float32)
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0

    # The model occasionally returns a sample fractionally over full scale.
    # Scaling the whole line down is lossless where clipping it is not.
    if peak > 1.0:
        audio = audio / peak

    with wave.open(path, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(int(rate))
        handle.writeframes((audio * 32767.0).astype("<i2").tobytes())


def main() -> int:
    manifest = json.loads(open(sys.argv[1], encoding="utf-8").read())
    lines = manifest["lines"]

    if not lines:
        print("[qwen] nothing to speak", flush=True)
        return 0

    import torch
    from qwen_tts import Qwen3TTSModel

    started = time.time()
    model = Qwen3TTSModel.from_pretrained(
        manifest["model"],
        device_map=manifest.get("device", "cpu"),
        dtype=torch.float32,
        # flash-attention wants Ampere; the CPU path does not want it at all.
        attn_implementation="sdpa",
    )
    print(f"[qwen] model loaded in {time.time() - started:.0f}s", flush=True)

    reference = manifest["reference"]

    # Built once. The reference encoding is the same for every line, and doing
    # it per line would re-read and re-encode the same six seconds of audio 43
    # times.
    prompt = model.create_voice_clone_prompt(
        ref_audio=reference["audio"],
        ref_text=reference["text"],
    )

    for index, line in enumerate(lines, start=1):
        at = time.time()

        wavs, rate = model.generate_voice_clone(
            text=line["text"],
            language=manifest.get("language", "German"),
            voice_clone_prompt=prompt,
        )
        write_wav(line["path"], wavs[0], rate)

        seconds = len(wavs[0]) / float(rate)
        took = time.time() - at

        print(
            f"[qwen] {index}/{len(lines)} {seconds:5.1f}s in {took:4.0f}s "
            f"({took / max(seconds, 0.01):.1f}x) {line['text'][:48]}",
            flush=True,
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
