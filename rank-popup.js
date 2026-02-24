/* ═══════════════════════════════════════════════════════════
   RANK POPUP — T1ERA
   Handles: level badge click → 2-page popup
   Page 1: Points earning guide
   Page 2: Level benefits (LV1–30)
═══════════════════════════════════════════════════════════ */

(function () {
  /* ── Inject CSS once ── */
  if (!document.getElementById("rank-popup-styles")) {
    const style = document.createElement("style");
    style.id = "rank-popup-styles";
    style.textContent = `
      /* ── OVERLAY ── */
      .rp-overlay {
        position: fixed;
        inset: 0;
        z-index: 900;
        background: rgba(0, 0, 0, 0.82);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.28s cubic-bezier(0.4,0,0.2,1),
                    visibility 0.28s cubic-bezier(0.4,0,0.2,1);
      }
      .rp-overlay.rp-open {
        opacity: 1;
        visibility: visible;
      }

      /* ── CARD ── */
      .rp-card {
        width: 100%;
        max-width: 480px;
        max-height: 88vh;
        background: rgba(10, 6, 16, 0.98);
        border: 1px solid rgba(245, 158, 11, 0.22);
        border-radius: 24px;
        box-shadow:
          0 32px 80px rgba(0, 0, 0, 0.85),
          0 0 0 1px rgba(245, 158, 11, 0.06),
          inset 0 1px 0 rgba(255, 255, 255, 0.04);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transform: translateY(28px) scale(0.95);
        transition: transform 0.32s cubic-bezier(0.34, 1.15, 0.64, 1);
        position: relative;
      }
      .rp-overlay.rp-open .rp-card {
        transform: translateY(0) scale(1);
      }

      /* shimmer top accent bar */
      .rp-card::before {
        content: "";
        position: absolute;
        top: 0;
        left: 10%;
        right: 10%;
        height: 1px;
        background: linear-gradient(90deg,
          transparent,
          rgba(245, 158, 11, 0.7) 40%,
          rgba(194, 24, 91, 0.6) 60%,
          transparent);
        z-index: 2;
      }

      /* ── HEADER ── */
      .rp-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 18px 20px 14px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        flex-shrink: 0;
        position: relative;
      }

      .rp-header-left {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .rp-shield-icon {
        width: 36px;
        height: 36px;
        flex-shrink: 0;
      }

      .rp-header-titles {
        display: flex;
        flex-direction: column;
        gap: 1px;
      }

      .rp-title {
        font-family: "Orbitron", sans-serif;
        font-size: 13px;
        font-weight: 800;
        color: #f59e0b;
        letter-spacing: 0.06em;
        text-shadow: 0 0 12px rgba(245, 158, 11, 0.5);
      }

      .rp-subtitle {
        font-size: 10px;
        color: rgba(255, 255, 255, 0.35);
        font-family: "Fira Code", monospace;
        letter-spacing: 0.06em;
      }

      .rp-close-btn {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.5);
        font-size: 14px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.18s;
        flex-shrink: 0;
      }
      .rp-close-btn:hover {
        background: rgba(194, 24, 91, 0.2);
        border-color: rgba(194, 24, 91, 0.4);
        color: #fff;
      }

      /* ── PAGE TABS ── */
      .rp-tabs {
        display: flex;
        padding: 12px 20px 0;
        gap: 4px;
        flex-shrink: 0;
        background: rgba(255, 255, 255, 0.01);
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      }

      .rp-tab {
        flex: 1;
        padding: 8px 4px 10px;
        font-size: 10.5px;
        font-weight: 700;
        font-family: "DM Sans", sans-serif;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.3);
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        cursor: pointer;
        transition: all 0.2s;
        position: relative;
        bottom: -1px;
      }
      .rp-tab.rp-tab-active {
        color: #f59e0b;
        border-bottom-color: #f59e0b;
      }
      .rp-tab:hover:not(.rp-tab-active) {
        color: rgba(255, 255, 255, 0.6);
      }

      /* ── SCROLLABLE BODY ── */
      .rp-body {
        flex: 1;
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        scrollbar-color: rgba(245, 158, 11, 0.2) transparent;
      }
      .rp-body::-webkit-scrollbar { width: 3px; }
      .rp-body::-webkit-scrollbar-thumb {
        background: rgba(245, 158, 11, 0.2);
        border-radius: 3px;
      }

      /* ── PAGES ── */
      .rp-page {
        display: none;
        padding: 20px;
        animation: rp-fadein 0.22s ease both;
      }
      .rp-page.rp-page-active {
        display: block;
      }
      @keyframes rp-fadein {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      /* ─────────────────────────────────────────
         PAGE 1 — POINTS
      ───────────────────────────────────────── */

      .rp-section-label {
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: rgba(255, 255, 255, 0.25);
        font-family: "Fira Code", monospace;
        margin-bottom: 10px;
        padding-bottom: 6px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      }

      .rp-points-grid {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 20px;
      }

      .rp-point-row {
        display: flex;
        align-items: center;
        gap: 12px;
        background: rgba(255, 255, 255, 0.025);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 12px;
        padding: 12px 14px;
        transition: border-color 0.18s, background 0.18s;
      }
      .rp-point-row:hover {
        border-color: rgba(245, 158, 11, 0.2);
        background: rgba(245, 158, 11, 0.03);
      }

      .rp-point-icon {
        width: 38px;
        height: 38px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        flex-shrink: 0;
      }
      .rp-point-icon.pink  { background: rgba(194, 24, 91, 0.12); border: 1px solid rgba(194, 24, 91, 0.2); }
      .rp-point-icon.gold  { background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.2); }
      .rp-point-icon.purple{ background: rgba(139, 92, 246, 0.12); border: 1px solid rgba(139, 92, 246, 0.2); }
      .rp-point-icon.green { background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.2); }
      .rp-point-icon.orange{ background: rgba(249, 115, 22, 0.12); border: 1px solid rgba(249, 115, 22, 0.2); }
      .rp-point-icon.blue  { background: rgba(59, 130, 246, 0.12); border: 1px solid rgba(59, 130, 246, 0.2); }

      .rp-point-info {
        flex: 1;
        min-width: 0;
      }

      .rp-point-action {
        font-size: 12.5px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.85);
        font-family: "DM Sans", sans-serif;
        margin-bottom: 2px;
      }

      .rp-point-desc {
        font-size: 10px;
        color: rgba(255, 255, 255, 0.35);
        font-family: "Fira Code", monospace;
        line-height: 1.5;
      }

      .rp-point-badge {
        flex-shrink: 0;
        font-family: "Orbitron", sans-serif;
        font-size: 13px;
        font-weight: 800;
        color: #f59e0b;
        text-shadow: 0 0 10px rgba(245, 158, 11, 0.5);
        white-space: nowrap;
      }
      .rp-point-badge.pink   { color: #e91e8c; text-shadow: 0 0 10px rgba(233, 30, 140, 0.4); }
      .rp-point-badge.purple { color: #a78bfa; text-shadow: 0 0 10px rgba(167, 139, 250, 0.4); }
      .rp-point-badge.green  { color: #10b981; text-shadow: 0 0 10px rgba(16, 185, 129, 0.4); }
      .rp-point-badge.orange { color: #f97316; text-shadow: 0 0 10px rgba(249, 115, 22, 0.4); }
      .rp-point-badge.blue   { color: #60a5fa; text-shadow: 0 0 10px rgba(96, 165, 250, 0.4); }

      /* Prompt breakdown sub-card */
      .rp-prompt-card {
        background: rgba(139, 92, 246, 0.05);
        border: 1px solid rgba(139, 92, 246, 0.15);
        border-radius: 12px;
        padding: 14px;
        margin-bottom: 20px;
      }

      .rp-prompt-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
      }

      .rp-prompt-title {
        font-size: 11px;
        font-weight: 700;
        color: #a78bfa;
        font-family: "DM Sans", sans-serif;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .rp-prompt-badge-soon {
        font-size: 8px;
        font-weight: 700;
        font-family: "Fira Code", monospace;
        letter-spacing: 0.08em;
        padding: 2px 7px;
        border-radius: 100px;
        background: rgba(139, 92, 246, 0.15);
        border: 1px solid rgba(139, 92, 246, 0.3);
        color: #a78bfa;
        text-transform: uppercase;
      }

      .rp-prompt-rows {
        display: flex;
        flex-direction: column;
        gap: 7px;
      }

      .rp-prompt-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .rp-prompt-row-left {
        display: flex;
        align-items: center;
        gap: 7px;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.5);
        font-family: "DM Sans", sans-serif;
      }

      .rp-prompt-row-left i {
        font-size: 13px;
      }

      .rp-prompt-pts {
        font-family: "Orbitron", sans-serif;
        font-size: 11px;
        font-weight: 700;
        color: #a78bfa;
        white-space: nowrap;
      }

      .rp-note-box {
        background: rgba(245, 158, 11, 0.06);
        border: 1px solid rgba(245, 158, 11, 0.15);
        border-radius: 10px;
        padding: 10px 12px;
        font-size: 10.5px;
        color: rgba(255, 255, 255, 0.45);
        font-family: "DM Sans", sans-serif;
        line-height: 1.6;
        margin-bottom: 6px;
      }
      .rp-note-box strong {
        color: rgba(245, 158, 11, 0.8);
        font-weight: 600;
      }

      /* ─────────────────────────────────────────
         PAGE 2 — LEVELS
      ───────────────────────────────────────── */

      .rp-tier-block {
        margin-bottom: 22px;
      }

      .rp-tier-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
      }

      .rp-tier-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .rp-tier-name {
        font-family: "Orbitron", sans-serif;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .rp-tier-range {
        font-size: 9px;
        font-family: "Fira Code", monospace;
        color: rgba(255, 255, 255, 0.25);
        margin-left: auto;
        letter-spacing: 0.04em;
      }

      .rp-levels-list {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      .rp-level-row {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 9px 12px;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.05);
        transition: border-color 0.15s;
      }
      .rp-level-row:hover {
        border-color: rgba(255, 255, 255, 0.1);
      }
      .rp-level-row.rp-level-active {
        border-color: rgba(245, 158, 11, 0.35);
        background: rgba(245, 158, 11, 0.04);
        box-shadow: 0 0 14px rgba(245, 158, 11, 0.06);
      }

      .rp-lv-num {
        font-family: "Orbitron", sans-serif;
        font-size: 10px;
        font-weight: 800;
        min-width: 30px;
        padding-top: 1px;
        flex-shrink: 0;
      }

      .rp-lv-content {
        flex: 1;
        min-width: 0;
      }

      .rp-lv-label {
        font-size: 11.5px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.8);
        font-family: "DM Sans", sans-serif;
        line-height: 1.4;
        margin-bottom: 2px;
      }

      .rp-lv-sub {
        font-size: 9.5px;
        color: rgba(255, 255, 255, 0.3);
        font-family: "Fira Code", monospace;
        line-height: 1.5;
      }

      .rp-lv-badge-you {
        font-size: 8px;
        font-weight: 700;
        font-family: "Fira Code", monospace;
        letter-spacing: 0.06em;
        padding: 2px 6px;
        border-radius: 100px;
        background: rgba(245, 158, 11, 0.15);
        border: 1px solid rgba(245, 158, 11, 0.3);
        color: #f59e0b;
        white-space: nowrap;
        flex-shrink: 0;
        align-self: flex-start;
      }

      /* tier color accents */
      .rp-tier-recruit  .rp-tier-dot  { background: #10b981; }
      .rp-tier-recruit  .rp-tier-name { color: #10b981; }
      .rp-tier-recruit  .rp-lv-num   { color: #10b981; }

      .rp-tier-operative .rp-tier-dot  { background: #60a5fa; }
      .rp-tier-operative .rp-tier-name { color: #60a5fa; }
      .rp-tier-operative .rp-lv-num   { color: #60a5fa; }

      .rp-tier-guardian .rp-tier-dot  { background: #a78bfa; }
      .rp-tier-guardian .rp-tier-name { color: #a78bfa; }
      .rp-tier-guardian .rp-lv-num   { color: #a78bfa; }

      .rp-tier-inferno  .rp-tier-dot  { background: #f97316; }
      .rp-tier-inferno  .rp-tier-name { color: #f97316; }
      .rp-tier-inferno  .rp-lv-num   { color: #f97316; }

      .rp-tier-elite    .rp-tier-dot  { background: #f59e0b; }
      .rp-tier-elite    .rp-tier-name { color: #f59e0b; }
      .rp-tier-elite    .rp-lv-num   { color: #f59e0b; }

      /* ── FOOTER ── */
      .rp-footer {
        padding: 12px 20px 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.05);
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .rp-footer-tip {
        font-size: 10px;
        color: rgba(255, 255, 255, 0.22);
        font-family: "Fira Code", monospace;
        letter-spacing: 0.04em;
        line-height: 1.5;
      }

      .rp-footer-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 6px 14px;
        border-radius: 100px;
        background: linear-gradient(135deg, #f59e0b, #f97316);
        border: none;
        color: #000;
        font-size: 10px;
        font-weight: 800;
        font-family: "DM Sans", sans-serif;
        letter-spacing: 0.04em;
        cursor: pointer;
        text-decoration: none;
        white-space: nowrap;
        box-shadow: 0 0 16px rgba(245, 158, 11, 0.3);
        transition: opacity 0.18s, box-shadow 0.18s;
        flex-shrink: 0;
      }
      .rp-footer-btn:hover {
        opacity: 0.88;
        box-shadow: 0 0 22px rgba(245, 158, 11, 0.5);
      }
      .rp-footer-btn i { font-size: 12px; }

      /* ── MOBILE responsive ── */
      @media (max-width: 480px) {
        .rp-card {
          max-height: 92vh;
          border-radius: 20px;
        }
        .rp-page {
          padding: 14px;
        }
        .rp-header {
          padding: 14px 16px 12px;
        }
        .rp-tabs {
          padding: 10px 16px 0;
        }
        .rp-footer {
          padding: 10px 16px 14px;
        }
      }

      @media (max-width: 360px) {
        .rp-title { font-size: 11px; }
        .rp-point-row { padding: 10px 11px; }
        .rp-point-badge { font-size: 11px; }
      }
    `;
    document.head.appendChild(style);
  }

  /* ── Level benefits data (LV1–30) ── */
  const LEVEL_BENEFITS = [
    /* LV 1 */  { tier: "recruit",   label: "Welcome, Recruit",               sub: "Basic access granted — 2 standard Sparks per day · explore the platform" },
    /* LV 2 */  { tier: "recruit",   label: "Spark limit upgraded to 4/day",  sub: "Standard Sparks: 4 per day · Spark Prompts: 2 per day" },
    /* LV 3 */  { tier: "recruit",   label: "Profile ring unlocked",          sub: "Animated border ring around profile photo — Style 1 (glow pulse)" },
    /* LV 4 */  { tier: "recruit",   label: "Posting upgraded to 5 Sparks",   sub: "Standard Spark posts: 5 per day · Spark Prompts: 2 per day" },
    /* LV 5 */  { tier: "recruit",   label: "+1 bonus Spark slot",            sub: "Standard Sparks: 6 per day · Sparks now auto-tag your level badge" },
    /* LV 6 */  { tier: "recruit",   label: "Tier complete: Affiliate eligible", sub: "Affiliate ID unlocked · Top-up enabled (min USD 5.00) · pay-as-you-go" },
    /* LV 7 */  { tier: "operative", label: "Operative rank activated",       sub: "12 daily Sparks · Priority listing in Spark feed · Operative badge" },
    /* LV 8 */  { tier: "operative", label: "Extended reply threading",       sub: "Reply threads up to 3 levels deep · Spark Prompts: 3 per day" },
    /* LV 9 */  { tier: "operative", label: "Second profile ring style",      sub: "Profile ring Style 2 (electric shimmer) · choose from unlocked styles" },
    /* LV 10 */ { tier: "operative", label: "Milestone: Tier badge awarded",  sub: "Operative enamel badge displayed on profile · Sparks: 14/day" },
    /* LV 11 */ { tier: "operative", label: "Analytics access",               sub: "View Spark reach stats · see who viewed your profile (7-day window)" },
    /* LV 12 */ { tier: "operative", label: "Operative tier mastered",        sub: "Sparks: 16/day · Prompt Sparks: 4/day · custom callsign color unlocked" },
    /* LV 13 */ { tier: "guardian",  label: "Guardian tier unlocked",         sub: "18 Sparks/day · Guardian shield badge · early access to new features" },
    /* LV 14 */ { tier: "guardian",  label: "Media Sparks enabled",           sub: "Attach images or video to standard Sparks · max 4 files per post" },
    /* LV 15 */ { tier: "guardian",  label: "Third ring style unlocked",      sub: "Profile ring Style 3 (aurora wave) · Sparks: 20/day" },
    /* LV 16 */ { tier: "guardian",  label: "Extended analytics (30-day)",    sub: "Full 30-day Spark analytics · follower growth graph · top posts view" },
    /* LV 17 */ { tier: "guardian",  label: "Prompt Sparks: 5/day",           sub: "AI prompt generation cap raised · Sparks: 22/day · priority feed ranking" },
    /* LV 18 */ { tier: "guardian",  label: "Guardian tier mastered",         sub: "Sparks: 24/day · unlocks Inferno application · custom profile theme accent" },
    /* LV 19 */ { tier: "inferno",   label: "Inferno tier activated",         sub: "30 Sparks/day · Inferno flame badge · featured slot eligibility" },
    /* LV 20 */ { tier: "inferno",   label: "Milestone: Creator status",      sub: "Creator tag on profile · monetization waitlist access · Sparks: 32/day" },
    /* LV 21 */ { tier: "inferno",   label: "Collab Sparks unlocked",         sub: "Co-author a Spark with another user · shared credit and XP split" },
    /* LV 22 */ { tier: "inferno",   label: "Fourth ring style unlocked",     sub: "Profile ring Style 4 (inferno burst) · Sparks: 35/day · 6 Prompt Sparks" },
    /* LV 23 */ { tier: "inferno",   label: "Referral bonus rate +50%",       sub: "Affiliate commission boosted · referral points multiplied by 1.5×" },
    /* LV 24 */ { tier: "inferno",   label: "Inferno tier mastered",          sub: "Sparks: 40/day · Prompt Sparks: 8/day · unlocks Elite path" },
    /* LV 25 */ { tier: "elite",     label: "ELITE status achieved",          sub: "50 Sparks/day · Elite diamond badge · front-page feature eligibility" },
    /* LV 26 */ { tier: "elite",     label: "Fifth ring style unlocked",      sub: "Profile ring Style 5 (elite crown pulse) · custom banner frame unlocked" },
    /* LV 27 */ { tier: "elite",     label: "Unlimited Prompt Sparks",        sub: "Spark Prompt daily cap removed · priority AI response queue" },
    /* LV 28 */ { tier: "elite",     label: "Elite Partner program eligible", sub: "Revenue share access · custom affiliate campaign tools · 2× XP events" },
    /* LV 29 */ { tier: "elite",     label: "Legacy badge granted",           sub: "Permanent legacy marker on profile · Sparks: unlimited · mentorship role" },
    /* LV 30 */ { tier: "elite",     label: "MAX LEVEL — T1ERA Legend",       sub: "All features unlocked · Legend crown ring · permanent top-feed placement · staff recognition" },
  ];

  const TIER_META = {
    recruit:   { label: "Recruit",   range: "LV 1 – 6" },
    operative: { label: "Operative", range: "LV 7 – 12" },
    guardian:  { label: "Guardian",  range: "LV 13 – 18" },
    inferno:   { label: "Inferno",   range: "LV 19 – 24" },
    elite:     { label: "Elite",     range: "LV 25 – 30" },
  };

  /* ── Build page 1 HTML ── */
  function buildPage1() {
    return `
      <div class="rp-section-label">How to earn points</div>

      <div class="rp-points-grid">

        <div class="rp-point-row">
          <div class="rp-point-icon pink">❤️</div>
          <div class="rp-point-info">
            <div class="rp-point-action">Like a Spark</div>
            <div class="rp-point-desc">Points awarded per like you give</div>
          </div>
          <div class="rp-point-badge pink">+10 pts</div>
        </div>

        <div class="rp-point-row">
          <div class="rp-point-icon purple">💬</div>
          <div class="rp-point-info">
            <div class="rp-point-action">Reply to a Spark</div>
            <div class="rp-point-desc">Points awarded per reply you post</div>
          </div>
          <div class="rp-point-badge purple">+40 pts</div>
        </div>

        <div class="rp-point-row">
          <div class="rp-point-icon gold">⚡</div>
          <div class="rp-point-info">
            <div class="rp-point-action">Post a Spark</div>
            <div class="rp-point-desc">Points per standard Spark you publish</div>
          </div>
          <div class="rp-point-badge">+20 pts</div>
        </div>

        <div class="rp-point-row">
          <div class="rp-point-icon green">🔁</div>
          <div class="rp-point-info">
            <div class="rp-point-action">Repost a Spark</div>
            <div class="rp-point-desc">Sharing someone else's Spark earns you points</div>
          </div>
          <div class="rp-point-badge green">+15 pts</div>
        </div>

        <div class="rp-point-row">
          <div class="rp-point-icon blue">👤</div>
          <div class="rp-point-info">
            <div class="rp-point-action">Gain a new Follower</div>
            <div class="rp-point-desc">Each unique follower awards points once</div>
          </div>
          <div class="rp-point-badge blue">+25 pts</div>
        </div>

        <div class="rp-point-row">
          <div class="rp-point-icon orange">🔗</div>
          <div class="rp-point-info">
            <div class="rp-point-action">Successful Referral</div>
            <div class="rp-point-desc">Referred user completes account setup</div>
          </div>
          <div class="rp-point-badge orange">+100 pts</div>
        </div>

      </div>

      <div class="rp-section-label">Spark Prompt points</div>

      <div class="rp-prompt-card">
        <div class="rp-prompt-header">
          <i class="ph-bold ph-robot" style="font-size:15px;color:#a78bfa"></i>
          <span class="rp-prompt-title">Prompt Sparks</span>
          <span class="rp-prompt-badge-soon">Coming Soon</span>
        </div>
        <div class="rp-prompt-rows">
          <div class="rp-prompt-row">
            <div class="rp-prompt-row-left">
              <i class="ph-bold ph-text-aa" style="color:rgba(167,139,250,0.6)"></i>
              Text only prompt (no media)
            </div>
            <span class="rp-prompt-pts">+30 pts</span>
          </div>
          <div class="rp-prompt-row">
            <div class="rp-prompt-row-left">
              <i class="ph-bold ph-image" style="color:rgba(167,139,250,0.6)"></i>
              Prompt with image attached
            </div>
            <span class="rp-prompt-pts">+50 pts</span>
          </div>
          <div class="rp-prompt-row">
            <div class="rp-prompt-row-left">
              <i class="ph-bold ph-video" style="color:rgba(167,139,250,0.6)"></i>
              Prompt with video attached
            </div>
            <span class="rp-prompt-pts">+50 pts</span>
          </div>
          <div class="rp-prompt-row">
            <div class="rp-prompt-row-left">
              <i class="ph-bold ph-file" style="color:rgba(167,139,250,0.6)"></i>
              Prompt with file/doc attached
            </div>
            <span class="rp-prompt-pts">+50 pts</span>
          </div>
        </div>
      </div>

      <div class="rp-note-box">
        <strong>Note:</strong> Points accumulate across all activities. Your XP is computed from your total points and determines your level and rank tier. Keep posting, engaging, and referring friends to level up faster.
      </div>
    `;
  }

  /* ── Build page 2 HTML ── */
  function buildPage2(currentLevel) {
    const tiers = ["recruit", "operative", "guardian", "inferno", "elite"];
    let html = "";

    tiers.forEach((tier) => {
      const meta = TIER_META[tier];
      const tierLevels = LEVEL_BENEFITS
        .map((b, i) => ({ ...b, lv: i + 1 }))
        .filter((b) => b.tier === tier);

      html += `
        <div class="rp-tier-block rp-tier-${tier}">
          <div class="rp-tier-header">
            <div class="rp-tier-dot"></div>
            <span class="rp-tier-name">${meta.label}</span>
            <span class="rp-tier-range">${meta.range}</span>
          </div>
          <div class="rp-levels-list">
      `;

      tierLevels.forEach(({ lv, label, sub }) => {
        const isActive = lv === currentLevel;
        html += `
          <div class="rp-level-row${isActive ? " rp-level-active" : ""}">
            <span class="rp-lv-num">LV${lv}</span>
            <div class="rp-lv-content">
              <div class="rp-lv-label">${label}</div>
              <div class="rp-lv-sub">${sub}</div>
            </div>
            ${isActive ? '<span class="rp-lv-badge-you">YOU</span>' : ""}
          </div>
        `;
      });

      html += `</div></div>`;
    });

    return html;
  }

  /* ── Inject popup DOM ── */
  function injectPopup() {
    if (document.getElementById("rankPopupOverlay")) return;

    const overlay = document.createElement("div");
    overlay.className = "rp-overlay";
    overlay.id = "rankPopupOverlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Rank & Points Guide");

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) window.closeRankPopup();
    });

    overlay.innerHTML = `
      <div class="rp-card" id="rankPopupCard">

        <!-- Header -->
        <div class="rp-header">
          <div class="rp-header-left">
            <svg class="rp-shield-icon" viewBox="0 0 48 48" fill="none">
              <path d="M24 4L8 12V24C8 33 15.1 41.5 24 44C32.9 41.5 40 33 40 24V12L24 4Z"
                fill="rgba(245,158,11,0.15)" stroke="#f59e0b" stroke-width="2" stroke-linejoin="round"/>
              <text x="24" y="31" text-anchor="middle" font-family="Orbitron"
                font-size="15" font-weight="800" fill="#f59e0b" id="rpShieldLevel">1</text>
            </svg>
            <div class="rp-header-titles">
              <div class="rp-title" id="rpHeaderTitle">RANK GUIDE</div>
              <div class="rp-subtitle" id="rpHeaderSub">T1ERA · LEVEL SYSTEM</div>
            </div>
          </div>
          <button class="rp-close-btn" onclick="window.closeRankPopup()" aria-label="Close">
            <i class="ph-bold ph-x"></i>
          </button>
        </div>

        <!-- Tabs -->
        <div class="rp-tabs">
          <button class="rp-tab rp-tab-active" id="rpTab0" onclick="window.switchRankPage(0)">
            Points Guide
          </button>
          <button class="rp-tab" id="rpTab1" onclick="window.switchRankPage(1)">
            Level Benefits
          </button>
        </div>

        <!-- Body -->
        <div class="rp-body" id="rpBody">
          <div class="rp-page rp-page-active" id="rpPage0"></div>
          <div class="rp-page" id="rpPage1"></div>
        </div>

        <!-- Footer -->
        <div class="rp-footer">
          <div class="rp-footer-tip">Keep earning points to<br>unlock the next level.</div>
          <a href="spark.html" class="rp-footer-btn" onclick="window.closeRankPopup()">
            <i class="ph-bold ph-lightning"></i>
            Go to Sparks
          </a>
        </div>

      </div>
    `;

    document.body.appendChild(overlay);
  }

  /* ── Public: open popup ── */
  window.openRankPopup = function () {
    injectPopup();

    const currentLevel = (typeof window._currentUid !== "undefined" && window._currentLevel)
      ? window._currentLevel
      : _readLevelFromDOM();

    // Populate content
    const page0 = document.getElementById("rpPage0");
    const page1 = document.getElementById("rpPage1");
    if (page0 && !page0.dataset.built) {
      page0.innerHTML = buildPage1();
      page0.dataset.built = "1";
    }
    if (page1 && !page1.dataset.built) {
      page1.innerHTML = buildPage2(currentLevel);
      page1.dataset.built = "1";
    }

    // Update shield level number in header
    const shieldEl = document.getElementById("rpShieldLevel");
    if (shieldEl) shieldEl.textContent = currentLevel;

    // Update header subtitle with current rank
    const rankTitleEl = document.getElementById("rankTitleText");
    const rankTitle = rankTitleEl ? rankTitleEl.textContent : "Recruit";
    const subEl = document.getElementById("rpHeaderSub");
    if (subEl) subEl.textContent = `${rankTitle.toUpperCase()} · LV ${currentLevel}`;

    // Reset to page 0
    window.switchRankPage(0);

    // Open
    const overlay = document.getElementById("rankPopupOverlay");
    if (overlay) {
      overlay.classList.add("rp-open");
      document.body.style.overflow = "hidden";
    }

    // Scroll level 2 page to current level after a tick
    setTimeout(() => {
      const activeRow = document.querySelector(".rp-level-row.rp-level-active");
      if (activeRow) {
        activeRow.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }, 350);
  };

  /* ── Public: close popup ── */
  window.closeRankPopup = function () {
    const overlay = document.getElementById("rankPopupOverlay");
    if (overlay) overlay.classList.remove("rp-open");
    document.body.style.overflow = "";
  };

  /* ── Public: switch page ── */
  window.switchRankPage = function (idx) {
    [0, 1].forEach((i) => {
      const tab  = document.getElementById(`rpTab${i}`);
      const page = document.getElementById(`rpPage${i}`);
      if (tab)  tab.classList.toggle("rp-tab-active",  i === idx);
      if (page) page.classList.toggle("rp-page-active", i === idx);
    });
    // Reset scroll to top on page switch
    const body = document.getElementById("rpBody");
    if (body) body.scrollTop = 0;
  };

  /* ── Read current level from DOM (fallback) ── */
  function _readLevelFromDOM() {
    const el = document.getElementById("rankLevelNum");
    if (!el) return 1;
    const match = el.textContent.match(/\d+/);
    return match ? parseInt(match[0], 10) : 1;
  }

  /* ── ESC key closes popup ── */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      const overlay = document.getElementById("rankPopupOverlay");
      if (overlay && overlay.classList.contains("rp-open")) {
        window.closeRankPopup();
      }
    }
  });

})();
