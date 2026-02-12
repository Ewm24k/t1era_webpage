/**
 * T1ERA — Netlify Serverless Proxy
 * File: netlify/functions/proxy.js
 *
 * Bridges the Netlify frontend to the Azure A10 VM running Wan2GP.
 * Responsibilities:
 *   1. Origin validation  — only accepts requests from your Netlify domain
 *   2. Rate limiting      — prevents a single user from spamming the GPU
 *   3. Payload mapping    — translates simple frontend choices into Wan2GP API params
 *   4. Model injection    — hardcodes the model name so users never choose it
 *   5. Request forwarding — POSTs to the Gradio /predict endpoint on Azure VM
 *   6. Response shaping   — returns a clean { video_url, job_id, duration_ms } object
 *
 * ─── HOW TO DEPLOY ────────────────────────────────────────────────
 *   1. Place this file at:   netlify/functions/proxy.js
 *   2. Set environment vars in Netlify Dashboard → Site Settings → Env Variables:
 *        AZURE_VM_IP          your-vm-ip-or-domain (no protocol, no trailing slash)
 *        AZURE_VM_PORT        7860  (default Gradio port, or your custom port)
 *        AZURE_API_TOKEN      optional bearer token if you added auth to wgp.py
 *        ALLOWED_ORIGIN       https://your-site.netlify.app
 *   3. Push to GitHub — Netlify auto-deploys the function.
 *   4. Call it from the frontend as: POST /.netlify/functions/proxy
 * ──────────────────────────────────────────────────────────────────
 */

// ═══════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════

/** The model is ALWAYS this — never exposed to the user */
const FORCED_MODEL = "ltx-2-19b-distilled_Q4_K_M.gguf";

/** Gradio API endpoint on your Azure VM */
const AZURE_BASE = `http://${process.env.AZURE_VM_IP}:${process.env.AZURE_VM_PORT || 7860}`;

/** Allowed origin — set to your exact Netlify URL */
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "";

/**
 * In-memory rate limiter.
 * NOTE: Netlify Functions are stateless; for production use
 * a Redis / Upstash KV store instead (see comment below).
 * This simple version still works well for low traffic.
 */
const rateLimits = new Map(); // ip → last_request_timestamp
const RATE_WINDOW_MS = 30_000; // 30 seconds between requests per IP

/** Max allowed request size to avoid abuse */
const MAX_BODY_BYTES = 12 * 1024 * 1024; // 12 MB

// ═══════════════════════════════════════════════════════
//  RESOLUTION MAP  key: "res:ratio"  value: [w, h]
// ═══════════════════════════════════════════════════════
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

const FPS         = 24;
const FRAME_BONUS = 1;   // LTX-2 formula: seconds × FPS + 1

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

/** Build standard CORS headers */
function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin":  ALLOWED_ORIGIN || origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

/** Uniform JSON response */
function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  };
}

/** Error shortcut */
function err(statusCode, message, extraHeaders = {}) {
  return json(statusCode, { error: true, message }, extraHeaders);
}

/** Parse multipart form data manually (Netlify strips multipart by default) */
async function parsePayload(event) {
  const contentType = (event.headers["content-type"] || "").toLowerCase();

  if (contentType.includes("application/json")) {
    const parsed = JSON.parse(event.body || "{}");
    return { fields: parsed, imageBase64: null, imageType: null };
  }

  if (contentType.includes("multipart/form-data")) {
    // Netlify Functions v2 / @netlify/functions@2+ support binary
    // Here we parse the base64 body that Netlify provides
    const boundary = contentType.split("boundary=")[1];
    if (!boundary) throw new Error("Missing multipart boundary");

    const bodyBuffer = Buffer.from(
      event.isBase64Encoded ? event.body : Buffer.from(event.body).toString("base64"),
      "base64"
    );

    let fields = {};
    let imageBase64 = null;
    let imageType = null;

    const parts = splitMultipart(bodyBuffer, `--${boundary}`);

    for (const part of parts) {
      const { headers, body: partBody } = parsePart(part);
      const disposition = headers["content-disposition"] || "";
      const name = (disposition.match(/name="([^"]+)"/) || [])[1];
      if (!name) continue;

      if (name === "data") {
        fields = JSON.parse(partBody.toString("utf8"));
      } else if (name === "image") {
        imageType = (headers["content-type"] || "image/jpeg").trim();
        imageBase64 = partBody.toString("base64");
      }
    }

    return { fields, imageBase64, imageType };
  }

  throw new Error("Unsupported content-type: " + contentType);
}

