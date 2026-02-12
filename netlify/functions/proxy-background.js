/**
 * T1ERA — Netlify Serverless Proxy (Ultra-Detailed Error Handling)
 * File: netlify/functions/proxy-background.js
 */

const FORCED_MODEL = "ltx-2-19b-distilled_Q4_K_M.gguf";
const AZURE_BASE = process.env.AZURE_VM_URL ? process.env.AZURE_VM_URL.replace(/\/$/, "") : "";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "";

// Helper for standardized responses
const response = (code, body, cors) => ({
  statusCode: code,
  headers: { "Content-Type": "application/json", ...cors },
  body: JSON.stringify(body),
});

exports.handler = async function (event, context) {
  const origin = event.headers["origin"] || "";
  const cors = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN || origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors };

  // 1. CONFIGURATION CHECK
  if (!AZURE_BASE) {
    return response(500, { error: "CONFIG_ERROR", message: "AZURE_VM_URL is missing in Netlify settings." }, cors);
  }

  // 2. PAYLOAD VALIDATION
  let payload;
  try {
    const rawBody = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body;
    payload = JSON.parse(rawBody);
  } catch (e) {
    return response(400, { error: "INVALID_JSON", message: "The request sent to the proxy was not valid JSON." }, cors);
  }

  // 3. DATA ARRAY CONSTRUCTION (Must match Gradio exactly)
  const dataArray = [
    payload.prompt || "",
    "(low quality, worst quality, text, watermark, speech, talking, subtitles:1.4)",
    payload.image_base64 ? { data: `data:${payload.image_type};base64,${payload.image_base64}`, name: "input.jpg" } : null,
    FORCED_MODEL,
    854, 480, // width/height
    145, 24,  // frames/fps
    1, 7.0, -1, true, "sdpa", "None", 127
  ];

  const session_hash = `t1_${Math.random().toString(36).substring(2, 10)}`;

  // 4. THE AZURE REQUEST
  try {
    console.log(`[Proxy] Attempting connection to: ${AZURE_BASE}/queue/join`);

    const azureRes = await fetch(`${AZURE_BASE}/queue/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: dataArray,
        fn_index: 2, // Ensure this matches your WanGP version
        session_hash: session_hash
      }),
      signal: AbortSignal.timeout(15000) // 15s timeout for the handshake
    });

    const responseText = await azureRes.text();

    // 5. DETAILED HTTP ERROR HANDLING
    if (!azureRes.ok) {
      let detail = "The GPU server rejected the request.";
      if (azureRes.status === 404) detail = "Endpoint not found. Check if WanGP is running and the Gradio link is still active.";
      if (azureRes.status === 502 || azureRes.status === 503) detail = "The GPU server is overloaded or restarting.";
      
      console.error(`[Proxy] Azure Error ${azureRes.status}:`, responseText);
      return response(azureRes.status, { 
        error: "GPU_REJECTION", 
        status: azureRes.status,
        message: detail,
        debug: responseText.substring(0, 100) 
      }, cors);
    }

    // 6. GRADIO SUCCESS PARSING
    try {
      const gData = JSON.parse(responseText);
      return response(200, {
        success: true,
        job_id: session_hash,
        event_id: gData.event_id,
        status_url: `${AZURE_BASE}/queue/data?session_hash=${session_hash}`
      }, cors);
    } catch (e) {
      return response(502, { error: "BAD_GATEWAY", message: "Azure sent a non-JSON response.", raw: responseText.substring(0, 50) }, cors);
    }

  } catch (err) {
    // 7. NETWORK/TIMEOUT ERROR HANDLING
    const isTimeout = err.name === "AbortError" || err.name === "TimeoutError";
    console.error("[Proxy] Network Error:", err.message);

    return response(504, { 
      error: isTimeout ? "GATEWAY_TIMEOUT" : "CONNECTION_FAILED",
      message: isTimeout 
        ? "The Azure VM took too long to respond. It might be warming up." 
        : "Could not reach the GPU. Is the Gradio URL correct?",
      system_msg: err.message
    }, cors);
  }
};
