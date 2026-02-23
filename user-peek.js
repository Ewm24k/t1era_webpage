/**
 * user-peek.js — T1ERA
 * Handles the mini "peek card" preview when clicking a user in
 * the Following / Followers modal, and navigation to user-profile.html
 *
 * Depends on:
 *   window._currentUid        — logged-in user's UID
 *   window._myFollowingSet    — Set of UIDs the current user follows
 *   window._profileCache      — uid → profile cache (from profile.html)
 *   window._followCache       — follow doc cache
 *   Firebase (db, serverTimestamp, etc.) exposed via window._t1FirebaseReady
 */

(function () {
  'use strict';

  /* ═══════════════════════════════════════════
     WAIT FOR FIREBASE + DOM READY
  ═══════════════════════════════════════════ */
  function _ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  /* ═══════════════════════════════════════════
     STATE
  ═══════════════════════════════════════════ */
  let _peekUid = null;   // uid currently shown in peek card

  /* ═══════════════════════════════════════════
     OPEN PEEK CARD
  ═══════════════════════════════════════════ */
  window.openPeekCard = async function (uid) {
    if (!uid) return;
    _peekUid = uid;

    const overlay = document.getElementById('peekOverlay');
    const card    = document.getElementById('peekCard');
    if (!overlay || !card) return;

    // Show overlay with loading state
    card.innerHTML = _loadingHtml();
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Restore full card structure (loading replaced it)
    card.innerHTML = _cardShellHtml();

    // Try cache first, else fetch
    let profile = (window._profileCache && window._profileCache[uid]) || null;

    if (!profile) {
      profile = await _fetchProfile(uid);
    }

    if (!profile) {
      card.innerHTML = _errorHtml();
      return;
    }

    _populateCard(profile);
  };

  /* ═══════════════════════════════════════════
     CLOSE
  ═══════════════════════════════════════════ */
  window.closePeekCard = function () {
    const overlay = document.getElementById('peekOverlay');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
    _peekUid = null;
  };

  // Close on Escape key
  _ready(function () {
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') window.closePeekCard();
    });
  });

  /* ═══════════════════════════════════════════
     FETCH PROFILE FROM FIRESTORE (full data)
  ═══════════════════════════════════════════ */
  async function _fetchProfile(uid) {
    try {
      // Access Firestore via the globally-exposed db instance from profile.html
      const db = window._t1db;
      if (!db) return null;

      const { doc, getDoc, collection, getDocs, query, where } =
        window._t1FirestoreFns || {};
      if (!getDoc) return null;

      const snap = await getDoc(doc(db, 'users', uid));
      if (!snap.exists()) return null;

      const d = snap.data();

      // Follow counts
      let followersCount = '—';
      let followingCount = '—';
      try {
        const [fersSnap, fingSnap] = await Promise.all([
          getDocs(query(collection(db, 'follows'), where('followedId', '==', uid))),
          getDocs(query(collection(db, 'follows'), where('followerId', '==', uid))),
        ]);
        followersCount = fersSnap.size;
        followingCount = fingSnap.size;
      } catch (_) {}

      // Spark count
      let sparkCount = '—';
      try {
        const sparksSnap = await getDocs(
          query(collection(db, 'sparks'), where('uid', '==', uid))
        );
        sparkCount = sparksSnap.size;
      } catch (_) {}

      const profile = {
        uid,
        name:           d.fullName    || d.nickname || 'T1ERA User',
        handle:         d.nickname    || '',
        photo:          d.profilePicture?.url || '',
        rank:           d.rank?.title || 'Recruit',
        level:          d.rank?.level || 1,
        callsign:       d.callsign    || '',
        plan:           d.plan?.type  || 'free',
        verified:       d.accountStatus?.verified || false,
        acctType:       d.accountStatus?.type || 'standard',
        status:         d.userStatus  || '',
        bio:            d.userBio     || '',
        industry:       d.industry    || '',
        city:           d.city        || '',
        country:        d.country     || '',
        aiLevel:        d.aiLevel     || '',
        bannerPreset:   d.bannerImage?.preset || null,
        bannerUrl:      d.bannerImage?.url    || null,
        followersCount,
        followingCount,
        sparkCount,
      };

      // Update cache
      if (!window._profileCache) window._profileCache = {};
      window._profileCache[uid] = profile;

      return profile;
    } catch (e) {
      console.warn('openPeekCard fetch error:', e);
      return null;
    }
  }

  /* ═══════════════════════════════════════════
     POPULATE CARD DOM
  ═══════════════════════════════════════════ */
  function _populateCard(p) {
    const card = document.getElementById('peekCard');
    if (!card) return;

    // Rebuild full shell to be safe
    card.innerHTML = _cardShellHtml();

    // Banner
    const bannerBg = document.getElementById('peekBannerBg');
    if (bannerBg) {
      if (p.bannerUrl) {
        bannerBg.style.backgroundImage = `url('${p.bannerUrl}')`;
      } else if (p.bannerPreset) {
        const banner = document.getElementById('peekBanner');
        if (banner) {
          const presetMap = {
            default:  'banner-preset-default',
            midnight: 'banner-preset-midnight',
            cyber:    'banner-preset-cyber',
            pinky:    'banner-preset-pinky',
          };
          const cls = presetMap[p.bannerPreset];
          if (cls) banner.classList.add(cls);
        }
      }
    }

    // Avatar
    const avatarEl = document.getElementById('peekAvatar');
    if (avatarEl) {
      if (p.photo) {
        avatarEl.innerHTML = `<img src="${_esc(p.photo)}" referrerpolicy="no-referrer"
          onerror="this.style.display='none'" alt="avatar">`;
      } else {
        avatarEl.textContent = (p.name[0] || '?').toUpperCase();
      }
    }

    // Name + handle
    _setText('peekName', p.name);
    _setText('peekHandle', p.handle ? '@' + p.handle : '');

    // Badges row
    const badgesRow = document.getElementById('peekBadgesRow');
    if (badgesRow) {
      let html = `<span class="peek-rank-badge">⬡ LV${p.level} · ${_esc(p.rank)}</span>`;
      if (p.verified) {
        html += `<span class="peek-verified-badge">✓ Verified</span>`;
      }
      html += `<span class="peek-plan-badge">${_capitalize(p.plan)} Plan</span>`;
      badgesRow.innerHTML = html;
    }

    // Status + bio
    _setText('peekStatus', p.status);
    _setText('peekBio',    p.bio);
    if (!p.status) {
      const el = document.getElementById('peekStatus');
      if (el) el.style.display = 'none';
    }
    if (!p.bio) {
      const el = document.getElementById('peekBio');
      if (el) el.style.display = 'none';
    }

    // Stats
    _setText('peekSparks',    String(p.sparkCount));
    _setText('peekFollowers', String(p.followersCount));
    _setText('peekFollowing', String(p.followingCount));

    // Chips
    const chipsEl = document.getElementById('peekChips');
    if (chipsEl) {
      const chips = [];
      if (p.industry) chips.push({ icon: 'ph-briefcase',        label: _capitalize(p.industry) });
      if (p.city)     chips.push({ icon: 'ph-map-pin',          label: `${p.city}${p.country ? ', '+p.country : ''}` });
      if (p.aiLevel)  chips.push({ icon: 'ph-robot',            label: `AI: ${_capitalize(p.aiLevel)}`, cls: 'highlight' });
      if (p.callsign) chips.push({ icon: 'ph-identification-badge', label: p.callsign.toUpperCase() });
      chipsEl.innerHTML = chips.map(c =>
        `<span class="chip ${c.cls||''}" style="font-size:9.5px;padding:3px 8px;">
           <i class="ph-bold ${c.icon}"></i>${_esc(c.label)}
         </span>`
      ).join('');
    }

    // Follow button
    const followBtn = document.getElementById('peekFollowBtn');
    if (followBtn) {
      const myUid  = window._currentUid;
      const isSelf = p.uid === myUid;
      if (isSelf) {
        followBtn.className = 'peek-follow-btn self-view';
        followBtn.innerHTML = '<i class="ph-bold ph-user"></i> You';
      } else {
        const iFollow = window._myFollowingSet && window._myFollowingSet.has(p.uid);
        _setFollowBtnState(followBtn, iFollow ? 'friends' : 'follow');
      }
    }

    // Visit Profile link
    const visitBtn = document.getElementById('peekVisitBtn');
    if (visitBtn) {
      visitBtn.href = `user-profile.html?uid=${p.uid}`;
    }
  }

  /* ═══════════════════════════════════════════
     PEEK FOLLOW / UNFOLLOW
  ═══════════════════════════════════════════ */
  window.peekToggleFollow = async function () {
    const uid = _peekUid;
    if (!uid || !window._currentUid) return;

    const btn    = document.getElementById('peekFollowBtn');
    if (!btn) return;

    const iFollow  = window._myFollowingSet && window._myFollowingSet.has(uid);
    const action   = iFollow ? 'unfollow' : 'follow';

    // Optimistic UI update
    _setFollowBtnState(btn, action === 'follow' ? 'friends' : 'follow');

    // Delegate to the existing follow handler in profile.html
    // We create a dummy button proxy that matches the modalToggleFollow signature
    const proxyBtn = { className: '', innerHTML: '', setAttribute: ()=>{}, classList: { add: ()=>{}, remove: ()=>{} } };
    try {
      await window.modalToggleFollow(proxyBtn, uid, action);
    } catch (e) {
      // Revert on error
      _setFollowBtnState(btn, iFollow ? 'friends' : 'follow');
    }
  };

  function _setFollowBtnState(btn, state) {
    if (state === 'follow') {
      btn.className = 'peek-follow-btn';
      btn.innerHTML = '<i class="ph-bold ph-user-plus"></i> Follow';
    } else if (state === 'friends') {
      btn.className = 'peek-follow-btn friends';
      btn.innerHTML = '<i class="ph-bold ph-check"></i> Following';
    } else if (state === 'unfollow') {
      btn.className = 'peek-follow-btn following';
      btn.innerHTML = '<i class="ph-bold ph-user-minus"></i> Unfollow';
    }
  }

  /* ═══════════════════════════════════════════
     HTML TEMPLATES
  ═══════════════════════════════════════════ */
  function _cardShellHtml() {
    return `
      <button class="peek-close-btn" onclick="window.closePeekCard()">
        <i class="ph-bold ph-x"></i>
      </button>
      <div class="peek-banner" id="peekBanner">
        <div class="peek-banner-bg" id="peekBannerBg"></div>
      </div>
      <div class="peek-avatar-wrap">
        <div class="peek-avatar" id="peekAvatar"></div>
        <span class="peek-online-dot" id="peekOnlineDot"></span>
      </div>
      <div class="peek-identity">
        <div class="peek-name" id="peekName">—</div>
        <div class="peek-handle" id="peekHandle"></div>
        <div class="peek-badges-row" id="peekBadgesRow"></div>
        <div class="peek-status" id="peekStatus"></div>
        <div class="peek-bio" id="peekBio"></div>
      </div>
      <div class="peek-stats">
        <div class="peek-stat">
          <span class="peek-stat-num" id="peekSparks">—</span>
          <span class="peek-stat-label">Sparks</span>
        </div>
        <div class="peek-stat-divider"></div>
        <div class="peek-stat">
          <span class="peek-stat-num" id="peekFollowers">—</span>
          <span class="peek-stat-label">Followers</span>
        </div>
        <div class="peek-stat-divider"></div>
        <div class="peek-stat">
          <span class="peek-stat-num" id="peekFollowing">—</span>
          <span class="peek-stat-label">Following</span>
        </div>
      </div>
      <div class="peek-chips" id="peekChips"></div>
      <div class="peek-footer">
        <button class="peek-follow-btn" id="peekFollowBtn" onclick="window.peekToggleFollow()">
          <i class="ph-bold ph-user-plus"></i> Follow
        </button>
        <a class="peek-visit-btn" id="peekVisitBtn" href="#">
          <i class="ph-bold ph-arrow-square-out"></i> Visit Profile
        </a>
      </div>`;
  }

  function _loadingHtml() {
    return `<div class="peek-loading"><div class="peek-spinner"></div>Loading profile…</div>`;
  }

  function _errorHtml() {
    return `<div class="peek-loading" style="gap:10px;">
      <i class="ph-bold ph-warning" style="font-size:26px;color:rgba(239,68,68,0.5)"></i>
      Could not load profile.
      <button onclick="window.closePeekCard()" style="margin-top:6px;padding:6px 16px;border-radius:8px;background:var(--bg-3);border:1px solid var(--border);color:var(--text-2);font-size:11px;cursor:pointer;font-family:var(--font-body);">Close</button>
    </div>`;
  }

  /* ═══════════════════════════════════════════
     UTILITIES
  ═══════════════════════════════════════════ */
  function _setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val || '';
  }

  function _esc(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

})();
