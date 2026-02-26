/* ══════════════════════════════════════════
   T1ERA — ANNOUNCEMENT POPUP
   Shows on every page load / refresh.
   Image: assets/Blue and White Illustrative What is SWOT Poster.png
══════════════════════════════════════════ */
(function () {
  "use strict";

  const IMG_SRC =
    "assets/Blue and White Illustrative What is SWOT Poster.png";

  /* ── Inject styles ── */
  const style = document.createElement("style");
  style.textContent = `
    /* ── Overlay backdrop ── */
    #ann-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: rgba(0, 0, 0, 0.78);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      box-sizing: border-box;
      opacity: 0;
      animation: ann-fadein 0.32s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    }

    @keyframes ann-fadein {
      to { opacity: 1; }
    }

    @keyframes ann-fadeout {
      to { opacity: 0; pointer-events: none; }
    }

    /* ── Popup card ── */
    #ann-popup {
      position: relative;
      display: inline-flex;          /* shrink-wrap the image exactly */
      flex-direction: column;
      align-items: stretch;
      border: 2px solid rgba(194, 24, 91, 0.55);
      border-radius: 16px;
      overflow: visible;             /* so X button can overhang */
      box-shadow:
        0 0 0 1px rgba(255,255,255,0.06),
        0 8px 48px rgba(0,0,0,0.65),
        0 0 60px rgba(194,24,91,0.18);
      transform: scale(0.88) translateY(20px);
      animation: ann-pop 0.38s cubic-bezier(0.34, 1.26, 0.64, 1) 0.06s forwards;
      max-width: min(92vw, 540px);   /* responsive cap */
      max-height: min(90vh, 800px);
    }

    @keyframes ann-pop {
      to { transform: scale(1) translateY(0); }
    }

    /* ── Image wrapper — clips the image inside rounded corners ── */
    #ann-img-wrap {
      display: block;
      border-radius: 14px;
      overflow: hidden;
      line-height: 0;               /* kill inline-block gap */
      background: #0a0a0a;
    }

    #ann-poster {
      display: block;
      width: 100%;
      height: auto;
      max-height: min(85vh, 760px);
      object-fit: contain;
      border-radius: 14px;
    }

    /* ── Close button ── */
    #ann-close {
      position: absolute;
      top: -13px;
      right: -13px;
      z-index: 10001;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      border: 1.5px solid rgba(255, 255, 255, 0.2);
      background: rgba(20, 20, 20, 0.95);
      color: rgba(255, 255, 255, 0.85);
      font-size: 15px;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 2px 12px rgba(0,0,0,0.55);
      transition:
        background 0.18s ease,
        border-color 0.18s ease,
        color 0.18s ease,
        transform 0.18s ease;
      padding: 0;
      font-family: sans-serif;
    }

    #ann-close:hover {
      background: rgba(194, 24, 91, 0.85);
      border-color: rgba(194, 24, 91, 0.9);
      color: #fff;
      transform: scale(1.15);
    }

    #ann-close:active {
      transform: scale(0.95);
    }

    /* ── Tap-outside hint label (optional, subtle) ── */
    #ann-hint {
      text-align: center;
      margin-top: 10px;
      font-family: "DM Sans", sans-serif;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.28);
      letter-spacing: 0.04em;
      user-select: none;
      pointer-events: none;
    }

    /* ── Mobile tweaks ── */
    @media (max-width: 480px) {
      #ann-popup {
        max-width: 96vw;
        border-radius: 13px;
        border-width: 1.5px;
      }
      #ann-img-wrap,
      #ann-poster {
        border-radius: 11px;
      }
      #ann-close {
        width: 28px;
        height: 28px;
        top: -11px;
        right: -11px;
        font-size: 13px;
      }
    }
  `;
  document.head.appendChild(style);

  /* ── Build DOM ── */
  function buildPopup() {
    const overlay = document.createElement("div");
    overlay.id = "ann-overlay";

    const popup = document.createElement("div");
    popup.id = "ann-popup";
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-modal", "true");
    popup.setAttribute("aria-label", "Announcement");

    /* Close button */
    const closeBtn = document.createElement("button");
    closeBtn.id = "ann-close";
    closeBtn.setAttribute("aria-label", "Close announcement");
    closeBtn.innerHTML = "&#x2715;"; /* × */

    /* Image wrapper */
    const imgWrap = document.createElement("div");
    imgWrap.id = "ann-img-wrap";

    const img = document.createElement("img");
    img.id = "ann-poster";
    img.src = IMG_SRC;
    img.alt = "T1ERA Announcement";
    img.draggable = false;

    /* If image fails to load, show a fallback message */
    img.onerror = function () {
      imgWrap.innerHTML = `
        <div style="padding:40px 32px;text-align:center;color:rgba(255,255,255,0.4);font-family:'DM Sans',sans-serif;font-size:13px;min-width:260px;">
          <i class="ph-bold ph-image" style="font-size:40px;display:block;margin-bottom:10px;opacity:.3;"></i>
          Announcement image not found.<br>
          <span style="font-size:11px;opacity:.6;">Place your image in the <code>assets/</code> folder.</span>
        </div>`;
    };

    imgWrap.appendChild(img);
    popup.appendChild(closeBtn);
    popup.appendChild(imgWrap);
    overlay.appendChild(popup);

    /* ── Close hint ── */
    const hint = document.createElement("p");
    hint.id = "ann-hint";
    hint.textContent = "Tap outside to close";
    overlay.appendChild(hint);

    document.body.appendChild(overlay);

    /* ── Close logic ── */
    function dismissPopup() {
      overlay.style.animation = "ann-fadeout 0.22s ease forwards";
      overlay.addEventListener(
        "animationend",
        () => overlay.remove(),
        { once: true }
      );
    }

    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dismissPopup();
    });

    /* Click on backdrop (outside popup) closes it */
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) dismissPopup();
    });

    /* Keyboard: Escape to close */
    document.addEventListener("keydown", function escClose(e) {
      if (e.key === "Escape") {
        dismissPopup();
        document.removeEventListener("keydown", escClose);
      }
    });
  }

  /* ── Init: run after DOM is ready ── */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildPopup);
  } else {
    buildPopup();
  }
})();
