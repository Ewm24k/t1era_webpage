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
    .t1sm-overlay.open { opacity: 1; pointer-events: all; }

    /* ── Side panel ── */
    .t1sm-panel {
      position: fixed;
      top: 0; left: 0;
      width: 72px;           /* icon-only width */
      max-width: 280px;
      height: 100dvh;
      background: linear-gradient(160deg,#0d0d14 0%,#121220 100%);
      border-right: 1px solid rgba(255,255,255,0.07);
      box-shadow: 4px 0 40px rgba(0,0,0,0.6);
      z-index: 1201;
      transform: translateX(-100%);
      transition: transform 0.3s cubic-bezier(0.4,0,0.2,1), width 0.28s ease;
      display: flex; flex-direction: column;
      overflow: hidden;
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
    }
    .t1sm-nav::-webkit-scrollbar { display: none; }

    .t1sm-item {
      display: flex; align-items: center; gap: 14px;
      padding: 11px 20px;
      cursor: pointer; border: none; background: transparent;
      width: 100%; text-align: left;
      color: var(--text-2, #888);
      border-radius: 0;
      transition: background 0.18s, color 0.18s;
      position: relative;
      text-decoration: none;
      white-space: nowrap;
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
    `;
    document.body.appendChild(panel);

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
