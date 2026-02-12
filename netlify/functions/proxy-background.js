/**
 * T1ERA — Netlify Serverless Proxy (Queue-Compatible for LTX-2)
 * File: netlify/functions/proxy.js
 */

const multipart = require('lambda-multipart-parser');

// ═══════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════

const FORCED_MODEL = "ltx-2-19b-distilled_Q4_K_M.gguf";

/** * Use the Gradio Live URL from your Netlify Env Vars 
 */
const AZURE_BASE = process.env.AZURE_VM_URL ? process.env.AZURE_VM_URL.replace(/\/$/, "") : "";
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

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN || origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  };
}

function err(statusCode, message, extraHeaders = {}) {
  return json(statusCode, { error: true, message }, extraHeaders);
}

async function parsePayload(event) {
  const contentType = (event.headers["content-type"] || event.headers["Content-Type"] || "").toLowerCase();
  
  if (contentType.includes("multipart/form-data")) {
    const result = await multipart.parse(event);
    const fields = result.data ? JSON.parse(result.data) : {};
    const imageFile = result.files && result.files[0];
    
    return { 
      fields, 
      imageBase64: imageFile ? imageFile.content.toString('base64') : null, 
      imageType: imageFile ? imageFile.contentType : null 
    };
  }

  if (contentType.includes("application/json")) {
    const parsed = JSON.parse(event.body || "{}");
    return { fields: parsed, imageBase64: null, imageType: null };
  }
  
  throw new Error("Unsupported Content-Type");
}

function checkRateLimit(ip) {
  const now = Date.now();
  const last = rateLimits.get(ip) || 0;
  const remain = RATE_WINDOW_MS - (now - last);
  if (remain > 0) return { allowed: false, retryAfterSeconds: Math.ceil(remain / 1000) };
  rateLimits.set(ip, now);
  return { allowed: true };
}

// ═══════════════════════════════════════════════════════
//  MAIN HANDLER
// ═══════════════════════════════════════════════════════

exports.handler = async function handler(event, _context) {
  const origin = event.headers["origin"] || "";
  const cors = corsHeaders(origin);

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" };
  if (event.httpMethod !== "POST") return err(405, "Method not allowed", cors);
  if (!AZURE_BASE) return err(500, "AZURE_VM_URL not set", cors);

  const clientIp = (event.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  const rl = checkRateLimit(clientIp);
  if (!rl.allowed) return err(429, `Wait ${rl.retryAfterSeconds}s`, cors);

  let fields, imageBase64, imageType;
  try {
    ({ fields, imageBase64, imageType } = await parsePayload(event));
  } catch (parseErr) {
    return err(400, "Invalid payload", cors);
  }

  // Build Data Array
  const resKey = `${fields.resolution || "480p"}:${fields.aspect_ratio || "16:9"}`;
  const [width, height] = RESOLUTION_MAP[resKey] || [854, 480];
  const numFrames = (fields.fps || FPS) * (fields.duration || 6) + FRAME_BONUS;

  const dataArray = [
    fields.prompt || "",
    "(low quality, worst quality, text, watermark, speech, talking, subtitles:1.4)",
    imageBase64 ? { data: `data:${imageType};base64,${imageBase64}`, name: "input.jpg" } : null,
    FORCED_MODEL,
    width,
    height,
    numFrames,
    fields.fps || FPS,
    1, 7.0, -1, true, "sdpa", "None", 127
  ];

  const session_hash = `t1era_${Math.random().toString(36).substring(2, 10)}`;

  try {
    /**
     * QUEUE JOIN LOGIC
     * Because your VM uses WebSockets ("join"), we use /queue/join 
     * which handles the queueing process for complex Gradio spaces.
     */
    const endpoint = `${AZURE_BASE}/queue/join`;
    console.log(`[proxy] Joining Queue: ${endpoint}`);

    const azureResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: dataArray,
        fn_index: 2, // Common index for video gen in large spaces
        session_hash: session_hash
      }),
      signal: AbortSignal.timeout(240_000), 
    });

    if (!azureResponse.ok) {
      const errorText = await azureResponse.text();
      console.error(`[proxy] GPU Error:`, errorText);
      return err(502, `Queue Rejected: ${azureResponse.status}`, cors);
    }

    const gradioData = await azureResponse.json();

    // Since Queue is asynchronous, we return the session details
    // so the frontend can wait for the result.
    return json(200, {
      message: "Processing started",
      job_id: session_hash,
      event_id: gradioData.event_id,
      check_status_url: `${AZURE_BASE}/queue/data?session_hash=${session_hash}`
    }, cors);

  } catch (fetchErr) {
    console.error("[proxy] Connection Error:", fetchErr.message);
    return err(503, "GPU Server connection failed", cors);
  }
};
