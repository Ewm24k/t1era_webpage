/**
 * pod-balance.js  —  T1ERA Compute · Balance & Transaction Manager
 * ─────────────────────────────────────────────────────────────────────
 * Responsibilities:
 *   1. Load / save per-user balance and transaction ledger to Firestore
 *      Path: users/{uid}/billing/balance       (balance doc)
 *            users/{uid}/billing/transactions  (ledger doc, array field)
 *   2. Sync live balance across all DOM balance displays
 *   3. Record every top-up / deduction as a transaction entry
 *   4. Expose T1Balance public API for toyyibPay and future payment hooks
 *   5. Persist balance in localStorage for offline resilience (same pattern
 *      as pod-notify.js LS_PREFS_CACHE)
 *
 * Firestore document shape:
 *
 *   users/{uid}/billing/balance:
 *   {
 *     amount:     number,   // current balance in MYR/USD
 *     currency:   string,   // 'MYR' | 'USD'
 *     updatedAt:  string,   // ISO timestamp
 *   }
 *
 *   users/{uid}/billing/transactions:
 *   {
 *     entries: [
 *       {
 *         id:          string,   // unique txn id  e.g. 'txn_1714123456789'
 *         type:        string,   // 'topup' | 'deduction' | 'refund' | 'adjustment'
 *         amount:      number,   // positive for topup/refund, negative for deduction
 *         balanceAfter:number,   // snapshot of balance after this txn
 *         description: string,   // human label e.g. 'Top-up via toyyibPay'
 *         ref:         string,   // payment gateway reference (billCode, etc.)
 *         gateway:     string,   // 'toyyibpay' | 'stripe' | 'manual' | ''
 *         status:      string,   // 'completed' | 'pending' | 'failed'
 *         createdAt:   string,   // ISO timestamp
 *       },
 *       ...
 *     ],
 *     updatedAt: string,
 *   }
 *
 * Requires:
 *   Firebase compat SDK already loaded and initialised by Pod-workflow.html.
 *   Loaded via:  <script src="pod-balance.js"></script>
 * ─────────────────────────────────────────────────────────────────────
 */

