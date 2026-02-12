/**
 * T1ERA — Result Handler & Queue Status Manager
 * File: netlify/functions/status.js
 *
 * Provides a lightweight queue/status API so the frontend can poll for
 * job progress without hammering the Azure VM directly.
 *
 * Endpoints:
 *   POST /.netlify/functions/status/queue   — add a job to the queue
 *   GET  /.netlify/functions/status/check   — poll a job's current status
 *   GET  /.netlify/functions/status/queue   — get current queue depth
 *
 * ─── IMPORTANT NOTE ON STATE ─────────────────────────────────────
 * Netlify Functions are stateless and ephemeral. This file uses an
 * in-memory Map as a simple demo store. For production with 100+ users
 * you MUST replace the `jobStore` Map with a persistent store:
 *
 *   Option A (Recommended): Upstash Redis (free tier)
 *     npm i @upstash/redis
 *     import { Redis } from "@upstash/redis"
 *     const redis = Redis.fromEnv()
 *     await redis.set(jobId, JSON.stringify(job), { ex: 3600 })
 *
 *   Option B: Netlify Blobs (no extra infra)
 *     import { getStore } from "@netlify/blobs"
 *     const store = getStore("jobs")
 *     await store.setJSON(jobId, job)
 *
 * Both options are drop-in replacements for the Map calls below.
 * ──────────────────────────────────────────────────────────────────
 */

// ═══════════════════════════════════════════════════════
//  JOB STORE  (replace with Redis/Blobs for production)
// ═══════════════════════════════════════════════════════

/**
 * @typedef {Object} Job
 * @property {string} id
 * @property {'queued'|'loading'|'rendering'|'encoding'|'done'|'error'} status
 * @property {number} queuePosition
 * @property {number} createdAt
 * @property {number|null} startedAt
 * @property {number|null} completedAt
 * @property {string|null} videoUrl
 * @property {string|null} errorMessage
 * @property {Object} specs      — res, ratio, dur, frames
 */

const jobStore = new Map(); // jobId → Job
let   queueCounter = 0;     // monotonic queue position tracker

/** How long to keep completed jobs in memory (ms) */
const JOB_TTL_MS = 3_600_000; // 1 hour

// ─── Step durations (ms) used for ETA estimation ───
const STEP_DURATIONS = {
  queued:    0,
  loading:   3_000,
  rendering: null,   // depends on frame count; estimated below
  encoding:  4_000,
  done:      0,
};

/** Estimate total generation time based on frame count & resolution */
function estimateMs(numFrames, resolution) {
  // Rough empirics on Azure A10 with LTX-2 Q4 distilled
  // 480p: ~80ms/frame · 720p: ~180ms/frame · 1080p: ~350ms/frame
  const msPerFrame = { "480p": 80, "720p": 180, "1080p": 350 }[resolution] || 100;
  return STEP_DURATIONS.loading + (numFrames * msPerFrame) + STEP_DURATIONS.encoding;
}

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════
function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin":  process.env.ALLOWED_ORIGIN || origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  };
}

function errResponse(code, message, cors) {
  return json(code, { error: true, message }, cors);
}

/** Derive which step is active from status string */
function statusToStep(status) {
  const MAP = { queued: 0, loading: 1, rendering: 2, encoding: 3, done: 4, error: -1 };
  return MAP[status] ?? 0;
}

/** Purge expired jobs from the store (call on every invocation) */
function gcJobs() {
  const now = Date.now();
  for (const [id, job] of jobStore) {
    if (now - job.createdAt > JOB_TTL_MS) jobStore.delete(id);
  }
}

/** Count how many jobs are still queued or rendering */
function activeJobCount() {
  let count = 0;
  for (const job of jobStore.values()) {
    if (["queued","loading","rendering","encoding"].includes(job.status)) count++;
  }
  return count;
}

// ═══════════════════════════════════════════════════════
//  ROUTE HANDLERS
// ═══════════════════════════════════════════════════════

