"""Nervbox TTS service: keeps Piper voices loaded and renders WAV on request.

Listens on 127.0.0.1 only; the Nervbox backend is the only client.
  POST /synth  {"text": "...", "voice": "thorsten-high", "speaker": "drunk" | null, "lengthScale": 1.0} -> audio/wav
  GET  /voices -> [{"id": "...", "speakers": [...]}]

Install (Pi): /opt/piper/venv with piper-tts, voices in /opt/piper/voices (de_DE-<id>.onnx + .onnx.json),
service unit: nervbox-tts.service (see README.md next to this file).
"""
import glob
import io
import json
import os
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from piper import PiperVoice, SynthesisConfig

VOICE_DIR = os.environ.get("NERVBOX_TTS_VOICES", "/opt/piper/voices")
PORT = int(os.environ.get("NERVBOX_TTS_PORT", "5002"))
MAX_CHARS = 500
PRELOAD = ("thorsten-high", "thorsten-medium")

_voices = {}
_lock = threading.Lock()


def voice_ids():
    return sorted(
        os.path.basename(p)[len("de_DE-"):-len(".onnx")]
        for p in glob.glob(f"{VOICE_DIR}/de_DE-*.onnx")
    )


def get_voice(vid):
    if vid not in voice_ids():
        raise KeyError(vid)
    if vid not in _voices:
        _voices[vid] = PiperVoice.load(f"{VOICE_DIR}/de_DE-{vid}.onnx")
    return _voices[vid]


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _error(self, code, msg):
        self._send(code, json.dumps({"error": msg}).encode())

    def do_GET(self):
        if self.path != "/voices":
            return self._error(404, "not found")
        out = []
        for vid in voice_ids():
            with open(f"{VOICE_DIR}/de_DE-{vid}.onnx.json", encoding="utf-8") as f:
                cfg = json.load(f)
            out.append({"id": vid, "speakers": sorted(cfg.get("speaker_id_map", {}).keys())})
        self._send(200, json.dumps(out).encode())

    def do_POST(self):
        if self.path != "/synth":
            return self._error(404, "not found")
        try:
            length = int(self.headers.get("Content-Length", 0))
            req = json.loads(self.rfile.read(length) or b"{}")
            text = (req.get("text") or "").strip()[:MAX_CHARS]
            if not text:
                return self._error(400, "empty text")
            vid = req.get("voice") or "thorsten-medium"
            with _lock:  # CPU bound: one synthesis at a time
                voice = get_voice(vid)
                speakers = voice.config.speaker_id_map or {}
                sid = speakers.get(req.get("speaker")) if req.get("speaker") else None
                cfg = SynthesisConfig(speaker_id=sid, length_scale=float(req.get("lengthScale") or 1.0))
                buf = io.BytesIO()
                t = time.time()
                with wave.open(buf, "wb") as w:
                    voice.synthesize_wav(text, w, syn_config=cfg)
            self.log_message("synth %s/%s %d chars in %.2fs", vid, req.get("speaker"), len(text), time.time() - t)
            self._send(200, buf.getvalue(), "audio/wav")
        except KeyError as e:
            self._error(400, f"unknown voice {e}")
        except Exception as e:  # noqa: BLE001 - report to the backend
            self._error(500, str(e))


if __name__ == "__main__":
    for vid in PRELOAD:
        try:
            get_voice(vid)
        except Exception as e:  # noqa: BLE001
            print("preload failed", vid, e, flush=True)
    print(f"nervbox-tts listening on 127.0.0.1:{PORT}, voices: {', '.join(voice_ids())}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
