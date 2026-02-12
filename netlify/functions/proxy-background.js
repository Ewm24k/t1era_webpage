/**
 * T1ERA — Netlify Serverless Proxy (Text-to-Video Focus)
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
  if (!AZURE_BASE) return response(500, { error: "AZURE_VM_URL missing." }, cors);

  let payload;
  try {
    const rawBody = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body;
    payload = JSON.parse(rawBody);
  } catch (e) {
    return response(400, { error: "INVALID_JSON" }, cors);
  }

  /**
   * DATA ARRAY ALIGNMENT (Text-to-Video Focus)
   * Index 0: Prompt (String)
   * Index 1: Negative Prompt (String)
   * Index 2: Image Input (null for Text-to-Video)
   * Index 3: Model Name (String)
   * Indices 4-14: Numeric settings and booleans
   */
  const dataArray = [
    payload.prompt || "", 
    "(low quality, worst quality, text, watermark, speech, talking, subtitles:1.4)",
    null, // Image placeholder - Setting to null for Text-to-Video
    FORCED_MODEL,
    854,  // Width
    480,  // Height
    145,  // Frames
    24,   // FPS
    1,    // Batch size
    7.0,  // Guidance scale
    -1,   // Seed (-1 for random)
    true, // Use CPU offload / logic toggle
    "sdpa", // Attention mode
    "None", // LoRA/Extra
    127   // Reserved/Other param
  ];

  const session_hash = `t1_${Math.random().toString(36).substring(2, 10)}`;
  const endpoint = `${AZURE_BASE}/gradio_api/queue/join`;

  try {
    console.log(`[Proxy] Sending T2V Request for session: ${session_hash}`);

    const azureRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: dataArray,
        fn_index: 2, 
        session_hash: session_hash
      }),
      signal: AbortSignal.timeout(25000)
    });

    const responseText = await azureRes.text();
    console.log(`[Proxy] Azure response: ${responseText}`);

    if (azureRes.ok || responseText.includes("event_id")) {
      const gData = JSON.parse(responseText);
      return response(200, {
        success: true,
        job_id: session_hash,
        event_id: gData.event_id,
        status_url: `${AZURE_BASE}/gradio_api/queue/data?session_hash=${session_hash}`
      }, cors);
    }

    return response(azureRes.status, { 
      error: "GRADIO_REJECTED", 
      debug: responseText.substring(0, 100) 
    }, cors);

  } catch (err) {
    console.error(`[Proxy] Error: ${err.message}`);
    return response(504, { error: "CONNECTION_ERROR", msg: err.message }, cors);
  }
};
