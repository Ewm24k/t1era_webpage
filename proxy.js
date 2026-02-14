/**
 * T1ERA — Netlify Background Function
 * File: netlify/functions/proxy-background.js
 *
 * WHY "-background" IN THE NAME:
 *   Netlify detects this suffix and gives the function a 15-minute timeout.
 *   Standard functions max at 26s. Generation takes 5–9 min.
 *   generate.html already calls /.netlify/functions/proxy-background —
 *   just rename your old proxy.js to proxy-background.js.
 *
 * BUGS FIXED vs OLD proxy.js:
 *   Bug 1: Wrong filename (proxy.js → proxy-background.js)
 *   Bug 2: Polling removed — html reads video_url directly from one response
 *   Bug 3: Timeout 3min → 13min; now a background fn (15min limit)
 *   Bug 4: fn_index + data array match t1era_wangp.py t1era_generate() exactly
 *   Bug 5: Video URL uses /gradio_api/file= (Gradio 4.x, not /file=)
 *   Bug 6: Removed lambda-multipart-parser; generate.html sends JSON only
 *
 * NETLIFY ENV VARS (Dashboard → Site → Environment Variables):
 *   AZURE_VM_URL   = https://xxxx.gradio.live   ← update every week
 *   ALLOWED_ORIGIN = https://t1era.netlify.app
 *
 * UPDATING WHEN GRADIO LINK EXPIRES (every 7 days):
 *   1. VM terminal: python t1era_wangp.py --share --attention sdpa --profile 2 --compile
 *   2. Copy the "Running on public URL: https://xxxx.gradio.live" line
 *   3. Netlify Dashboard → Environment Variables → AZURE_VM_URL → Edit → Save
 *   4. Netlify Dashboard → Deploys → Trigger deploy  (no code change needed)
 *
 * t1era_wangp.py FUNCTION SIGNATURE (line ~383):
 *   def t1era_generate(prompt, resolution_choice, num_steps, guidance, seed, state)
 *   Gradio public data array (state is internal):
 *   data[0] = prompt            e.g. "A cinematic drone shot..."
 *   data[1] = resolution_choice e.g. "480p 16:9"  (label string, not pixel dims)
 *   data[2] = num_steps         e.g. 30
 *   data[3] = guidance_scale    e.g. 7.5
 *   data[4] = seed              e.g. -1
 */

const AZURE_BASE     = (process.env.AZURE_VM_URL || "").replace(/\/$/, "");
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

// Resolution label — matches RESOLUTION_MAP in t1era_wangp.py
const RES_LABEL = {
  "480p:16:9": "480p 16:9", "480p:9:16": "480p 9:16", "480p:1:1": "480p 1:1",
  "720p:16:9": "720p 16:9", "720p:9:16": "720p 9:16", "720p:1:1": "720p 1:1",
  "1080p:16:9":"1080p 16:9","1080p:9:16":"1080p 9:16","1080p:1:1":"1080p 1:1",
};

const cors = (origin) => ({
  "Access-Control-Allow-Origin":  ALLOWED_ORIGIN || origin || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
});

const jsonResp = (status, body, origin) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json", ...cors(origin) },
  body: JSON.stringify(body),
});