/** Split a Buffer by a multipart boundary string */
function splitMultipart(buffer, boundary) {
  const sep = Buffer.from("\r\n" + boundary);
  const parts = [];
  let start = buffer.indexOf(boundary) + boundary.length + 2; // skip first \r\n

  while (start < buffer.length) {
    const end = buffer.indexOf(sep, start);
    if (end === -1) break;
    parts.push(buffer.slice(start, end));
    start = end + sep.length + 2;
  }
  return parts;
}

/** Parse headers from a multipart part Buffer */
function parsePart(partBuffer) {
  const headerEnd = partBuffer.indexOf("\r\n\r\n");
  if (headerEnd === -1) return { headers: {}, body: partBuffer };

  const headerStr  = partBuffer.slice(0, headerEnd).toString("utf8");
  const body       = partBuffer.slice(headerEnd + 4);
  const headers    = {};

  for (const line of headerStr.split("\r\n")) {
    const [key, ...rest] = line.split(":");
    if (key) headers[key.trim().toLowerCase()] = rest.join(":").trim();
  }

  return { headers, body };
}

// ═══════════════════════════════════════════════════════
//  AZURE VM  — build the Gradio /predict payload
// ═══════════════════════════════════════════════════════

/**
 * Build the payload that Wan2GP's Gradio /predict endpoint expects.
 * Adjust `fn_index` to match your wgp.py API function index.
 * You can discover it by opening http://YOUR_VM_IP:7860/info in a browser.
 */
function buildGradioPayload(fields, imageBase64, imageType) {
  const resKey = `${fields.resolution || "480p"}:${fields.aspect_ratio || "16:9"}`;
  const [width, height] = RESOLUTION_MAP[resKey] || [854, 480];
  const numFrames = (fields.fps || FPS) * (fields.duration || 6) + FRAME_BONUS;

  const data = [
    fields.prompt      || "",          // [0] positive prompt
    "",                                // [1] negative prompt (leave blank)
    imageBase64
      ? { data: `data:${imageType};base64,${imageBase64}`, name: "input.jpg" }
      : null,                          // [2] reference image (null = text-to-video)
    FORCED_MODEL,                      // [3] model — HARDCODED, never from user
    width,                             // [4] width
    height,                            // [5] height
    numFrames,                         // [6] number of frames
    fields.fps || FPS,                 // [7] fps
    1,                                 // [8] num_inference_steps (kept at 1 for distilled)
    0.5,                               // [9] guidance_scale
    42,                                // [10] seed (random is fine)
    true,                              // [11] enable_vae_tiling
  ];

  return {
    fn_index: 0,       // ← confirm this matches your wgp.py API
    data,
    session_hash: `t1era_${Date.now()}`,
  };
}

// ═══════════════════════════════════════════════════════
//  RATE LIMITER
//  For production, replace with Upstash Redis:
//  https://upstash.com/docs/redis/quickstarts/netlify-functions
// ═══════════════════════════════════════════════════════
function checkRateLimit(ip) {
  const now    = Date.now();
  const last   = rateLimits.get(ip) || 0;
  const remain = RATE_WINDOW_MS - (now - last);

  if (remain > 0) {
    return { allowed: false, retryAfterSeconds: Math.ceil(remain / 1000) };
  }

  rateLimits.set(ip, now);
  return { allowed: true };
}

