/**
 * pod-notify.js  —  T1ERA Compute · Notification & Alert Manager
 * ─────────────────────────────────────────────────────────────────────
 * Responsibilities:
 *   1. Load / save per-user notification preferences to Firestore
 *      Path: users/{uid}/settings/notifications  (single doc per user)
 *   2. Sync preference toggles & threshold input in the Settings UI
 *   3. Evaluate balance against thresholds on every balance tick
 *   4. Render / dismiss persistent alert banners below the topbar
 *   5. Persist banner dismissed-state so banners survive page refresh
 *
 * Firestore document shape — users/{uid}/settings/notifications:
 * {
 *   lowBalanceEnabled:  boolean,   // master toggle
 *   threshold:          number,    // warn below this $ amount
 *   criticalEnabled:    boolean,   // red banner below $5
 *   depletedEnabled:    boolean,   // banner at $0
 *   stoppedEnabled:     boolean,   // instance stopped alert
 *   pausedEnabled:      boolean,   // instance paused alert
 *   deployedEnabled:    boolean,   // instance deployed alert
 *   updatedAt:          string     // ISO timestamp
 * }
 *
 * Requires:
 *   Firebase compat SDK already loaded (firebase-app-compat + firebase-auth-compat
 *   + firebase-firestore-compat) and initialised by Pod-workflow.html auth gate.
 *
 * Loaded via:  <script src="pod-notify.js"></script>
 * ─────────────────────────────────────────────────────────────────────
 */

