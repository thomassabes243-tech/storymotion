"""Download the pinned Spanish model; verify both files before installation."""
import hashlib
import os
import sys
import urllib.request
from pathlib import Path

base = "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/"
files = {
    "ald/medium/es_MX-ald-medium.onnx": "019b3803293c93e34a206dd2e53a3889209a514e786fd7144f7b70196c579b63",
    "ald/medium/es_MX-ald-medium.onnx.json": "5a71498158e04afc8099bfd019c7e87c68eb9d042505a2b1a87e5c1ac2b1a61d",
    "claude/high/es_MX-claude-high.onnx": "3ef40a71ea63852cd8ab7e6fa7d2ecdcfa67a0b47c9c48e3f10e02ee02083ea0",
    "claude/high/es_MX-claude-high.onnx.json": "1afc81f703c0e4cb3b4d7c0dca096b8b54a98806807f0170cf5eb5557723c12d",
}
directory = Path(sys.argv[1])
directory.mkdir(parents=True, exist_ok=True)
for resource, digest in files.items():
    name = Path(resource).name
    target = directory / name
    if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == digest:
        continue
    temporary = target.with_suffix(target.suffix + ".download")
    try:
        with urllib.request.urlopen(base + resource, timeout=120) as response, temporary.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
        if hashlib.sha256(temporary.read_bytes()).hexdigest() != digest:
            raise ValueError("El modelo descargado no coincide con la versión verificada")
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)
