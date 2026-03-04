/* ══════════════════════════════════════════════════════
   T1ERA CARD PREVIEW — t1era-card-preview.js
   Click any attachment card → popup showing full content
   Header: filename/label, badges, line count
   Body: scrollable content with line numbers
══════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ── Inject styles ── */
  var STYLE = [
    "#t1cpOverlay {",
    "  position: fixed; inset: 0; z-index: 9000;",
    "  background: rgba(0,0,0,0.75);",
    "  backdrop-filter: blur(6px);",
    "  display: flex; align-items: center; justify-content: center;",
    "  padding: 16px; box-sizing: border-box;",
    "  opacity: 0; pointer-events: none;",
    "  transition: opacity 0.18s ease;",
    "}",
    "#t1cpOverlay.open { opacity: 1; pointer-events: all; }",

    "#t1cpSheet {",
    "  width: 100%; max-width: 640px;",
    "  max-height: 88vh;",
    "  background: #0f0f0f;",
    "  border: 1px solid rgba(255,255,255,0.09);",
    "  border-radius: 16px;",
    "  display: flex; flex-direction: column;",
    "  overflow: hidden;",
    "  box-shadow: 0 32px 80px rgba(0,0,0,0.8);",
    "  transform: translateY(16px) scale(0.98);",
    "  transition: transform 0.2s cubic-bezier(0.22,1,0.36,1);",
    "}",
    "#t1cpOverlay.open #t1cpSheet {",
    "  transform: translateY(0) scale(1);",
    "}",

    /* header */
    "#t1cpHeader {",
    "  display: flex; align-items: flex-start;",
    "  justify-content: space-between;",
    "  gap: 10px;",
    "  padding: 14px 14px 12px;",
    "  border-bottom: 1px solid rgba(255,255,255,0.07);",
    "  flex-shrink: 0;",
    "}",
    "#t1cpHeaderLeft {",
    "  display: flex; align-items: flex-start; gap: 10px; min-width: 0;",
    "}",
    "#t1cpIcon {",
    "  width: 32px; height: 32px; border-radius: 8px;",
    "  display: flex; align-items: center; justify-content: center;",
    "  font-size: 15px; flex-shrink: 0;",
    "  background: color-mix(in srgb, var(--t1cp-color, #8b5cf6) 14%, transparent);",
    "  border: 1px solid color-mix(in srgb, var(--t1cp-color, #8b5cf6) 28%, transparent);",
    "  color: var(--t1cp-color, #8b5cf6);",
    "}",
    "#t1cpMeta { display: flex; flex-direction: column; gap: 4px; min-width: 0; }",
    "#t1cpTitle {",
    "  font-family: var(--f-mono, monospace);",
    "  font-size: 13px; font-weight: 700;",
    "  color: #fff;",
    "  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;",
    "  max-width: 420px;",
    "}",
    "#t1cpStats {",
    "  display: flex; align-items: center; gap: 6px;",
    "  font-family: var(--f-mono, monospace);",
    "  font-size: 9px; color: rgba(255,255,255,0.35);",
    "  letter-spacing: 0.04em;",
    "}",
    "#t1cpStats i { font-size: 9px; opacity: 0.6; }",
    "#t1cpBadges { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }",
    ".t1cp-badge {",
    "  display: inline-flex; align-items: center;",
    "  padding: 2px 6px; border-radius: 4px;",
    "  font-size: 8px; font-family: var(--f-mono, monospace);",
    "  font-weight: 700; letter-spacing: 0.06em;",
    "  border: 1px solid;",
    "  background: color-mix(in srgb, var(--t1cp-color, #8b5cf6) 12%, transparent);",
    "  border-color: color-mix(in srgb, var(--t1cp-color, #8b5cf6) 30%, transparent);",
    "  color: var(--t1cp-color, #8b5cf6);",
    "}",
    ".t1cp-badge.cat {",
    "  --t1cp-color: #94a3b8;",
    "  font-weight: 500; letter-spacing: 0.03em;",
    "}",

    /* close button */
    "#t1cpClose {",
    "  width: 28px; height: 28px; border-radius: 50%;",
    "  border: 1px solid rgba(255,255,255,0.08);",
    "  background: none; color: rgba(255,255,255,0.3);",
    "  font-size: 13px; cursor: pointer; flex-shrink: 0;",
    "  display: flex; align-items: center; justify-content: center;",
    "  transition: background 0.15s, color 0.15s;",
    "}",
    "#t1cpClose:hover { background: rgba(255,255,255,0.07); color: #fff; }",

    /* content body */
    "#t1cpBody {",
    "  flex: 1; overflow-y: auto; overflow-x: auto;",
    "  padding: 0;",
    "  background: #0a0a0a;",
    "}",
    "#t1cpBody::-webkit-scrollbar { width: 4px; height: 4px; }",
    "#t1cpBody::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }",

    /* code table */
    "#t1cpCode {",
    "  width: 100%; border-collapse: collapse;",
    "  font-family: var(--f-mono, 'Fira Code', monospace);",
    "  font-size: 12px; line-height: 1.6;",
    "  tab-size: 2;",
    "}",
    ".t1cp-ln {",
    "  width: 1%; white-space: nowrap;",
    "  padding: 0 12px 0 14px;",
    "  text-align: right;",
    "  color: rgba(255,255,255,0.2);",
    "  user-select: none;",
    "  border-right: 1px solid rgba(255,255,255,0.05);",
    "  font-size: 10px;",
    "}",
    ".t1cp-line {",
    "  padding: 0 16px 0 12px;",
    "  color: rgba(255,255,255,0.82);",
    "  white-space: pre;",
    "}",
    "tr:first-child .t1cp-ln, tr:first-child .t1cp-line { padding-top: 12px; }",
    "tr:last-child  .t1cp-ln, tr:last-child  .t1cp-line  { padding-bottom: 12px; }",

    /* footer */
    "#t1cpFooter {",
    "  display: flex; align-items: center; justify-content: flex-end;",
    "  gap: 8px; padding: 10px 14px;",
    "  border-top: 1px solid rgba(255,255,255,0.07);",
    "  flex-shrink: 0;",
    "}",
    ".t1cp-btn {",
    "  display: flex; align-items: center; gap: 5px;",
    "  padding: 6px 12px; border-radius: 8px;",
    "  font-size: 11px; font-family: var(--f-mono, monospace);",
    "  font-weight: 600; letter-spacing: 0.04em;",
    "  cursor: pointer; border: 1px solid; transition: all 0.15s;",
    "}",
    ".t1cp-btn-copy {",
    "  background: rgba(139,92,246,0.1); border-color: rgba(139,92,246,0.25);",
    "  color: #8b5cf6;",
    "}",
    ".t1cp-btn-copy:hover { background: rgba(139,92,246,0.2); }",
    ".t1cp-btn-copy.copied { color: #10b981; border-color: rgba(16,185,129,0.3); background: rgba(16,185,129,0.1); }",
    ".t1cp-btn-remove {",
    "  background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.2);",
    "  color: rgba(239,68,68,0.7);",
    "}",
    ".t1cp-btn-remove:hover { background: rgba(239,68,68,0.15); color: #ef4444; }",

    "@media (max-width: 480px) {",
    "  #t1cpSheet { max-height: 92vh; border-radius: 12px; }",
    "  #t1cpTitle { max-width: 200px; }",
    "}",
  ].join("\n");

  /* ── HTML skeleton (content filled at open time) ── */
  var HTML = [
    '<div id="t1cpOverlay" onclick="t1cpBgClose(event)">',
    '  <div id="t1cpSheet">',
    '    <div id="t1cpHeader">',
    '      <div id="t1cpHeaderLeft">',
    '        <div id="t1cpIcon"><i id="t1cpIconI" class="ph-bold ph-file-code"></i></div>',
    '        <div id="t1cpMeta">',
    '          <div id="t1cpTitle">untitled</div>',
    '          <div id="t1cpStats">',
    '            <i class="ph-bold ph-rows"></i><span id="t1cpLineCount">0 lines</span>',
    '            &nbsp;·&nbsp;',
    '            <i class="ph-bold ph-text-aa"></i><span id="t1cpCharCount">0 chars</span>',
    '          </div>',
    '          <div id="t1cpBadges"></div>',
    '        </div>',
    '      </div>',
    '      <button id="t1cpClose" onclick="t1cpClose()" title="Close">',
    '        <i class="ph-bold ph-x"></i>',
    '      </button>',
    '    </div>',
    '    <div id="t1cpBody">',
    '      <table id="t1cpCode"></table>',
    '    </div>',
    '    <div id="t1cpFooter">',
    '      <button class="t1cp-btn t1cp-btn-copy" id="t1cpCopyBtn" onclick="t1cpCopyContent()">',
    '        <i class="ph-bold ph-copy"></i> Copy',
    '      </button>',
    '      <button class="t1cp-btn t1cp-btn-remove" id="t1cpRemoveBtn" onclick="t1cpRemoveFromPreview()">',
    '        <i class="ph-bold ph-trash"></i> Remove',
    '      </button>',
    '    </div>',
    '  </div>',
    '</div>',
  ].join("\n");

  /* ── Current open card state ── */
  var _currentId  = null;
  var _currentCtx = null;

  /* ── Inject on DOM ready ── */
  function _inject() {
    var style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);

    var wrap = document.createElement("div");
    wrap.innerHTML = HTML;
    document.body.appendChild(wrap.firstElementChild);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _inject);
  } else {
    _inject();
  }

  /* ══════════════════════════════════════════════════
     PUBLIC: open preview for a card
     Called by onclick on each .t1c-att-card
  ══════════════════════════════════════════════════ */
  window.t1cpOpen = function (id, ctx) {
    // Get attachment data from t1eraChat internals via exposed getter
    var att = _getAttachment(id);
    if (!att) return;

    _currentId  = id;
    _currentCtx = ctx;

    var overlay = document.getElementById("t1cpOverlay");
    var color   = att.color || "#8b5cf6";

    // ── Set CSS colour variable ──
    overlay.style.setProperty("--t1cp-color", color);
    document.getElementById("t1cpIcon").style.setProperty("--t1cp-color", color);

    // ── Icon ──
    document.getElementById("t1cpIconI").className = "ph-bold " + (att.icon || "ph-file-code");

    // ── Title ──
    document.getElementById("t1cpTitle").textContent = att.filename || att.label || "Snippet";

    // ── Stats ──
    var lines = att.content.split("\n").length;
    var chars = att.content.length;
    document.getElementById("t1cpLineCount").textContent = lines + " lines";
    document.getElementById("t1cpCharCount").textContent = chars < 1000 ? chars + " chars" : (chars/1000).toFixed(1) + "k chars";

    // ── Badges ──
    var badgesEl = document.getElementById("t1cpBadges");
    badgesEl.innerHTML =
      '<span class="t1cp-badge" style="--t1cp-color:' + color + '">' + (att.ext || att.type || "txt").toUpperCase() + "</span>" +
      '<span class="t1cp-badge cat">' + (att.category || "Text") + "</span>";

    // ── Code body with line numbers ──
    var codeEl  = document.getElementById("t1cpCode");
    var lineArr = att.content.split("\n");
    var rows    = lineArr.map(function (line, i) {
      return "<tr>" +
        '<td class="t1cp-ln">' + (i + 1) + "</td>" +
        '<td class="t1cp-line">' + _escHtml(line) + "</td>" +
        "</tr>";
    }).join("");
    codeEl.innerHTML = rows;

    // ── Reset copy button ──
    var copyBtn = document.getElementById("t1cpCopyBtn");
    copyBtn.className = "t1cp-btn t1cp-btn-copy";
    copyBtn.innerHTML = '<i class="ph-bold ph-copy"></i> Copy';

    // ── Open ──
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
  };

  window.t1cpClose = function () {
    var overlay = document.getElementById("t1cpOverlay");
    if (overlay) overlay.classList.remove("open");
    document.body.style.overflow = "";
    _currentId  = null;
    _currentCtx = null;
  };

  window.t1cpBgClose = function (e) {
    if (e.target.id === "t1cpOverlay") window.t1cpClose();
  };

  window.t1cpCopyContent = function () {
    var att = _getAttachment(_currentId);
    if (!att) return;
    navigator.clipboard.writeText(att.content).then(function () {
      var btn = document.getElementById("t1cpCopyBtn");
      btn.className = "t1cp-btn t1cp-btn-copy copied";
      btn.innerHTML = '<i class="ph-bold ph-check"></i> Copied';
      setTimeout(function () {
        btn.className = "t1cp-btn t1cp-btn-copy";
        btn.innerHTML = '<i class="ph-bold ph-copy"></i> Copy';
      }, 2000);
    });
  };

  window.t1cpRemoveFromPreview = function () {
    if (_currentId && _currentCtx) {
      var id  = _currentId;
      var ctx = _currentCtx;
      window.t1cpClose();
      // Small delay so close animation plays first
      setTimeout(function () {
        if (typeof window.t1cRemoveAttachment === "function") {
          window.t1cRemoveAttachment(id, ctx);
        }
      }, 120);
    }
  };

  /* ── Get attachment data from t1eraChat's internal list ── */
  function _getAttachment(id) {
    // t1eraChat exposes attachments via window.t1eraAttachments (we add this getter below)
    var list = window.t1eraAttachments ? window.t1eraAttachments() : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function _escHtml(str) {
    return (str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

})();
