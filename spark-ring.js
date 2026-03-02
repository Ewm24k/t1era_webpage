/**
 * spark-ring.js — T1ERA
 * Loads the saved profileRing from Firestore (via window._sparkUserData)
 * and applies it to the current user's own avatars on the Spark page.
 *
 * Must be loaded BEFORE spark-module.js (as a plain <script>, not type="module").
 * Does NOT modify spark-module.js at all.
 *
 * Applies ring to:
 *   • #composeAv      — Standard Spark compose avatar
 *   • #promptComposeAv — Prompt Spark compose avatar
 *   • .reply-av        — Reply sheet avatar (applied on open)
 *   • .spark-card[data-owner-uid="{uid}"] .spark-av — own feed cards
 */
(function () {
  'use strict';

  // ── Ring box-shadow map — matches profile.js RING_GRADIENTS keys exactly ──
  const RING_SHADOWS = {
    'none':        'none',
    'white':       '0 0 0 3px #ffffff',
    'white-grey':  '0 0 0 3px #aaaaaa',
    'pink-purple': '0 0 0 3px #c2185b',
    'gold':        '0 0 0 3px #f59e0b',
    'green':       '0 0 0 3px #10b981',
    'blue':        '0 0 0 3px #3b82f6',
    'red':         '0 0 0 3px #ef4444',
    'orange':      '0 0 0 3px #f97316',
    'rainbow':     '0 0 0 3px #8b5cf6',
  };

  // Active ring key — updated when _sparkUserData is set
  window._userRingKey = 'none';

  // ── Apply ring box-shadow to a single element ──
  function _applyRingToEl(el, key) {
    if (!el) return;
    el.style.boxShadow = RING_SHADOWS[key] || 'none';
  }

  // ── Apply ring to all compose/reply avatars ──
  function _applyRingToComposeAvatars(key) {
    _applyRingToEl(document.getElementById('composeAv'), key);
    _applyRingToEl(document.getElementById('promptComposeAv'), key);
    document.querySelectorAll('.reply-av').forEach((el) => _applyRingToEl(el, key));
  }

  // ── Apply ring to own spark-av in feed cards (called after cards mount) ──
  window._applyRingToOwnFeedCards = function (key) {
    const uid = window._sparkUser && window._sparkUser.uid;
    if (!uid) return;
    const shadow = RING_SHADOWS[key] || 'none';
    document
      .querySelectorAll(`.spark-card[data-owner-uid="${uid}"] .spark-av`)
      .forEach(function (el) {
        el.style.boxShadow = shadow;
      });
  };

  // ── Main: apply ring from a key ──
  window._applySparkRing = function (key) {
    const ringKey = RING_SHADOWS[key] !== undefined ? key : 'none';
    window._userRingKey = ringKey;
    _applyRingToComposeAvatars(ringKey);
    window._applyRingToOwnFeedCards(ringKey);
  };

  // ── Intercept window._sparkUserData being set by spark-module.js ──
  // When spark-module.js writes `window._sparkUserData = d` (after Firestore fetch),
  // this fires synchronously, reads d.profileRing, and applies the ring.
  let _storedUserData = undefined;
  Object.defineProperty(window, '_sparkUserData', {
    configurable: true,
    enumerable: true,
    get: function () {
      return _storedUserData;
    },
    set: function (val) {
      _storedUserData = val;
      // Apply ring as soon as user data is available
      if (val && typeof val === 'object') {
        const key = val.profileRing || 'none';
        window._applySparkRing(key);
      }
    },
  });

  // ── Watch feed containers for new cards — apply ring to own cards as they mount ──
  // This covers spark-module.js renderCard() without needing to edit that file.
  function _watchFeedContainers() {
    var feedIds = ['realFeed', 'realPromptFeed'];
    feedIds.forEach(function (feedId) {
      var container = document.getElementById(feedId);
      if (!container) return;
      var observer = new MutationObserver(function (mutations) {
        if (window._userRingKey === 'none') return;
        var uid = window._sparkUser && window._sparkUser.uid;
        if (!uid) return;
        mutations.forEach(function (mutation) {
          mutation.addedNodes.forEach(function (node) {
            if (node.nodeType !== 1) return; // element nodes only
            // Check if this node itself is an own spark card
            if (
              node.classList &&
              node.classList.contains('spark-card') &&
              node.dataset.ownerUid === uid
            ) {
              var av = node.querySelector('.spark-av');
              if (av) av.style.boxShadow = RING_SHADOWS[window._userRingKey] || 'none';
            }
            // Also check any spark-cards nested inside (e.g. wrapped in a fragment)
            if (node.querySelectorAll) {
              node
                .querySelectorAll(`.spark-card[data-owner-uid="${uid}"] .spark-av`)
                .forEach(function (av) {
                  av.style.boxShadow = RING_SHADOWS[window._userRingKey] || 'none';
                });
            }
          });
        });
      });
      observer.observe(container, { childList: true, subtree: true });
    });
  }

  // ── Watch reply overlay opening — re-apply ring to .reply-av ──
  function _watchReplySheet() {
    var overlay = document.getElementById('replyOverlay');
    if (!overlay) {
      setTimeout(_watchReplySheet, 300);
      return;
    }
    var observer = new MutationObserver(function () {
      if (overlay.classList.contains('open') && window._userRingKey !== 'none') {
        document.querySelectorAll('.reply-av').forEach(function (el) {
          el.style.boxShadow = RING_SHADOWS[window._userRingKey] || 'none';
        });
      }
    });
    observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
  }

  function _initObservers() {
    _watchFeedContainers();
    _watchReplySheet();
  }

  if (document.readyState !== 'loading') {
    _initObservers();
  } else {
    document.addEventListener('DOMContentLoaded', _initObservers);
  }
})();
