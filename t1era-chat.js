/* ══════════════════════════════════════════════════════
   T1ERA CHAT HANDLER — t1era-chat.js
   Handles: clear body → inject conversation stream
   Demo mode: responds to any message with a mock reply
   Later: replace _getAiResponse() with real API call
══════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ── State ── */
  var _chatActive = false;
  var _activeModel = "T1x.V1.1";
  var _msgCount = 0;
  var _copyToastTimer = null;

  /* ── Paste attachment state ── */
  var _attachments = []; // [{id, label, content, type, ctx}]
  var _attachIdCounter = 0;

  /* ── DOM refs (resolved lazily on first send) ── */
  var _wrap = null;  // #t1eraChatBody
  var _convo = null; // #t1eraConversation

  /* ══════════════════════════════════════════════════
     PUBLIC API — called by aiOmnibarSend in spark22
  ══════════════════════════════════════════════════ */
  window.t1eraChat = {
    send: handleSend,
    setModel: function (m) { _activeModel = m; },
    clear: clearChat,
  };

  /* ══════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════ */
  function _init() {
    var origSetActive = window.setActiveModel;
    window.setActiveModel = function (modelId) {
      if (typeof origSetActive === "function") origSetActive(modelId);
      _activeModel = modelId || "T1x.V1.1";
    };

    if (!document.getElementById("t1cCopyToast")) {
      var toast = document.createElement("div");
      toast.id = "t1cCopyToast";
      toast.className = "t1c-copy-toast";
      toast.textContent = "Copied to clipboard";
      document.body.appendChild(toast);
    }

    // Upgrade both omnibar inputs
    _upgradeOmnibar("pc");
    _upgradeOmnibar("mob");
  }

  // Run immediately if DOM already ready (scripts load after DOMContentLoaded
  // when placed at bottom of <body>), otherwise wait for the event
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _init);
  } else {
    _init();
  }

  /* ══════════════════════════════════════════════════
     UPGRADE OMNIBAR — swap <input> to <textarea>
     inject attachment tray OUTSIDE omnibar box,
     wire immediate paste-to-card on length threshold
  ══════════════════════════════════════════════════ */
  function _upgradeOmnibar(ctx) {
    var inputId    = ctx === "mob" ? "aiOmniInputMob"    : "aiOmniInputPc";
    var omnibarId  = ctx === "mob" ? "aiOmnibarMobile"   : null;
    var panelId    = ctx === "mob" ? null                : "super-panel-1";

    var input = document.getElementById(inputId);
    if (!input) return;

    // ── Swap <input> for auto-grow <textarea> ──
    var ta = document.createElement("textarea");
    ta.id           = inputId;
    ta.className    = input.className + " t1c-omni-ta";
    ta.placeholder  = input.placeholder;
    ta.autocomplete = "off";
    ta.rows         = 1;
    input.parentNode.replaceChild(ta, input);

    ta.addEventListener("input", function () {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
    });

    ta.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        window.aiOmnibarSend(ctx);
      }
    });

    // ── PASTE: intercept immediately on length — no delay ──
    ta.addEventListener("paste", function (e) {
      var pasted = (e.clipboardData || window.clipboardData).getData("text");
      // Instant threshold: >80 chars or contains newline → card. No format detection needed first.
      if (pasted && (pasted.length > 80 || pasted.indexOf("\n") !== -1)) {
        e.preventDefault();
        e.stopPropagation();
        _addAttachment(pasted, ctx);
      }
      // Under 80 chars, single line → goes into textarea normally
    });

    // ── Inject tray ──
    // PC:  inject BEFORE .ai-omnibar-pc, inside super-panel-1
    // Mob: inject BEFORE .ai-omnibar-input-row, inside .ai-omnibar-mobile
    var tray = document.createElement("div");
    tray.id        = "t1cTray_" + ctx;
    tray.className = "t1c-attach-tray";
    tray.style.display = "none";

    if (ctx === "pc") {
      // Place tray inside super-panel-1, directly before .ai-omnibar-pc
      var panel = document.getElementById("super-panel-1");
      var omniPc = panel ? panel.querySelector(".ai-omnibar-pc") : null;
      if (omniPc && panel) {
        panel.insertBefore(tray, omniPc);
      } else {
        // fallback: before the inner row
        ta.parentNode.parentNode.insertBefore(tray, ta.parentNode);
      }
    } else {
      // Mobile: tray goes inside .ai-omnibar-mobile, before .ai-omnibar-input-row
      var omniMob = document.getElementById("aiOmnibarMobile");
      var inputRow = omniMob ? omniMob.querySelector(".ai-omnibar-input-row") : null;
      if (omniMob && inputRow) {
        omniMob.insertBefore(tray, inputRow);
      } else {
        ta.parentNode.parentNode.insertBefore(tray, ta.parentNode);
      }
    }
  }

  /* ── Should this paste become an attachment card? ── */
  function _shouldAttach(text) {
    if (!text) return false;
    var trimmed = text.trim();
    var looksLikeCode =
      /[`{};]/.test(trimmed) ||
      /^\s{2,}/m.test(trimmed) ||
      /\n.*\n/.test(trimmed);
    var isLong = trimmed.length > 120;
    return isLong || looksLikeCode;
  }

  /* ── Add an attachment card ── */
  function _addAttachment(content, ctx) {
    _attachIdCounter++;
    var id      = "t1cAtt_" + _attachIdCounter;
    var info;
    try { info = _detectFormat(content); } catch(e) { info = _fmt("txt", null); }
    if (!info) info = _fmt("txt", null);
    var lines   = _lineCount(content);
    var chars   = content.length;

    _attachments.push({ id: id, label: info.label, content: content, type: info.format, ctx: ctx });

    var tray = document.getElementById("t1cTray_" + ctx);
    if (!tray) return;

    var card = document.createElement("div");
    card.className = "t1c-att-card";
    card.id = id;
    card.setAttribute("data-format", info.format);

    // Badge(s): extension + category
    var badgesHtml =
      '<span class="t1c-fmt-badge" style="--fmt-color:' + info.color + '">' + info.ext.toUpperCase() + '</span>' +
      '<span class="t1c-fmt-badge t1c-fmt-cat">' + info.category + '</span>';

    card.innerHTML =
      '<div class="t1c-att-icon" style="--fmt-color:' + info.color + '">' +
        '<i class="ph-bold ' + info.icon + '"></i>' +
      '</div>' +
      '<div class="t1c-att-info">' +
        // Row 1: filename / label
        '<span class="t1c-att-label">' + _escHtml(info.filename || info.label) + '</span>' +
        // Row 2: line count + char count
        '<span class="t1c-att-meta">' +
          '<i class="ph-bold ph-rows"></i> ' + lines + ' lines' +
          ' &nbsp;·&nbsp; ' +
          '<i class="ph-bold ph-text-aa"></i> ' + _formatSize(chars) +
        '</span>' +
        // Row 3: format badges
        '<div class="t1c-att-badges">' + badgesHtml + '</div>' +
      '</div>' +
      '<button class="t1c-att-remove" title="Remove" ' +
        'onclick="window.t1cRemoveAttachment(\'' + id + '\',\'' + ctx + '\')">' +
        '<i class="ph-bold ph-x"></i>' +
      '</button>';

    tray.appendChild(card);
    _rebalanceCards(tray);
  }

  /* ── Remove a card ── */
  window.t1cRemoveAttachment = function (id, ctx) {
    _attachments = _attachments.filter(function (a) { return a.id !== id; });
    var card = document.getElementById(id);
    if (card) {
      card.style.opacity = "0";
      card.style.transform = "scale(0.88)";
      setTimeout(function () {
        if (card.parentNode) card.parentNode.removeChild(card);
        var tray = document.getElementById("t1cTray_" + ctx);
        if (tray) _rebalanceCards(tray);
      }, 180);
    }
  };

  /* ── Rebalance card sizes and push omnibar up ── */
  function _rebalanceCards(tray) {
    var cards = tray.querySelectorAll(".t1c-att-card");
    var count = cards.length;
    var cls = count === 1 ? "size-1" : count === 2 ? "size-2" : "size-3";
    cards.forEach(function (c) {
      c.classList.remove("size-1", "size-2", "size-3");
      if (count > 0) c.classList.add(cls);
    });
    tray.style.display = count > 0 ? "flex" : "none";

    // PC: push .ai-omnibar-pc up by the tray height so tray sits above it
    if (tray.id === "t1cTray_pc") {
      var omniPc = document.querySelector(".ai-omnibar-pc");
      if (omniPc) {
        var h = count > 0 ? (tray.offsetHeight || 60) : 0;
        omniPc.style.bottom = h + "px";
        tray.style.bottom = omniPc.offsetHeight + "px";
      }
    }
  }

  /* ══════════════════════════════════════════════════
     FORMAT DETECTION ENGINE
     Detects language / file format from pasted content.
     Returns: { format, ext, category, icon, color, label, filename }
  ══════════════════════════════════════════════════ */
  function _detectFormat(text) {
    var t = text.trim();
    var firstLine = t.split("\n")[0].trim();

    // ── Try to extract a filename from the first line ──
    var filename = null;
    var fnMatch = firstLine.match(/^[#\/\*\-–]?\s*([\w\-. ]+\.([a-zA-Z0-9]{1,10}))\s*$/);
    if (fnMatch) filename = fnMatch[1].trim();

    // ── Shebang detection ──
    if (/^#!\/usr\/bin\/env\s+(python|python3)/i.test(t)) return _fmt("python",  filename);
    if (/^#!\/usr\/bin\/env\s+node/i.test(t))            return _fmt("js",      filename);
    if (/^#!\/bin\/(bash|sh|zsh)/i.test(t))               return _fmt("shell",   filename);

    // ── Markdown ──
    if (/^#{1,6}\s/.test(t) && /\n#{1,6}\s/.test(t))     return _fmt("md",      filename);
    if (/^#{1,6}\s/.test(t) && t.length < 2000)            return _fmt("md",      filename);

    // ── HTML / XML / SVG ──
    if (/^<!DOCTYPE\s+html/i.test(t))                      return _fmt("html",    filename);
    if (/^<html/i.test(t) || /<\/html>/i.test(t))          return _fmt("html",    filename);
    if (/^<svg/i.test(t))                                    return _fmt("svg",     filename);
    if (/^<\?xml/i.test(t))                                 return _fmt("xml",     filename);
    if (/<[a-z][^>]*>[\s\S]*?<\/[a-z]+>/.test(t))              return _fmt("html",    filename);

    // ── JSON ──
    if (/^[\[{]/.test(t)) {
      try { JSON.parse(t); return _fmt("json", filename); } catch(e) {}
    }

    // ── YAML ──
    if (/^---\n/.test(t) || /^[a-zA-Z_]+:\s+\S/.test(t) && /\n[a-zA-Z_]+:\s+/.test(t))
      return _fmt("yaml", filename);

    // ── TOML ──
    if (/^\[[A-Za-z]/.test(t) && /\n[a-zA-Z_]+ ?=/.test(t))
      return _fmt("toml", filename);

    // ── CSS / SCSS / LESS ──
    if (/[a-z#.][^{]*\{[\s\S]*?:[\s\S]*?\}/.test(t) && !/function|=>/.test(t)) {
      if (t.includes("$") && /\$[a-z-]+:/.test(t))        return _fmt("scss",    filename);
      if (t.includes("@") && /@[a-z]+\s*\(/.test(t))      return _fmt("less",    filename);
      return _fmt("css", filename);
    }

    // ── Python ──
    if (/^(import |from |def |class |async def |@[a-z])/m.test(t) &&
        !/function |const |let |var /.test(t))              return _fmt("python",  filename);
    if (/:\s*\n\s+(return|pass|raise|yield|print)/m.test(t)) return _fmt("python", filename);

    // ── TypeScript (before JS — more specific) ──
    if (/(interface |type [A-Z]|: string|: number|: boolean|<T>|as [A-Z])/.test(t))
      return _fmt("ts", filename);

    // ── JavaScript ──
    if (/(function |const |let |var |=>|require\(|module\.exports|import .* from)/.test(t))
      return _fmt("js", filename);

    // ── JSX / TSX ──
    if (/return \(\s*<|React\.createElement|<\/[A-Z]/.test(t))
      return _fmt("jsx", filename);

    // ── PHP ──
    if (/^<\?php/i.test(t) || /\$[a-z_]+\s*=/.test(t) && /echo |->/.test(t))
      return _fmt("php", filename);

    // ── Ruby ──
    if (/^(require |def |class |module |end$)/m.test(t) && !/(function|const)/.test(t))
      return _fmt("ruby", filename);

    // ── Go ──
    if (/^package [a-z]|func [A-Za-z]|:= |var [a-z]/.test(t))
      return _fmt("go", filename);

    // ── Rust ──
    if (/fn [a-z]|let mut |use std::|impl [A-Z]|pub fn/.test(t))
      return _fmt("rust", filename);

    // ── Java / Kotlin ──
    if (/public (class|static|void)|System\.out\.println/.test(t))
      return _fmt("java", filename);
    if (/^fun [a-z]|val [a-z]|var [a-z].*=|data class/.test(t))
      return _fmt("kotlin", filename);

    // ── C / C++ ──
    if (/#include\s*[<"]/.test(t))
      return /class |std::|cout|cin/.test(t) ? _fmt("cpp", filename) : _fmt("c", filename);

    // ── C# ──
    if (/using System|namespace [A-Z]|public class/.test(t))
      return _fmt("cs", filename);

    // ── Swift ──
    if (/import (Foundation|UIKit|SwiftUI)|func [a-z]|var [a-z].*: [A-Z]/.test(t))
      return _fmt("swift", filename);

    // ── Kotlin ──
    if (/fun [a-z]|data class|companion object/.test(t))
      return _fmt("kotlin", filename);

    // ── Dart / Flutter ──
    if (/void main\(\)|Widget build|StatelessWidget|import 'package:/.test(t))
      return _fmt("dart", filename);

    // ── SQL ──
    if (/(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE|DROP|ALTER)/i.test(t) &&
        /(FROM|WHERE|INTO|SET|VALUES)/i.test(t))            return _fmt("sql", filename);

    // ── Shell / Bash ──
    if (/(echo |grep |awk |sed |chmod |mkdir |export |source )/.test(t))
      return _fmt("shell", filename);

    // ── Dockerfile ──
    if (/^FROM [a-z]/im.test(t) && /(RUN |CMD |EXPOSE |ENV )/m.test(t))
      return _fmt("docker", filename);

    // ── GraphQL ──
    if (/^(query|mutation|subscription|type [A-Z]|schema) \{/m.test(t))
      return _fmt("graphql", filename);

    // ── Regex / config-like ──
    if (/^\[.*\]\s*$/m.test(t) && /^[a-z_]+ ?=/m.test(t))
      return _fmt("ini", filename);

    // ── Plain text / prose ──
    return _fmt("txt", filename);
  }

  /* ── Format definition lookup ──
     Returns full descriptor object for a given ext string
  ── */
  var _FMT_MAP = {
    // Web
    html:    { ext:"html",    category:"Web",      icon:"ph-file-html",         color:"#f97316" },
    css:     { ext:"css",     category:"Web",      icon:"ph-file-css",          color:"#38bdf8" },
    scss:    { ext:"scss",    category:"Web",      icon:"ph-file-css",          color:"#c084fc" },
    less:    { ext:"less",    category:"Web",      icon:"ph-file-css",          color:"#1d4ed8" },
    svg:     { ext:"svg",     category:"Web",      icon:"ph-file-svg",          color:"#fb923c" },
    jsx:     { ext:"jsx",     category:"Web",      icon:"ph-file-jsx",          color:"#38bdf8" },
    // Scripts
    js:      { ext:"js",     category:"Script",   icon:"ph-file-js",           color:"#facc15" },
    ts:      { ext:"ts",     category:"Script",   icon:"ph-file-ts",           color:"#60a5fa" },
    tsx:     { ext:"tsx",    category:"Script",   icon:"ph-file-ts",           color:"#60a5fa" },
    python:  { ext:"py",     category:"Script",   icon:"ph-file-py",           color:"#4ade80" },
    ruby:    { ext:"rb",     category:"Script",   icon:"ph-file-code",         color:"#f87171" },
    php:     { ext:"php",    category:"Script",   icon:"ph-file-php",          color:"#818cf8" },
    shell:   { ext:"sh",     category:"Script",   icon:"ph-terminal-window",   color:"#a3e635" },
    // Systems
    c:       { ext:"c",      category:"Systems",  icon:"ph-file-c",            color:"#60a5fa" },
    cpp:     { ext:"cpp",    category:"Systems",  icon:"ph-file-cpp",          color:"#818cf8" },
    cs:      { ext:"cs",     category:"Systems",  icon:"ph-file-cs",           color:"#a78bfa" },
    go:      { ext:"go",     category:"Systems",  icon:"ph-file-code",         color:"#34d399" },
    rust:    { ext:"rs",     category:"Systems",  icon:"ph-file-code",         color:"#fb923c" },
    java:    { ext:"java",   category:"Systems",  icon:"ph-file-code",         color:"#fb923c" },
    kotlin:  { ext:"kt",     category:"Systems",  icon:"ph-file-code",         color:"#a78bfa" },
    swift:   { ext:"swift",  category:"Systems",  icon:"ph-file-code",         color:"#f97316" },
    dart:    { ext:"dart",   category:"Systems",  icon:"ph-file-code",         color:"#38bdf8" },
    // Data
    json:    { ext:"json",   category:"Data",     icon:"ph-file-code",         color:"#fbbf24" },
    yaml:    { ext:"yaml",   category:"Data",     icon:"ph-file-code",         color:"#34d399" },
    toml:    { ext:"toml",   category:"Data",     icon:"ph-file-code",         color:"#f87171" },
    xml:     { ext:"xml",    category:"Data",     icon:"ph-file-code",         color:"#fb923c" },
    ini:     { ext:"ini",    category:"Config",   icon:"ph-gear-six",          color:"#94a3b8" },
    sql:     { ext:"sql",    category:"Database", icon:"ph-database",          color:"#38bdf8" },
    graphql: { ext:"gql",    category:"API",      icon:"ph-graph",             color:"#e879f9" },
    // Docs
    md:      { ext:"md",     category:"Docs",     icon:"ph-file-md",           color:"#e2e8f0" },
    txt:     { ext:"txt",    category:"Text",     icon:"ph-file-text",         color:"#94a3b8" },
    // Other
    docker:  { ext:"docker", category:"DevOps",   icon:"ph-cube",              color:"#38bdf8" },
  };

  function _fmt(key, filename) {
    var def = _FMT_MAP[key] || _FMT_MAP["txt"];
    var label = filename
      ? filename.replace(/\.[^.]+$/, "")  // strip extension for label
      : (def.category + " snippet");
    return {
      format:   key,
      ext:      def.ext,
      category: def.category,
      icon:     def.icon,
      color:    def.color,
      label:    label,
      filename: filename || null,
    };
  }

  function _makeLabel(content, type) {
    var first = content.trim().split("\n")[0].slice(0, 36).trim();
    return first || (type === "code" ? "Code snippet" : "Long text");
  }

  function _lineCount(str) {
    return str.split("\n").length;
  }

  function _formatSize(chars) {
    if (chars < 1000) return chars + " chars";
    return (chars / 1000).toFixed(1) + "k chars";
  }

  /* ══════════════════════════════════════════════════
     HANDLE SEND — entry point
  ══════════════════════════════════════════════════ */
  function handleSend(text, ctx) {
    if (!text || !text.trim()) return;
    text = text.trim();

    // Also gather any attachments for this ctx
    var ctxAttachments = _attachments.filter(function (a) { return a.ctx === ctx; });

    // First message — activate chat mode
    if (!_chatActive) {
      _activateChatMode();
    }

    _msgCount++;

    // Build full message: attachments first, then typed text
    var fullText = "";
    if (ctxAttachments.length > 0) {
      ctxAttachments.forEach(function (att) {
        fullText += "[" + att.type.toUpperCase() + ": " + att.label + "]\n" + att.content + "\n\n";
      });
    }
    fullText += text;

    // Clear attachments for this ctx
    ctxAttachments.forEach(function (att) {
      window.t1cRemoveAttachment(att.id, ctx);
    });
    _attachments = _attachments.filter(function (a) { return a.ctx !== ctx; });

    // Reset textarea height
    var taId = ctx === "mob" ? "aiOmniInputMob" : "aiOmniInputPc";
    var ta = document.getElementById(taId);
    if (ta) { ta.style.height = ""; ta.value = ""; }

    // Render user bubble
    appendMessage({ role: "user", text: fullText, attachCount: ctxAttachments.length });

    _scrollToBottom();

    var loadingId = "t1cLoad_" + _msgCount;
    appendLoading(loadingId);
    _scrollToBottom();

    setTimeout(function () {
      removeLoading(loadingId);
      var reply = _getAiResponse(text);
      appendMessage({ role: "ai", text: reply, model: _activeModel });
      _scrollToBottom();
    }, 900 + Math.random() * 400);
  }

  /* ══════════════════════════════════════════════════
     ACTIVATE CHAT MODE
  ══════════════════════════════════════════════════ */
  function _activateChatMode() {
    _chatActive = true;
    _wrap = document.getElementById("t1eraChatBody");
    if (!_wrap) return;

    _wrap.innerHTML = "";
    _wrap.classList.add("chat-active");

    var notice = document.createElement("div");
    notice.className = "t1c-clear-notice";
    notice.innerHTML =
      '<div class="t1c-clear-icon"><i class="ph-bold ph-chat-teardrop-dots"></i></div>' +
      '<div class="t1c-clear-label">New session started</div>';
    _wrap.appendChild(notice);

    _convo = document.createElement("div");
    _convo.id = "t1eraConversation";
    _wrap.appendChild(_convo);
  }

  /* ══════════════════════════════════════════════════
     CLEAR CHAT
  ══════════════════════════════════════════════════ */
  function clearChat() {
    _chatActive = false;
    _msgCount = 0;
    var wrap = document.getElementById("t1eraChatBody");
    if (wrap) wrap.classList.remove("chat-active");
    _wrap = null;
    _convo = null;
  }

  /* ══════════════════════════════════════════════════
     APPEND MESSAGE BUBBLE
  ══════════════════════════════════════════════════ */
  function appendMessage(opts) {
    if (!_convo) return;

    var role = opts.role;
    var text = opts.text;
    var model = opts.model || _activeModel;
    var attachCount = opts.attachCount || 0;
    var now = _formatTime();
    var uid = "t1cMsg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);

    var avatarContent = role === "user" ? (window._currentUserInitial || "U") : "\u26a1";
    var senderLabel = role === "user" ? "YOU" : "T1ERA AI";
    var modelTag = role === "ai"
      ? '<span class="t1c-model-tag">' + _escHtml(model) + "</span>"
      : "";

    // Attachment badge for user messages
    var attachBadge = (role === "user" && attachCount > 0)
      ? '<span class="t1c-attach-badge"><i class="ph-bold ph-paperclip"></i> ' + attachCount + " attachment" + (attachCount > 1 ? "s" : "") + "</span>"
      : "";

    var row = document.createElement("div");
    row.className = "t1c-row t1c-" + role;
    row.id = uid;

    row.innerHTML =
      '<div class="t1c-card">' +
      '<div class="t1c-header">' +
      '<div class="t1c-header-left">' +
      '<div class="t1c-avatar">' + avatarContent + "</div>" +
      '<span class="t1c-sender">' + senderLabel + "</span>" +
      modelTag + attachBadge +
      "</div>" +
      '<span class="t1c-timestamp">' + now + "</span>" +
      "</div>" +
      '<div class="t1c-body" id="' + uid + '_body">' +
      _formatText(_escHtml(text)) +
      "</div>" +
      '<div class="t1c-footer">' +
      '<span class="t1c-timestamp">\u21a9 ' + _wordCount(text) + " words</span>" +
      '<div class="t1c-actions">' +
      '<button class="t1c-action-btn" title="Copy to clipboard" onclick="window.t1cCopy(this,\'' +
      uid + "_body')\">" +
      '<i class="ph-bold ph-copy"></i>' +
      "</button>" +
      "</div>" +
      "</div>" +
      "</div>";

    _convo.appendChild(row);
  }

  /* ══════════════════════════════════════════════════
     APPEND LOADING INDICATOR
  ══════════════════════════════════════════════════ */
  function appendLoading(id) {
    if (!_convo) return;

    var row = document.createElement("div");
    row.className = "t1c-row t1c-ai t1c-loading";
    row.id = id;

    row.innerHTML =
      '<div class="t1c-card">' +
      '<div class="t1c-header">' +
      '<div class="t1c-header-left">' +
      '<div class="t1c-avatar">\u26a1</div>' +
      '<span class="t1c-sender" style="color:var(--purple)">T1ERA AI</span>' +
      '<span class="t1c-model-tag">' + _escHtml(_activeModel) + "</span>" +
      "</div>" +
      '<span class="t1c-timestamp">thinking\u2026</span>' +
      "</div>" +
      '<div class="t1c-body">' +
      '<div class="t1c-dot"></div>' +
      '<div class="t1c-dot"></div>' +
      '<div class="t1c-dot"></div>' +
      "</div>" +
      "</div>";

    _convo.appendChild(row);
  }

  function removeLoading(id) {
    var el = document.getElementById(id);
    if (el) el.remove();
  }

  /* ══════════════════════════════════════════════════
     COPY TO CLIPBOARD
  ══════════════════════════════════════════════════ */
  window.t1cCopy = function (btn, bodyId) {
    var bodyEl = document.getElementById(bodyId);
    if (!bodyEl) return;
    var text = bodyEl.innerText || bodyEl.textContent || "";
    navigator.clipboard.writeText(text).then(function () {
      _copyFeedback(btn);
    }).catch(function () {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      _copyFeedback(btn);
    });
  };

  function _copyFeedback(btn) {
    btn.classList.add("copied");
    btn.innerHTML = '<i class="ph-bold ph-check"></i>';
    _showCopyToast();
    setTimeout(function () {
      btn.classList.remove("copied");
      btn.innerHTML = '<i class="ph-bold ph-copy"></i>';
    }, 2000);
  }

  function _showCopyToast() {
    var toast = document.getElementById("t1cCopyToast");
    if (!toast) return;
    toast.classList.add("show");
    clearTimeout(_copyToastTimer);
    _copyToastTimer = setTimeout(function () {
      toast.classList.remove("show");
    }, 1800);
  }

  /* ══════════════════════════════════════════════════
     DEMO AI RESPONSE
     Replace _getAiResponse with real API call later.
  ══════════════════════════════════════════════════ */
  function _getAiResponse(userText) {
    var t = userText.toLowerCase();

    if (t === "hello" || t === "hi" || t === "hey") {
      return "Hello! I'm T1ERA AI \u2014 your command centre assistant. I can help you write sparks, summarise your feed, suggest hashtags, and more. What would you like to do today?";
    }
    if (t.includes("how are you")) {
      return "Running at full capacity! All T1ERA AI systems are online. What can I help you build today?";
    }
    if (t.includes("what can you do") || t.includes("help")) {
      return "Here's what I can help with:\n\n\u2022 Write or rewrite sparks\n\u2022 Suggest trending hashtags\n\u2022 Summarise your feed\n\u2022 Translate posts to any language\n\u2022 Reply suggestions for sparks\n\u2022 AI-powered content strategy\n\nJust tell me what you need.";
    }
    if (t.includes("spark") || t.includes("post")) {
      return "Great \u2014 let's craft a spark. Tell me the topic or idea you want to post about, and I'll generate a few options with optimal hashtags for reach.";
    }
    if (t.includes("hashtag") || t.includes("tag")) {
      return "For best reach on T1ERA, I recommend using 3\u20135 focused hashtags. Share your topic and I'll generate the most relevant ones based on current trending signals.";
    }

    return (
      "Got it. This is a demo response from T1ERA AI (" +
      _activeModel +
      '). Real AI integration will be wired in the next phase \u2014 your message "' +
      userText.slice(0, 60) +
      (userText.length > 60 ? "\u2026" : "") +
      '" has been received.'
    );
  }

  /* ══════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════ */
  function _scrollToBottom() {
    var wrap = document.getElementById("t1eraChatBody");
    if (!wrap) return;
    if (wrap.scrollHeight > wrap.clientHeight) {
      wrap.scrollTop = wrap.scrollHeight;
    } else {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }
  }

  function _formatTime() {
    var d = new Date();
    var h = d.getHours().toString().padStart(2, "0");
    var m = d.getMinutes().toString().padStart(2, "0");
    return h + ":" + m;
  }

  function _wordCount(str) {
    return str.trim().split(/\s+/).filter(Boolean).length;
  }

  function _escHtml(str) {
    return (str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function _formatText(str) {
    return str.replace(/\n/g, "<br>");
  }
})();