// ═══════════════════════════════════════════════════════
//  MAIN HANDLER
// ═══════════════════════════════════════════════════════
exports.handler = async function handler(event, _context) {
  const origin = event.headers["origin"] || "";
  const cors   = corsHeaders(origin);

  // ── CORS preflight ──
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" };
  }

  // ── Method guard ──
  if (event.httpMethod !== "POST") {
    return err(405, "Method not allowed", cors);
  }

  // ── Origin validation ──
  if (ALLOWED_ORIGIN && origin && origin !== ALLOWED_ORIGIN) {
    console.warn(`[proxy] Rejected origin: ${origin}`);
    return err(403, "Forbidden: origin not allowed", cors);
  }

  // ── Body size guard ──
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, "base64")
    : Buffer.from(event.body || "");

  if (rawBody.length > MAX_BODY_BYTES) {
    return err(413, "Request too large", cors);
  }

  // ── Rate limiting ──
  const clientIp = (
    event.headers["x-forwarded-for"] ||
    event.headers["client-ip"]       ||
    "unknown"
  ).split(",")[0].trim();

  const rl = checkRateLimit(clientIp);
  if (!rl.allowed) {
    return err(429, `Rate limit hit — please wait ${rl.retryAfterSeconds}s`, {
      ...cors,
      "Retry-After": String(rl.retryAfterSeconds),
    });
  }

  // ── Parse incoming payload ──
  let fields, imageBase64, imageType;
  try {
    ({ fields, imageBase64, imageType } = await parsePayload(event));
  } catch (parseErr) {
    console.error("[proxy] parse error:", parseErr);
    return err(400, "Invalid request payload: " + parseErr.message, cors);
  }

  // ── Validate prompt ──
  const prompt = (fields.prompt || "").trim();
  if (!prompt || prompt.length < 10) {
    return err(400, "Prompt too short — describe your scene in more detail", cors);
  }

  if (prompt.length > 700) {
    return err(400, "Prompt too long — max 700 characters", cors);
  }

  // ── Build Gradio payload (model injected here) ──
  const gradioPayload = buildGradioPayload(fields, imageBase64, imageType);

  console.log(`[proxy] Generating | ip=${clientIp} | res=${fields.resolution} | ratio=${fields.aspect_ratio} | dur=${fields.duration}s | model=${FORCED_MODEL}`);

  // ── Forward to Azure VM ──
  const t0 = Date.now();
  let azureResponse;

  try {
    const headers = {
      "Content-Type": "application/json",
    };

    // Attach bearer token if configured
    if (process.env.AZURE_API_TOKEN) {
      headers["Authorization"] = `Bearer ${process.env.AZURE_API_TOKEN}`;
    }

    azureResponse = await fetch(`${AZURE_BASE}/api/predict`, {
      method: "POST",
      headers,
      body: JSON.stringify(gradioPayload),
      // Timeout: video generation can take 60–120s for 1080p
      signal: AbortSignal.timeout(150_000),
    });
  } catch (fetchErr) {
    console.error("[proxy] Azure VM unreachable:", fetchErr.message);
    return err(503, "GPU server unreachable — please try again in a moment", cors);
  }

  // ── Handle Azure error responses ──
  if (!azureResponse.ok) {
    const body = await azureResponse.text().catch(() => "");
    console.error(`[proxy] Azure error ${azureResponse.status}:`, body.slice(0, 200));
    return err(502, `GPU server returned error ${azureResponse.status}`, cors);
  }

  // ── Parse Gradio response ──
  let gradioData;
  try {
    gradioData = await azureResponse.json();
  } catch (jsonErr) {
    return err(502, "Could not parse response from GPU server", cors);
  }

  /*
   * Gradio /predict returns:
   *   { data: [ "/file=/tmp/gradio/abc123.mp4", ...extra ], duration: 45.2 }
   *
   * The video path is a local path on the Azure VM.
   * Wan2GP also serves a static file endpoint so we convert it to a full URL.
   */
  const rawPath = (gradioData.data || [])[0] || "";
  if (!rawPath) {
    return err(502, "No video path in GPU server response", cors);
  }

  // Convert Gradio local path → public URL served by the VM's built-in file server
  // e.g. "/file=/tmp/gradio/abc.mp4" → "http://VM_IP:7860/file=/tmp/gradio/abc.mp4"
  const videoUrl = rawPath.startsWith("http")
    ? rawPath
    : `${AZURE_BASE}${rawPath.startsWith("/") ? "" : "/"}${rawPath}`;

  const durationMs = Math.round((Date.now() - t0));

  console.log(`[proxy] Done | url=${videoUrl} | duration=${durationMs}ms`);

  // ── Return clean response to frontend ──
  return json(200, {
    video_url:   videoUrl,
    job_id:      gradioData.session_hash || `job_${Date.now()}`,
    duration_ms: durationMs,
    model:       FORCED_MODEL,           // informational only
    specs: {
      resolution:   fields.resolution,
      aspect_ratio: fields.aspect_ratio,
      width:        gradioPayload.data[4],
      height:       gradioPayload.data[5],
      num_frames:   gradioPayload.data[6],
      fps:          gradioPayload.data[7],
    },
  }, cors);
};
