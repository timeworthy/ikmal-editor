#!/usr/bin/env python3
"""Optional local T5 grammar-correction adapter for the Ikmal sidecar.

The Go sidecar remains fully functional without this process. When this adapter
is running, set IKMAL_TRANSFORMER_URL to its /v1/analyze endpoint.
"""

from __future__ import annotations

import difflib
import json
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


MODEL_NAME = os.environ.get("IKMAL_TRANSFORMER_MODEL", "Unbabel/gec-t5_small")
DEFAULT_MODEL_DIR = Path.home() / ".ikmal-editor" / "models" / "gec-t5_small"
MODEL_SOURCE = os.environ.get(
    "IKMAL_TRANSFORMER_MODEL_DIR",
    str(DEFAULT_MODEL_DIR) if (DEFAULT_MODEL_DIR / "config.json").exists() else MODEL_NAME,
)
PORT = int(os.environ.get("IKMAL_TRANSFORMER_PORT", "8099"))
MAX_BODY = 1 << 20
MAX_CHUNK_WORDS = int(os.environ.get("IKMAL_TRANSFORMER_MAX_CHUNK_WORDS", "80"))
MAX_INPUT_TOKENS = int(os.environ.get("IKMAL_TRANSFORMER_MAX_INPUT_TOKENS", "128"))
TOKEN_RE = re.compile(r"\w+|[^\w\s]", re.UNICODE)
WORD_RE = re.compile(r"\w+", re.UNICODE)

_tokenizer: Any = None
_model: Any = None
_torch: Any = None
_load_error: str | None = None


def load_model() -> tuple[Any, Any, Any]:
    global _tokenizer, _model, _torch, _load_error
    if _tokenizer is not None:
        return _tokenizer, _model, _torch
    if _load_error is not None:
        raise RuntimeError(_load_error)
    try:
        import torch
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

        _torch = torch
        _tokenizer = AutoTokenizer.from_pretrained(MODEL_SOURCE)
        _model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_SOURCE)
        _model.eval()
        return _tokenizer, _model, _torch
    except Exception as exc:  # dependency and model-download failures are reported by /health
        _load_error = f"{type(exc).__name__}: {exc}"
        raise RuntimeError(_load_error) from exc


def correct(text: str) -> str:
    tokenizer, model, torch = load_model()
    prompt = "gec: " + text
    encoded = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=MAX_INPUT_TOKENS)
    with torch.no_grad():
        output = model.generate(
            **encoded,
            max_length=MAX_INPUT_TOKENS,
            num_beams=5,
            early_stopping=True,
        )
    return tokenizer.decode(output[0], skip_special_tokens=True, clean_up_tokenization_spaces=True)


def tokenize(text: str) -> list[tuple[str, int, int]]:
    return [(match.group(0), match.start(), match.end()) for match in TOKEN_RE.finditer(text)]


def detokenize(parts: list[str]) -> str:
    value = " ".join(parts)
    value = re.sub(r"\s+([,.!?;:%])", r"\1", value)
    value = re.sub(r"\s+(['’])", r"\1", value)
    value = re.sub(r"(['’])\s+", r"\1", value)
    return value


def utf16_offset(text: str, codepoint_offset: int) -> int:
    return len(text[:codepoint_offset].encode("utf-16-le")) // 2


def suggestions_for(text: str, corrected: str) -> list[dict[str, Any]]:
    if text == corrected:
        return []

    source = tokenize(text)
    target = [part[0] for part in tokenize(corrected)]
    source_values = [part[0] for part in source]
    matcher = difflib.SequenceMatcher(a=source_values, b=target, autojunk=False)
    suggestions = []

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        if i1 < len(source):
            start = source[i1][1]
            end = source[i2 - 1][2] if i2 > i1 else start
        else:
            start = end = len(text)
        replacement = detokenize(target[j1:j2])
        suggestions.append(
            {
                "start": utf16_offset(text, start),
                "end": utf16_offset(text, end),
                "replacement": replacement,
                "category": "transformer-grammar",
                "message": "The local grammar model suggests this correction.",
                "confidence": 0.68,
                "source": "transformer",
            }
        )
    return suggestions


def sentence_ranges(text: str) -> list[tuple[int, int]]:
    ranges = []
    start = 0
    for token, _, end in tokenize(text):
        if token in ".!?":
            ranges.append((start, end))
            start = end
    if start < len(text):
        ranges.append((start, len(text)))
    return ranges


def word_count(text: str) -> int:
    return len(WORD_RE.findall(text))


def split_long_range(text: str, start: int, end: int) -> list[tuple[int, int]]:
    words = list(WORD_RE.finditer(text, start, end))
    if not words:
        return [(start, end)]
    ranges = []
    chunk_start = start
    for index, word in enumerate(words, start=1):
        if index % MAX_CHUNK_WORDS == 0:
            ranges.append((chunk_start, word.end()))
            chunk_start = words[index].start() if index < len(words) else word.end()
    if chunk_start < end:
        ranges.append((chunk_start, end))
    return ranges


def correction_chunks(text: str) -> list[tuple[int, int]]:
    """Group complete sentences without exceeding the local model budget."""
    ranges = []
    pending_start = None
    pending_end = None
    pending_words = 0

    def flush_pending() -> None:
        nonlocal pending_start, pending_end, pending_words
        if pending_start is not None and pending_end is not None:
            ranges.append((pending_start, pending_end))
        pending_start = None
        pending_end = None
        pending_words = 0

    for start, end in sentence_ranges(text):
        count = word_count(text[start:end])
        if count > MAX_CHUNK_WORDS:
            flush_pending()
            ranges.extend(split_long_range(text, start, end))
            continue
        if pending_start is not None and pending_words + count > MAX_CHUNK_WORDS:
            flush_pending()
        if pending_start is None:
            pending_start = start
        pending_end = end
        pending_words += count
    flush_pending()
    return ranges


def add_utf16_offset(text: str, base: int, value: int) -> int:
    return utf16_offset(text, base) + value


def analyze_chunk(text: str, start: int, end: int) -> list[dict[str, Any]]:
    chunk = text[start:end]
    corrected = correct(chunk)
    suggestions = suggestions_for(chunk, corrected)
    for suggestion in suggestions:
        suggestion["start"] = add_utf16_offset(text, start, suggestion["start"])
        suggestion["end"] = add_utf16_offset(text, start, suggestion["end"])
    return suggestions


def analyze(payload: dict[str, Any]) -> dict[str, Any]:
    text = payload.get("text", "")
    if not isinstance(text, str) or not text.strip():
        raise ValueError("text is required")
    suggestions = []
    for start, end in correction_chunks(text):
        suggestions.extend(analyze_chunk(text, start, end))
    return {
        "backend": "transformer",
        "suggestions": suggestions,
        "antecedents": [],
    }


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status: int, value: dict[str, Any]) -> None:
        body = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path != "/health":
            self.send_json(404, {"error": "not found"})
            return
        self.send_json(
            200,
            {
                "status": "ok" if _load_error is None else "degraded",
                "backend": "transformer",
                "model": MODEL_SOURCE,
                "loaded": _tokenizer is not None,
                "error": _load_error,
            },
        )

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/v1/analyze":
            self.send_json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > MAX_BODY:
                raise ValueError("request too large")
            payload = json.loads(self.rfile.read(length))
            self.send_json(200, analyze(payload))
        except Exception as exc:
            self.send_json(503, {"error": str(exc)})

    def log_message(self, format: str, *args: Any) -> None:
        return


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Ikmal transformer adapter listening on http://127.0.0.1:{PORT}")
    server.serve_forever()
