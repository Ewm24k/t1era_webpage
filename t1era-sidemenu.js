/* ═══════════════════════════════════════════════════════
   T1ERA SIDE MENU  — t1era-sidemenu.js
   Slide-in nav from the left, visible only in T1ERA mode
═══════════════════════════════════════════════════════ */

(function () {
  /* ── Inject CSS ── */
  const style = document.createElement('style');
  style.textContent = `
    /* ── Hamburger button (replaces "< Profile" in T1ERA mode) ── */
    .t1era-menu-btn {
      display: none;           /* hidden by default */
      align-items: center;
      justify-content: center;
      width: 34px; height: 34px;
      border: none; background: transparent;
      border-radius: 8px;
      color: var(--text-2, #aaa);
      cursor: pointer;
      transition: background 0.18s, color 0.18s;
      flex-shrink: 0;
    }
    .t1era-menu-btn:hover { background: var(--bg-3, #1e1e2a); color: var(--text, #fff); }
    .t1era-menu-btn svg { width: 20px; height: 20px; display: block; }

    /* Show hamburger only when T1ERA is active */
    body.t1era-active .t1era-menu-btn  { display: flex; }
    body.t1era-active .topbar-back     { display: none !important; }

    /* ── Overlay ── */
    .t1sm-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.55);
      backdrop-filter: blur(3px);
      -webkit-backdrop-filter: blur(3px);
      z-index: 1200;
      opacity: 0; pointer-events: none;
      transition: opacity 0.28s ease;
    }
    .t1sm-overlay.open { opacity: 1; pointer-events: auto; }

    /* ── Side panel ── */
    .t1sm-panel {
      position: fixed;
      top: 0; left: 0;
      width: 72px;           /* icon-only width */
      max-width: 280px;
      height: 100vh;         /* fallback for older browsers */
      height: 100dvh;        /* dynamic viewport — modern browsers */
      /* iOS Safari full-height fix */
      min-height: -webkit-fill-available;
      background: linear-gradient(160deg,#0d0d14 0%,#121220 100%);
      border-right: 1px solid rgba(255,255,255,0.07);
      box-shadow: 4px 0 40px rgba(0,0,0,0.6);
      z-index: 1201;
      transform: translateX(-100%);
      transition: transform 0.3s cubic-bezier(0.4,0,0.2,1), width 0.28s ease;
      display: flex; flex-direction: column;
      overflow: hidden;
      /* Prevent iOS scroll bounce leaking through panel */
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
    }
    .t1sm-panel.open { transform: translateX(0); }

    /* Expand on hover (PC only) */
    @media (min-width: 640px) {
      .t1sm-panel:hover { width: 220px; }
    }

    /* Mobile — always full slim open */
    @media (max-width: 639px) {
      .t1sm-panel { width: 220px; }
    }

    /* ── Panel header ── */
    .t1sm-header {
      display: flex; align-items: center; gap: 10px;
      padding: 18px 16px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      min-height: 58px;
      flex-shrink: 0;
    }
    .t1sm-logo-mark {
      width: 32px; height: 32px; border-radius: 8px;
      background: linear-gradient(135deg,#c2185b,#7b1fa2);
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 800; color: #fff;
      letter-spacing: -0.5px; flex-shrink: 0;
    }
    .t1sm-logo-text {
      font-size: 13px; font-weight: 700; color: #fff;
      letter-spacing: 0.08em; white-space: nowrap;
      opacity: 0; transition: opacity 0.2s 0.05s;
    }
    .t1sm-panel:hover .t1sm-logo-text,
    @media (max-width: 639px) { .t1sm-logo-text { opacity: 1; } }

    /* ── Nav list ── */
    .t1sm-nav {
      flex: 1; padding: 12px 0;
      overflow-y: auto; overflow-x: hidden;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch; /* iOS momentum scroll */
      overscroll-behavior-y: contain;
    }
    .t1sm-nav::-webkit-scrollbar { display: none; }

    .t1sm-item {
      display: flex; align-items: center; gap: 14px;
      padding: 11px 20px;
      min-height: 44px; /* Apple HIG & Android minimum touch target */
      cursor: pointer; border: none; background: transparent;
      width: 100%; text-align: left;
      color: var(--text-2, #888);
      border-radius: 0;
      transition: background 0.18s, color 0.18s;
      position: relative;
      text-decoration: none;
      white-space: nowrap;
      -webkit-tap-highlight-color: transparent; /* remove grey flash on tap (Android/iOS) */
      touch-action: manipulation; /* prevent 300ms tap delay */
    }
    .t1sm-item:hover { background: rgba(255,255,255,0.05); color: #fff; }
    .t1sm-item.active { color: #fff; }
    .t1sm-item.active::before {
      content: '';
      position: absolute; left: 0; top: 20%; height: 60%;
      width: 3px; border-radius: 0 3px 3px 0;
      background: linear-gradient(180deg,#c2185b,#7b1fa2);
    }

    /* icon wrapper */
    .t1sm-icon {
      width: 34px; height: 34px; border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      font-size: 18px;
      transition: transform 0.2s;
    }
    .t1sm-item:hover .t1sm-icon { transform: scale(1.1); }

    /* label */
    .t1sm-label {
      font-size: 13px; font-weight: 600;
      letter-spacing: 0.01em;
      opacity: 0; transition: opacity 0.15s 0.04s;
      pointer-events: none;
    }
    /* show label when panel is wide */
    .t1sm-panel:hover .t1sm-label { opacity: 1; }
    @media (max-width: 639px) { .t1sm-label { opacity: 1; } }

    /* Also show logo text when hovered */
    .t1sm-panel:hover .t1sm-logo-text { opacity: 1; }

    /* ── Tooltip (PC non-hover state fallback) ── */
    .t1sm-item .t1sm-tooltip {
      position: absolute;
      left: calc(100% + 10px);
      top: 50%; transform: translateY(-50%);
      background: #1a1a2e; color: #fff;
      font-size: 11px; font-weight: 600;
      padding: 4px 10px; border-radius: 6px;
      pointer-events: none;
      white-space: nowrap;
      opacity: 0; transition: opacity 0.15s;
      border: 1px solid rgba(255,255,255,0.1);
      z-index: 1300;
    }
    /* Only show tooltip when NOT hovered (icon-only state) */
    @media (min-width: 640px) {
      .t1sm-panel:not(:hover) .t1sm-item:hover .t1sm-tooltip { opacity: 1; }
    }

    /* ── Pane container ── */
    .t1sm-pane { display: none; }
    .t1sm-pane.t1sm-active { display: block; }

    /* ── Icon colour accents ── */
    .t1sm-icon.chat    { background: rgba(194,24,91,0.13);  color: #c2185b; }
    .t1sm-icon.img     { background: rgba(139,92,246,0.13); color: #8b5cf6; }
    .t1sm-icon.video   { background: rgba(59,130,246,0.13); color: #3b82f6; }
    .t1sm-icon.music   { background: rgba(16,185,129,0.13); color: #10b981; }
    .t1sm-icon.voice   { background: rgba(245,158,11,0.13); color: #f59e0b; }

    /* ── Close button ── */
    .t1sm-close {
      position: absolute; top: 14px; right: 12px;
      width: 28px; height: 28px; border-radius: 50%;
      border: none; background: rgba(255,255,255,0.06);
      color: var(--text-2,#aaa); cursor: pointer;
      display: none; align-items: center; justify-content: center;
      font-size: 14px; transition: background 0.18s;
    }
    .t1sm-close:hover { background: rgba(255,255,255,0.12); color: #fff; }
    @media (max-width: 639px) { .t1sm-close { display: flex; } }

    /* ── Active pane marker on nav item ── */
    .t1sm-item[data-pane].active { color: #fff; }

    /* ── "Coming soon" placeholder panes ── */
    .t1sm-coming {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 14px; padding: 60px 20px; text-align: center;
      color: var(--text-3, #555);
    }
    .t1sm-coming .t1sm-ci {
      font-size: 48px;
      opacity: 0.4;
    }
    .t1sm-coming p { font-size: 13px; font-weight: 500; margin: 0; }
    .t1sm-coming small { font-size: 11px; opacity: 0.6; }

    /* ── Footer ── */
    .t1sm-footer {
      flex-shrink: 0;
      border-top: 1px solid rgba(255,255,255,0.07);
      padding: 10px 0 12px;
      /* iPhone home bar / notch safe area */
      padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    }

    /* Profile row — always visible, click to expand */
    .t1sm-profile-row {
      display: flex; align-items: center; gap: 12px;
      padding: 8px 16px;
      min-height: 44px; /* minimum touch target */
      cursor: pointer;
      border-radius: 10px;
      margin: 0 6px;
      transition: background 0.18s;
      position: relative;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }
    .t1sm-profile-row:hover { background: rgba(255,255,255,0.05); }

    /* Avatar circle — mirrors compose-av pattern from spark22 */
    .t1sm-footer-av {
      width: 32px; height: 32px; border-radius: 50%;
      flex-shrink: 0;
      background: linear-gradient(135deg, #c2185b, #8b5cf6);
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 800;
      font-family: var(--f-display, "Orbitron", sans-serif);
      color: #fff;
      overflow: hidden;
      border: 2px solid rgba(194,24,91,0.3);
      transition: border-color 0.18s;
    }
    .t1sm-footer-av img {
      width: 100%; height: 100%;
      object-fit: cover; border-radius: 50%; display: block;
    }
    .t1sm-profile-row:hover .t1sm-footer-av { border-color: rgba(194,24,91,0.6); }

    /* Name + handle — hidden when panel is narrow */
    .t1sm-footer-info {
      flex: 1; min-width: 0;
      opacity: 0; transition: opacity 0.15s 0.04s;
      pointer-events: none;
    }
    .t1sm-panel:hover .t1sm-footer-info { opacity: 1; }
    @media (max-width: 639px) { .t1sm-footer-info { opacity: 1; } }

    .t1sm-footer-name {
      font-size: 12px; font-weight: 700; color: #fff;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .t1sm-footer-handle {
      font-size: 10px; color: rgba(255,255,255,0.35);
      font-family: var(--f-mono, "Fira Code", monospace);
      white-space: nowrap;
    }

    /* Chevron indicator */
    .t1sm-footer-chevron {
      font-size: 11px; color: rgba(255,255,255,0.25);
      opacity: 0; transition: opacity 0.15s;
      flex-shrink: 0;
    }
    .t1sm-panel:hover .t1sm-footer-chevron { opacity: 1; }

    /* ── Expanded drawer ── */
    .t1sm-footer-drawer {
      overflow: hidden;
      max-height: 0;
      transition: max-height 0.28s cubic-bezier(0.4,0,0.2,1),
                  opacity 0.22s ease;
      opacity: 0;
      margin: 0 6px;
    }
    .t1sm-footer-drawer.open {
      max-height: 200px;
      opacity: 1;
    }
    /* When panel shrinks back to icon-only on PC (not hovered), force drawer closed */
    @media (min-width: 640px) {
      .t1sm-panel:not(:hover) .t1sm-footer-drawer.open {
        max-height: 0;
        opacity: 0;
      }
    }
    .t1sm-footer-drawer-inner {
      padding: 10px 12px 4px;
      display: flex; flex-direction: column; gap: 8px;
    }

    /* Balance row */
    .t1sm-balance-row {
      display: flex; align-items: center; justify-content: space-between;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 8px;
      padding: 8px 10px;
    }
    .t1sm-balance-label {
      font-size: 9px; font-weight: 700; letter-spacing: 0.1em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.35);
      font-family: var(--f-mono, "Fira Code", monospace);
    }
    .t1sm-balance-value {
      font-size: 13px; font-weight: 800;
      font-family: var(--f-display, "Orbitron", sans-serif);
      background: linear-gradient(135deg, #c2185b, #8b5cf6);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    /* Server / tier button */
    .t1sm-server-btn {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      width: 100%;
      padding: 6px 10px;
      min-height: 36px; /* comfortable tap target */
      border-radius: 7px;
      background: rgba(194,24,91,0.08);
      border: 1px solid rgba(194,24,91,0.2);
      color: rgba(194,24,91,0.85);
      font-size: 10px; font-weight: 700; letter-spacing: 0.05em;
      font-family: var(--f-body, "DM Sans", sans-serif);
      cursor: pointer;
      transition: background 0.18s, border-color 0.18s;
      white-space: nowrap;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }
    .t1sm-server-btn:hover {
      background: rgba(194,24,91,0.16);
      border-color: rgba(194,24,91,0.4);
      color: #e91e8c;
    }
    .t1sm-server-btn svg { width: 12px; height: 12px; flex-shrink: 0; }

    /* ── Sign Out button ── */
    .t1sm-signout-btn {
      display: none;
      align-items: center; justify-content: center; gap: 6px;
      width: 100%; padding: 6px 10px; min-height: 36px;
      border-radius: 7px;
      background: rgba(239,68,68,0.07);
      border: 1px solid rgba(239,68,68,0.18);
      color: rgba(239,68,68,0.75);
      font-size: 10px; font-weight: 700; letter-spacing: 0.05em;
      font-family: var(--f-body, "DM Sans", sans-serif);
      cursor: pointer;
      transition: background 0.18s, border-color 0.18s, color 0.18s, opacity 0.18s;
      white-space: nowrap;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }
    .t1sm-signout-btn:hover:not(:disabled) {
      background: rgba(239,68,68,0.16);
      border-color: rgba(239,68,68,0.4);
      color: #ef4444;
    }
    .t1sm-signout-btn:disabled {
      opacity: 0.5; cursor: not-allowed;
    }
    .t1sm-signout-btn.visible { display: flex; }
    .t1sm-signout-btn svg { width: 13px; height: 13px; flex-shrink: 0; }

    /* Spinner inside sign out button */
    .t1sm-so-spin {
      display: none;
      width: 13px; height: 13px; border-radius: 50%;
      border: 2px solid rgba(239,68,68,0.3);
      border-top-color: #ef4444;
      animation: t1smSpin 0.7s linear infinite;
      flex-shrink: 0;
    }
    .t1sm-signout-btn.loading .t1sm-so-spin { display: block; }
    .t1sm-signout-btn.loading .t1sm-so-txt  { display: none; }
    @keyframes t1smSpin { to { transform: rotate(360deg); } }

    /* ── Sign out toast ── */
    .t1sm-signout-toast {
      position: fixed; bottom: 28px; left: 50%;
      transform: translateX(-50%) translateY(12px);
      background: #10b981; color: #fff;
      font-size: 13px; font-weight: 700;
      padding: 10px 22px; border-radius: 100px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.45);
      opacity: 0; pointer-events: none;
      transition: opacity 0.22s, transform 0.22s;
      z-index: 9999; white-space: nowrap;
      font-family: var(--f-body, "DM Sans", sans-serif);
      display: flex; align-items: center; gap: 8px;
    }
    .t1sm-signout-toast.show {
      opacity: 1; transform: translateX(-50%) translateY(0);
    }
  `;
  document.head.appendChild(style);

  /* ── Build DOM once page is ready ── */
  function buildMenu() {
    /* 1. Hamburger button — insert before .topbar-back */
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;

    const btn = document.createElement('button');
    btn.className = 't1era-menu-btn';
    btn.title = 'T1ERA Menu';
    btn.setAttribute('aria-label', 'Open T1ERA menu');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
        <line x1="3" y1="6"  x2="21" y2="6"/>
        <line x1="3" y1="12" x2="21" y2="12"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
      </svg>`;
    btn.addEventListener('click', openMenu);
    topbar.insertBefore(btn, topbar.firstChild);

    /* 2. Overlay */
    const overlay = document.createElement('div');
    overlay.className = 't1sm-overlay';
    overlay.addEventListener('click', closeMenu);
    document.body.appendChild(overlay);

    /* 3. Side panel */
    const panel = document.createElement('div');
    panel.className = 't1sm-panel';
    panel.id = 't1smPanel';
    panel.innerHTML = `
      <button class="t1sm-close" onclick="window.t1smClose()" title="Close">✕</button>
      <div class="t1sm-header">
        <div class="t1sm-logo-mark">T1</div>
        <span class="t1sm-logo-text">T1ERA AI</span>
      </div>
      <nav class="t1sm-nav" id="t1smNav">

        <button class="t1sm-item active" data-pane="chat">
          <span class="t1sm-icon chat">
            <!-- Chat with AI — circuit-brain / terminal style -->
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2C6.48 2 2 6.03 2 11c0 2.4 1.02 4.58 2.68 6.18L4 22l4.96-1.98C10.23 20.63 11.1 21 12 21c5.52 0 10-4.03 10-9S17.52 2 12 2z"/>
              <path d="M8 10h8M8 14h5"/>
            </svg>
          </span>
          <span class="t1sm-label">Chat with AI</span>
          <span class="t1sm-tooltip">Chat with AI</span>
        </button>

        <button class="t1sm-item" data-pane="image">
          <span class="t1sm-icon img">
            <!-- Generate Image — hexagonal AI frame -->
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21,15 16,10 5,21"/>
            </svg>
          </span>
          <span class="t1sm-label">Generate Image</span>
          <span class="t1sm-tooltip">Generate Image</span>
        </button>

        <button class="t1sm-item" data-pane="video">
          <span class="t1sm-icon video">
            <!-- Generate Video — clapperboard-ish -->
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="6" width="14" height="12" rx="2"/>
              <polyline points="16,9.5 22,6 22,18 16,14.5"/>
              <line x1="2" y1="10" x2="16" y2="10"/>
            </svg>
          </span>
          <span class="t1sm-label">Generate Video</span>
          <span class="t1sm-tooltip">Generate Video</span>
        </button>

        <button class="t1sm-item" data-pane="music">
          <span class="t1sm-icon music">
            <!-- Generate Music — waveform -->
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 19V6l12-2v13"/>
              <circle cx="6" cy="19" r="3"/>
              <circle cx="18" cy="17" r="3"/>
            </svg>
          </span>
          <span class="t1sm-label">Generate Music</span>
          <span class="t1sm-tooltip">Generate Music</span>
        </button>

        <button class="t1sm-item" data-pane="voice">
          <span class="t1sm-icon voice">
            <!-- Generate Voice — mic / soundwave -->
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="2" width="6" height="11" rx="3"/>
              <path d="M5 10a7 7 0 0 0 14 0"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
              <line x1="8"  y1="22" x2="16" y2="22"/>
            </svg>
          </span>
          <span class="t1sm-label">Generate Voice</span>
          <span class="t1sm-tooltip">Generate Voice</span>
        </button>

      </nav>

      <div class="t1sm-footer" id="t1smFooter">
        <!-- Profile row — always visible, click to expand -->
        <div class="t1sm-profile-row" id="t1smProfileRow" onclick="window.t1smToggleDrawer()">
          <!-- Avatar — mirrors composeAv/miniAv pattern from spark22: div with initials,
               img injected by window.t1smUpdateProfile() when photoURL is available -->
          <div class="t1sm-footer-av" id="t1smFooterAv">M</div>
          <div class="t1sm-footer-info">
            <div class="t1sm-footer-name" id="t1smFooterName">My Account</div>
            <div class="t1sm-footer-handle" id="t1smFooterHandle">@user</div>
          </div>
          <span class="t1sm-footer-chevron" id="t1smFooterChevron">▲</span>
        </div>

        <!-- Expandable drawer -->
        <div class="t1sm-footer-drawer" id="t1smFooterDrawer">
          <div class="t1sm-footer-drawer-inner">
            <!-- Balance / quota row — placeholder until backend wired -->
            <div class="t1sm-balance-row">
              <span class="t1sm-balance-label">Balance</span>
              <span class="t1sm-balance-value" id="t1smBalanceVal">—</span>
            </div>
            <!-- Server / tier button -->
            <button class="t1sm-server-btn" id="t1smServerBtn" onclick="window.t1smServerClick()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="3" width="20" height="5" rx="1"/>
                <rect x="2" y="10" width="20" height="5" rx="1"/>
                <circle cx="18" cy="5.5" r="1"/><circle cx="18" cy="12.5" r="1"/>
              </svg>
              Free Server
            </button>
            <!-- Sign Out — only visible when authenticated -->
            <button class="t1sm-signout-btn" id="t1smSignOutBtn" onclick="window.t1smSignOut()">
              <span class="t1sm-so-spin"></span>
              <svg class="t1sm-so-txt" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <span class="t1sm-so-txt">Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    /* 4a. Touch swipe-to-close — swipe left anywhere on panel to close (mobile) */
    (function wireSwipe() {
      var _tx = 0, _dragging = false;
      panel.addEventListener('touchstart', function (e) {
        _tx = e.touches[0].clientX;
        _dragging = true;
      }, { passive: true });
      panel.addEventListener('touchmove', function (e) {
        if (!_dragging) return;
        var dx = e.touches[0].clientX - _tx;
        /* Only respond to leftward swipe (dx < 0) */
        if (dx < -8) {
          /* Live-drag the panel for tactile feel */
          panel.style.transition = 'none';
          panel.style.transform = 'translateX(' + Math.min(0, dx) + 'px)';
        }
      }, { passive: true });
      panel.addEventListener('touchend', function (e) {
        if (!_dragging) return;
        _dragging = false;
        var dx = e.changedTouches[0].clientX - _tx;
        panel.style.transition = '';
        panel.style.transform = '';
        /* Swipe > 60px left = close */
        if (dx < -60) {
          closeMenu();
        }
      }, { passive: true });
    })();

    /* 4. Wire nav items → panes */
    panel.querySelectorAll('.t1sm-item[data-pane]').forEach(function (item) {
      item.addEventListener('click', function () {
        var pane = this.dataset.pane;
        // deactivate all items
        panel.querySelectorAll('.t1sm-item').forEach(function (i) { i.classList.remove('active'); });
        this.classList.add('active');
        // show correct pane
        switchT1Pane(pane);
        // close menu on mobile
        if (window.innerWidth < 640) closeMenu();
      });
    });

    /* 5. Expose helpers to global scope */
    window.t1smClose = closeMenu;

    /* 6. Footer drawer toggle */
    window.t1smToggleDrawer = function () {
      var drawer  = document.getElementById('t1smFooterDrawer');
      var chevron = document.getElementById('t1smFooterChevron');
      if (!drawer) return;
      var isOpen = drawer.classList.toggle('open');
      if (chevron) chevron.textContent = isOpen ? '▼' : '▲';
    };

    /* 7. Server button click — placeholder; backend wires this later */
    window.t1smServerClick = function () {
      window.location.href = 'https://t1era.netlify.app/pod-workflow';
    };

    /* 8. Profile update hook — called by backend/auth module with user data.
          Mirrors the spark22 pattern: inject <img> if photoURL exists,
          otherwise fall back to initials. */
    window.t1smUpdateProfile = function (opts) {
      /* opts: { name, handle, photoURL, balance, serverLabel } — all optional */
      opts = opts || {};
      var avEl      = document.getElementById('t1smFooterAv');
      var nameEl    = document.getElementById('t1smFooterName');
      var handleEl  = document.getElementById('t1smFooterHandle');
      var balEl     = document.getElementById('t1smBalanceVal');
      var srvBtn    = document.getElementById('t1smServerBtn');

      if (nameEl   && opts.name)        nameEl.textContent   = opts.name;
      if (handleEl && opts.handle)      handleEl.textContent = '@' + opts.handle.replace(/^@/, '');
      if (balEl    && opts.balance != null) balEl.textContent = opts.balance;
      if (srvBtn   && opts.serverLabel) {
        /* preserve the SVG icon, update text node only */
        var svgNode = srvBtn.querySelector('svg');
        srvBtn.textContent = opts.serverLabel;
        if (svgNode) srvBtn.insertBefore(svgNode, srvBtn.firstChild);
      }

      /* Avatar — exact same pattern as applyComposeAvatar() in spark-module.js:
         inject <img> with referrerPolicy if photoURL present, else show initials */
      if (avEl) {
        if (opts.photoURL) {
          avEl.textContent = '';
          avEl.style.background = 'none';
          avEl.style.padding = '0';
          var img = document.createElement('img');
          img.src = opts.photoURL;
          img.alt = 'avatar';
          img.referrerPolicy = 'no-referrer';
          img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;';
          img.onerror = function () {
            avEl.style.background = 'linear-gradient(135deg,#c2185b,#8b5cf6)';
            avEl.style.padding = '';
            avEl.textContent = opts._initial || 'U';
          };
          avEl.appendChild(img);
        } else {
          avEl.style.background = '';
          avEl.style.padding = '';
          if (opts.name) {
            avEl.innerHTML = '';
            avEl.textContent = opts.name.trim().split(/\s+/).map(function(w){ return w[0]; }).join('').substring(0,2).toUpperCase();
          }
        }
      }
    };

    /* 10. Sign Out
          Key fix: we WAIT for signOut() promise to resolve before showing toast or
          redirecting. This ensures Firebase revokes the token server-side BEFORE
          auth.html loads, so onAuthStateChanged in auth.html fires null (not the
          cached user). We also set a flag in sessionStorage so auth.html knows a
          deliberate signout just happened and should NOT auto-redirect. */
    window.t1smSignOut = function () {
      var btn = document.getElementById('t1smSignOutBtn');
      if (!btn || btn.disabled) return;

      /* Show loading spinner — user sees activity immediately */
      btn.disabled = true;
      btn.classList.add('loading');

      function onSuccess() {
        /* ── Mark signout in sessionStorage so auth.html skips auto-redirect ──
           auth.html checks window._isLoggingOut but since we're navigating to a
           new page we use sessionStorage which persists across the navigation. */
        try { sessionStorage.setItem('t1era_signed_out', '1'); } catch (e) {}

        /* Show success toast AFTER signOut() resolves — not before */
        _t1smSOToast('✓ Signed out successfully');

        /* Navigate to auth page after toast is visible — long enough to see it */
        setTimeout(function () {
          window.location.replace('https://t1era.netlify.app/auth');
        }, 1200);
      }

      function onError(err) {
        console.error('[t1sm] signOut error:', err);
        btn.disabled = false;
        btn.classList.remove('loading');
        _t1smSOToast('Sign out failed — try again');
      }

      /* ── 1. Modular Firebase (spark-module.js must expose auth + signOut) ── */
      if (window._t1eraAuth && typeof window._t1eraSignOut === 'function') {
        window._t1eraSignOut(window._t1eraAuth).then(onSuccess).catch(onError);
        return;
      }

      /* ── 2. Compat Firebase SDK ── */
      if (window.firebase && window.firebase.auth) {
        window.firebase.auth().signOut().then(onSuccess).catch(onError);
        return;
      }

      /* ── 3. Dynamic import of modular SDK as last resort ── */
      var fbConfig = {
        apiKey: 'AIzaSyBnt9mbb8LdMVeguSHUmS20L6uBHIfxwAs',
        authDomain: 't1era-v2.firebaseapp.com',
        projectId: 't1era-v2',
        storageBucket: 't1era-v2.firebasestorage.app',
        messagingSenderId: '279266491659',
        appId: '1:279266491659:web:28a03c7b7300fcb152b60e'
      };
      Promise.all([
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js')
      ]).then(function (mods) {
        var appMod  = mods[0];
        var authMod = mods[1];
        var existingApps = appMod.getApps ? appMod.getApps() : [];
        var fbApp = existingApps.length > 0
          ? existingApps[0]
          : appMod.initializeApp(fbConfig);
        var auth = authMod.getAuth(fbApp);
        return authMod.signOut(auth);
      }).then(onSuccess).catch(onError);
    };

    /* Toast helper — only shows AFTER signout resolves */
    function _t1smSOToast(msg) {
      var old = document.getElementById('t1smSOToast');
      if (old && old.parentNode) old.parentNode.removeChild(old);
      var el = document.createElement('div');
      el.id = 't1smSOToast';
      el.className = 't1sm-signout-toast';
      var isErr = msg.indexOf('fail') !== -1 || msg.indexOf('error') !== -1;
      if (isErr) el.style.background = '#ef4444';
      el.innerHTML = (isErr
        ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
        : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
      ) + msg;
      document.body.appendChild(el);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { el.classList.add('show'); });
      });
    }

    /* 11. Auth watcher — show sign out btn only when authenticated.
           Polls window._sparkUser (set by spark-module.js onAuthStateChanged)
           and compat firebase.auth().currentUser. */
    (function watchAuthForSignOut() {
      var btn = document.getElementById('t1smSignOutBtn');
      if (!btn) return;
      function show() { btn.classList.add('visible'); }

      if (window._sparkUser) { show(); return; }

      var n = 0;
      var poll = setInterval(function () {
        n++;
        if (window._sparkUser) { show(); clearInterval(poll); return; }
        if (window.firebase && window.firebase.auth) {
          if (window.firebase.auth().currentUser) { show(); clearInterval(poll); return; }
        }
        if (n > 150) clearInterval(poll);
      }, 100);
    })();

    /* 9. Patch into spark-module.js applyComposeAvatar so the footer avatar
          stays in sync automatically — same timing, same data, zero duplication.
          Strategy: wrap window._t1eraUserPhoto/_t1eraUserInitial with a setter
          so whenever spark-module.js writes those globals we update the footer. */
    (function patchApplyComposeAvatar() {
      /* spark-module.js sets window._t1eraUserPhoto THEN calls applyComposeAvatar.
         We wrap applyComposeAvatar on window so we intercept every call. */
      var _origApply = window.applyComposeAvatar; /* may be undefined at this point */

      function _syncFooter() {
        var photo   = window._t1eraUserPhoto   || '';
        var initial = window._t1eraUserInitial || 'U';
        var ud      = window._sparkUserData    || {};
        var pref    = window._displayNamePref  || 'fullName';

        /* Resolve display name the same way spark-module.js does */
        var name = '';
        if (pref === 'nickname') {
          name = ud.nickname || ud.fullName || 'My Account';
        } else {
          name = ud.fullName || 'My Account';
        }
        var handle = ud.nickname || (ud.emailPrimary || '').split('@')[0] || 'user';

        if (typeof window.t1smUpdateProfile === 'function') {
          window.t1smUpdateProfile({
            photoURL: photo,
            name: name,
            handle: handle,
            _initial: initial,
          });
        }
      }

      /* Try to patch applyComposeAvatar if already defined */
      function _tryPatch() {
        if (typeof window.applyComposeAvatar === 'function' && !window.applyComposeAvatar._t1smPatched) {
          var orig = window.applyComposeAvatar;
          window.applyComposeAvatar = function (photoURL, initial) {
            orig(photoURL, initial);
            _syncFooter();
          };
          window.applyComposeAvatar._t1smPatched = true;
        }
      }

      /* Poll until spark-module.js has loaded and defined applyComposeAvatar.
         Stops after 10 seconds. Also handles the case where _t1eraUserPhoto
         is already set (spark-module loaded first). */
      var _pollCount = 0;
      var _poll = setInterval(function () {
        _tryPatch();
        _pollCount++;
        /* If photo globals already populated (module ran first), sync immediately */
        if (window._t1eraUserPhoto !== undefined || _pollCount > 100) {
          clearInterval(_poll);
          if (window._t1eraUserPhoto !== undefined) _syncFooter();
        }
      }, 100);
    })();
  }

  /* ── Open / close ── */
  function openMenu() {
    var panel  = document.getElementById('t1smPanel');
    var overlay = document.querySelector('.t1sm-overlay');
    if (!panel) return;
    panel.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    var panel  = document.getElementById('t1smPanel');
    var overlay = document.querySelector('.t1sm-overlay');
    if (!panel) return;
    panel.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    /* Collapse footer drawer so only the profile icon shows when panel minimises */
    var drawer  = document.getElementById('t1smFooterDrawer');
    var chevron = document.getElementById('t1smFooterChevron');
    if (drawer)  drawer.classList.remove('open');
    if (chevron) chevron.textContent = '▲';
  }

  /* ── Pane switcher — controls what shows in super-panel-1 ── */
  function switchT1Pane(pane) {
    /* show/hide the main T1ERA dashboard body */
    var wrap = document.getElementById('t1eraChatBody');
    var omniPc  = document.querySelector('.ai-omnibar-pc');
    var omniMob = document.getElementById('aiOmnibarMobile');

    /* remove any existing "coming soon" panes */
    document.querySelectorAll('.t1sm-pane').forEach(function (p) { p.remove(); });

    if (pane === 'chat') {
      if (wrap)    wrap.style.display = '';
      if (omniPc)  omniPc.style.display = '';
      if (omniMob) omniMob.style.display = '';
      return;
    }

    /* hide chat content */
    if (wrap)    wrap.style.display = 'none';
    if (omniPc)  omniPc.style.display = 'none';
    if (omniMob) omniMob.style.display = 'none';

    /* inject placeholder pane */
    var labels = {
      image: { emoji: '🎨', title: 'Generate Image', hint: 'AI image generation — coming soon' },
      video: { emoji: '🎬', title: 'Generate Video', hint: 'AI video generation — coming soon' },
      music: { emoji: '🎵', title: 'Generate Music', hint: 'AI music generation — coming soon' },
      voice: { emoji: '🎙️', title: 'Generate Voice', hint: 'AI voice synthesis — coming soon' },
    };
    var info = labels[pane] || { emoji: '⚡', title: pane, hint: 'Coming soon' };

    var div = document.createElement('div');
    div.className = 't1sm-pane t1sm-active t1sm-coming';
    div.innerHTML = '<div class="t1sm-ci">' + info.emoji + '</div>' +
      '<p>' + info.title + '</p>' +
      '<small>' + info.hint + '</small>';

    var panel1 = document.getElementById('super-panel-1');
    if (panel1) panel1.insertBefore(div, panel1.firstChild);
  }

  /* ── Reset to chat pane when user leaves T1ERA tab ── */
  var origSwitch = window.switchSuperTab;
  if (typeof origSwitch === 'function') {
    window.switchSuperTab = function (idx, btn) {
      origSwitch(idx, btn);
      if (idx !== 1) {
        /* restore chat pane state */
        document.querySelectorAll('.t1sm-pane').forEach(function (p) { p.remove(); });
        var wrap = document.getElementById('t1eraChatBody');
        var omniPc  = document.querySelector('.ai-omnibar-pc');
        var omniMob = document.getElementById('aiOmnibarMobile');
        if (wrap)    wrap.style.display = '';
        if (omniPc)  omniPc.style.display = '';
        if (omniMob) omniMob.style.display = '';
        /* reset nav active state */
        var nav = document.getElementById('t1smNav');
        if (nav) {
          nav.querySelectorAll('.t1sm-item').forEach(function (i) { i.classList.remove('active'); });
          var first = nav.querySelector('.t1sm-item[data-pane="chat"]');
          if (first) first.classList.add('active');
        }
        closeMenu();
      }
    };
  }

  /* ── Init ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildMenu);
  } else {
    buildMenu();
  }
})();
