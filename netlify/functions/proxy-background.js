/**
 * T1ERA — Netlify Serverless Proxy (Gradio 5 + Pydantic Fix)
 * File: netlify/functions/proxy-background.js
 */

const FORCED_MODEL = "ltx-2-19b-distilled_Q4_K_M.gguf";
const AZURE_BASE = process.env.AZURE_VM_URL ? process.env.AZURE_VM_URL.replace(/\/$/, "") : "";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "";

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

  // 1. URL & CONFIG VALIDATION
  if (!AZURE_BASE) return response(500, { error: "CONFIG_ERROR", message: "AZURE_VM_URL missing." }, cors);

  let payload;
  try {
    const rawBody = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body;
    payload = JSON.parse(rawBody);
  } catch (e) {
    return response(400, { error: "INVALID_JSON", message: "Request body was not valid JSON." }, cors);
  }

  // 2. DATA ARRAY CONSTRUCTION (Gradio 5 / Pydantic Fix)
  // We wrap prompt and negative prompt in [ ] because the server expects List[str]
  const dataArray = [
    payload.prompt ? [payload.prompt.trim()] : [""], 
    ["(low quality, worst quality, text, watermark, speech, talking, subtitles:1.4)"],
    payload.image_base64 ? { data: `data:${payload.image_type};base64,${payload.image_base64}`, name: "input.jpg" } : null,
    FORCED_MODEL,
    854, 480, 145, 24, // width, height, frames, fps
    1, 7.0, -1, true, "sdpa", "None", 127
  ];

  const session_hash = `t1_${Math.random().toString(36).substring(2, 10)}`;
  
  // Gradio 5 API endpoint
  const endpoint = `${AZURE_BASE}/gradio_api/queue/join`;

  try {
    console.log(`[Proxy] Routing to Gradio 5 API: ${endpoint}`);

    const azureRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: dataArray,
        fn_index: 2, 
        session_hash: session_hash
      }),
      signal: AbortSignal.timeout(30000) // Increased to 30s for stability
    });

    const responseText = await azureRes.text();
    console.log(`[Proxy] Azure Raw Response: ${responseText}`);

    if (!azureRes.ok) {
      return response(azureRes.status, { 
        error: "GRADIO_ERROR", 
        status: azureRes.status,
        message: `GPU rejected request.`,
        debug: responseText.substring(0, 200) 
      }, cors);
    }

    const gData = JSON.parse(responseText);
    return response(200, {
      success: true,
      job_id: session_hash,
      event_id: gData.event_id,
      status_url: `${AZURE_BASE}/gradio_api/queue/data?session_hash=${session_hash}`
    }, cors);

  } catch (err) {
    const isTimeout = err.name === "AbortError" || err.name === "TimeoutError";
    console.error(`[Proxy] Fetch Error: ${err.message}`);
    return response(504, { 
      error: isTimeout ? "TIMEOUT" : "CONNECTION_FAILED",
      message: isTimeout ? "Azure VM didn't respond in time." : "Is the Gradio link still live?",
      system_msg: err.message
    }, cors);
  }
};
