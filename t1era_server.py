"""
T1ERA AI Server
───────────────
Run:  python t1era_server.py
Push to GitHub → Render auto-deploys.

Set these in Render dashboard → Environment:
  RUNPOD_API_KEY      your RunPod API key
  RUNPOD_ENDPOINT_ID  your endpoint ID
  RUNPOD_MODEL        qwen/qwen3-14b-awq  (optional, has default)

Install: pip install flask flask-cors requests gunicorn
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import time
import logging
import os

# ─── CONFIG ──────────────────────────────────────────────────────────────────

# All values come from Render environment variables — nothing hardcoded
API_KEY     = os.environ.get("RUNPOD_API_KEY")
ENDPOINT_ID = os.environ.get("RUNPOD_ENDPOINT_ID")
MODEL       = os.environ.get("RUNPOD_MODEL", "qwen/qwen3-14b-awq")

OPENAI_URL = f"https://api.runpod.ai/v2/{ENDPOINT_ID}/openai/v1/chat/completions"

# ─── APP ─────────────────────────────────────────────────────────────────────

app = Flask(__name__)
CORS(app)  # flask-cors handles all origins by default

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s")
log = app.logger

# Force CORS headers onto EVERY response — including 4xx and 5xx
@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"]  = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response

# ─── RUNPOD HELPERS ──────────────────────────────────────────────────────────

def call_runpod(messages, max_tokens=32768, temperature=0.7):
    """Call RunPod OpenAI-compatible endpoint — synchronous, no polling needed."""
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type":  "application/json",
    }
    payload = {
        "model":       MODEL,
        "messages":    messages,
        "max_tokens":  max_tokens,
        "temperature": temperature,
    }
    resp = requests.post(OPENAI_URL, headers=headers, json=payload, timeout=300)
    log.info(f"RunPod status: {resp.status_code}")
    resp.raise_for_status()
    data = resp.json()
    raw = data["choices"][0]["message"]["content"]
    log.info(f"reply length: {len(raw)}, finish_reason: {data['choices'][0].get('finish_reason')}")
    return raw

# ─── ROUTES ──────────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model": MODEL, "endpoint": ENDPOINT_ID}), 200


@app.route("/chat", methods=["POST", "OPTIONS"])
def chat():
    # Browser preflight
    if request.method == "OPTIONS":
        return jsonify({}), 200

    if not API_KEY:
        return jsonify({"error": "RUNPOD_API_KEY not set on server"}), 500

    body = request.get_json(silent=True)
    if not body or not body.get("messages"):
        return jsonify({"error": "messages array required"}), 400

    messages    = body["messages"]
    max_tokens  = int(body.get("max_tokens",   32768))
    temperature = float(body.get("temperature", 0.7))

    log.info(f'→ RunPod  turns={len(messages)}  last="{messages[-1]["content"][:60]}"')

    try:
        reply = call_runpod(messages, max_tokens, temperature)
    except Exception as e:
        log.error(f"RunPod error: {e}")
        return jsonify({"error": f"RunPod request failed: {e}"}), 502

    log.info(f'← reply length: {len(reply)}, has </think>: {"</think>" in reply}')
    return jsonify({"reply": reply}), 200

# ─── START ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"\n{'═'*50}")
    print("  T1ERA AI Server")
    print(f"{'═'*50}")
    print(f"  Listening : http://localhost:{port}")
    print(f"  RunPod    : {ENDPOINT_ID}")
    print(f"  Model     : {MODEL}")
    print(f"  API key   : {'SET ✓' if API_KEY else 'NOT SET ✗'}")
    print(f"{'═'*50}\n")
    app.run(host="0.0.0.0", port=port, debug=False)
