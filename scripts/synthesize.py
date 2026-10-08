"""CPU-only speech process. Receives text JSON on stdin; never analyzes audio."""
import json
import re
import sys
import wave
from pathlib import Path
import onnxruntime as ort
from piper import PiperVoice, PiperConfig, SynthesisConfig

model, output = sys.argv[1:3]
request = json.load(sys.stdin)
options = ort.SessionOptions()
options.intra_op_num_threads = 2
options.inter_op_num_threads = 1
voice = PiperVoice(
    config=PiperConfig.from_dict(json.loads(Path(model + ".json").read_text())),
    session=ort.InferenceSession(model, sess_options=options, providers=["CPUExecutionProvider"]),
)
narrator = request.get("delivery") == "narrator"
config = SynthesisConfig(length_scale=(1.02 if narrator else 1) / request["rate"], volume=0.9)
rate = voice.config.sample_rate
cues = []
with wave.open(output, "wb") as wav:
    wav.setnchannels(1)
    wav.setsampwidth(2)
    wav.setframerate(rate)
    for i, text in enumerate(request["texts"]):
        samples = 0
        sentences = re.split(r"(?<=[.!?])\s+", text.strip()) if narrator else [text]
        for sentence_index, sentence in enumerate(sentences):
            for chunk in voice.synthesize(sentence, config):
                data = chunk.audio_int16_bytes
                wav.writeframesraw(data)
                samples += len(data) // 2
            if narrator and sentence_index < len(sentences) - 1:
                gap = round(rate * 0.2)
                wav.writeframesraw(bytes(gap * 2))
                samples += gap
        # A short breath between narrative beats, included in the timing cue.
        if i < len(request["texts"]) - 1:
            gap = round(rate * (0.45 if narrator else 0.12))
            wav.writeframesraw(bytes(gap * 2))
            samples += gap
        if samples == 0:
            raise ValueError("La voz no produjo audio")
        cues.append({"text": text, "duration": samples / rate})
        print(json.dumps({"progress": (i + 1) / len(request["texts"])}), flush=True)
print(json.dumps({"cues": cues}), flush=True)
