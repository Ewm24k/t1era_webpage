/**
 * T1ERA — Netlify Serverless Proxy (Fixed for LTX-2 / Wan2GP)
 * File: netlify/functions/proxy.js
 */

const multipart = require('lambda-multipart-parser');

// ═══════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════

const FORCED_MODEL = "ltx-2-19b-distilled_Q4_K_M.gguf";

/** * Use the Gradio Live URL from your Netlify Env Vars 
 * Example: https://bad7ec597ed5f9bde6.gradio.live
 */
const AZURE_BASE = process.env.AZURE_VM_URL ? process.env.AZURE_VM_URL.replace(/\/$/, "") : "";

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "";

const rateLimits = new Map();
const RATE_WINDOW_MS = 15_000; // 15 seconds cooldown
const MAX_BODY_BYTES = 12 * 1024 * 1024; 

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

/**
 * FIXED: This now correctly handles both JSON and Multipart (Images)
 */
async function parsePayload(event) {
  const contentType = (event.headers["content-type"] || event.headers["Content-Type"] || "").toLowerCase();
  
  // Handle Multipart (FormData from UI)
  if (contentType.includes("multipart/form-data")) {
    const result = await multipart.parse(event);
    
    // result.data contains the JSON string 'payload' from generate.html
    const fields = result.data ? JSON.parse(result.data) : {};
    const imageFile = result.files && result.files[0];
    
    return { 
      fields, 
      imageBase64: imageFile ? imageFile.content.toString('base64') : null, 
      imageType: imageFile ? imageFile.contentType : null 
    };
  }

  // Handle Standard JSON
  if (contentType.includes("application/json")) {
    const parsed = JSON.parse(event.body || "{}");
    return { fields: parsed, imageBase64: null, imageType: null };
  }
  
  throw new Error("Unsupported Content-Type. Expected multipart/form-data or application/json");
}

// ═══════════════════════════════════════════════════════
//  AZURE VM — Payload Construction
// ═══════════════════════════════════════════════════════

function buildGradioPayload(fields, imageBase64, imageType) {
  const resKey = `${fields.resolution || "480p"}:${fields.aspect_ratio || "16:9"}`;
  const [width, height] = RESOLUTION_MAP[resKey] || [854, 480];
  const numFrames = (fields.fps || FPS) * (fields.duration || 6) + FRAME_BONUS;

  const data = [
    fields.prompt || "",          // [0] Positive prompt
    "(low quality, worst quality, text, watermark, speech, talking, subtitles:1.4)", // [1] Negative prompt
    imageBase64 ? { data: `data:${imageType};base64,${imageBase64}`, name: "input.jpg" } : null, // [2] Image
    FORCED_MODEL,                  // [3] Hardcoded Model
    width,                         // [4] Width
    height,                        // [5] Height
    numFrames,                     // [6] Frames
    fields.fps || FPS,             // [7] FPS
    1,                             // [8] Steps (Distilled)
    7.0,                           // [9] Guidance Scale
    -1,                            // [10] Seed
    true,                          // [11] VAE Tiling
    "sdpa",                        // [12] Attention
    "None",                        // [13] Upscaler
    127,                           // [14] Motion Bucket
  ];

  return {
    fn_index: 1, 
    data,
    session_hash: `t1era_${Date.now()}`,
  };
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

  if (!AZURE_BASE) return err(500, "AZURE_VM_URL environment variable is not set.", cors);

  const clientIp = (event.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  const rl = checkRateLimit(clientIp);
  if (!rl.allowed) return err(429, `Wait ${rl.retryAfterSeconds}s`, cors);

  let fields, imageBase64, imageType;
  try {
    ({ fields, imageBase64, imageType } = await parsePayload(event));
  } catch (parseErr) {
    console.error("[proxy] Parse Error Details:", parseErr);
    return err(400, "Invalid payload structure. Check proxy logs.", cors);
  }

  const gradioPayload = buildGradioPayload(fields, imageBase64, imageType);
  const t0 = Date.now();
  
  try {
    /**
     * UPDATED ENDPOINT: Switching from /gradio_api/predict to /api/predict
     * to resolve the 404 error returned by your Azure VM.
     */
    const endpoint = `${AZURE_BASE}/api/predict`;
    console.log(`[proxy] Requesting GPU at: ${endpoint}`);

    const azureResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(gradioPayload),
      signal: AbortSignal.timeout(180_000), 
    });

    if (!azureResponse.ok) {
      const errorText = await azureResponse.text();
      console.error(`[proxy] GPU Error ${azureResponse.status}:`, errorText);
      return err(502, `GPU returned ${azureResponse.status}`, cors);
    }

    const gradioData = await azureResponse.json();
    
    // Support for both new and old Gradio data formats
    const rawPathData = gradioData.data || [];
    const rawPath = (typeof rawPathData[0] === 'object') ? rawPathData[0].name : rawPathData[0] || "";

    if (!rawPath) return err(502, "GPU failed to return a video path", cors);

    // Build the final public video URL
    const videoUrl = rawPath.startsWith("http") ? rawPath : `${AZURE_BASE}/file=${rawPath.replace(/^\//, "")}`;

    return json(200, {
      video_url: videoUrl,
      job_id: gradioData.session_hash || `job_${Date.now()}`,
      duration_ms: (Date.now() - t0),
      specs: { width: gradioPayload.data[4], height: gradioPayload.data[5] }
    }, cors);

  } catch (fetchErr) {
    console.error("[proxy] Connection Error:", fetchErr.message);
    return err(503, "GPU Server connection failed. Check your Azure VM terminal.", cors);
  }
};
