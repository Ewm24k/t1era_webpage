/* ══════════════════════════════════════════════════════
   T1ERA CHAT HANDLER — t1era-chat.js
   Handles: clear body → inject conversation stream
   Demo mode: responds to any message with a mock reply
   Later: replace _getAiResponse() with real API call
══════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── State ── */
  var _chatActive = false;
  var _activeModel = 'T1x.V1.1';
  var _msgCount = 0;
  var _copyToastTimer = null;

  /* ── DOM refs (resolved lazily on first send) ── */
  var _wrap = null;   // #t1eraChatBody   — the scrollable page wrap
  var _convo = null;  // #t1eraConversation — message stream

  /* ══════════════════════════════════════════════════
     PUBLIC API — called by aiOmnibarSend in spark22
  ══════════════════════════════════════════════════ */
  window.t1eraChat = {
    send: handleSend,
    setModel: function (m) { _activeModel = m; },
    clear: clearChat,
  };

  /* ══════════════════════════════════════════════════
     INIT — wire up Enter key on both inputs, model sync
  ══════════════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', function () {
    // Keep model label in sync with model picker
    var origSetActive = window.setActiveModel;
    window.setActiveModel = function (modelId) {
      if (typeof origSetActive === 'function') origSetActive(modelId);
      _activeModel = modelId || 'T1x.V1.1';
    };

    // Inject copy-toast element once
    if (!document.getElementById('t1cCopyToast')) {
      var toast = document.createElement('div');
      toast.id = 't1cCopyToast';
      toast.className = 't1c-copy-toast';
      toast.textContent = '✓ Copied to clipboard';
      document.body.appendChild(toast);
    }
  });

  /* ══════════════════════════════════════════════════
     HANDLE SEND — entry point
  ══════════════════════════════════════════════════ */
  function handleSend(text, ctx) {
    if (!text || !text.trim()) return;
    text = text.trim();

    // First message — clear the page body and activate chat mode
    if (!_chatActive) {
      _activateChatMode();
    }

    _msgCount++;

    // Render user bubble
    appendMessage({ role: 'user', text: text });

    // Scroll to bottom
    _scrollToBottom();

    // Show typing indicator then respond
    var loadingId = 't1cLoad_' + _msgCount;
    appendLoading(loadingId);
    _scrollToBottom();

    // Demo response — replace _getAiResponse with real call later
    setTimeout(function () {
      removeLoading(loadingId);
      var reply = _getAiResponse(text);
      appendMessage({ role: 'ai', text: reply, model: _activeModel });
      _scrollToBottom();
    }, 900 + Math.random() * 400);
  }

  /* ══════════════════════════════════════════════════
     ACTIVATE CHAT MODE
     Clears the hero/dashboard content, injects
     the empty conversation container
  ══════════════════════════════════════════════════ */
  function _activateChatMode() {
    _chatActive = true;
    _wrap = document.getElementById('t1eraChatBody');
    if (!_wrap) return;

    // Clear all existing page content (hero, stats, quick actions, AI cards)
    _wrap.innerHTML = '';

    // Engage chat-mode layout via CSS class
    _wrap.classList.add('chat-active');

    // Add cleared session divider
    var notice = document.createElement('div');
    notice.className = 't1c-clear-notice';
    notice.innerHTML =
      '<div class="t1c-clear-icon"><i class="ph-bold ph-chat-teardrop-dots"></i></div>' +
      '<div class="t1c-clear-label">New session started</div>';
    _wrap.appendChild(notice);

    // Create conversation stream container
    _convo = document.createElement('div');
    _convo.id = 't1eraConversation';
    _wrap.appendChild(_convo);
  }

  /* ══════════════════════════════════════════════════
     CLEAR CHAT — reset to fresh state
  ══════════════════════════════════════════════════ */
  function clearChat() {
    _chatActive = false;
    _msgCount = 0;
    var wrap = document.getElementById('t1eraChatBody');
    if (wrap) wrap.classList.remove('chat-active');
    _wrap = null;
    _convo = null;
  }

  /* ══════════════════════════════════════════════════
     APPEND MESSAGE BUBBLE
  ══════════════════════════════════════════════════ */
  function appendMessage(opts) {
    if (!_convo) return;

    var role = opts.role;   // 'user' | 'ai'
    var text = opts.text;
    var model = opts.model || _activeModel;
    var now = _formatTime();
    var uid = 't1cMsg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

    /* ── Avatar content ── */
    var avatarContent = role === 'user'
      ? (window._currentUserInitial || 'U')
      : '⚡';

    /* ── Sender label ── */
    var senderLabel = role === 'user' ? 'YOU' : 'T1ERA AI';

    /* ── Model tag (AI only) ── */
    var modelTag = role === 'ai'
      ? '<span class="t1c-model-tag">' + _escHtml(model) + '</span>'
      : '';

    /* ── Row ── */
    var row = document.createElement('div');
    row.className = 't1c-row t1c-' + role;
    row.id = uid;

    row.innerHTML =
      '<div class="t1c-card">' +
        /* header */
        '<div class="t1c-header">' +
          '<div class="t1c-header-left">' +
            '<div class="t1c-avatar">' + avatarContent + '</div>' +
            '<span class="t1c-sender">' + senderLabel + '</span>' +
            modelTag +
          '</div>' +
          '<span class="t1c-timestamp">' + now + '</span>' +
        '</div>' +
        /* body */
        '<div class="t1c-body" id="' + uid + '_body">' + _formatText(_escHtml(text)) + '</div>' +
        /* footer */
        '<div class="t1c-footer">' +
          '<span class="t1c-timestamp">↩ ' + _wordCount(text) + ' words</span>' +
          '<div class="t1c-actions">' +
            '<button class="t1c-action-btn" title="Copy to clipboard" onclick="window.t1cCopy(this,\'' + uid + '_body\')">' +
              '<i class="ph-bold ph-copy"></i>' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    _convo.appendChild(row);
  }

  /* ══════════════════════════════════════════════════
     APPEND LOADING INDICATOR
  ══════════════════════════════════════════════════ */
  function appendLoading(id) {
    if (!_convo) return;

    var row = document.createElement('div');
    row.className = 't1c-row t1c-ai t1c-loading';
    row.id = id;

    row.innerHTML =
      '<div class="t1c-card">' +
        '<div class="t1c-header">' +
          '<div class="t1c-header-left">' +
            '<div class="t1c-avatar">⚡</div>' +
            '<span class="t1c-sender" style="color:var(--purple)">T1ERA AI</span>' +
            '<span class="t1c-model-tag">' + _escHtml(_activeModel) + '</span>' +
          '</div>' +
          '<span class="t1c-timestamp">thinking…</span>' +
        '</div>' +
        '<div class="t1c-body">' +
          '<div class="t1c-dot"></div>' +
          '<div class="t1c-dot"></div>' +
          '<div class="t1c-dot"></div>' +
        '</div>' +
      '</div>';

    _convo.appendChild(row);
  }

  /* ── Remove loading indicator ── */
  function removeLoading(id) {
    var el = document.getElementById(id);
    if (el) el.remove();
  }

  /* ══════════════════════════════════════════════════
     COPY TO CLIPBOARD — exposed on window
  ══════════════════════════════════════════════════ */
  window.t1cCopy = function (btn, bodyId) {
    var bodyEl = document.getElementById(bodyId);
    if (!bodyEl) return;
    var text = bodyEl.innerText || bodyEl.textContent || '';
    navigator.clipboard.writeText(text).then(function () {
      btn.classList.add('copied');
      btn.innerHTML = '<i class="ph-bold ph-check"></i>';
      _showCopyToast();
      setTimeout(function () {
        btn.classList.remove('copied');
        btn.innerHTML = '<i class="ph-bold ph-copy"></i>';
      }, 2000);
    }).catch(function () {
      // Fallback for older browsers
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      btn.classList.add('copied');
      btn.innerHTML = '<i class="ph-bold ph-check"></i>';
      _showCopyToast();
      setTimeout(function () {
        btn.classList.remove('copied');
        btn.innerHTML = '<i class="ph-bold ph-copy"></i>';
      }, 2000);
    });
  };

  function _showCopyToast() {
    var toast = document.getElementById('t1cCopyToast');
    if (!toast) return;
    toast.classList.add('show');
    clearTimeout(_copyToastTimer);
    _copyToastTimer = setTimeout(function () {
      toast.classList.remove('show');
    }, 1800);
  }

  /* ══════════════════════════════════════════════════
     DEMO AI RESPONSE
     Replace this function with real API call later.
     Input: user text string
     Output: response string
  ══════════════════════════════════════════════════ */
  function _getAiResponse(userText) {
    var t = userText.toLowerCase();

    if (t === 'hello' || t === 'hi' || t === 'hey') {
      return 'Hello! I\'m T1ERA AI — your command centre assistant. I can help you write sparks, summarise your feed, suggest hashtags, and more. What would you like to do today?';
    }
    if (t.includes('how are you')) {
      return 'Running at full capacity! All T1ERA AI systems are online. What can I help you build today?';
    }
    if (t.includes('what can you do') || t.includes('help')) {
      return 'Here\'s what I can help with:\n\n• Write or rewrite sparks\n• Suggest trending hashtags\n• Summarise your feed\n• Translate posts to any language\n• Reply suggestions for sparks\n• AI-powered content strategy\n\nJust tell me what you need.';
    }
    if (t.includes('spark') || t.includes('post')) {
      return 'Great — let\'s craft a spark. Tell me the topic or idea you want to post about, and I\'ll generate a few options with optimal hashtags for reach.';
    }
    if (t.includes('hashtag') || t.includes('tag')) {
      return 'For best reach on T1ERA, I recommend using 3–5 focused hashtags. Share your topic and I\'ll generate the most relevant ones based on current trending signals.';
    }

    // Generic fallback
    return 'Got it. This is a demo response from T1ERA AI (' + _activeModel + '). Real AI integration will be wired in the next phase — your message "' + userText.slice(0, 60) + (userText.length > 60 ? '…' : '') + '" has been received.';
  }

  /* ══════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════ */
  function _scrollToBottom() {
    var wrap = document.getElementById('t1eraChatBody');
    if (!wrap) return;
    // If t1era-page-wrap is the scroll container, scroll it
    // Otherwise fall back to window scroll
    if (wrap.scrollHeight > wrap.clientHeight) {
      wrap.scrollTop = wrap.scrollHeight;
    } else {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }
  }

  function _formatTime() {
    var d = new Date();
    var h = d.getHours().toString().padStart(2, '0');
    var m = d.getMinutes().toString().padStart(2, '0');
    return h + ':' + m;
  }

  function _wordCount(str) {
    return str.trim().split(/\s+/).filter(Boolean).length;
  }

  function _escHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Convert newlines to <br> for display
  function _formatText(str) {
    return str.replace(/\n/g, '<br>');
  }

})();
