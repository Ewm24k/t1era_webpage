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

  // 3. Mode Detection & Validation
  const mode = payload.mode || 'text-to-video';
  
  if (mode === 'image-to-video' && !payload.image_base64) {
    return sendResponse(400, { 
      error: "IMAGE_REQUIRED", 
      message: "Image is required for image-to-video mode." 
    }, cors);
  }

  // 4. Payload Normalization
  const prompt = String(payload.prompt).trim();
  const negPrompt = "(low quality, worst quality, text, watermark, speech, talking, subtitles:1.4)";
  
  const width = parseInt(payload.width) || DEFAULTS.WIDTH;
  const height = parseInt(payload.height) || DEFAULTS.HEIGHT;
  const frames = parseInt(payload.num_frames) || DEFAULTS.FRAMES;
  const fps = parseInt(payload.fps) || DEFAULTS.FPS;
  
  // 5. Data Array - MODE-DEPENDENT STRUCTURE
  // ✅ TEXT-TO-VIDEO: Position 0 = empty array [], Position 1 = prompt
  // ✅ IMAGE-TO-VIDEO: Position 0 = image gallery array with image object
  
  let imageGallery = [];
  
  if (mode === 'image-to-video' && payload.image_base64) {
    // Convert base64 to proper Gradio gallery format
    imageGallery = [{
      path: `data:${payload.image_type};base64,${payload.image_base64}`,
      url: `data:${payload.image_type};base64,${payload.image_base64}`,
      orig_name: "reference.png",
      size: null,
      mime_type: payload.image_type
    }];
  }
  
  const dataArray = [
    imageGallery,  // ✅ Position 0: [] for text-to-video, [imageObj] for image-to-video
    prompt,        // ✅ Position 1: Text prompt
    negPrompt,     // Negative prompt
    FORCED_MODEL,  // Model selection
    width,
    height,
    frames,
    fps,
    1,             // Batch count
    DEFAULTS.GUIDANCE,
    -1,            // Random seed
    true,          // CPU offload
    "sdpa",        // Attention type
    "None",        // LoRA
    127            // Gradio internal
  ];

  const session_hash = `prod_${Math.random().toString(36).substring(2, 12)}`;
  const joinEndpoint = `${AZURE_BASE}/gradio_api/queue/join`;

  console.log(`[Queue] Mode: ${mode} | Session: ${session_hash}`);
  console.log(`[Queue] Endpoint: ${joinEndpoint}`);
  console.log(`[Specs] ${width}x${height} | ${frames} frames @ ${fps}fps`);
  console.log(`[Image] ${mode === 'image-to-video' ? 'Yes (gallery populated)' : 'No (text-only)'}`);

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
      
      const statusUrl = `${AZURE_BASE}/gradio_api/queue/data?session_hash=${session_hash}`;
      
      return sendResponse(200, {
        success: true,
        mode: mode,
        job_id: session_hash,
        event_id: result.event_id,
        status_url: statusUrl,
        check_status_url: statusUrl,  // ✅ Frontend expects this field
        specs: {
          mode: mode,
          width: width,
          height: height,
          num_frames: frames,
          fps: fps,
          model: FORCED_MODEL,
          has_image: mode === 'image-to-video'
        }
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
