/**
 * spark-ring.js — T1ERA
 * Reads profileRing saved by profile.html and applies it to the current
 * user's own profile photo circles on the Spark page.
 *
 * Targets:
 *   - .spark-ring spans inside .av-wrap (static demo cards + dynamic Firestore cards)
 *   - #composeAv, #promptComposeAv, .reply-av (compose/reply avatars)
 *
 * Load BEFORE spark-module.js as a plain <script> (not type="module").
 */
(function () {
  'use strict';

  // Exact same gradients as profile.js RING_GRADIENTS
  window._SPARK_RING_GRADIENTS = {
    'none':        'transparent',
    'white':       '#ffffff',
    'white-grey':  'linear-gradient(135deg,#ffffff,#888888)',
    'pink-purple': 'conic-gradient(var(--pink) 0deg,var(--purple) 90deg,var(--pink-2) 180deg,var(--pink) 360deg)',
    'gold':        'linear-gradient(135deg,#f59e0b,#fbbf24)',
    'green':       'linear-gradient(135deg,#10b981,#34d399)',
    'blue':        'linear-gradient(135deg,#3b82f6,#60a5fa)',
    'red':         'linear-gradient(135deg,#ef4444,#f87171)',
    'orange':      'linear-gradient(135deg,#f97316,#fb923c)',
    'rainbow':     'conic-gradient(#f59e0b,#ef4444,#8b5cf6,#3b82f6,#10b981,#f59e0b)',
  };

  // Solid accent colour per key — for outline on compose/reply avatars
  var _SOLID = {
    'white':       '#ffffff',
    'white-grey':  '#aaaaaa',
    'pink-purple': '#c2185b',
    'gold':        '#f59e0b',
    'green':       '#10b981',
    'blue':        '#3b82f6',
    'red':         '#ef4444',
    'orange':      '#f97316',
    'rainbow':     '#8b5cf6',
  };

  window._userRingKey = 'none';

  // ── Set gradient on one .spark-ring span ──
  function _applySpan(span, key) {
    if (!span) return;
    var g = window._SPARK_RING_GRADIENTS[key] || 'transparent';
    span.style.background = g;
    if (key === 'none') span.classList.remove('visible');
    else span.classList.add('visible');
  }

  // ── Apply ring to all .spark-ring spans in own Firestore cards ──
  window._applyRingToOwnFeedCards = function (key) {
    var uid = window._sparkUser && window._sparkUser.uid;
    if (!uid) return;
    document.querySelectorAll('.spark-card[data-owner-uid="' + uid + '"] .spark-ring')
      .forEach(function (s) { _applySpan(s, key); });
  };

  // ── Apply ring to static demo cards that belong to the current user ──
  // Matches by @handle text inside .author-handle in each demo card
  function _applyRingToDemoCards(key) {
    var ud = window._sparkUserData || {};
    var handle = ud.nickname || (window._sparkUser && window._sparkUser.email
      ? window._sparkUser.email.split('@')[0] : '');
    if (!handle) return;

    // Static demo cards have no data-spark-id — find ones whose handle matches
    document.querySelectorAll('.spark-card:not([data-spark-id])').forEach(function (card) {
      var handleEl = card.querySelector('.author-handle');
      // Demo cards may not have .author-handle — fall back to showProfile onclick text
      var cardHandle = '';
      if (handleEl) {
        cardHandle = handleEl.textContent.replace('@', '').trim();
      } else {
        // Extract handle from onclick attribute of spark-av (e.g., 'ewm24k')
        var av = card.querySelector('.spark-av');
        if (av) {
          var m = (av.getAttribute('onclick') || '').match(/'([^']+)',\s*\n?\s*'LV/);
          if (m) cardHandle = m[1];
        }
      }
      if (cardHandle === handle) {
        var span = card.querySelector('.spark-ring');
        if (span) _applySpan(span, key);
      }
    });
  }

  // ── Apply ring to compose + reply avatars ──
  function _applyCompose(key) {
    var isNone = (key === 'none');
    var solid = _SOLID[key] || '#c2185b';
    ['composeAv', 'promptComposeAv'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.style.outline = isNone ? '' : '3px solid ' + solid;
      el.style.outlineOffset = isNone ? '' : '2px';
    });
    document.querySelectorAll('.reply-av').forEach(function (el) {
      el.style.outline = isNone ? '' : '3px solid ' + solid;
      el.style.outlineOffset = isNone ? '' : '2px';
    });
  }

  // ── Main — called by spark-module.js after Firestore user doc is loaded ──
  window._applySparkRing = function (key) {
    var k = (window._SPARK_RING_GRADIENTS[key] !== undefined) ? key : 'none';
    window._userRingKey = k;
    _applyCompose(k);
    _applyRingToDemoCards(k);
    window._applyRingToOwnFeedCards(k);
  };

  // ── Watch feed containers for newly inserted own Firestore cards ──
  function _watchFeeds() {
    ['realFeed', 'realPromptFeed'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      new MutationObserver(function (muts) {
        if (window._userRingKey === 'none') return;
        var uid = window._sparkUser && window._sparkUser.uid;
        if (!uid) return;
        muts.forEach(function (m) {
          m.addedNodes.forEach(function (node) {
            if (node.nodeType !== 1) return;
            if (node.classList.contains('spark-card') && node.dataset.ownerUid === uid) {
              _applySpan(node.querySelector('.spark-ring'), window._userRingKey);
            }
          });
        });
      }).observe(el, { childList: true });
    });
  }

  // ── Watch reply overlay to re-apply ring when it opens ──
  function _watchReply() {
    var ov = document.getElementById('replyOverlay');
    if (!ov) { setTimeout(_watchReply, 200); return; }
    new MutationObserver(function () {
      if (ov.classList.contains('open') && window._userRingKey !== 'none')
        _applyCompose(window._userRingKey);
    }).observe(ov, { attributes: true, attributeFilter: ['class'] });
  }

  function _init() { _watchFeeds(); _watchReply(); }

  if (document.readyState !== 'loading') _init();
  else document.addEventListener('DOMContentLoaded', _init);

})();
