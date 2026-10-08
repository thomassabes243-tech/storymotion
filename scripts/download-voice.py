"""Download the pinned Spanish model; verify both files before installation."""
import hashlib
import os
import sys
import urllib.request
from pathlib import Path

base = "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/medium/"
files = {
    "es_MX-ald-medium.onnx": "019b3803293c93e34a206dd2e53a3889209a514e786fd7144f7b70196c579b63",
    "es_MX-ald-medium.onnx.json": "5a71498158e04afc8099bfd019c7e87c68eb9d042505a2b1a87e5c1ac2b1a61d",
}
directory = Path(sys.argv[1])
directory.mkdir(parents=True, exist_ok=True)
for name, digest in files.items():
    target = directory / name
    if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == digest:
        continue
    temporary = target.with_suffix(target.suffix + ".download")
    try:
        with urllib.request.urlopen(base + name, timeout=120) as response, temporary.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
        if hashlib.sha256(temporary.read_bytes()).hexdigest() != digest:
            raise ValueError("El modelo descargado no coincide con la versión verificada")
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)
