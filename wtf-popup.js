/**
 * wtf-popup.js — T1ERA
 * "Who To Follow" bottom-sheet popup for mobile devices.
 *
 * Trigger conditions (checked after auth + data ready):
 *   - followers < 5  OR  following === 0  OR  following < 5
 *
 * Frequency limit:
 *   - Max 2 times per calendar day, tracked in localStorage
 *   - Never shown on desktop (>= 1080px)
 *   - Shown 2.5s after page load to avoid jarring the user
 *
 * Dependencies (must already exist on window):
 *   window._currentUid        — logged-in user UID
 *   window._followingSet      — Set of UIDs the current user follows
 *   window._t1db              — Firestore db instance
 *   window._t1FirestoreFns    — { collection, query, where, getDocs, doc, getDoc }
 *   window._followFn          — existing follow/unfollow handler
 */

(function () {
  "use strict";

  var STORAGE_KEY = "t1era_wtf_popup";
  var MAX_PER_DAY = 2;
  var DELAY_MS    = 2500;
  var POPUP_ID    = "wtfPopupSheet";

  /* ─── Guard: desktop never shows this ─── */
  function _isMobile() {
    return window.innerWidth < 1080;
  }

  /* ─── localStorage helpers ─── */
  function _getRecord() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function _saveRecord(record) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(record)); } catch (e) {}
  }

  function _todayKey() {
    var d = new Date();
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }

  function _canShowToday() {
    var record = _getRecord();
    var today  = _todayKey();
    if (!record || record.date !== today) return true;   // new day
    return record.count < MAX_PER_DAY;
  }

  function _markShown() {
    var record = _getRecord();
    var today  = _todayKey();
    if (!record || record.date !== today) {
      _saveRecord({ date: today, count: 1 });
    } else {
      _saveRecord({ date: today, count: record.count + 1 });
    }
  }

  /* ─── Check if user needs the nudge ─── */
  async function _shouldShow() {
    if (!_isMobile())       return false;
    if (!_canShowToday())   return false;

    var uid = window._currentUid;
    var fns = window._t1FirestoreFns;
    var db  = window._t1db;
    if (!uid || !fns || !db) return false;

    try {
      /* Following count — we already have the Set */
      var followingCount = window._followingSet
        ? window._followingSet.size
        : 0;

      /* Followers count — query follows collection */
      var fersSnap = await fns.getDocs(
        fns.query(fns.collection(db, "follows"), fns.where("followedId", "==", uid))
      );
      var followersCount = fersSnap.size;

      return followersCount < 5 || followingCount === 0 || followingCount < 5;
    } catch (e) {
      console.warn("wtf-popup _shouldShow error:", e);
      return false;
    }
  }

  /* ─── Fetch suggested users (same logic as sidebar) ─── */
  async function _fetchSuggestions() {
    var uid = window._currentUid;
    var fns = window._t1FirestoreFns;
    var db  = window._t1db;

    var snap = await fns.getDocs(fns.collection(db, "users"));
    var all  = [];
    snap.forEach(function (d) {
      if (d.id !== uid) all.push({ uid: d.id, data: d.data() });
    });

    /* Shuffle */
    for (var i = all.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = all[i]; all[i] = all[j]; all[j] = tmp;
    }

    return all.slice(0, 5);
  }

  /* ─── Safe HTML escape ─── */
  function _esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ─── Build and inject popup DOM ─── */
  function _buildPopup(users) {
    /* Remove any existing popup first */
    var existing = document.getElementById(POPUP_ID);
    if (existing) existing.remove();

    var gradients = [
      "linear-gradient(135deg,#8b5cf6,#c2185b)",
      "linear-gradient(135deg,#f59e0b,#f97316)",
      "linear-gradient(135deg,#10b981,#0ea5e9)",
      "linear-gradient(135deg,#ef4444,#f97316)",
      "linear-gradient(135deg,#3b82f6,#8b5cf6)",
    ];

    var rowsHtml = users.map(function (item, idx) {
      var u     = item.data;
      var uid   = item.uid;
      var pref  = u.displayNamePref || "fullName";
      var name  = pref === "nickname"
        ? (u.nickname || u.fullName || u.email && u.email.split("@")[0] || "T1ERA User")
        : (u.fullName || u.email && u.email.split("@")[0] || "T1ERA User");
      var handle = u.nickname || (u.email && u.email.split("@")[0]) || "user";
      var photo  = (u.profilePicture && u.profilePicture.url) || u.photoURL || "";
      var initial = name[0].toUpperCase();
      var grad   = gradients[idx % gradients.length];
      var isFollowing = window._followingSet && window._followingSet.has(uid);

      var avHtml = photo
        ? '<img src="' + _esc(photo) + '" referrerpolicy="no-referrer" '
          + 'style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" '
          + 'onerror="this.style.display=\'none\';this.parentElement.textContent=\'' + _esc(initial) + '\'">'
        : _esc(initial);

      return '<div class="wtf-popup-row" data-uid="' + _esc(uid) + '">'
        + '<div class="wtf-popup-av" style="background:' + grad + ';overflow:hidden;">' + avHtml + '</div>'
        + '<div class="wtf-popup-info">'
        +   '<div class="wtf-popup-name">' + _esc(name) + '</div>'
        +   '<div class="wtf-popup-sub">@' + _esc(handle) + '</div>'
        + '</div>'
        + '<button class="wtf-popup-btn' + (isFollowing ? ' on' : '') + '" data-fuid="' + _esc(uid) + '">'
        +   (isFollowing ? '✓ Following' : '+ Follow')
        + '</button>'
        + '</div>';
    }).join("");

    var html = ''
      + '<div id="wtfPopupBackdrop" style="'
      +   'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9998;'
      +   'opacity:0;transition:opacity 0.3s;-webkit-tap-highlight-color:transparent;'
      + '" onclick="window._wtfPopupClose()"></div>'

      + '<div id="' + POPUP_ID + '" style="'
      +   'position:fixed;bottom:0;left:0;right:0;z-index:9999;'
      +   'background:#141414;'
      +   'border-top:1px solid rgba(255,255,255,0.08);'
      +   'border-radius:20px 20px 0 0;'
      +   'padding:0 0 env(safe-area-inset-bottom,16px);'
      +   'transform:translateY(100%);'
      +   'transition:transform 0.35s cubic-bezier(0.4,0,0.2,1);'
      +   '-webkit-overflow-scrolling:touch;'
      + '">'

      /* Handle bar */
      + '<div style="display:flex;justify-content:center;padding:12px 0 4px;">'
      +   '<div style="width:36px;height:4px;border-radius:2px;background:rgba(255,255,255,0.15);"></div>'
      + '</div>'

      /* Header */
      + '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 20px 12px;">'
      +   '<div>'
      +     '<div style="font-size:15px;font-weight:700;color:#fff;font-family:\'DM Sans\',sans-serif;">Who to Follow</div>'
      +     '<div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:2px;font-family:\'Fira Code\',monospace;">Suggested for you</div>'
      +   '</div>'
      +   '<button onclick="window._wtfPopupClose()" style="'
      +     'width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.07);'
      +     'border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.5);'
      +     'font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;'
      +   '">✕</button>'
      + '</div>'

      /* User rows */
      + '<div style="padding:0 16px 16px;" id="wtfPopupList">'
      +   rowsHtml
      + '</div>'

      /* Dismiss link */
      + '<div style="text-align:center;padding:4px 0 12px;">'
      +   '<button onclick="window._wtfPopupClose()" style="'
      +     'background:none;border:none;color:rgba(255,255,255,0.3);font-size:11px;'
      +     'cursor:pointer;font-family:\'DM Sans\',sans-serif;padding:4px 12px;'
      +   '">Not now</button>'
      + '</div>'

      + '</div>';

    var wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper.firstElementChild); // backdrop
    document.body.appendChild(wrapper.lastElementChild);  // sheet

    /* Animate in — RAF double-flush for iOS Safari */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        var backdrop = document.getElementById("wtfPopupBackdrop");
        var sheet    = document.getElementById(POPUP_ID);
        if (backdrop) backdrop.style.opacity = "1";
        if (sheet)    sheet.style.transform  = "translateY(0)";
      });
    });

    /* Wire up follow buttons */
    var list = document.getElementById("wtfPopupList");
    if (list) {
      list.addEventListener("click", function (e) {
        var btn = e.target.closest(".wtf-popup-btn");
        if (!btn) return;
        var fuid = btn.getAttribute("data-fuid");
        if (!fuid || typeof window._followFn !== "function") return;
        window._followFn({ ownerUid: fuid, btn: btn, type: "wtf" });
      });
    }
  }

  /* ─── Close / destroy popup ─── */
  window._wtfPopupClose = function () {
    var backdrop = document.getElementById("wtfPopupBackdrop");
    var sheet    = document.getElementById(POPUP_ID);

    if (sheet)    sheet.style.transform  = "translateY(100%)";
    if (backdrop) backdrop.style.opacity = "0";

    setTimeout(function () {
      if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      if (sheet    && sheet.parentNode)    sheet.parentNode.removeChild(sheet);
    }, 380);
  };

  /* ─── Main entry: called after auth + data is ready ─── */
  window._initWtfPopup = async function () {
    try {
      var show = await _shouldShow();
      if (!show) return;

      _markShown();

      var users = await _fetchSuggestions();
      if (!users.length) return;

      setTimeout(function () {
        /* Re-check still mobile after delay (orientation change etc) */
        if (_isMobile()) _buildPopup(users);
      }, DELAY_MS);

    } catch (e) {
      console.warn("wtf-popup init error:", e);
    }
  };

  /* ─── CSS injected once ─── */
  (function _injectStyles() {
    if (document.getElementById("wtfPopupStyles")) return;
    var style = document.createElement("style");
    style.id  = "wtfPopupStyles";
    style.textContent = [
      ".wtf-popup-row{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);}",
      ".wtf-popup-row:last-child{border-bottom:none;}",
      ".wtf-popup-av{width:40px;height:40px;border-radius:50%;-webkit-border-radius:50%;-ms-flex-negative:0;flex-shrink:0;display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;}",
      ".wtf-popup-info{-webkit-box-flex:1;-ms-flex:1;flex:1;min-width:0;}",
      ".wtf-popup-name{font-size:13px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:'DM Sans',sans-serif;}",
      ".wtf-popup-sub{font-size:10px;color:rgba(255,255,255,0.35);font-family:'Fira Code',monospace;}",
      ".wtf-popup-btn{padding:5px 14px;border-radius:100px;font-size:11px;font-weight:700;border:1px solid #e91e8c;color:#e91e8c;background:transparent;cursor:pointer;white-space:nowrap;-webkit-transition:all 0.15s;transition:all 0.15s;font-family:'DM Sans',sans-serif;}",
      ".wtf-popup-btn:active,.wtf-popup-btn:hover{background:#e91e8c;color:#fff;}",
      ".wtf-popup-btn.on{border-color:rgba(255,255,255,0.13);color:rgba(255,255,255,0.35);background:rgba(255,255,255,0.05);}",
    ].join("");
    document.head.appendChild(style);
  })();

})();
