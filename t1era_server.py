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

RUN_URL    = f"https://api.runpod.ai/v2/{ENDPOINT_ID}/run"
STATUS_URL = f"https://api.runpod.ai/v2/{ENDPOINT_ID}/status"

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

def runpod_headers():
    return {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type":  "application/json",
    }

def submit_job(messages, max_tokens=32768, temperature=0.7):
    payload = {
        "input": {
            "model":    MODEL,
            "messages": messages,
            "sampling_params": {
                "max_tokens":  max_tokens,
                "temperature": temperature,
            }
        }
    }
    resp = requests.post(RUN_URL, headers=runpod_headers(), json=payload, timeout=30)
    resp.raise_for_status()
    return resp.json().get("id")


def poll_job(job_id, timeout=120):
    deadline = time.time() + timeout
    while time.time() < deadline:
        resp = requests.get(
            f"{STATUS_URL}/{job_id}", headers=runpod_headers(), timeout=15
        )
        resp.raise_for_status()
        data   = resp.json()
        status = data.get("status")
        if status == "COMPLETED":
            return data
        if status in ("FAILED", "CANCELLED"):
            log.error(f"Job {job_id} {status}")
            return None
        time.sleep(2)
    log.error(f"Job {job_id} timed out")
    return None


def extract_reply(result):
    try:
        output = result["output"]
        choice = output[0]["choices"][0]
        log.info(f"finish_reason: {choice.get('finish_reason')}")
        log.info(f"output keys: {list(choice.keys())}")
        tokens = choice.get("tokens")
        if tokens:
            raw = tokens[0]
        else:
            raw = choice["message"]["content"]
        log.info(f"raw reply length: {len(raw)}")
        return raw
    except (IndexError, KeyError, TypeError) as e:
        log.error(f"extract_reply error: {e} — raw output: {str(result.get('output'))[:300]}")
        return None

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
        job_id = submit_job(messages, max_tokens, temperature)
    except Exception as e:
        log.error(f"Submit error: {e}")
        return jsonify({"error": f"Submit failed: {e}"}), 502

    if not job_id:
        return jsonify({"error": "No job ID from RunPod"}), 502

    result = poll_job(job_id)
    if not result:
        return jsonify({"error": "Job failed or timed out"}), 504

    reply = extract_reply(result)
    if not reply:
        log.error(f"Unparseable output: {result.get('output')}")
        return jsonify({"error": "Could not parse RunPod response"}), 502

    log.info(f'← reply length: {len(reply)} chars')
    log.info(f'← has </think>: {"</think>" in reply}')
    log.info(f'← first 200: {reply[:200]}')
    log.info(f'← last 200: {reply[-200:]}')
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