(function (global) {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════
     CONSTANTS  (mirror pod-notify.js naming pattern)
  ══════════════════════════════════════════════════════════════════ */
  var LS_BALANCE_CACHE = 't1era_sl_balance';          // reuse existing key so SL module stays in sync
  var LS_TXN_CACHE     = 't1era_billing_transactions';// local ledger cache
  var DEFAULT_BALANCE  = 142.50;
  var DEFAULT_CURRENCY = 'MYR';
  var MAX_LOCAL_TXN    = 50;                          // keep last N entries in localStorage

  /* ══════════════════════════════════════════════════════════════════
     MODULE STATE  (mirror pod-notify.js _db / _uid / _prefs pattern)
  ══════════════════════════════════════════════════════════════════ */
  var _db            = null;
  var _uid           = null;
  var _balance       = null;   // current balance (number)
  var _currency      = DEFAULT_CURRENCY;
  var _txns          = [];     // in-memory transaction array
  var _ready         = false;
  var _lastFsWrite   = 0;      // timestamp of last Firestore balance write
  var FS_WRITE_THROTTLE = 30000; // ms — max 1 Firestore write per 30s during tick

  /* ══════════════════════════════════════════════════════════════════
     1. FIREBASE INIT  —  piggyback on existing compat app
        (identical pattern to pod-notify.js initFirebase)
  ══════════════════════════════════════════════════════════════════ */
  function initFirebase() {
    if (!global.firebase) {
      console.warn('[Balance] Firebase compat SDK not found.');
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
     2. FIRESTORE REFS  (mirror pod-notify.js fsDocRef pattern)
  ══════════════════════════════════════════════════════════════════ */
  function balanceDocRef() {
    if (!_db || !_uid) return null;
    return _db.collection('users').doc(_uid)
               .collection('billing').doc('balance');
  }

  function txnDocRef() {
    if (!_db || !_uid) return null;
    return _db.collection('users').doc(_uid)
               .collection('billing').doc('transactions');
  }

  /* ══════════════════════════════════════════════════════════════════
     3. BALANCE  —  load / save  (mirrors loadPrefsFromFirestore pattern)
  ══════════════════════════════════════════════════════════════════ */
  function loadBalanceFromFirestore(callback) {
    var ref = balanceDocRef();
    if (!ref) { callback(null); return; }

    ref.get()
      .then(function (snap) {
        if (snap.exists) {
          callback(snap.data());
        } else {
          /* First visit — seed from localStorage or default */
          var cached = loadBalanceFromCache();
          var seed = {
            amount:    cached !== null ? cached : DEFAULT_BALANCE,
            currency:  DEFAULT_CURRENCY,
            updatedAt: new Date().toISOString(),
          };
          ref.set(seed).catch(function (e) { console.warn('[Balance] seed write failed:', e); });
          callback(seed);
        }
      })
      .catch(function (e) {
        console.warn('[Balance] load balance failed:', e);
        callback(null);
      });
  }

  function saveBalanceToFirestore(amount, currency) {
    var ref = balanceDocRef();
    if (!ref) return;
    var data = {
      amount:    amount,
      currency:  currency || _currency,
      updatedAt: new Date().toISOString(),
    };
    ref.set(data, { merge: true })
      .catch(function (e) { console.warn('[Balance] save balance failed:', e); });

    /* Mirror to localStorage — keeps SL module and notify module in sync */
    try { localStorage.setItem(LS_BALANCE_CACHE, String(amount)); } catch (e) {}
  }

  function loadBalanceFromCache() {
    try {
      var raw = localStorage.getItem(LS_BALANCE_CACHE);
      if (raw !== null) {
        var v = parseFloat(raw);
        return isNaN(v) ? null : v;
      }
    } catch (e) {}
    return null;
  }

  /* ══════════════════════════════════════════════════════════════════
     4. TRANSACTIONS  —  load / append  (same pattern as balance above)
  ══════════════════════════════════════════════════════════════════ */
  function loadTxnsFromFirestore(callback) {
    var ref = txnDocRef();
    if (!ref) { callback(null); return; }

    ref.get()
      .then(function (snap) {
        if (snap.exists) {
          callback(snap.data());
        } else {
          var seed = { entries: [], updatedAt: new Date().toISOString() };
          ref.set(seed).catch(function (e) { console.warn('[Balance] seed txn write failed:', e); });
          callback(seed);
        }
      })
      .catch(function (e) {
        console.warn('[Balance] load txns failed:', e);
        callback(null);
      });
  }

  function appendTxnToFirestore(entry) {
    var ref = txnDocRef();
    if (!ref) return;

    /* Use arrayUnion so concurrent writes don't clobber each other */
    ref.set(
      { entries: global.firebase.firestore.FieldValue.arrayUnion(entry), updatedAt: new Date().toISOString() },
      { merge: true }
    ).catch(function (e) { console.warn('[Balance] append txn failed:', e); });

    /* Also persist to local cache */
    _txns.unshift(entry);
    if (_txns.length > MAX_LOCAL_TXN) _txns = _txns.slice(0, MAX_LOCAL_TXN);
    try { localStorage.setItem(LS_TXN_CACHE, JSON.stringify(_txns)); } catch (e) {}
  }

  function loadTxnsFromCache() {
    try {
      var raw = localStorage.getItem(LS_TXN_CACHE);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [];
  }

  /* ══════════════════════════════════════════════════════════════════
     5. BALANCE MUTATION  —  public-facing helpers used by payment hooks
  ══════════════════════════════════════════════════════════════════ */

  /**
   * applyTopUp(amount, opts)
   * Called by toyyibPay callback or manual top-up.
   * opts: { description, ref, gateway, status }
   */
  function applyTopUp(amount, opts) {
    opts = opts || {};
    var prev    = _balance !== null ? _balance : (loadBalanceFromCache() || DEFAULT_BALANCE);
    var newBal  = Math.round((prev + amount) * 1e6) / 1e6;

    _balance = newBal;
    saveBalanceToFirestore(newBal, _currency);
    syncAllBalanceDOMs(newBal);

    var entry = {
      id:          'txn_' + Date.now(),
      type:        'topup',
      amount:      amount,
      balanceAfter: newBal,
      description: opts.description || 'Top-up',
      ref:         opts.ref         || '',
      gateway:     opts.gateway     || '',
      status:      opts.status      || 'completed',
      createdAt:   new Date().toISOString(),
    };
    appendTxnToFirestore(entry);
    renderTxnHistory();

    /* Fire existing slBalanceUpdate event so SL/notify modules respond */
    try {
      document.dispatchEvent(new CustomEvent('slBalanceUpdate', { detail: '$' + newBal.toFixed(2) }));
    } catch (e) {}

    /* Let T1Notify re-evaluate banners */
    try { if (global.T1Notify) global.T1Notify.evaluate(newBal); } catch (e) {}

    console.log('[Balance] Top-up applied. New balance:', newBal);
    return newBal;
  }

  /**
   * applyDeduction(amount, opts)
   * Called by SL module on instance billing tick.
   */
  function applyDeduction(amount, opts) {
    opts = opts || {};
    var prev    = _balance !== null ? _balance : (loadBalanceFromCache() || DEFAULT_BALANCE);
    var newBal  = Math.max(0, Math.round((prev - amount) * 1e6) / 1e6);

    _balance = newBal;
    saveBalanceToFirestore(newBal, _currency);
    syncAllBalanceDOMs(newBal);

    var entry = {
      id:          'txn_' + Date.now(),
      type:        'deduction',
      amount:      -amount,
      balanceAfter: newBal,
      description: opts.description || 'GPU compute charge',
      ref:         opts.ref         || '',
      gateway:     '',
      status:      'completed',
      createdAt:   new Date().toISOString(),
    };
    appendTxnToFirestore(entry);

    try {
      document.dispatchEvent(new CustomEvent('slBalanceUpdate', { detail: '$' + newBal.toFixed(2) }));
    } catch (e) {}
    try { if (global.T1Notify) global.T1Notify.evaluate(newBal); } catch (e) {}

    return newBal;
  }

  /* ══════════════════════════════════════════════════════════════════
     6. DOM SYNC  —  keep all balance displays in sync
        (extends the existing slBalanceUpdate listener pattern)
  ══════════════════════════════════════════════════════════════════ */
  function syncAllBalanceDOMs(amount) {
    var fmt = '$' + amount.toFixed(2);
    var ids = ['headerBalanceStat', 'balanceAmount', 'runwayBalance', 'sidebarBalance'];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        /* balanceAmount has no $ prefix in its own text — keep consistent */
        el.textContent = id === 'balanceAmount' ? fmt : fmt;
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     7. TRANSACTION HISTORY RENDERER
        Injects into #billingTxnList (card added to billing tab HTML)
  ══════════════════════════════════════════════════════════════════ */
  function renderTxnHistory() {
    var container = document.getElementById('billingTxnList');
    if (!container) return;

    var entries = _txns.slice(0, 20); // show latest 20

    if (entries.length === 0) {
      container.innerHTML =
        '<div style="text-align:center;padding:32px 20px;color:var(--t3);font-size:13px;">' +
        '<i class="ph-bold ph-receipt" style="font-size:32px;display:block;margin-bottom:10px;opacity:.3;"></i>' +
        'No transactions yet. Top up to get started.' +
        '</div>';
      return;
    }

    var rows = entries.map(function (e) {
      var isPos  = e.amount >= 0;
      var color  = isPos ? 'var(--b3)' : 'var(--b5)';
      var sign   = isPos ? '+' : '';
      var icon   = e.type === 'topup'      ? 'ph-arrow-circle-down'
                 : e.type === 'refund'     ? 'ph-arrow-u-up-left'
                 : e.type === 'adjustment' ? 'ph-sliders'
                 : 'ph-arrow-circle-up';
      var iconColor = isPos ? 'var(--b3)' : 'var(--b4)';

      var gwLabel = e.gateway === 'toyyibpay' ? 'toyyibPay'
                  : e.gateway === 'stripe'    ? 'Stripe'
                  : e.gateway === 'manual'    ? 'Manual'
                  : '';
      var refHtml = (e.ref && e.ref !== '')
        ? '<span style="font-size:10px;color:var(--t3);font-family:\'DM Mono\',monospace;margin-left:4px;">#' + e.ref + '</span>'
        : '';
      var gwHtml  = gwLabel
        ? '<span style="font-size:10px;color:var(--b2);background:rgba(167,139,250,.08);border:1px solid rgba(167,139,250,.15);padding:1px 7px;border-radius:4px;margin-left:5px;">' + gwLabel + '</span>'
        : '';

      var statusDot = e.status === 'completed' ? 'var(--b3)'
                    : e.status === 'pending'   ? 'var(--b4)'
                    : 'var(--b5)';

      var dateStr = '';
      try { dateStr = new Date(e.createdAt).toLocaleString(); } catch(x) { dateStr = e.createdAt; }

      return '<div style="display:flex;align-items:center;gap:12px;padding:11px 20px;border-bottom:1px solid var(--line);">' +
        '<div style="width:32px;height:32px;border-radius:var(--r1);background:rgba(52,211,153,.06);border:1px solid rgba(52,211,153,.1);display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
          '<i class="ph-fill ' + icon + '" style="font-size:16px;color:' + iconColor + ';"></i>' +
        '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:13px;font-weight:600;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
            e.description + gwHtml + refHtml +
          '</div>' +
          '<div style="font-size:11px;color:var(--t3);margin-top:2px;display:flex;align-items:center;gap:5px;">' +
            '<span style="width:6px;height:6px;border-radius:50%;background:' + statusDot + ';flex-shrink:0;display:inline-block;"></span>' +
            e.status.charAt(0).toUpperCase() + e.status.slice(1) +
            ' · ' + dateStr +
          '</div>' +
        '</div>' +
        '<div style="text-align:right;flex-shrink:0;">' +
          '<div style="font-size:14px;font-weight:700;font-family:\'DM Mono\',monospace;color:' + color + ';">' +
            sign + Math.abs(e.amount).toFixed(2) +
          '</div>' +
          '<div style="font-size:10px;color:var(--t3);margin-top:2px;">bal: $' + (e.balanceAfter || 0).toFixed(2) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    container.innerHTML = rows;
  }

  /* ══════════════════════════════════════════════════════════════════
     8. TOYYIBPAY INTEGRATION HOOK  —  ready to wire
        Call T1Balance.handleToyyibPayCallback(billCode, txnData) from
        your server-side redirect or webhook handler.
  ══════════════════════════════════════════════════════════════════ */
  function handleToyyibPayCallback(billCode, txnData) {
    /* txnData expected: { amount, status, ref, description } */
    txnData = txnData || {};
    if (!billCode) {
      console.warn('[Balance] toyyibPay callback missing billCode');
      return;
    }

    var status = (txnData.status === '1' || txnData.status === 1) ? 'completed' : 'failed';

    if (status === 'completed') {
      applyTopUp(parseFloat(txnData.amount) || 0, {
        description: txnData.description || 'Top-up via toyyibPay',
        ref:         billCode,
        gateway:     'toyyibpay',
        status:      'completed',
      });
    } else {
      /* Record failed attempt without mutating balance */
      var entry = {
        id:          'txn_' + Date.now(),
        type:        'topup',
        amount:      parseFloat(txnData.amount) || 0,
        balanceAfter: _balance !== null ? _balance : (loadBalanceFromCache() || DEFAULT_BALANCE),
        description: 'Top-up via toyyibPay (failed)',
        ref:         billCode,
        gateway:     'toyyibpay',
        status:      'failed',
        createdAt:   new Date().toISOString(),
      };
      appendTxnToFirestore(entry);
      renderTxnHistory();
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     9. BOOT  (mirrors pod-notify.js boot() exactly)
  ══════════════════════════════════════════════════════════════════ */
  function boot() {
    if (!initFirebase()) {
      /* Fallback: localStorage only */
      var cachedBal = loadBalanceFromCache();
      _balance = cachedBal !== null ? cachedBal : DEFAULT_BALANCE;
      _txns    = loadTxnsFromCache();
      syncAllBalanceDOMs(_balance);
      renderTxnHistory();
      _ready = true;
      return;
    }

    global.firebase.auth().onAuthStateChanged(function (user) {
      if (!user) return;
      _uid = user.uid;

      /* Show cached data immediately while Firestore loads */
      var cachedBal = loadBalanceFromCache();
      if (cachedBal !== null) {
        _balance = cachedBal;
        syncAllBalanceDOMs(_balance);
      }
      _txns = loadTxnsFromCache();
      renderTxnHistory();

      /* Load authoritative balance from Firestore */
      loadBalanceFromFirestore(function (balData) {
        if (balData) {
          _balance  = balData.amount;
          _currency = balData.currency || DEFAULT_CURRENCY;
          try { localStorage.setItem(LS_BALANCE_CACHE, String(_balance)); } catch (e) {}
          syncAllBalanceDOMs(_balance);
          /* Let T1Notify evaluate immediately with server balance */
          try { if (global.T1Notify) global.T1Notify.evaluate(_balance); } catch (e) {}
        }
      });

      /* Load transaction ledger from Firestore */
      loadTxnsFromFirestore(function (txnData) {
        if (txnData && Array.isArray(txnData.entries)) {
          /* Merge: server is authoritative; sort newest-first */
          _txns = txnData.entries.slice().sort(function (a, b) {
            return new Date(b.createdAt) - new Date(a.createdAt);
          });
          try { localStorage.setItem(LS_TXN_CACHE, JSON.stringify(_txns.slice(0, MAX_LOCAL_TXN))); } catch (e) {}
          renderTxnHistory();
        }
        _ready = true;
      });

      /* Hook into slBalanceUpdate event (fired by SL module each tick).
         Throttled: Firestore write at most once per 30s during active drain.
         localStorage is always kept current for instant cross-tab reads. */
      document.addEventListener('slBalanceUpdate', function (e) {
        if (!e.detail) return;
        var val = parseFloat(String(e.detail).replace('$', ''));
        if (isNaN(val) || val === _balance) return;
        _balance = val;
        /* Always keep localStorage current */
        try { localStorage.setItem(LS_BALANCE_CACHE, String(val)); } catch (ex) {}
        /* Throttle Firestore writes — max 1 per 30s */
        var now = Date.now();
        if (now - _lastFsWrite >= FS_WRITE_THROTTLE) {
          _lastFsWrite = now;
          saveBalanceToFirestore(val, _currency);
        }
      });
    });
  }

  /* ── Expose public API (mirrors T1Notify pattern) ── */
  global.T1Balance = {
    topUp:              applyTopUp,
    deduct:             applyDeduction,
    getBalance:         function () { return _balance; },
    getCurrency:        function () { return _currency; },
    getTransactions:    function () { return _txns.slice(); },
    renderHistory:      renderTxnHistory,
    isReady:            function () { return _ready; },
    /* toyyibPay hook — call this from your payment redirect handler */
    toyyibPayCallback:  handleToyyibPayCallback,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window);
