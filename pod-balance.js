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
  /* localStorage constants removed — Firestore is the only storage */
  var DEFAULT_BALANCE  = 142.50;
  var DEFAULT_CURRENCY = 'MYR';

  /* ══════════════════════════════════════════════════════════════════
     MODULE STATE  (mirror pod-notify.js _db / _uid / _prefs pattern)
  ══════════════════════════════════════════════════════════════════ */
  var _db            = null;
  var _uid           = null;
  var _balance       = null;   // current balance (number)
  var _currency      = DEFAULT_CURRENCY;
  var _txns          = [];     // in-memory transaction array
  var _ready         = false;
  var _lastFsWrite      = 0;       // timestamp of last Firestore balance write
  var FS_WRITE_THROTTLE = 30000;  // ms — max 1 Firestore write per 30s during tick
  var _unsubBalance     = null;   // Firestore onSnapshot unsubscribe fn

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
          /* First visit — seed with default balance */
          var seed = {
            amount:    DEFAULT_BALANCE,
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
  }

  /* loadBalanceFromCache removed — Firestore onSnapshot is the only source */

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

    /* Keep in-memory txn list updated for renderTxnHistory() */
    _txns.unshift(entry);
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
    if (_balance === null) { console.warn('[Balance] applyTopUp before Firestore loaded'); return null; }
    var prev    = _balance;
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

    /* ALWAYS use the in-memory _balance that was set by onSnapshot.
       Never fall back to localStorage — it may be from a different device
       or a stale session. If _balance is null, Firestore has not responded
       yet — defer the write until onSnapshot sets it. */
    if (_balance === null) {
      console.warn('[Balance] applyDeduction called before Firestore balance loaded — skipped.');
      return null;
    }

    var prev   = _balance;
    var newBal = Math.max(0, Math.round((prev - amount) * 1e6) / 1e6);

    /* Write to Firestore — onSnapshot will update DOM on ALL devices */
    saveBalanceToFirestore(newBal, _currency);

    /* Record transaction */
    if (amount > 0) {
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
    }

    try { if (global.T1Notify) global.T1Notify.evaluate(newBal); } catch (e) {}

    return newBal;
  }

  /* ══════════════════════════════════════════════════════════════════
     6. DOM SYNC  —  keep all balance displays in sync
        (extends the existing slBalanceUpdate listener pattern)
  ══════════════════════════════════════════════════════════════════ */
  function syncAllBalanceDOMs(amount) {
    var fmt = '$' + amount.toFixed(2);
    /* ALL balance display IDs across every tab and component */
    var ids = [
      'headerBalanceStat',
      'balanceAmount',
      'runwayBalance',
      'sidebarBalance',
      'slHeaderBalance',    /* balance chip inside serverless tab header */
      'headerBalanceStat',
    ];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = fmt;
    });
    /* Also update user-balance in sidebar (different selector) */
    var userBal = document.querySelector('.user-balance');
    if (userBal) userBal.textContent = fmt;
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
        balanceAfter: _balance !== null ? _balance : DEFAULT_BALANCE,
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
      console.warn('[Balance] Firebase not available — balance cannot be loaded.');
      _ready = true;
      return;
    }

    /* CRITICAL: Pod-workflow.html registers onAuthStateChanged first.
       Firebase fires it immediately from local cache.
       By the time pod-balance.js runs, auth is already resolved.
       onAuthStateChanged will NOT fire again — currentUser is already set.
       Read currentUser directly. Fall back to onAuthStateChanged only
       if not yet resolved (slow connection edge case). */
    function startBalanceSync(user) {
      if (!user) return;
      _uid = user.uid;

      /* Re-init _db if needed */
      if (!_db && global.firebase) {
        _db = global.firebase.firestore();
      }

      /* Detach any existing listener */
      if (_unsubBalance) { _unsubBalance(); _unsubBalance = null; }

      var _balRef = balanceDocRef();
      if (!_balRef) {
        console.warn('[Balance] balanceDocRef null — Firestore not ready');
        return;
      }

      /* Attach REALTIME listener — fires immediately with current value
         and again every time ANY device writes to this document.
         This is the ONLY place balance DOM is updated. */
      _unsubBalance = _balRef.onSnapshot(function (snap) {
        if (!snap.exists) {
          /* Document does not exist yet — create it with default */
          var seed = { amount: DEFAULT_BALANCE, currency: DEFAULT_CURRENCY, updatedAt: new Date().toISOString() };
          _balRef.set(seed).catch(function(e){ console.warn('[Balance] seed failed:', e); });
          return;
        }
        var data  = snap.data();
        _balance  = data.amount;
        _currency = data.currency || DEFAULT_CURRENCY;
        syncAllBalanceDOMs(_balance);
        try { if (global.T1Notify) global.T1Notify.evaluate(_balance); } catch (e) {}
      }, function (err) {
        console.warn('[Balance] onSnapshot error:', err);
      });

      /* Load transaction ledger */
      loadTxnsFromFirestore(function (txnData) {
        if (txnData && Array.isArray(txnData.entries)) {
          _txns = txnData.entries.slice().sort(function (a, b) {
            return new Date(b.createdAt) - new Date(a.createdAt);
          });
          renderTxnHistory();
        }
        _ready = true;
      });
    }

    /* Check currentUser directly first */
    var _authUser = global.firebase.auth
      ? global.firebase.auth().currentUser
      : null;

    if (_authUser) {
      startBalanceSync(_authUser);
    } else {
      var _unsub = global.firebase.auth().onAuthStateChanged(function (user) {
        _unsub();
        startBalanceSync(user);
      });
    }
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
