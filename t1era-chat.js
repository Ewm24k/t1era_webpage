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
  document.addEventListener("DOMContentLoaded", function () {
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
  });

  /* ══════════════════════════════════════════════════
     UPGRADE OMNIBAR — swap <input> to <textarea>
     inject attachment tray, wire paste detection
  ══════════════════════════════════════════════════ */
  function _upgradeOmnibar(ctx) {
    var inputId = ctx === "mob" ? "aiOmniInputMob" : "aiOmniInputPc";
    var input = document.getElementById(inputId);
    if (!input) return;

    // Create textarea replacement
    var ta = document.createElement("textarea");
    ta.id = inputId;
    ta.className = input.className + " t1c-omni-ta";
    ta.placeholder = input.placeholder;
    ta.autocomplete = "off";
    ta.rows = 1;
    ta.setAttribute("data-ctx", ctx);
    input.parentNode.replaceChild(ta, input);

    // Auto-grow
    ta.addEventListener("input", function () {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
    });

    // Enter = send, Shift+Enter = newline
    ta.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        window.aiOmnibarSend(ctx);
      }
    });

    // Paste detection
    ta.addEventListener("paste", function (e) {
      var pasted = (e.clipboardData || window.clipboardData).getData("text");
      if (_shouldAttach(pasted)) {
        e.preventDefault();
        _addAttachment(pasted, ctx);
      }
      // short plain text — allow into textarea normally
    });

    // Inject tray OUTSIDE and ABOVE the omnibar inner row
    // PC:  textarea is inside .ai-omnibar-inner  → parent is .ai-omnibar-pc
    // Mob: textarea is inside .ai-omnibar-input-row → parent is .ai-omnibar-mobile
    // We place the tray between the outer container and the inner row
    var tray = document.createElement("div");
    tray.id = "t1cTray_" + ctx;
    tray.className = "t1c-attach-tray";
    tray.style.display = "none";

    var innerRow = ta.closest
      ? ta.closest(".ai-omnibar-inner, .ai-omnibar-input-row")
      : null;
    if (!innerRow) {
      // Fallback: innerRow is ta's direct parent
      innerRow = ta.parentNode;
    }
    var outerWrap = innerRow.parentNode;
    if (outerWrap) {
      outerWrap.insertBefore(tray, innerRow);
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
    var id = "t1cAtt_" + _attachIdCounter;
    var type = _detectType(content);
    var label = _makeLabel(content, type);

    _attachments.push({ id: id, label: label, content: content, type: type, ctx: ctx });

    var tray = document.getElementById("t1cTray_" + ctx);
    if (!tray) return;

    var card = document.createElement("div");
    card.className = "t1c-att-card";
    card.id = id;

    var iconHtml = type === "code"
      ? '<i class="ph-bold ph-code"></i>'
      : '<i class="ph-bold ph-file-text"></i>';

    card.innerHTML =
      '<div class="t1c-att-icon">' + iconHtml + "</div>" +
      '<div class="t1c-att-info">' +
        '<span class="t1c-att-label">' + _escHtml(label) + "</span>" +
        '<span class="t1c-att-meta">' + type + " \xb7 " + _lineCount(content) + " lines</span>" +
      "</div>" +
      '<button class="t1c-att-remove" title="Remove" onclick="window.t1cRemoveAttachment(\'' +
        id + "','" + ctx + "')\"><i class=\"ph-bold ph-x\"></i></button>";

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

  /* ── Rebalance card sizes based on count ── */
  function _rebalanceCards(tray) {
    var cards = tray.querySelectorAll(".t1c-att-card");
    var count = cards.length;
    var cls = count === 1 ? "size-1" : count === 2 ? "size-2" : "size-3";
    cards.forEach(function (c) {
      c.classList.remove("size-1", "size-2", "size-3");
      if (count > 0) c.classList.add(cls);
    });
    tray.style.display = count > 0 ? "flex" : "none";
  }

  /* ── Detect if content is code or text ── */
  function _detectType(text) {
    var t = text.trim();
    if (
      /[`{};]/.test(t) ||
      /^\s{2,}/m.test(t) ||
      /function |const |var |let |def |class |import |<\/?[a-z]+/i.test(t)
    ) {
      return "code";
    }
    return "text";
  }

  function _makeLabel(content, type) {
    var first = content.trim().split("\n")[0].slice(0, 36).trim();
    return first || (type === "code" ? "Code snippet" : "Long text");
  }

  function _lineCount(str) {
    return str.split("\n").length;
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