exports.handler = async function (event) {
  const origin = event.headers["origin"] || "";

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors(origin), body: "" };
  if (event.httpMethod !== "POST")    return jsonResp(405, { error: true, message: "Method not allowed" }, origin);

  if (!AZURE_BASE) {
    return jsonResp(500, { error: true, message:
      "AZURE_VM_URL not set. Netlify Dashboard → Environment Variables → add AZURE_VM_URL = https://xxxx.gradio.live"
    }, origin);
  }

  // Bug 6 fix: generate.html sends JSON — no multipart parser needed
  let body;
  try   { body = JSON.parse(event.body || "{}"); }
  catch { return jsonResp(400, { error: true, message: "Request body must be valid JSON" }, origin); }

  const prompt = (body.prompt || "").trim();
  if (prompt.length < 3) return jsonResp(400, { error: true, message: "Prompt must be at least 3 characters" }, origin);

  // Bug 4 fix: build correct label string, not pixel dimensions
  const resKey   = `${body.resolution || "480p"}:${body.aspect_ratio || "16:9"}`;
  const resLabel = RES_LABEL[resKey] || "480p 16:9";
  const numSteps = Math.min(60, Math.max(10, parseInt(body.num_steps) || 30));
  const guidance = Math.min(15, Math.max(1,  parseFloat(body.guidance) || 7.5));
  const seed     = parseInt(body.seed) || -1;

  // Bug 4 fix: fn_index:0, 5 data items matching t1era_generate() exactly
  const gradioPayload = {
    fn_index: 0,
    data: [ prompt, resLabel, numSteps, guidance, seed ],
    session_hash: `t1era_${Date.now()}`,
  };

  const t0 = Date.now();
  console.log(`[proxy] → ${AZURE_BASE}/api/predict | "${prompt.slice(0,80)}" | ${resLabel} | steps=${numSteps}`);

  try {
    // Bug 3 fix: 13 min timeout. Background functions allow 15 min.
    const gradioResp = await fetch(`${AZURE_BASE}/api/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(gradioPayload),
      signal: AbortSignal.timeout(13 * 60 * 1000),
    });

    if (!gradioResp.ok) {
      const txt = await gradioResp.text().catch(() => "");
      return jsonResp(502, { error: true, message: `GPU HTTP ${gradioResp.status}. Is WanGP running? ${txt.slice(0,150)}` }, origin);
    }

    let gradioData;
    try   { gradioData = await gradioResp.json(); }
    catch { return jsonResp(502, { error: true, message: "Gradio returned non-JSON. WanGP may have crashed." }, origin); }

    // t1era_generate yields (status_html, video_path, info_text)
    // Gradio /api/predict returns the final yield only.
    // data[0]=status_html  data[1]=video_path  data[2]=info_text
    const rawData = gradioData.data || [];
    let videoPath = null;

    // Primary: data[1]
    const d1 = rawData[1];
    if (d1) {
      videoPath = typeof d1 === "string" ? d1 : (d1.url || d1.name || d1.path || null);
    }
    // Fallback: scan all items
    if (!videoPath) {
      for (const item of rawData) {
        if (typeof item === "string" && /\.(mp4|webm|mov|mkv)$/i.test(item)) { videoPath = item; break; }
        if (item && typeof item === "object") {
          const c = item.url || item.name || item.path || "";
          if (/\.(mp4|webm|mov|mkv)$/i.test(c)) { videoPath = c; break; }
        }
      }
    }

    if (!videoPath) {
      console.error("[proxy] No video in:", JSON.stringify(rawData).slice(0, 400));
      return jsonResp(502, { error: true, message: "Generation done but no video returned. Check Azure VM terminal." }, origin);
    }

    // Bug 5 fix: Gradio 4.x uses /gradio_api/file= not /file=
    const videoUrl = videoPath.startsWith("http")
      ? videoPath
      : `${AZURE_BASE}/gradio_api/file=${videoPath.replace(/^\/+/, "")}`;

    const elapsed     = Math.round((Date.now() - t0) / 1000);
    const wangpStatus = typeof rawData[0] === "string" ? rawData[0].replace(/<[^>]*>/g, "").trim() : "";

    console.log(`[proxy] ✅ ${elapsed}s → ${videoUrl}`);

    // Bug 2 fix: return video_url directly — no check_status_url, no polling
    return jsonResp(200, { video_url: videoUrl, elapsed_sec: elapsed, wangp_status: wangpStatus }, origin);

  } catch (e) {
    const isTimeout = e.name === "TimeoutError" || /timeout/i.test(e.message);
    if (isTimeout) return jsonResp(504, { error: true, message: "Timed out (>13min). Try 480p and fewer steps." }, origin);
    return jsonResp(503, { error: true, message: "Cannot reach Azure VM. Check WanGP is running and AZURE_VM_URL is current." }, origin);
  }
};
