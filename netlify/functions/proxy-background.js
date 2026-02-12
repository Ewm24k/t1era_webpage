/**
 * T1ERA — Production Serverless Proxy (Gradio 5 + Wan2GP)
 * Optimized for Text-to-Video Production Stability
 */

// --- CONFIGURATION ---
const FORCED_MODEL = "ltx-2-19b-distilled_Q4_K_M.gguf";
const AZURE_BASE = process.env.AZURE_VM_URL ? process.env.AZURE_VM_URL.replace(/\/$/, "") : "";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "";

// Default specs if not provided by frontend
const DEFAULTS = {
  WIDTH: 854,
  HEIGHT: 480,
  FRAMES: 145,
  FPS: 24,
  GUIDANCE: 7.0
};

// --- HELPER FUNCTIONS ---

/**
 * Standardized JSON response handler
 */
const sendResponse = (statusCode, body, corsHeaders) => {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders
    },
    body: JSON.stringify(body),
  };
};

/**
 * Extracts and parses the request body safely
 */
const getSafePayload = (event) => {
  try {
    const raw = event.isBase64Encoded 
      ? Buffer.from(event.body, "base64").toString("utf8") 
      : (event.body || "{}");
    return JSON.parse(raw);
  } catch (err) {
    console.error("[Payload Error]", err.message);
    return null;
  }
};

// --- MAIN HANDLER ---

exports.handler = async function (event, context) {
  // 1. CORS & Preflight Setup
  const origin = event.headers["origin"] || event.headers["Origin"] || "";
  const cors = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN || origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" };
  }

  console.log("--- New Production Generation Request ---");

  // 2. System Integrity Checks
  if (!AZURE_BASE) {
    console.error("[Critical] AZURE_VM_URL is not defined in environment.");
    return sendResponse(500, { error: "SERVER_CONFIG_MISSING" }, cors);
  }

  const payload = getSafePayload(event);
  if (!payload || !payload.prompt) {
    return sendResponse(400, { error: "INVALID_REQUEST", message: "Prompt is required." }, cors);
  }

  // 3. Payload Normalization (Ensuring correct types for Wan2GP)
  /** * FIX: Wrapped in arrays [] to satisfy Pydantic ValidationError for GalleryData 
   */
  const prompt = [String(payload.prompt).trim()]; 
  const negPrompt = ["(low quality, worst quality, text, watermark, speech, talking, subtitles:1.4)"];
  
  const width = parseInt(payload.width) || DEFAULTS.WIDTH;
  const height = parseInt(payload.height) || DEFAULTS.HEIGHT;
  const frames = parseInt(payload.num_frames) || DEFAULTS.FRAMES;
  const fps = parseInt(payload.fps) || DEFAULTS.FPS;
  
  // 4. Data Array Alignment for Wan2GP fn_index: 2
  // Alignment: [Prompt, NegPrompt, Image(null), Model, W, H, Frames, FPS, Batch, Guidance, Seed, Offload, Attn, LoRA, Reserved]
  const dataArray = [
    prompt,
    negPrompt,
    null, // Image slot (must be null for Text-to-Video)
    FORCED_MODEL,
    width,
    height,
    frames,
    fps,
    1,             // Batch count
    DEFAULTS.GUIDANCE,
    -1,            // Random Seed
    true,          // Tiled/CPU Offload
    "sdpa",        // Attention implementation
    "None",        // LoRA selection
    127            // Gradio Internal Parameter
  ];

  const session_hash = `prod_${Math.random().toString(36).substring(2, 12)}`;
  const joinEndpoint = `${AZURE_BASE}/gradio_api/queue/join`;

  console.log(`[Queue] Session: ${session_hash} | Endpoint: ${joinEndpoint}`);
  console.log(`[Specs] ${width}x${height} | ${frames} frames @ ${fps}fps`);

  // 5. Execution & Error Handling
  try {
    const azureResponse = await fetch(joinEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: dataArray,
        fn_index: 2,
        session_hash: session_hash
      }),
      signal: AbortSignal.timeout(45000) // 45s Production Timeout
    });

    const responseText = await azureResponse.text();
    
    // Gradio 5 Protocol Check
    if (!azureResponse.ok) {
      console.error(`[Azure Error] HTTP ${azureResponse.status}: ${responseText}`);
      return sendResponse(azureResponse.status, {
        error: "GPU_QUEUE_REJECTED",
        details: responseText.substring(0, 250)
      }, cors);
    }

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      console.error("[Parse Error] Non-JSON response from Azure:", responseText);
      return sendResponse(502, { error: "MALFORMED_GPU_RESPONSE" }, cors);
    }

    // Success Path
    if (result.event_id) {
      console.log(`[Success] Job Queued. Event ID: ${result.event_id}`);
      return sendResponse(200, {
        success: true,
        job_id: session_hash,
        event_id: result.event_id,
        // Using /gradio_api/ prefix for the status polling too
        status_url: `${AZURE_BASE}/gradio_api/queue/data?session_hash=${session_hash}`
      }, cors);
    } else {
      console.warn("[Unexpected] No Event ID in response:", result);
      return sendResponse(500, { error: "NO_EVENT_ID_GENERATED" }, cors);
    }

  } catch (err) {
    const isTimeout = err.name === "AbortError" || err.name === "TimeoutError";
    console.error(`[Network Error] ${err.name}: ${err.message}`);
    
    return sendResponse(504, {
      error: isTimeout ? "GATEWAY_TIMEOUT" : "CONNECTION_FAILED",
      message: isTimeout ? "Azure VM did not respond within 45s." : "Could not establish connection to GPU.",
      system_info: err.message
    }, cors);
  }
};