/** POST /status/queue — register a new job, get back a jobId + initial status */
function handleEnqueue(body, cors) {
  const { prompt, resolution, aspect_ratio, duration, num_frames } = body;

  if (!prompt) return errResponse(400, "prompt is required", cors);

  const jobId = `t1era_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const position = ++queueCounter;
  const specs = { resolution, aspect_ratio, duration, num_frames };
  const eta = estimateMs(num_frames || 145, resolution || "480p");

  /** @type {Job} */
  const job = {
    id:           jobId,
    status:       "queued",
    queuePosition: position,
    createdAt:    Date.now(),
    startedAt:    null,
    completedAt:  null,
    videoUrl:     null,
    errorMessage: null,
    specs,
    eta_ms:       eta,
  };

  jobStore.set(jobId, job);

  return json(201, {
    job_id:         jobId,
    queue_position: position,
    active_jobs:    activeJobCount(),
    eta_seconds:    Math.ceil(eta / 1000),
    step:           statusToStep("queued"),
    status:         "queued",
  }, cors);
}

/** GET /status/check?job_id=xxx — poll a specific job's status */
function handleCheck(params, cors) {
  const jobId = params.get("job_id");
  if (!jobId) return errResponse(400, "job_id query param required", cors);

  const job = jobStore.get(jobId);
  if (!job) return errResponse(404, "Job not found — it may have expired", cors);

  const elapsed = Date.now() - job.createdAt;
  const progress = job.status === "done"
    ? 100
    : Math.min(95, Math.round((elapsed / job.eta_ms) * 100));

  return json(200, {
    job_id:         job.id,
    status:         job.status,
    step:           statusToStep(job.status),
    queue_position: job.queuePosition,
    active_jobs:    activeJobCount(),
    progress_pct:   progress,
    eta_remaining_seconds: job.status === "done"
      ? 0
      : Math.max(0, Math.ceil((job.eta_ms - elapsed) / 1000)),
    video_url:      job.videoUrl,
    error_message:  job.errorMessage,
    specs:          job.specs,
    elapsed_ms:     elapsed,
  }, cors);
}

/** GET /status/queue — get current queue depth (no auth required) */
function handleQueueDepth(cors) {
  return json(200, {
    active_jobs:  activeJobCount(),
    total_stored: jobStore.size,
    status: activeJobCount() === 0 ? "idle" : "busy",
  }, cors);
}

/**
 * Internal update — called by the main proxy.js after generation completes.
 * POST /status/update with body { job_id, status, video_url?, error_message? }
 */
function handleUpdate(body, cors) {
  const { job_id, status, video_url, error_message } = body;
  if (!job_id || !status) return errResponse(400, "job_id and status required", cors);

  const job = jobStore.get(job_id);
  if (!job) return errResponse(404, "Job not found", cors);

  job.status = status;
  if (video_url) {
    job.videoUrl = video_url;
    job.completedAt = Date.now();
  }
  if (error_message) {
    job.errorMessage = error_message;
  }
  if (status !== "queued" && !job.startedAt) {
    job.startedAt = Date.now();
  }

  jobStore.set(job_id, job);

  return json(200, { ok: true, job_id, status }, cors);
}

// ═══════════════════════════════════════════════════════
//  MAIN HANDLER
// ═══════════════════════════════════════════════════════
exports.handler = async function handler(event, _context) {
  const origin = event.headers["origin"] || "";
  const cors   = corsHeaders(origin);

  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" };
  }

  // Garbage collect expired jobs on every call
  gcJobs();

  // Parse sub-route from path: /.netlify/functions/status/{action}
  const pathParts = (event.path || "").split("/").filter(Boolean);
  const action    = pathParts[pathParts.length - 1]; // "queue", "check", "update"
  const params    = new URLSearchParams(event.queryStringParameters || {});

  // ── GET routes ──
  if (event.httpMethod === "GET") {
    if (action === "check")  return handleCheck(params, cors);
    if (action === "queue")  return handleQueueDepth(cors);
    return errResponse(404, "Unknown endpoint", cors);
  }

  // ── POST routes ──
  if (event.httpMethod === "POST") {
    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return errResponse(400, "Invalid JSON body", cors);
    }

    if (action === "queue")  return handleEnqueue(body, cors);
    if (action === "update") return handleUpdate(body, cors);
    return errResponse(404, "Unknown endpoint", cors);
  }

  return errResponse(405, "Method not allowed", cors);
};

// ═══════════════════════════════════════════════════════
//  CLIENT-SIDE POLLING HELPER  (paste into generate.html)
// ═══════════════════════════════════════════════════════
/*
 * Drop this into your frontend JavaScript to poll for job status:
 *
 * async function pollJobStatus(jobId, onUpdate, onDone, onError) {
 *   const POLL_INTERVAL = 2500; // ms between polls
 *   const MAX_POLLS     = 80;   // ~3.3 minutes max
 *   let   polls         = 0;
 *
 *   return new Promise((resolve, reject) => {
 *     const interval = setInterval(async () => {
 *       polls++;
 *
 *       if (polls > MAX_POLLS) {
 *         clearInterval(interval);
 *         onError("Generation timed out — please try again");
 *         reject(new Error("timeout"));
 *         return;
 *       }
 *
 *       try {
 *         const res  = await fetch(`/.netlify/functions/status/check?job_id=${jobId}`);
 *         const data = await res.json();
 *
 *         onUpdate(data); // { status, step, progress_pct, queue_position, eta_remaining_seconds }
 *
 *         if (data.status === "done") {
 *           clearInterval(interval);
 *           onDone(data.video_url);
 *           resolve(data.video_url);
 *         }
 *
 *         if (data.status === "error") {
 *           clearInterval(interval);
 *           onError(data.error_message || "Unknown error");
 *           reject(new Error(data.error_message));
 *         }
 *       } catch (fetchErr) {
 *         // Don't abort on transient network errors — keep polling
 *         console.warn("[poll] Network error, retrying:", fetchErr.message);
 *       }
 *     }, POLL_INTERVAL);
 *   });
 * }
 *
 * ─── Usage ──────────────────────────────────────────────
 * // 1. Enqueue a job (proxy.js returns job_id)
 * const { job_id } = await fetch("/.netlify/functions/proxy", { ... }).then(r => r.json());
 *
 * // 2. Poll for updates
 * await pollJobStatus(
 *   job_id,
 *   (update) => {
 *     updateStatusBar(update.queue_position, update.eta_remaining_seconds);
 *     updateProgressBar(update.progress_pct);
 *     activateStep(update.step);
 *   },
 *   (videoUrl) => showVideoPlayer(videoUrl),
 *   (errMsg)   => showError(errMsg),
 * );
 */
