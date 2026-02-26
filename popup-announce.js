/* ══════════════════════════════════════════
   T1ERA — ANNOUNCEMENT POPUP
   Shows on every page load / refresh.
   Image: assets/Blue and White Illustrative What is SWOT Poster.png
══════════════════════════════════════════ */
(function () {
  "use strict";

  const IMG_SRC =
    "assets/Blue and White Illustrative What is SWOT Poster.png";

  const style = document.createElement("style");
  style.textContent = `
    #ann-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      height: 100%;
      z-index: 9999;
      background: rgba(0, 0, 0, 0.78);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      box-sizing: border-box;
      margin: 0 !important;
      padding-bottom: 24px !important;
      opacity: 0;
      animation: ann-fadein 0.32s cubic-bezier(0.4,0,0.2,1) forwards;
    }
    @keyframes ann-fadein { to { opacity:1; } }
    @keyframes ann-fadeout { to { opacity:0; pointer-events:none; } }

    #ann-center {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      margin: auto;
      width: min(92vw, 520px);
    }

    #ann-popup {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      width: 100%;
      border: 2px solid rgba(194,24,91,0.55);
      border-radius: 16px;
      overflow: visible;
      box-shadow:
        0 0 0 1px rgba(255,255,255,0.06),
        0 8px 48px rgba(0,0,0,0.65),
        0 0 60px rgba(194,24,91,0.18);
      transform: scale(0.88) translateY(20px);
      animation: ann-pop 0.38s cubic-bezier(0.34,1.26,0.64,1) 0.06s forwards;
    }
    @keyframes ann-pop { to { transform: scale(1) translateY(0); } }

    #ann-img-wrap {
      display: block;
      width: 100%;
      border-radius: 14px;
      overflow: hidden;
      line-height: 0;
      background: #0a0a0a;
    }

    #ann-poster {
      display: block;
      width: 100%;
      height: auto;
      max-height: 80vh;
      object-fit: contain;
      border-radius: 14px;
    }

    #ann-close {
      position: absolute;
      top: -13px;
      right: -13px;
      z-index: 10001;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      border: 1.5px solid rgba(255,255,255,0.2);
      background: rgba(20,20,20,0.95);
      color: rgba(255,255,255,0.85);
      font-size: 15px;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 2px 12px rgba(0,0,0,0.55);
      transition: background 0.18s, border-color 0.18s, color 0.18s, transform 0.18s;
      padding: 0;
      font-family: sans-serif;
    }
    #ann-close:hover {
      background: rgba(194,24,91,0.85);
      border-color: rgba(194,24,91,0.9);
      color: #fff;
      transform: scale(1.15);
    }
    #ann-close:active { transform: scale(0.95); }

    #ann-hint {
      text-align: center;
      margin-top: 10px;
      font-family: "DM Sans", sans-serif;
      font-size: 11px;
      color: rgba(255,255,255,0.28);
      letter-spacing: 0.04em;
      user-select: none;
      pointer-events: none;
    }

    @media (max-width: 600px) {
      #ann-overlay {
        padding: 16px !important;
        padding-bottom: 16px !important;
        align-items: center !important;
        justify-content: center !important;
      }
      #ann-center {
        width: 94vw !important;
        margin: auto !important;
      }
      #ann-popup { border-radius: 12px; }
      #ann-img-wrap, #ann-poster {
        border-radius: 10px;
        max-height: 78vh;
      }
      #ann-close {
        width: 28px; height: 28px;
        top: -11px; right: -11px;
        font-size: 13px;
      }
    }
  `;
  document.head.appendChild(style);

  function buildPopup() {
    const overlay = document.createElement("div");
    overlay.id = "ann-overlay";

    /* centering wrapper */
    const center = document.createElement("div");
    center.id = "ann-center";

    const popup = document.createElement("div");
    popup.id = "ann-popup";
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-modal", "true");
    popup.setAttribute("aria-label", "Announcement");

    const closeBtn = document.createElement("button");
    closeBtn.id = "ann-close";
    closeBtn.setAttribute("aria-label", "Close announcement");
    closeBtn.innerHTML = "&#x2715;";

    const imgWrap = document.createElement("div");
    imgWrap.id = "ann-img-wrap";

    const img = document.createElement("img");
    img.id = "ann-poster";
    img.src = IMG_SRC;
    img.alt = "T1ERA Announcement";
    img.draggable = false;

    img.onerror = function () {
      imgWrap.innerHTML = `<div style="padding:40px 32px;text-align:center;color:rgba(255,255,255,0.4);font-family:'DM Sans',sans-serif;font-size:13px;min-width:260px;"><i class='ph-bold ph-image' style='font-size:40px;display:block;margin-bottom:10px;opacity:.3;'></i>Image not found.<br><span style='font-size:11px;opacity:.6;'>Place it in the <code>assets/</code> folder.</span></div>`;
    };

    const hint = document.createElement("p");
    hint.id = "ann-hint";
    hint.textContent = "Tap outside to close";

    imgWrap.appendChild(img);
    popup.appendChild(closeBtn);
    popup.appendChild(imgWrap);
    center.appendChild(popup);
    center.appendChild(hint);
    overlay.appendChild(center);
    document.body.appendChild(overlay);

    const _prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function dismissPopup() {
      document.body.style.overflow = _prevOverflow;
      overlay.style.animation = "ann-fadeout 0.22s ease forwards";
      overlay.addEventListener("animationend", () => overlay.remove(), { once: true });
    }

    closeBtn.addEventListener("click", (e) => { e.stopPropagation(); dismissPopup(); });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) dismissPopup(); });
    document.addEventListener("keydown", function escClose(e) {
      if (e.key === "Escape") { dismissPopup(); document.removeEventListener("keydown", escClose); }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildPopup);
  } else {
    buildPopup();
  }
})();
