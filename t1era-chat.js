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
  var _pendingAvatars   = [];

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
  // Expose attachments list for card preview popup
  window.t1eraAttachments = function () { return _attachments; };

  // Hook for attach menu — inject a file as an attachment card
  window._t1amInjectAttachment = function (content, ctx, filename) {
    _addAttachment(content, ctx, filename);
  };

  // Hook for attach menu — inject an image preview card
  window._t1amInjectImage = function (url, filename, ctx) {
    _attachIdCounter++;
    var id = "t1cAtt_" + _attachIdCounter;
    _attachments.push({
      id: id, label: filename, filename: filename,
      content: "[IMAGE: " + filename + "]",
      type: "image", ext: filename.split(".").pop().toLowerCase(),
      category: "Image", icon: "ph-image", color: "#e879f9", ctx: ctx
    });
    var trayId = ctx === "mob" ? "t1cCardRowMob" : "t1cCardRowPc";
    var tray = document.getElementById(trayId);
    if (!tray) return;

    var card = document.createElement("div");
    card.className = "t1c-att-card";
    card.id = id;
    card.setAttribute("data-format", "image");
    card.style.cursor = "pointer";
    card.style.setProperty("--fmt-color", "#e879f9");
    card.onclick = function (e) {
      if (e.target.closest && e.target.closest(".t1c-att-remove")) return;
      // Image preview: open in new tab
      window.open(url, "_blank");
    };
    card.innerHTML =
      '<div class="t1c-att-icon" style="--fmt-color:#e879f9"><i class="ph-bold ph-image"></i></div>' +
      '<div class="t1c-att-info">' +
        '<span class="t1c-att-label">' + _escHtml(filename) + "</span>" +
        '<span class="t1c-att-meta"><i class="ph-bold ph-image"></i> image</span>' +
        '<div class="t1c-att-badges">' +
          '<span class="t1c-fmt-badge" style="--fmt-color:#e879f9">' + filename.split(".").pop().toUpperCase() + "</span>" +
          '<span class="t1c-fmt-badge t1c-fmt-cat">Image</span>' +
        "</div>" +
      "</div>" +
      '<button class="t1c-att-remove" title="Remove" onclick="window.t1cRemoveAttachment(\'' + id + '\',\'' + ctx + '\')">' + '<i class="ph-bold ph-x"></i></button>';

    tray.appendChild(card);
    _rebalanceCards(tray);
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
    var inputId = ctx === "mob" ? "aiOmniInputMob" : "aiOmniInputPc";
    var input   = document.getElementById(inputId);
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

    // ── PASTE: instant threshold check — no regex, no delay ──
    ta.addEventListener("paste", function (e) {
      var pasted = (e.clipboardData || window.clipboardData).getData("text");
      if (pasted && (pasted.length > 80 || pasted.indexOf("\n") !== -1)) {
        e.preventDefault();
        e.stopPropagation();
        _addAttachment(pasted, ctx);
      }
    });
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
  function _addAttachment(content, ctx, filenameOverride) {
    _attachIdCounter++;
    var id      = "t1cAtt_" + _attachIdCounter;
    var info;
    try { info = _detectFormat(content, filenameOverride); } catch(e) { info = _fmt("txt", null); }
    if (!info) info = _fmt("txt", null);
    if (filenameOverride && !info.filename) info.filename = filenameOverride;
    var lines   = _lineCount(content);
    var chars   = content.length;

    _attachments.push({
      id:       id,
      label:    info.label,
      filename: info.filename,
      content:  content,
      type:     info.format,
      ext:      info.ext,
      category: info.category,
      icon:     info.icon,
      color:    info.color,
      ctx:      ctx
    });

    var trayId = ctx === "mob" ? "t1cCardRowMob" : "t1cCardRowPc";
    var tray = document.getElementById(trayId);
    if (!tray) return;

    var card = document.createElement("div");
    card.className = "t1c-att-card";
    card.id = id;
    card.setAttribute("data-format", info.format);
    card.style.cursor = "pointer";
    card.onclick = function (e) {
      // Don't open preview if clicking the remove button
      if (e.target.closest && e.target.closest(".t1c-att-remove")) return;
      window.t1cpOpen(id, ctx);
    };

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
    if (card && card.parentNode) card.parentNode.removeChild(card);
    var trayId = ctx === "mob" ? "t1cCardRowMob" : "t1cCardRowPc";
    var tray = document.getElementById(trayId);
    if (tray) _rebalanceCards(tray);
  };

  /* ── Rebalance card sizes, show/hide card row ── */
  function _rebalanceCards(tray) {
    var cards = tray.querySelectorAll(".t1c-att-card");
    var count = cards.length;
    var cls = count === 1 ? "size-1" : count === 2 ? "size-2" : "size-3";
    cards.forEach(function (c) {
      c.classList.remove("size-1", "size-2", "size-3");
      if (count > 0) c.classList.add(cls);
    });
    // Show inner card row via class — CSS controls visibility
    if (count > 0) {
      tray.classList.add("has-cards");
    } else {
      tray.classList.remove("has-cards");
    }
  }

  /* ══════════════════════════════════════════════════
     FORMAT DETECTION ENGINE
     Detects language / file format from pasted content.
     Returns: { format, ext, category, icon, color, label, filename }
  ══════════════════════════════════════════════════ */
  function _detectFormat(text, filenameHint) {
    var t = text.trim();
    var firstLine = t.split("\n")[0].trim();

    // ── Filename: use hint if provided, else try extract from first line ──
    var filename = filenameHint || null;
    if (!filename) {
      var fnMatch = firstLine.match(/^[#\/\*\-]?\s*([\w\-. ]+\.([a-zA-Z0-9]{1,10}))\s*$/);
      if (fnMatch) filename = fnMatch[1].trim();
    }
    // If filename hint provided, also try to infer format from extension
    if (filenameHint) {
      var extMatch = filenameHint.match(/\.([a-zA-Z0-9]+)$/);
      if (extMatch) {
        var extMap = {
          js:"js",jsx:"jsx",ts:"ts",tsx:"tsx",py:"python",
          rb:"ruby",php:"php",go:"go",rs:"rust",java:"java",
          kt:"kotlin",swift:"swift",dart:"dart",c:"c",cpp:"cpp",
          cs:"cs",html:"html",css:"css",scss:"scss",less:"less",
          json:"json",yaml:"yaml",yml:"yaml",toml:"toml",xml:"xml",
          sql:"sql",sh:"shell",bash:"shell",md:"md",txt:"txt",
          svg:"svg",graphql:"graphql",gql:"graphql"
        };
        var mapped = extMap[extMatch[1].toLowerCase()];
        if (mapped) return _fmt(mapped, filenameHint);
      }
    }

    // ── 1. Shebang — unambiguous ──
    if (/^#!\/usr\/bin\/env\s+(python|python3)/i.test(t)) return _fmt("python", filename);
    if (/^#!\/usr\/bin\/env\s+node/i.test(t))            return _fmt("js",     filename);
    if (/^#!\/bin\/(bash|sh|zsh)/i.test(t))               return _fmt("shell",  filename);

    // ── 2. Strong HTML signals — must come FIRST before generic < > check ──
    if (/^<!DOCTYPE\s+html/i.test(t))                      return _fmt("html", filename);
    if (/^<html[\s>]/i.test(t) || /<\/html>/i.test(t))    return _fmt("html", filename);
    if (/^<svg[\s>]/i.test(t))                             return _fmt("svg",  filename);
    if (/^<\?xml/i.test(t))                                return _fmt("xml",  filename);

    // ── 3. JS / TS — check BEFORE anything that has {} or <> ──
    // TypeScript specific (interface, type alias, generics, typed params)
    if (/\binterface\s+[A-Z]|\btype\s+[A-Z]\w*\s*=|:\s*(string|number|boolean|void|any|never)\b/.test(t))
      return _fmt("ts", filename);
    // JSX / TSX — React return with JSX
    if (/\breturn\s*\(\s*<[A-Z]|React\.createElement|<\/[A-Z][a-zA-Z]+>/.test(t))
      return _fmt("jsx", filename);
    // JavaScript — function/const/let/var/arrow/require/module
    if (/\b(function\s+\w|const\s+\w|let\s+\w|var\s+\w)/.test(t) ||
        /=>\s*[{(]|require\s*\(|module\.exports|import\s+[\w{]/.test(t))
      return _fmt("js", filename);

    // ── 4. Python ──
    if (/^\s*(def |class |async def |import |from \w+ import)/m.test(t) &&
        !/\bfunction\b|\bconst\b|\blet\b/.test(t))     return _fmt("python", filename);
    if (/:\s*\n\s+(return|pass|raise|yield|print\()/.test(t)) return _fmt("python", filename);

    // ── 5. Markdown ──
    if (/^#{1,6}\s.+/.test(t) && /\n#{1,6}\s/.test(t))   return _fmt("md", filename);
    if (/^#{1,6}\s.+/.test(t) && t.length < 1500)          return _fmt("md", filename);

    // ── 6. JSON ──
    if (/^[\[{]/.test(t)) {
      try { JSON.parse(t); return _fmt("json", filename); } catch(e) {}
    }

    // ── 7. SQL ──
    if (/\b(SELECT|INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM|CREATE\s+TABLE|DROP\s+TABLE|ALTER\s+TABLE)\b/i.test(t))
      return _fmt("sql", filename);

    // ── 8. Shell ──
    if (/^(echo |export |source |chmod |grep |awk |sed |curl |apt |npm |pip )/m.test(t))
      return _fmt("shell", filename);

    // ── 9. CSS / SCSS / LESS — only if no JS keywords ──
    if (!/\b(function|const|let|var|=>|return)\b/.test(t) &&
        /[a-zA-Z#.*[][^{\n]*\{[^}]*:[^}]*\}/.test(t)) {
      if (/\$[a-z][a-z-]+\s*:/.test(t))                   return _fmt("scss", filename);
      if (/@[a-z]+\s*\(/.test(t))                         return _fmt("less", filename);
      return _fmt("css", filename);
    }

    // ── 10. PHP ──
    if (/^<\?php/i.test(t) || (/\$[a-z_]+\s*=/.test(t) && /\becho\b|->/.test(t)))
      return _fmt("php", filename);

    // ── 11. Ruby ──
    if (/^(require |def |module )\w/m.test(t) && /\bend\b/.test(t) &&
        !/\bfunction\b|\bconst\b/.test(t))               return _fmt("ruby", filename);

    // ── 12. Go ──
    if (/^package \w/m.test(t) || (/\bfunc \w/.test(t) && /:=/.test(t)))
      return _fmt("go", filename);

    // ── 13. Rust ──
    if (/\bfn \w+\s*\(|\blet mut\b|\buse std::/.test(t))
      return _fmt("rust", filename);

    // ── 14. Java ──
    if (/\bpublic\s+(class|static|void)\b|System\.out\.print/.test(t))
      return _fmt("java", filename);

    // ── 15. Kotlin ──
    if (/\bfun \w+\s*\(|\bdata class\b|\bcompanion object\b/.test(t))
      return _fmt("kotlin", filename);

    // ── 16. C / C++ ──
    if (/#include\s*[<"]/.test(t))
      return /\bclass\b|std::|cout|cin/.test(t) ? _fmt("cpp", filename) : _fmt("c", filename);

    // ── 17. C# ──
    if (/\busing System\b|\bnamespace \w|\bpublic class\b/.test(t))
      return _fmt("cs", filename);

    // ── 18. Swift ──
    if (/\bimport (Foundation|UIKit|SwiftUI)\b|\bvar \w+:\s*[A-Z]/.test(t))
      return _fmt("swift", filename);

    // ── 19. Dart ──
    if (/\bvoid main\(\)|\bWidget build\b|import 'package:/.test(t))
      return _fmt("dart", filename);

    // ── 20. Dockerfile ──
    if (/^FROM \w/im.test(t) && /\b(RUN|CMD|EXPOSE|ENV|COPY|ADD)\b/.test(t))
      return _fmt("docker", filename);

    // ── 21. GraphQL ──
    if (/^(query|mutation|type|schema)\s+\w*\s*\{/m.test(t))
      return _fmt("graphql", filename);

    // ── 22. YAML ──
    if (/^---\n/.test(t) || (/^[a-zA-Z_][\w-]*:\s*\S/m.test(t) && /\n[a-zA-Z_][\w-]*:\s*/m.test(t)))
      return _fmt("yaml", filename);

    // ── 23. TOML ──
    if (/^\[\w/.test(t) && /^\w+ ?=/m.test(t))
      return _fmt("toml", filename);

    // ── 24. INI / Config ──
    if (/^\[\w+\]$/m.test(t) && /^\w+ ?= ?.+/m.test(t))
      return _fmt("ini", filename);

    // ── 25. Weak HTML — only as last resort for code ──
    if (/^\s*<[a-z][^>]*>/.test(t) && /<\/[a-z]+>/.test(t) &&
        !/\b(const|let|var|function|=>)\b/.test(t))
      return _fmt("html", filename);

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

    var senderLabel = role === "user" ? "YOU" : "T1ERA AI";
    var modelTag = role === "ai"
      ? '<span class="t1c-model-tag">' + _escHtml(model) + "</span>"
      : "";

    // Attachment badge for user messages
    var attachBadge = (role === "user" && attachCount > 0)
      ? '<span class="t1c-attach-badge"><i class="ph-bold ph-paperclip"></i> ' + attachCount + " attachment" + (attachCount > 1 ? "s" : "") + "</span>"
      : "";

    // ── Build avatar — reads from window._t1eraUserPhoto set by applyComposeAvatar ──
    var avatarHtml;
    if (role === "user") {
      var photoURL = window._t1eraUserPhoto   || "";
      var initial  = window._t1eraUserInitial || "U";
      avatarHtml =
        '<div class="t1c-av-wrap">' +
          '<span class="t1c-spark-ring"></span>' +
          '<div class="t1c-avatar t1c-av-user" id="t1cAv_' + uid + '"></div>' +
        '</div>';
      _pendingAvatars.push({ elId: "t1cAv_" + uid, photoURL: photoURL, initial: initial });
    } else {
      avatarHtml = '<div class="t1c-av-wrap"><div class="t1c-avatar">&#x26a1;</div></div>';
    }

    var row = document.createElement("div");
    row.className = "t1c-row t1c-" + role;
    row.id = uid;

    row.innerHTML =
      '<div class="t1c-card">' +
      '<div class="t1c-header">' +
      '<div class="t1c-header-left">' +
      avatarHtml +
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

    // ── Hydrate user avatars via DOM (avoids HTML-string quote issues) ──
    while (_pendingAvatars.length) {
      var av = _pendingAvatars.shift();
      var el = document.getElementById(av.elId);
      if (!el) continue;
      if (av.photoURL) {
        el.style.background = "none";
        el.style.padding    = "0";
        var img = document.createElement("img");
        img.src             = av.photoURL;
        img.alt             = av.initial;
        img.referrerPolicy  = "no-referrer";
        img.style.cssText   = "width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;";
        img.onerror = (function(e, ini) { return function() {
          e.textContent      = ini;
          e.style.background = "linear-gradient(135deg,#c2185b,#8b5cf6)";
          e.style.padding    = "";
        }; }(el, av.initial));
        el.appendChild(img);
      } else {
        el.textContent      = av.initial;
        el.style.background = "linear-gradient(135deg,#c2185b,#8b5cf6)";
      }
    }
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
