"""
T1ERA AI Server
───────────────
Run:  python t1era_server.py
Then open spark22.html — the T1ERA tab will hit this server.

Install: pip install flask flask-cors requests
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import time
import logging
import os

# ─── CONFIG ──────────────────────────────────────────────────────────────────

API_KEY     = os.environ.get("RUNPOD_API_KEY")
ENDPOINT_ID = os.environ.get("RUNPOD_ENDPOINT_ID", "xd50gpmd9jahih")
MODEL       = os.environ.get("RUNPOD_MODEL", "qwen/qwen3-14b-awq")

RUN_URL     = f"https://api.runpod.ai/v2/{ENDPOINT_ID}/run"
STATUS_URL  = f"https://api.runpod.ai/v2/{ENDPOINT_ID}/status"
HEADERS     = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type":  "application/json",
}

# ─── APP ─────────────────────────────────────────────────────────────────────

# Allow requests from Netlify (and localhost for dev)
ALLOWED_ORIGINS = [
    os.environ.get("ALLOWED_ORIGIN", "*"),
    "http://localhost:5000",
    "http://127.0.0.1:5000",
]

app = Flask(__name__)
CORS(app, origins=ALLOWED_ORIGINS)

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s")
log = app.logger

if not API_KEY:
    raise RuntimeError("RUNPOD_API_KEY environment variable is not set")

# ─── RUNPOD HELPERS ──────────────────────────────────────────────────────────

def submit_job(messages, max_tokens=512, temperature=0.7):
    payload = {
        "input": {
            "model":       MODEL,
            "messages":    messages,
            "max_tokens":  max_tokens,
            "temperature": temperature,
        }
    }
    resp = requests.post(RUN_URL, headers=HEADERS, json=payload, timeout=30)
    resp.raise_for_status()
    return resp.json().get("id")


def poll_job(job_id, timeout=120):
    deadline = time.time() + timeout
    while time.time() < deadline:
        resp = requests.get(f"{STATUS_URL}/{job_id}", headers=HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()
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
        # Shape 1: tokens array (your pod format)
        tokens = output[0]["choices"][0].get("tokens")
        if tokens:
            return tokens[0]
        # Shape 2: OpenAI message.content
        return output[0]["choices"][0]["message"]["content"]
    except (IndexError, KeyError, TypeError):
        return None

# ─── ROUTES ──────────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200


@app.route("/chat", methods=["POST"])
def chat():
    body = request.get_json(silent=True)
    if not body or not body.get("messages"):
        return jsonify({"error": "messages array required"}), 400

    messages    = body["messages"]
    max_tokens  = int(body.get("max_tokens", 512))
    temperature = float(body.get("temperature", 0.7))

    log.info(f"→ RunPod  turns={len(messages)}  last=\"{messages[-1]['content'][:60]}\"")

    try:
        job_id = submit_job(messages, max_tokens, temperature)
    except Exception as e:
        return jsonify({"error": f"Submit failed: {e}"}), 502

    if not job_id:
        return jsonify({"error": "No job ID from RunPod"}), 502

    result = poll_job(job_id)
    if not result:
        return jsonify({"error": "Job failed or timed out"}), 504

    reply = extract_reply(result)
    if not reply:
        return jsonify({"error": "Could not parse RunPod response"}), 502

    log.info(f"← reply   \"{reply[:80]}\"")
    return jsonify({"reply": reply}), 200

# ─── START ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("\n" + "═" * 50)
    print("  T1ERA AI Server")
    print("═" * 50)
    print("  Open   : http://localhost:5000")
    print("  API    : http://localhost:5000/chat")
    print("  RunPod : " + ENDPOINT_ID)
    print("  Model  : " + MODEL)
    print("  Stop   : Ctrl+C")
    print("═" * 50 + "\n")
    app.run(host="0.0.0.0", port=5000, debug=False)