(function (global) {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════
     CONSTANTS
  ══════════════════════════════════════════════════════════════════ */
  var CRITICAL_THRESHOLD = 5;   // hard-coded critical level ($5)
  var LS_DISMISSED       = 't1era_notif_dismissed'; // localStorage key
  var LS_PREFS_CACHE     = 't1era_notif_prefs';     // offline cache key

  /* ══════════════════════════════════════════════════════════════════
     MODULE STATE
  ══════════════════════════════════════════════════════════════════ */
  var _db      = null;
  var _uid     = null;
  var _prefs   = null;   // loaded from Firestore, falls back to localStorage cache
  var _ready   = false;  // true once prefs loaded and UI wired

  /* Default prefs — used before Firestore load completes */
  var DEFAULT_PREFS = {
    lowBalanceEnabled: true,
    threshold:         20,
    criticalEnabled:   true,
    depletedEnabled:   true,
    stoppedEnabled:    true,
    pausedEnabled:     false,
    deployedEnabled:   true,
  };

  /* ══════════════════════════════════════════════════════════════════
     1. FIREBASE INIT  —  piggyback on existing compat app
  ══════════════════════════════════════════════════════════════════ */
  function initFirebase() {
    if (!global.firebase) {
      console.warn('[Notify] Firebase compat SDK not found.');
      return false;
    }
    var app = global.firebase.apps && global.firebase.apps.length > 0
      ? global.firebase.apps[0]
      : global.firebase.initializeApp({
          apiKey:            'AIzaSyBnt9mbb8LdMVeguSHUmS20L6uBHIfxwAs',
          authDomain:        't1era-v2.firebaseapp.com',
          projectId:         't1era-v2',
          storageBucket:     't1era-v2.firebasestorage.app',
          messagingSenderId: '279266491659',
          appId:             '1:279266491659:web:28a03c7b7300fcb152b60e',
        });
    _db = global.firebase.firestore();
    return true;
  }

  /* ══════════════════════════════════════════════════════════════════
     2. FIRESTORE  —  load / save per-user prefs
  ══════════════════════════════════════════════════════════════════ */
  function fsDocRef() {
    if (!_db || !_uid) return null;
    return _db.collection('users').doc(_uid)
               .collection('settings').doc('notifications');
  }

  function loadPrefsFromFirestore(callback) {
    var ref = fsDocRef();
    if (!ref) { callback(null); return; }

    ref.get()
      .then(function (snap) {
        if (snap.exists) {
          callback(snap.data());
        } else {
          /* First visit — write defaults */
          var defaults = Object.assign({}, DEFAULT_PREFS, { updatedAt: new Date().toISOString() });
          ref.set(defaults).catch(function (e) { console.warn('[Notify] write defaults failed:', e); });
          callback(defaults);
        }
      })
      .catch(function (e) {
        console.warn('[Notify] load prefs failed:', e);
        callback(null);
      });
  }

  function savePrefsToFirestore(prefs) {
    var ref = fsDocRef();
    if (!ref) return;
    var data = Object.assign({}, prefs, { updatedAt: new Date().toISOString() });
    ref.set(data, { merge: true })
      .catch(function (e) { console.warn('[Notify] save prefs failed:', e); });

    /* Also cache locally for offline resilience */
    try { localStorage.setItem(LS_PREFS_CACHE, JSON.stringify(data)); } catch (e) {}
  }

  function loadPrefsFromCache() {
    try {
      var raw = localStorage.getItem(LS_PREFS_CACHE);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  /* ══════════════════════════════════════════════════════════════════
     3. ALERT BANNER  —  below topbar, above content
  ══════════════════════════════════════════════════════════════════ */
  var BANNER_TYPES = {
    low:      { id: 'notifBannerLow',      level: 'warn' },
    critical: { id: 'notifBannerCritical', level: 'danger' },
    depleted: { id: 'notifBannerDepleted', level: 'fatal' },
  };

  function injectBannerCSS() {
    if (document.getElementById('t1NotifBannerCSS')) return;
    var s = document.createElement('style');
    s.id = 't1NotifBannerCSS';
    s.textContent = [
      /* Container injected right after .topbar */
      '.t1-notif-zone{display:flex;flex-direction:column;gap:0;}',

      /* Base banner */
      '.t1-banner{display:flex;align-items:center;gap:10px;',
        'padding:10px 20px;font-size:13px;font-weight:600;',
        'font-family:"DM Sans",sans-serif;',
        'border-bottom:1px solid rgba(0,0,0,0.15);',
        'animation:t1BannerIn .3s ease both;',
        'position:relative;z-index:10;}',

      /* Colour variants */
      '.t1-banner-warn{background:rgba(245,158,11,0.14);color:#f59e0b;border-left:3px solid #f59e0b;}',
      '.t1-banner-danger{background:rgba(248,113,113,0.16);color:#f87171;border-left:3px solid #f87171;}',
      '.t1-banner-fatal{background:rgba(180,30,30,0.28);color:#fca5a5;border-left:3px solid #ef4444;}',

      /* Icon */
      '.t1-banner i{font-size:16px;flex-shrink:0;}',

      /* Message text */
      '.t1-banner-msg{flex:1;line-height:1.45;}',
      '.t1-banner-msg strong{color:#fff;}',

      /* Action button (e.g. top up) */
      '.t1-banner-action{',
        'padding:5px 12px;border-radius:6px;font-size:11px;font-weight:700;',
        'cursor:pointer;border:1px solid currentColor;background:transparent;',
        'color:inherit;font-family:"DM Sans",sans-serif;',
        'white-space:nowrap;transition:background .15s;flex-shrink:0;}',
      '.t1-banner-action:hover{background:rgba(255,255,255,0.1);}',

      /* Close button */
      '.t1-banner-close{',
        'width:24px;height:24px;border-radius:50%;border:none;',
        'background:rgba(255,255,255,0.1);color:inherit;cursor:pointer;',
        'font-size:13px;display:flex;align-items:center;justify-content:center;',
        'flex-shrink:0;transition:background .15s;}',
      '.t1-banner-close:hover{background:rgba(255,255,255,0.2);}',

      /* Slide-in animation */
      '@keyframes t1BannerIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}',

      /* Slide-out */
      '.t1-banner.t1-banner-hide{',
        'animation:t1BannerOut .25s ease forwards;}',
      '@keyframes t1BannerOut{to{opacity:0;transform:translateY(-8px);max-height:0;padding:0;}}',
    ].join('');
    document.head.appendChild(s);
  }

  function getBannerZone() {
    var zone = document.getElementById('t1NotifZone');
    if (zone) return zone;
    zone = document.createElement('div');
    zone.id        = 't1NotifZone';
    zone.className = 't1-notif-zone';
    /* Insert after topbar / header */
    var topbar = document.querySelector('header.topbar');
    if (topbar && topbar.parentNode) {
      topbar.parentNode.insertBefore(zone, topbar.nextSibling);
    } else {
      document.body.insertBefore(zone, document.body.firstChild);
    }
    return zone;
  }

  /* Dismissed state helpers */
  function getDismissedState() {
    try { return JSON.parse(localStorage.getItem(LS_DISMISSED) || '{}'); } catch (e) { return {}; }
  }
  function setDismissedState(state) {
    try { localStorage.setItem(LS_DISMISSED, JSON.stringify(state)); } catch (e) {}
  }

  /**
   * showBanner(type, message, balance)
   * type: 'low' | 'critical' | 'depleted'
   * Checks dismissed state — won't re-show if balance hasn't dropped further
   * since last dismiss.
   */
  function showBanner(type, message, balance) {
    var meta = BANNER_TYPES[type];
    if (!meta) return;

    /* Check if already visible */
    if (document.getElementById(meta.id)) return;

    /* Check dismissed state — only re-show if balance has dropped further */
    var dismissed = getDismissedState();
    var d = dismissed[type];
    if (d) {
      var dismissedAtBalance = parseFloat(d.balance);
      if (!isNaN(dismissedAtBalance) && balance >= dismissedAtBalance - 0.01) {
        /* Balance hasn't dropped further — respect dismiss */
        return;
      }
    }

    injectBannerCSS();
    var zone = getBannerZone();

    var banner = document.createElement('div');
    banner.id        = meta.id;
    banner.className = 't1-banner t1-banner-' + meta.level;

    /* Icon per level */
    var iconName = meta.level === 'warn' ? 'ph-warning'
                 : meta.level === 'danger' ? 'ph-warning-circle'
                 : 'ph-x-circle';

    banner.innerHTML =
      '<i class="ph-fill ' + iconName + '"></i>' +
      '<span class="t1-banner-msg">' + message + '</span>' +
      '<button class="t1-banner-action" onclick="document.querySelector(\'.tab[data-target=tab-payg]\').click()">' +
        'Top Up' +
      '</button>' +
      '<button class="t1-banner-close" onclick="window.t1NotifyDismiss(\'' + type + '\',' + balance + ')" title="Dismiss">' +
        '<i class="ph-bold ph-x"></i>' +
      '</button>';

    zone.appendChild(banner);
  }

  function hideBanner(type) {
    var meta = BANNER_TYPES[type];
    if (!meta) return;
    var el = document.getElementById(meta.id);
    if (!el) return;
    el.classList.add('t1-banner-hide');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 280);
  }

  /* Public dismiss — called by close button */
  global.t1NotifyDismiss = function (type, balance) {
    hideBanner(type);
    /* Record balance at time of dismiss so we don't re-show unless it drops further */
    var state = getDismissedState();
    state[type] = { balance: balance, dismissedAt: new Date().toISOString() };
    setDismissedState(state);
  };

  /* ══════════════════════════════════════════════════════════════════
     4. BALANCE EVALUATION  —  called on every balance tick
  ══════════════════════════════════════════════════════════════════ */
  function evaluateBalance(balance) {
    if (!_prefs) return;

    /* ── Depleted ($0) ── */
    if (_prefs.depletedEnabled && balance <= 0) {
      showBanner('depleted',
        '<strong>Balance Depleted</strong> — your balance has reached $0.00. ' +
        'All running instances have been stopped.', balance);
      hideBanner('critical');
      hideBanner('low');
      return;
    } else {
      hideBanner('depleted');
    }

    /* ── Critical (below $5) ── */
    if (_prefs.criticalEnabled && balance < CRITICAL_THRESHOLD) {
      showBanner('critical',
        '<strong>Critical Balance</strong> — your balance is <strong>$' +
        balance.toFixed(2) + '</strong>, below $' + CRITICAL_THRESHOLD +
        '. Running instances may stop soon.', balance);
      hideBanner('low');
      return;
    } else {
      hideBanner('critical');
    }

    /* ── Low balance (below user threshold) ── */
    if (_prefs.lowBalanceEnabled && balance < _prefs.threshold) {
      showBanner('low',
        '<strong>Low Balance</strong> — your balance ($<strong>' +
        balance.toFixed(2) + '</strong>) has dropped below your $' +
        _prefs.threshold + ' threshold.', balance);
    } else {
      hideBanner('low');
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     5. HOOK INTO pod-serverless.js BALANCE TICK
         pod-serverless calls syncBalanceDOMs() every second.
         We patch it to also call evaluateBalance.
  ══════════════════════════════════════════════════════════════════ */
  function hookBalanceTick() {
    /* Poll until pod-serverless.js exposes window.SL */
    var attempts = 0;
    var poll = setInterval(function () {
      attempts++;

      /* Also check headerBalanceStat DOM updates as a secondary hook */
      var el = document.getElementById('headerBalanceStat');
      if (el && !el._t1NotifyObserver) {
        var observer = new MutationObserver(function () {
          var text = el.textContent.replace('$', '').trim();
          var val  = parseFloat(text);
          if (!isNaN(val)) evaluateBalance(val);
        });
        observer.observe(el, { childList: true, characterData: true, subtree: true });
        el._t1NotifyObserver = observer;
      }

      /* Also check on localStorage balance directly (page load / refresh) */
      if (attempts === 1) {
        try {
          var b = parseFloat(localStorage.getItem('t1era_sl_balance'));
          if (!isNaN(b)) evaluateBalance(b);
        } catch (e) {}
      }

      if (attempts > 50) clearInterval(poll);
    }, 200);
  }

  /* ══════════════════════════════════════════════════════════════════
     6. SETTINGS UI  —  wire toggles and threshold input
  ══════════════════════════════════════════════════════════════════ */
  function applyPrefsToUI(prefs) {
    function setChk(id, val) {
      var el = document.getElementById(id);
      if (el) el.checked = !!val;
    }
    function setVal(id, val) {
      var el = document.getElementById(id);
      if (el) el.value = val;
    }
    setChk('notifLowBalance', prefs.lowBalanceEnabled);
    setVal('notifThreshold',  prefs.threshold);
    setChk('notifCritical',   prefs.criticalEnabled);
    setChk('notifDepleted',   prefs.depletedEnabled);
    setChk('notifStopped',    prefs.stoppedEnabled);
    setChk('notifPaused',     prefs.pausedEnabled);
    setChk('notifDeployed',   prefs.deployedEnabled);

    /* Apply master-toggle dimming */
    applyMasterToggleDim(prefs.lowBalanceEnabled);
  }

  /* Dim sub-rows when master low-balance toggle is off */
  function applyMasterToggleDim(enabled) {
    var subIds = ['notifThreshold', 'notifCritical', 'notifDepleted'];
    var subRows = [];
    subIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        var row = el.closest('.s-row');
        if (row) subRows.push(row);
      }
    });
    subRows.forEach(function (row) {
      row.style.opacity       = enabled ? '1' : '0.38';
      row.style.pointerEvents = enabled ? 'auto' : 'none';
      row.style.transition    = 'opacity .2s';
    });
  }

  function wireSettingsUI() {
    /* Helper: on any toggle change → save immediately */
    function onToggleChange() {
      collectAndSave();
    }

    /* Master toggle — also controls sub-row dimming */
    var masterEl = document.getElementById('notifLowBalance');
    if (masterEl) {
      masterEl.addEventListener('change', function () {
        applyMasterToggleDim(this.checked);
        onToggleChange();
        /* Re-evaluate banners immediately */
        try {
          var b = parseFloat(localStorage.getItem('t1era_sl_balance'));
          if (!isNaN(b)) {
            /* If turning OFF, hide low/critical banners */
            if (!this.checked) {
              hideBanner('low');
              if (_prefs) _prefs.lowBalanceEnabled = false;
            }
            collectAndSave();
            evaluateBalance(b);
          }
        } catch (e) {}
      });
    }

    /* All other toggles */
    ['notifCritical', 'notifDepleted', 'notifStopped', 'notifPaused', 'notifDeployed'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', function () {
        onToggleChange();
        /* Re-evaluate immediately on toggle */
        try {
          var b = parseFloat(localStorage.getItem('t1era_sl_balance'));
          if (!isNaN(b)) evaluateBalance(b);
        } catch (e) {}
      });
    });

    /* Threshold input — save on blur or Enter */
    var threshEl = document.getElementById('notifThreshold');
    if (threshEl) {
      function onThresholdCommit() {
        var val = parseFloat(threshEl.value);
        if (isNaN(val) || val < 1) { threshEl.value = 1; }
        if (val > 999) { threshEl.value = 999; }
        onToggleChange();
        /* Clear low-banner dismissed state so it re-evaluates with new threshold */
        var state = getDismissedState();
        delete state['low'];
        setDismissedState(state);
        try {
          var b = parseFloat(localStorage.getItem('t1era_sl_balance'));
          if (!isNaN(b)) evaluateBalance(b);
        } catch (e) {}
      }
      threshEl.addEventListener('blur', onThresholdCommit);
      threshEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { threshEl.blur(); }
      });
    }

    /* Wire Save Preferences button — already shows toast, now also persists */
    var saveBtn = document.querySelector('#sp-notif .s-save-bar .btn');
    if (saveBtn) {
      var originalOnclick = saveBtn.getAttribute('onclick');
      saveBtn.removeAttribute('onclick');
      saveBtn.addEventListener('click', function () {
        collectAndSave();
        if (typeof showSettingsToast === 'function') {
          showSettingsToast('Notification preferences saved');
        }
      });
    }
  }

  function collectAndSave() {
    function getChk(id) {
      var el = document.getElementById(id);
      return el ? el.checked : DEFAULT_PREFS[id] || false;
    }
    function getNum(id, def) {
      var el = document.getElementById(id);
      if (!el) return def;
      var v = parseFloat(el.value);
      return isNaN(v) ? def : v;
    }

    var prefs = {
      lowBalanceEnabled: getChk('notifLowBalance'),
      threshold:         getNum('notifThreshold', 20),
      criticalEnabled:   getChk('notifCritical'),
      depletedEnabled:   getChk('notifDepleted'),
      stoppedEnabled:    getChk('notifStopped'),
      pausedEnabled:     getChk('notifPaused'),
      deployedEnabled:   getChk('notifDeployed'),
    };

    _prefs = prefs;
    savePrefsToFirestore(prefs);
    /* Also update local cache */
    try { localStorage.setItem(LS_PREFS_CACHE, JSON.stringify(prefs)); } catch (e) {}
  }

  /* ══════════════════════════════════════════════════════════════════
     7. BOOT
  ══════════════════════════════════════════════════════════════════ */
  function boot() {
    if (!initFirebase()) {
      /* Fallback: use localStorage cache only */
      _prefs = loadPrefsFromCache() || Object.assign({}, DEFAULT_PREFS);
      applyPrefsToUI(_prefs);
      wireSettingsUI();
      hookBalanceTick();
      return;
    }

    /* Wait for auth state — piggyback on existing firebase.auth() */
    global.firebase.auth().onAuthStateChanged(function (user) {
      if (!user) return; /* Auth gate in Pod-workflow.html handles redirect */

      _uid = user.uid;

      /* Load prefs — show cached prefs immediately while Firestore loads */
      var cached = loadPrefsFromCache();
      if (cached) {
        _prefs = cached;
        applyPrefsToUI(_prefs);
        /* Evaluate balance immediately with cached prefs */
        try {
          var b = parseFloat(localStorage.getItem('t1era_sl_balance'));
          if (!isNaN(b)) evaluateBalance(b);
        } catch (e) {}
      }

      /* Then load from Firestore (authoritative) */
      loadPrefsFromFirestore(function (serverPrefs) {
        if (serverPrefs) {
          _prefs = serverPrefs;
          /* Cache it */
          try { localStorage.setItem(LS_PREFS_CACHE, JSON.stringify(serverPrefs)); } catch (e) {}
          applyPrefsToUI(_prefs);
          /* Re-evaluate with server prefs */
          try {
            var b = parseFloat(localStorage.getItem('t1era_sl_balance'));
            if (!isNaN(b)) evaluateBalance(b);
          } catch (e) {}
        }

        /* Wire UI regardless — prefs are ready */
        wireSettingsUI();
        hookBalanceTick();
        _ready = true;
      });
    });
  }

  /* ── Expose public API ── */
  global.T1Notify = {
    evaluate:  evaluateBalance,
    dismiss:   global.t1NotifyDismiss,
    getPrefs:  function () { return _prefs ? Object.assign({}, _prefs) : null; },
    isReady:   function () { return _ready; },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window);
