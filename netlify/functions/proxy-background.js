/**
 * T1ERA — Netlify Serverless Proxy (Fixed)
 * File: netlify/functions/proxy-background.js
 *
 * FIX SUMMARY:
 * 1. Accepts both JSON and multipart — but frontend now sends JSON (no FormData)
 * 2. Every code path returns a valid JSON response — no more empty body crashes
 * 3. isBase64Encoded flag handled correctly for Netlify
 * 4. Image upload converted to base64 on frontend before sending as JSON
 */

const FORCED_MODEL = "ltx-2-19b-distilled_Q4_K_M.gguf";

const AZURE_BASE = process.env.AZURE_VM_URL
  ? process.env.AZURE_VM_URL.replace(/\/$/, "")
  : "";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "";

const RATE_WINDOW_MS = 15_000;
const rateLimits = new Map();

const RESOLUTION_MAP = {
  "480p:16:9":  [854,  480],
  "480p:9:16":  [480,  854],
  "480p:1:1":   [480,  480],
  "720p:16:9":  [1280, 720],
  "720p:9:16":  [720,  1280],
  "720p:1:1":   [720,  720],
  "1080p:16:9": [1920, 1080],
  "1080p:9:16": [1080, 1920],
  "1080p:1:1":  [1080, 1080],
};

const FPS = 24;
const FRAME_BONUS = 1;

// ─── HELPERS ────────────────────────────────────────────

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin":  ALLOWED_ORIGIN || origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function jsonResp(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  };
}

function errResp(statusCode, message, extraHeaders = {}) {
  return jsonResp(statusCode, { error: true, message }, extraHeaders);
}

function checkRateLimit(ip) {
  const now = Date.now();
  const last = rateLimits.get(ip) || 0;
  const remain = RATE_WINDOW_MS - (now - last);
  if (remain > 0) return { allowed: false, retryAfterSeconds: Math.ceil(remain / 1000) };
  rateLimits.set(ip, now);
  return { allowed: true };
}

// ─── PAYLOAD PARSER ─────────────────────────────────────
// Frontend now sends application/json — image already base64'd on client side.
// This avoids the lambda-multipart-parser isBase64Encoded crash on Netlify.

function parsePayload(event) {
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : (event.body || "{}");

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error("Body is not valid JSON: " + e.message);
  }

  return {
    fields: parsed,
    imageBase64: parsed.image_base64 || null,
    imageType:   parsed.image_type   || "image/jpeg",
  };
}

// ─── MAIN HANDLER ────────────────────────────────────────

exports.handler = async function handler(event, _context) {
  const origin = event.headers["origin"] || event.headers["Origin"] || "";
  const cors   = corsHeaders(origin);

  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return errResp(405, "Method not allowed", cors);
  }

  if (!AZURE_BASE) {
    return errResp(500, "AZURE_VM_URL environment variable is not set", cors);
  }

  // Rate limit
  const clientIp = (event.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  const rl = checkRateLimit(clientIp);
  if (!rl.allowed) {
    return errResp(429, `Too many requests. Wait ${rl.retryAfterSeconds}s before retrying.`, cors);
  }

  // Parse body
  let fields, imageBase64, imageType;
  try {
    ({ fields, imageBase64, imageType } = parsePayload(event));
  } catch (parseErr) {
    console.error("[proxy] Parse error:", parseErr.message);
    return errResp(400, "Invalid request body: " + parseErr.message, cors);
  }

  if (!fields.prompt || !fields.prompt.trim()) {
    return errResp(400, "prompt is required", cors);
  }

  // Build Gradio data array
  const resKey = `${fields.resolution || "480p"}:${fields.aspect_ratio || "16:9"}`;
  const [width, height] = RESOLUTION_MAP[resKey] || [854, 480];
  const numFrames = (FPS * (fields.duration || 6)) + FRAME_BONUS;

  const imagePayload = imageBase64
    ? { data: `data:${imageType};base64,${imageBase64}`, name: "input.jpg" }
    : null;

  const dataArray = [
    fields.prompt.trim(),
    "(low quality, worst quality, text, watermark, speech, talking, subtitles:1.4)",
    imagePayload,
    FORCED_MODEL,
    width,
    height,
    numFrames,
    FPS,
    1, 7.0, -1, true, "sdpa", "None", 127
  ];

  const session_hash = `t1era_${Math.random().toString(36).substring(2, 10)}`;
  const endpoint     = `${AZURE_BASE}/queue/join`;

  console.log(`[proxy] Joining queue: ${endpoint} | res: ${width}x${height} | frames: ${numFrames}`);

  try {
    const azureResponse = await fetch(endpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data:         dataArray,
        fn_index:     2,
        session_hash: session_hash,
      }),
      signal: AbortSignal.timeout(240_000),
    });

    // Read body as text first — never call .json() directly on unknown responses
    const responseText = await azureResponse.text();

    if (!azureResponse.ok) {
      console.error(`[proxy] GPU rejected request (${azureResponse.status}):`, responseText);
      return errResp(502, `GPU queue rejected: HTTP ${azureResponse.status}. ${responseText.substring(0, 200)}`, cors);
    }

    let gradioData = {};
    try {
      gradioData = JSON.parse(responseText);
    } catch (e) {
      console.error("[proxy] GPU returned non-JSON:", responseText.substring(0, 300));
      return errResp(502, "GPU returned unexpected response format", cors);
    }

    return jsonResp(200, {
      message:          "Job queued successfully",
      job_id:           session_hash,
      event_id:         gradioData.event_id || null,
      check_status_url: `${AZURE_BASE}/queue/data?session_hash=${session_hash}`,
      specs: {
        resolution:   fields.resolution || "480p",
        aspect_ratio: fields.aspect_ratio || "16:9",
        duration:     fields.duration || 6,
        width,
        height,
        num_frames:   numFrames,
      },
    }, cors);

  } catch (fetchErr) {
    // AbortError = timeout, TypeError = DNS/network failure
    const isTimeout = fetchErr.name === "AbortError" || fetchErr.name === "TimeoutError";
    console.error("[proxy] Fetch error:", fetchErr.name, fetchErr.message);
    return errResp(
      503,
      isTimeout
        ? "GPU server timed out. It may be starting up — please retry in 30 seconds."
        : `Cannot reach GPU server: ${fetchErr.message}`,
      cors
    );
  }
};
