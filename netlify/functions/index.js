/**
 * ═══════════════════════════════════════════════════════════════
 *  T1ERA — Firebase Cloud Functions
 *  File   : functions/index.js
 *  Purpose: Server-side reCAPTCHA Enterprise token verification
 *
 *  SETUP (run these once in your terminal):
 *    npm install -g firebase-tools
 *    firebase login
 *    firebase init functions          ← choose JavaScript, ESLint optional
 *    cd functions && npm install      ← installs dependencies below
 *    firebase functions:config:set recaptcha.apikey="YOUR_GOOGLE_CLOUD_API_KEY"
 *    firebase deploy --only functions
 *
 *  GET YOUR API KEY:
 *    Google Cloud Console → t1era-v2 project
 *    → APIs & Services → Credentials → Create API Key
 *    → Restrict it to "reCAPTCHA Enterprise API" only
 * ═══════════════════════════════════════════════════════════════
 */

const functions = require('firebase-functions');
const fetch     = require('node-fetch');

// ── CONFIG ──────────────────────────────────────────────────────
const PROJECT_ID     = 't1era-v2';
const SITE_KEY       = '6LeGCHAsAAAAAJX2MQXouPsu1Rx0helciRjRitFl';
const SCORE_THRESHOLD = 0.5;   // 0.0 = bot, 1.0 = human — adjust as needed

// Valid actions this function will accept
const VALID_ACTIONS = ['LOGIN', 'SIGNUP', 'RESET'];

// ── HELPER: call reCAPTCHA Enterprise REST API ───────────────────
async function callRecaptchaAPI(token, action, apiKey) {
  const url  = `https://recaptchaenterprise.googleapis.com/v1/projects/${PROJECT_ID}/assessments?key=${apiKey}`;
  const body = {
    event: {
      token:          token,
      expectedAction: action,
      siteKey:        SITE_KEY,
    },
  };

  const response = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`reCAPTCHA API HTTP ${response.status}: ${errText}`);
  }

  return response.json();
}

// ── CLOUD FUNCTION: verifyRecaptcha ──────────────────────────────
exports.verifyRecaptcha = functions.https.onCall(async (data, context) => {

  // 1. Validate inputs
  const { token, action } = data;

  if (!token || typeof token !== 'string') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'A valid reCAPTCHA token is required.'
    );
  }

  if (!action || !VALID_ACTIONS.includes(action)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `Action must be one of: ${VALID_ACTIONS.join(', ')}.`
    );
  }

  // 2. Get API key from Firebase config (set via CLI — never hardcoded)
  const apiKey = functions.config().recaptcha?.apikey;
  if (!apiKey) {
    console.error('reCAPTCHA API key not configured. Run: firebase functions:config:set recaptcha.apikey="YOUR_KEY"');
    throw new functions.https.HttpsError(
      'internal',
      'Server configuration error. Please contact support.'
    );
  }

  // 3. Call reCAPTCHA Enterprise API
  let result;
  try {
    result = await callRecaptchaAPI(token, action, apiKey);
  } catch (err) {
    console.error('reCAPTCHA API call failed:', err.message);
    throw new functions.https.HttpsError(
      'internal',
      'Could not reach reCAPTCHA service. Please try again.'
    );
  }

  // 4. Check token validity
  if (!result.tokenProperties?.valid) {
    const reason = result.tokenProperties?.invalidReason || 'UNKNOWN';
    console.warn(`Invalid reCAPTCHA token for action=${action}, reason=${reason}`);

    // Token expired or malformed — tell the client to retry
    throw new functions.https.HttpsError(
      'unauthenticated',
      `reCAPTCHA token is invalid (${reason}). Please refresh and try again.`
    );
  }

  // 5. Check action matches what we expected
  const returnedAction = result.tokenProperties?.action;
  if (returnedAction !== action) {
    console.warn(`reCAPTCHA action mismatch: expected=${action}, got=${returnedAction}`);
    throw new functions.https.HttpsError(
      'permission-denied',
      'reCAPTCHA action mismatch. Possible tampering detected.'
    );
  }

  // 6. Read score and reasons
  const score   = result.riskAnalysis?.score   ?? 0;
  const reasons = result.riskAnalysis?.reasons ?? [];
  const passed  = score >= SCORE_THRESHOLD;

  // 7. Log for monitoring (visible in Firebase Console → Functions → Logs)
  console.log(`reCAPTCHA | action=${action} | score=${score} | passed=${passed} | reasons=${JSON.stringify(reasons)}`);

  // 8. Return result to the frontend
  return {
    passed,
    score,
    reasons,
  };
});
