/* ══════════════════════════════════════════════════════
   T1ERA ATTACH MENU — t1era-attach-menu.js
   "+" button popup — tablet-style menu
   Options: File, Image, Office
   PC: hover effects / Mobile: touch-friendly
══════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ══════════════════════════════════════════════════
     STYLES
  ══════════════════════════════════════════════════ */
  var STYLE = `
    /* ── Backdrop ── */
    #t1amOverlay {
      position: fixed;
      inset: 0;
      z-index: 8000;
      background: rgba(0,0,0,0.55);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      display: flex;
      align-items: flex-end;
      justify-content: center;
      padding: 0 0 20px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
    }
    #t1amOverlay.open {
      opacity: 1;
      pointer-events: all;
    }

    /* ── Sheet — tablet app launcher style ── */
    #t1amSheet {
      width: 100%;
      max-width: 520px;
      background: linear-gradient(160deg, #141414 0%, #0e0e0e 100%);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 20px;
      padding: 0;
      overflow: hidden;
      box-shadow:
        0 -2px 0 rgba(255,255,255,0.04),
        0 32px 80px rgba(0,0,0,0.9),
        0 0 0 1px rgba(0,0,0,0.5);
      transform: translateY(24px);
      transition: transform 0.24s cubic-bezier(0.22,1,0.36,1);
    }
    #t1amOverlay.open #t1amSheet {
      transform: translateY(0);
    }

    /* ── Header ── */
    #t1amHeader {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 18px 0;
    }
    #t1amHeaderLeft {
      display: flex;
      align-items: center;
      gap: 9px;
    }
    .t1am-logo-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: linear-gradient(135deg, #c2185b, #8b5cf6);
      box-shadow: 0 0 8px rgba(194,24,91,0.6);
    }
    #t1amTitle {
      font-family: var(--f-display, 'Orbitron', sans-serif);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.45);
    }
    #t1amClose {
      width: 26px; height: 26px;
      border-radius: 50%;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.03);
      color: rgba(255,255,255,0.3);
      font-size: 12px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    #t1amClose:hover { background: rgba(255,255,255,0.08); color: #fff; }

    /* ── Grid of option cards ── */
    #t1amGrid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      padding: 14px 14px 18px;
    }

    /* ── Option card ── */
    .t1am-card {
      position: relative;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.07);
      background: rgba(255,255,255,0.03);
      padding: 16px 14px 14px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
      overflow: hidden;
      transition:
        border-color 0.2s,
        background 0.2s,
        transform 0.18s cubic-bezier(0.22,1,0.36,1),
        box-shadow 0.2s;
      -webkit-tap-highlight-color: transparent;
    }

    /* Glow accent bar at top */
    .t1am-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: var(--card-color, #8b5cf6);
      opacity: 0.5;
      transition: opacity 0.2s;
    }

    /* Subtle background radial on hover */
    .t1am-card::after {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at 30% 20%, var(--card-color, #8b5cf6) 0%, transparent 65%);
      opacity: 0;
      transition: opacity 0.25s;
      pointer-events: none;
    }

    .t1am-card:hover {
      border-color: color-mix(in srgb, var(--card-color, #8b5cf6) 40%, transparent);
      background: color-mix(in srgb, var(--card-color, #8b5cf6) 6%, #0e0e0e);
      transform: translateY(-2px);
      box-shadow: 0 8px 28px color-mix(in srgb, var(--card-color, #8b5cf6) 15%, transparent);
    }
    .t1am-card:hover::before { opacity: 1; }
    .t1am-card:hover::after  { opacity: 0.07; }
    .t1am-card:active { transform: translateY(0) scale(0.97); }

    /* ── Card icon ── */
    .t1am-icon {
      width: 36px; height: 36px;
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      font-size: 18px;
      background: color-mix(in srgb, var(--card-color, #8b5cf6) 14%, transparent);
      border: 1px solid color-mix(in srgb, var(--card-color, #8b5cf6) 25%, transparent);
      color: var(--card-color, #8b5cf6);
      flex-shrink: 0;
      transition: background 0.2s, transform 0.2s;
    }
    .t1am-card:hover .t1am-icon {
      background: color-mix(in srgb, var(--card-color, #8b5cf6) 22%, transparent);
      transform: scale(1.08);
    }

    /* ── Card label ── */
    .t1am-label {
      font-family: var(--f-display, 'Orbitron', sans-serif);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #fff;
      line-height: 1.2;
    }

    /* ── Card description ── */
    .t1am-desc {
      font-family: var(--f-body, sans-serif);
      font-size: 10px;
      color: rgba(255,255,255,0.38);
      line-height: 1.45;
      margin-top: -2px;
    }

    /* ── Badges row ── */
    .t1am-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 2px;
    }
    .t1am-badge {
      font-family: var(--f-mono, monospace);
      font-size: 7.5px;
      font-weight: 700;
      letter-spacing: 0.06em;
      padding: 2px 5px;
      border-radius: 4px;
      border: 1px solid color-mix(in srgb, var(--card-color, #8b5cf6) 30%, transparent);
      background: color-mix(in srgb, var(--card-color, #8b5cf6) 10%, transparent);
      color: var(--card-color, #8b5cf6);
    }

    /* ── Coming soon overlay ── */
    .t1am-card.soon {
      opacity: 0.5;
      cursor: default;
    }
    .t1am-card.soon:hover {
      transform: none;
      box-shadow: none;
      border-color: rgba(255,255,255,0.07);
      background: rgba(255,255,255,0.03);
    }
    .t1am-soon-tag {
      position: absolute;
      top: 8px; right: 8px;
      font-family: var(--f-mono, monospace);
      font-size: 7px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: rgba(255,255,255,0.3);
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 4px;
      padding: 2px 5px;
    }

    /* ── Hidden file input ── */
    #t1amFileInput,
    #t1amImageInput { display: none; }

    /* ── Mobile: 2 col on narrow ── */
    @media (max-width: 420px) {
      #t1amGrid {
        grid-template-columns: repeat(2, 1fr);
      }
      #t1amSheet {
        border-radius: 16px 16px 0 0;
        max-width: 100%;
      }
      #t1amOverlay {
        padding: 0;
        align-items: flex-end;
      }
    }
  `;

  /* ══════════════════════════════════════════════════
     HTML
  ══════════════════════════════════════════════════ */
  var HTML = `
    <div id="t1amOverlay" onclick="t1amBgClose(event)">
      <div id="t1amSheet">

        <div id="t1amHeader">
          <div id="t1amHeaderLeft">
            <div class="t1am-logo-dot"></div>
            <span id="t1amTitle">Add to message</span>
          </div>
          <button id="t1amClose" onclick="closeAttachMenu()">
            <i class="ph-bold ph-x"></i>
          </button>
        </div>

        <div id="t1amGrid">

          <!-- File -->
          <div class="t1am-card" style="--card-color:#8b5cf6"
               onclick="t1amPickFile()">
            <div class="t1am-icon">
              <i class="ph-bold ph-paperclip"></i>
            </div>
            <div class="t1am-label">File</div>
            <div class="t1am-desc">Upload any document or code file from your device</div>
            <div class="t1am-badges">
              <span class="t1am-badge">PDF</span>
              <span class="t1am-badge">TXT</span>
              <span class="t1am-badge">JS</span>
              <span class="t1am-badge">PY</span>
            </div>
          </div>

          <!-- Image -->
          <div class="t1am-card" style="--card-color:#e879f9"
               onclick="t1amPickImage()">
            <div class="t1am-icon">
              <i class="ph-bold ph-image"></i>
            </div>
            <div class="t1am-label">Image</div>
            <div class="t1am-desc">Share a photo, screenshot or visual reference</div>
            <div class="t1am-badges">
              <span class="t1am-badge">PNG</span>
              <span class="t1am-badge">JPG</span>
              <span class="t1am-badge">WEBP</span>
            </div>
          </div>

          <!-- Office -->
          <div class="t1am-card soon" style="--card-color:#f97316">
            <span class="t1am-soon-tag">SOON</span>
            <div class="t1am-icon">
              <i class="ph-bold ph-microsoft-word-logo"></i>
            </div>
            <div class="t1am-label">Office</div>
            <div class="t1am-desc">Attach Word, Excel or PowerPoint documents</div>
            <div class="t1am-badges">
              <span class="t1am-badge">DOCX</span>
              <span class="t1am-badge">XLSX</span>
              <span class="t1am-badge">PPTX</span>
            </div>
          </div>

        </div><!-- end grid -->

      </div><!-- end sheet -->
    </div><!-- end overlay -->

    <input type="file" id="t1amFileInput"
      accept=".txt,.md,.pdf,.js,.ts,.jsx,.tsx,.py,.rb,.go,.rs,.java,.kt,.swift,.c,.cpp,.cs,.php,.html,.css,.scss,.json,.yaml,.yml,.toml,.sql,.sh"
      onchange="t1amHandleFile(this)">

    <input type="file" id="t1amImageInput"
      accept="image/png,image/jpeg,image/webp,image/gif"
      onchange="t1amHandleImage(this)">
  `;

  /* ══════════════════════════════════════════════════
     INJECT
  ══════════════════════════════════════════════════ */
  function _inject() {
    var style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);

    var wrap = document.createElement("div");
    wrap.innerHTML = HTML;
    while (wrap.firstChild) {
      document.body.appendChild(wrap.firstChild);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _inject);
  } else {
    _inject();
  }

  /* ══════════════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════════════ */
  window.openAttachMenu = function () {
    var ov = document.getElementById("t1amOverlay");
    if (!ov) return;
    ov.classList.add("open");
    document.body.style.overflow = "hidden";
  };

  window.closeAttachMenu = function () {
    var ov = document.getElementById("t1amOverlay");
    if (!ov) return;
    ov.classList.remove("open");
    document.body.style.overflow = "";
  };

  window.t1amBgClose = function (e) {
    if (e.target.id === "t1amOverlay") window.closeAttachMenu();
  };

  window.t1amPickFile = function () {
    window.closeAttachMenu();
    var input = document.getElementById("t1amFileInput");
    if (input) { input.value = ""; input.click(); }
  };

  window.t1amPickImage = function () {
    window.closeAttachMenu();
    var input = document.getElementById("t1amImageInput");
    if (input) { input.value = ""; input.click(); }
  };

  /* ── File selected — read as text and create attachment card ── */
  window.t1amHandleFile = function (input) {
    var file = input.files && input.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function (e) {
      var content = e.target.result;
      // Detect active omnibar context
      var ctx = _activeCtx();
      // Inject into attachment system via t1eraChat internals
      if (typeof window._t1amInjectAttachment === "function") {
        window._t1amInjectAttachment(content, ctx, file.name);
      }
    };
    reader.readAsText(file);
  };

  /* ── Image selected — show preview card (placeholder for now) ── */
  window.t1amHandleImage = function (input) {
    var file = input.files && input.files[0];
    if (!file) return;

    var ctx = _activeCtx();
    var url = URL.createObjectURL(file);

    if (typeof window._t1amInjectImage === "function") {
      window._t1amInjectImage(url, file.name, ctx);
    }
  };

  /* ── Detect which omnibar is active (pc vs mob) ── */
  function _activeCtx() {
    var pcInput = document.getElementById("aiOmniInputPc");
    if (pcInput && window.getComputedStyle(pcInput).display !== "none") {
      return "pc";
    }
    return "mob";
  }

})();
