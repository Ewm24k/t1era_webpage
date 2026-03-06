"""
T1ERA AI Server — Streaming
────────────────────────────
Push to GitHub → Render auto-deploys.

Render Environment Variables:
  RUNPOD_API_KEY      RunPod API key
  RUNPOD_ENDPOINT_ID  RunPod endpoint ID
  RUNPOD_MODEL        model name (default: qwen/qwen3-14b-awq)

Install: pip install flask flask-cors requests gunicorn
"""

from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
import requests
import logging
import os
import json

# ─── CONFIG ──────────────────────────────────────────────────────────────────

API_KEY     = os.environ.get("RUNPOD_API_KEY")
ENDPOINT_ID = os.environ.get("RUNPOD_ENDPOINT_ID")
MODEL       = os.environ.get("RUNPOD_MODEL", "qwen/qwen3-14b-awq")
OPENAI_URL  = f"https://api.runpod.ai/v2/{ENDPOINT_ID}/openai/v1/chat/completions"

# ─── APP ─────────────────────────────────────────────────────────────────────

app = Flask(__name__)
CORS(app)

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s")
log = app.logger

@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"]  = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response

# ─── STREAM GENERATOR ────────────────────────────────────────────────────────

def stream_runpod(messages, max_tokens=8192, temperature=0.7):
    """
    Stream tokens from RunPod directly to the browser as SSE.
    Filters out <think>...</think> block — only streams the final answer.
    """
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type":  "application/json",
    }
    payload = {
        "model":       MODEL,
        "messages":    messages,
        "max_tokens":  max_tokens,
        "temperature": temperature,
        "stream":      True,
    }

    in_think   = False   # currently inside <think> block
    think_done = False   # </think> already seen
    buffer     = ""      # partial token buffer for tag detection

    try:
        with requests.post(OPENAI_URL, headers=headers,
                           json=payload, stream=True, timeout=600) as resp:
            resp.raise_for_status()

            for line in resp.iter_lines():
                if not line:
                    continue

                line = line.decode("utf-8")

                # SSE format: "data: {...}" or "data: [DONE]"
                if not line.startswith("data:"):
                    continue

                data_str = line[5:].strip()

                if data_str == "[DONE]":
                    yield "data: [DONE]\n\n"
                    break

                try:
                    chunk = json.loads(data_str)
                except json.JSONDecodeError:
                    continue

                # Extract token from chunk
                delta = chunk.get("choices", [{}])[0].get("delta", {})
                token = delta.get("content", "")

                if not token:
                    continue

                buffer += token

                # ── Think block filtering ─────────────────────────────────
                if not think_done:
                    # Check if we just entered think block
                    if "<think>" in buffer and not in_think:
                        in_think = True
                        # Emit anything before <think>
                        before = buffer.split("<think>")[0]
                        buffer = buffer[buffer.index("<think>"):]
                        if before:
                            yield f"data: {json.dumps({'token': before})}\n\n"
                        continue

                    if in_think:
                        if "</think>" in buffer:
                            # Think block closed — emit everything after
                            in_think   = False
                            think_done = True
                            after = buffer.split("</think>", 1)[1]
                            buffer = ""
                            if after:
                                yield f"data: {json.dumps({'token': after})}\n\n"
                        # Still inside think — discard
                        continue

                # ── Normal token — emit to browser ───────────────────────
                yield f"data: {json.dumps({'token': buffer})}\n\n"
                buffer = ""

    except Exception as e:
        log.error(f"Stream error: {e}")
        yield f"data: {json.dumps({'error': str(e)})}\n\n"

# ─── ROUTES ──────────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model": MODEL, "endpoint": ENDPOINT_ID}), 200


@app.route("/chat", methods=["POST", "OPTIONS"])
def chat():
    if request.method == "OPTIONS":
        return jsonify({}), 200

    if not API_KEY:
        return jsonify({"error": "RUNPOD_API_KEY not set on server"}), 500

    body = request.get_json(silent=True)
    if not body or not body.get("messages"):
        return jsonify({"error": "messages array required"}), 400

    messages    = body["messages"]
    max_tokens  = int(body.get("max_tokens",   8192))
    temperature = float(body.get("temperature", 0.7))

    log.info(f'→ stream  turns={len(messages)}  last="{messages[-1]["content"][:60]}"'  )

    return Response(
        stream_with_context(stream_runpod(messages, max_tokens, temperature)),
        mimetype="text/event-stream",
        headers={
            "Cache-Control":           "no-cache",
            "X-Accel-Buffering":       "no",
            "Access-Control-Allow-Origin": "*",
        }
    )


# ─── START ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"\n{'═'*50}")
    print("  T1ERA AI Server — Streaming")
    print(f"{'═'*50}")
    print(f"  Listening : http://localhost:{port}")
    print(f"  RunPod    : {ENDPOINT_ID}")
    print(f"  Model     : {MODEL}")
    print(f"  API key   : {'SET ✓' if API_KEY else 'NOT SET ✗'}")
    print(f"{'═'*50}\n")
    app.run(host="0.0.0.0", port=port, debug=False)
