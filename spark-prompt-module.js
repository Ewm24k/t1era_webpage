import {
  initializeApp,
  getApps,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  deleteDoc,
  serverTimestamp,
  updateDoc,
  increment,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── CONFIG ──
const firebaseConfig = {
  apiKey: "AIzaSyBnt9mbb8LdMVeguSHUmS20L6uBHIfxwAs",
  authDomain: "t1era-v2.firebaseapp.com",
  projectId: "t1era-v2",
  storageBucket: "t1era-v2.firebasestorage.app",
  messagingSenderId: "279266491659",
  appId: "1:279266491659:web:28a03c7b7300fcb152b60e",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);

const SPARKS_COL = "sparks";
const PROMPT_TAB = "prompt";

// ══════════════════════════════════════════════════════════════
// PROMPT LIBRARY
// ══════════════════════════════════════════════════════════════
const PROMPT_LIBRARY = [
  {
    id: "p1",
    question:
      "What single habit completely changed your productivity — and could you ever go back to life without it?",
    hint: "Share a concrete habit, routine, or system that made the biggest difference.",
  },
  {
    id: "p2",
    question:
      "What is the most underrated tool for remote teams in 2025 that most people still haven't discovered?",
    hint: "Name it, explain what it does, and why it matters.",
  },
  {
    id: "p3",
    question:
      "Describe your ideal morning routine in 3 steps — be specific. What time, what actions, and what outcome?",
    hint: "Be precise: times, durations, and why each step matters to you.",
  },
  {
    id: "p4",
    question:
      "If you could only read one book this year to grow professionally, what would it be and why?",
    hint: "Give the title, one key insight, and who you'd recommend it to.",
  },
  {
    id: "p5",
    question:
      "What is the best career advice you ever received — and did you follow it?",
    hint: "Share the advice, who gave it, and how it shaped your path.",
  },
  {
    id: "p6",
    question:
      "What skill do you wish you had learned 5 years earlier, and how would it have changed things?",
    hint: "Be honest. This is about reflection, not showing off.",
  },
];

let _activePromptIndex = 0;

// ══════════════════════════════════════════════════════════════
// TIME HELPER
// ══════════════════════════════════════════════════════════════
function _timeAgo(ts) {
  if (!ts) return "just now";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 30) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const wks = Math.floor(days / 7);
  if (wks < 5) return `${wks}w ago`;
  const mths = Math.floor(days / 30);
  if (mths < 12) return `${mths}mo ago`;
  return `${Math.floor(mths / 12)}y ago`;
}

// ══════════════════════════════════════════════════════════════
// SKELETON HELPERS — show while fetching, hide when done
// mirrors hidePageSkeleton() behaviour in spark-module.js
// ══════════════════════════════════════════════════════════════
function _showPromptSkeleton() {
  const sk = document.getElementById("skPromptFeed");
  const real = document.getElementById("realPromptFeedWrap");
  if (sk) sk.classList.remove("sk-hidden");
  if (real) real.classList.add("sk-hidden");
}

function _hidePromptSkeleton() {
  const sk = document.getElementById("skPromptFeed");
  const real = document.getElementById("realPromptFeedWrap");
  if (sk) sk.classList.add("sk-hidden");
  if (real) real.classList.remove("sk-hidden");
}

// ══════════════════════════════════════════════════════════════
// DOTS MENU — dropdown with Delete (owner) or Report (others)
// ══════════════════════════════════════════════════════════════
function _closeAllDotsMenus() {
  document.querySelectorAll(".prompt-dots-menu").forEach((m) => m.remove());
}
window._closeAllDotsMenus = _closeAllDotsMenus;

function openPromptDotsMenu(btn, sparkId, ownerUid) {
  _closeAllDotsMenus();

  const isOwner = window._sparkUser && ownerUid === window._sparkUser.uid;

  const menu = document.createElement("div");
  menu.className = "prompt-dots-menu";
  menu.style.cssText = [
    "position:absolute",
    "right:0",
    "top:32px",
    "background:var(--bg-card)",
    "border:1px solid var(--border-2)",
    "border-radius:var(--r)",
    "box-shadow:0 8px 32px rgba(0,0,0,.55)",
    "min-width:160px",
    "z-index:350",
    "overflow:hidden",
    "animation:fu .18s var(--ease) forwards",
  ].join(";");

  if (isOwner) {
    const deleteBtn = document.createElement("button");
    deleteBtn.style.cssText = [
      "display:flex",
      "align-items:center",
      "gap:10px",
      "width:100%",
      "padding:11px 16px",
      "background:none",
      "border:none",
      "color:rgba(239,68,68,.85)",
      "font-size:13px",
      "font-weight:600",
      "font-family:var(--f-body)",
      "cursor:pointer",
      "transition:background .15s",
    ].join(";");
    deleteBtn.innerHTML = '<i class="ph-bold ph-trash" style="font-size:16px"></i> Delete Spark';
    deleteBtn.addEventListener("mouseover", () => { deleteBtn.style.background = "rgba(239,68,68,.08)"; });
    deleteBtn.addEventListener("mouseout", () => { deleteBtn.style.background = "none"; });
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      _promptDeleteCard(sparkId);
    });
    menu.appendChild(deleteBtn);
  } else {
    const reportBtn = document.createElement("button");
    reportBtn.style.cssText = [
      "display:flex",
      "align-items:center",
      "gap:10px",
      "width:100%",
      "padding:11px 16px",
      "background:none",
      "border:none",
      "color:var(--text-2)",
      "font-size:13px",
      "font-weight:600",
      "font-family:var(--f-body)",
      "cursor:pointer",
      "transition:background .15s",
    ].join(";");
    reportBtn.innerHTML = '<i class="ph-bold ph-flag" style="font-size:16px"></i> Report Spark';
    reportBtn.addEventListener("mouseover", () => { reportBtn.style.background = "rgba(255,255,255,.04)"; });
    reportBtn.addEventListener("mouseout", () => { reportBtn.style.background = "none"; });
    reportBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      _closeAllDotsMenus();
      if (typeof window.showToast === "function") window.showToast("Reported — thank you \uD83D\uDE4F");
    });
    menu.appendChild(reportBtn);
  }

  // Anchor menu to the dots button wrapper
  const wrapper = btn.parentElement;
  wrapper.style.position = "relative";
  wrapper.appendChild(menu);

  // Close on any outside click
  setTimeout(() => {
    document.addEventListener("click", _closeAllDotsMenus, { once: true });
  }, 0);
}
window.openPromptDotsMenu = openPromptDotsMenu;

// ══════════════════════════════════════════════════════════════
// DELETE PROMPT CARD — Firestore delete + DOM remove + toast
// ══════════════════════════════════════════════════════════════
async function _promptDeleteCard(sparkId) {
  _closeAllDotsMenus();
  if (!sparkId) return;
  if (!confirm("Delete this Prompt Spark? This cannot be undone.")) return;

  const card = document.querySelector(`.spark-card[data-spark-id="${sparkId}"]`);
  try {
    await deleteDoc(doc(db, SPARKS_COL, sparkId));
    if (card) card.remove();
    if (typeof window.showToast === "function")
      window.showToast("Prompt Spark deleted");
  } catch (e) {
    console.error("Delete prompt spark failed:", e);
    if (typeof window.showToast === "function")
      window.showToast("Delete failed — try again");
  }
}
window._promptDeleteCard = _promptDeleteCard;

// ══════════════════════════════════════════════════════════════
// COPY TO CLIPBOARD — used by quote block copy icon
// ══════════════════════════════════════════════════════════════
window._copyQuoteText = function (encodedText) {
  const text = decodeURIComponent(encodedText);
  const doFallback = () => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    if (typeof window.showToast === "function") window.showToast("Copied \u2713");
  };
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      if (typeof window.showToast === "function") window.showToast("Copied to clipboard \u2713");
    }).catch(doFallback);
  } else {
    doFallback();
  }
};

// ══════════════════════════════════════════════════════════════
// LIKE — full parity with standard spark
// Optimistic UI + delegates to _toggleLikeFn (XP + notif + activity)
// ══════════════════════════════════════════════════════════════
window._promptToggleLike = async function (btn) {
  const card = btn.closest(".spark-card[data-spark-id]");
  if (!card) return;
  const sparkId = card.dataset.sparkId;
  const ownerUid = card.dataset.ownerUid;
  const sparkText = card.querySelector(".spark-text")?.textContent?.slice(0, 80) || "";

  // Optimistic UI
  const on = btn.classList.toggle("liked");
  const icon = btn.querySelector("i");
  const cnt = btn.querySelector("span");
  const n = parseInt(cnt.textContent.replace(/[^0-9]/g, "")) || 0;
  icon.className = on ? "ph-fill ph-heart" : "ph-bold ph-heart";
  cnt.textContent = on ? n + 1 : Math.max(0, n - 1);

  // Persist via shared handler in spark-module.js (XP + notif)
  if (typeof window._toggleLikeFn === "function") {
    window._toggleLikeFn({ liked: on, sparkId, ownerUid, sparkText });
  }
};

// ══════════════════════════════════════════════════════════════
// BOOKMARK — full parity with standard spark (notification)
// ══════════════════════════════════════════════════════════════
window._promptToggleBookmark = function (btn) {
  const on = btn.classList.toggle("bookmarked");
  const icon = btn.querySelector("i");
  icon.className = on ? "ph-fill ph-bookmark-simple" : "ph-bold ph-bookmark-simple";
  btn.style.color = on ? "var(--gold)" : "";

  if (on && typeof window._sendNotifFn === "function") {
    const card = btn.closest(".spark-card[data-spark-id]");
    if (card) {
      window._sendNotifFn({
        type: "bookmark",
        ownerUid: card.dataset.ownerUid,
        sparkId: card.dataset.sparkId,
        sparkText: card.querySelector(".spark-text")?.textContent?.slice(0, 80) || "",
      });
    }
  }
};

// ══════════════════════════════════════════════════════════════
// RENDER PROMPT CARD
// ══════════════════════════════════════════════════════════════
function renderPromptCard(id, d, rankLabel) {
  const panel = document.getElementById("realPromptFeed");
  if (!panel) return;

  const name = d.authorName || "T1ERA User";
  const handle = d.authorHandle || "user";
  const photo = d.authorPhoto || "";
  const txt = d.text || "";
  const promptText = d.promptText || "";
  const initial = name[0].toUpperCase();

  const avBg = "background:linear-gradient(135deg,var(--pink),var(--purple))";
  const avInner = photo
    ? `<img src="${photo}" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" onerror="this.style.display='none'">`
    : initial;

  // Quote block — strip raw syntax, render with "Prompt" label + copy icon
  const quoteMatch = txt.match(/```quote\n([\s\S]*?)\n```/);
  const quoteContent = quoteMatch ? quoteMatch[1] : (d.quoteText || null);
  const displayRaw = quoteMatch ? txt.replace(/```quote\n[\s\S]*?\n```/, "").trim() : txt;

  const linkedTxt = displayRaw
    .replace(/(#\w+)/g, '<span class="ht">$1</span>')
    .replace(/(@\w+)/g, '<span class="mn">$1</span>');

  let quoteBlockHtml = "";
  if (quoteContent) {
    const escaped = quoteContent.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const encoded = encodeURIComponent(quoteContent);
    quoteBlockHtml = `<div class="quote-block" style="position:relative">
      <div class="quote-block-label" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span><i class="ph-bold ph-chat-teardrop-dots"></i> Prompt</span>
        <button onclick="event.stopPropagation();_copyQuoteText('${encoded}')" title="Copy to clipboard" style="background:none;border:none;cursor:pointer;color:var(--text-3);font-size:12px;padding:2px 5px;border-radius:4px;display:inline-flex;align-items:center;gap:3px;transition:color .15s;" onmouseover="this.style.color='var(--purple)'" onmouseout="this.style.color='var(--text-3)'"><i class="ph-bold ph-copy"></i></button>
      </div>${escaped}</div>`;
  }

  const safeText = txt.replace(/'/g, "\\'").slice(0, 80);
  const safePhoto = photo.replace(/'/g, "\\'");
  const safeOwnerUid = (d.uid || "").replace(/'/g, "\\'");

  const isOwner = d.uid && window._sparkUser && d.uid === window._sparkUser.uid;

  // Prompt question block shown above the user's answer
  const promptBlockHtml = promptText
    ? `<div class="prompt-card">
         <div class="prompt-label"><i class="ph-bold ph-chat-teardrop-dots"></i> Prompt</div>
         <p class="prompt-q">${promptText.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
       </div>`
    : "";

  const article = document.createElement("article");
  article.className = "spark-card fu";
  article.dataset.sparkId = id;
  article.dataset.ownerUid = d.uid || "";
  article.setAttribute("onclick", "openSparkDetail(this)");
  article.innerHTML = `
    <div class="card-head">
      <div class="av-wrap">
        <div class="spark-av" style="${avBg}">${avInner}</div>
      </div>
      <div class="card-meta">
        <div class="meta-row-1">
          <span class="author-name">${name}</span>
          <span class="author-handle">@${handle}</span>
          <span class="spark-time">${_timeAgo(d.createdAt)}</span>
        </div>
        <div class="badges-row">
          <span class="badge rank">${rankLabel || "LV 1"}</span>
          <span class="badge prompt-tag"><i class="ph-bold ph-chat-teardrop-dots"></i> Prompt</span>
          ${
            !isOwner
              ? (() => {
                  const isFollowing = window._followingSet && window._followingSet.has(d.uid || "");
                  return isFollowing
                    ? `<button class="badge follow-badge following" onclick="event.stopPropagation();toggleFollowBadge(this)"><i class="ph-bold ph-check"></i> Following</button>`
                    : `<button class="badge follow-badge" onclick="event.stopPropagation();toggleFollowBadge(this)"><i class="ph-bold ph-user-plus"></i> Follow</button>`;
                })()
              : ""
          }
        </div>
      </div>
      <button class="dots-btn" onclick="event.stopPropagation();openPromptDotsMenu(this,'${id}','${safeOwnerUid}')">
        <i class="ph-bold ph-dots-three-vertical"></i>
      </button>
    </div>
    <div class="card-content">
      ${promptBlockHtml}
      <p class="spark-text" style="margin-top:${promptText ? "10px" : "0"}">${linkedTxt}</p>
      ${quoteBlockHtml}
      ${typeof window._buildMediaGridHtml === "function" ? window._buildMediaGridHtml(d.images) : ""}
    </div>
    <div class="action-bar">
      <button class="act-btn like" id="plk-${id}" onclick="event.stopPropagation();_promptToggleLike(this)">
        <i class="ph-bold ph-heart"></i><span id="plkc-${id}">0</span>
      </button>
      <button class="act-btn reply" onclick="event.stopPropagation();openReply('${name}','${initial}','#8b5cf6','${safeText}','${id}','${d.uid || ""}','${handle}','${safePhoto}')">
        <i class="ph-bold ph-chat-circle"></i><span id="prpc-${id}">0</span>
      </button>
      <button class="act-btn repost" onclick="event.stopPropagation();toggleRepost(this)">
        <i class="ph-bold ph-repeat"></i><span>${d.reposts || 0}</span>
      </button>
      <button class="act-btn share" onclick="event.stopPropagation();shareSpark()">
        <i class="ph-bold ph-share-network"></i><span></span>
      </button>
      <button class="act-btn bookmark" id="pbk-${id}" onclick="event.stopPropagation();_promptToggleBookmark(this)" style="margin-left:auto">
        <i class="ph-bold ph-bookmark-simple"></i>
      </button>
    </div>
  `;

  const firstDemo = panel.querySelector(".spark-card:not([data-spark-id])");
  firstDemo ? panel.insertBefore(article, firstDemo) : panel.appendChild(article);

  // Fetch real like count + check if current user already liked
  const currentUid = window._sparkUser?.uid;
  getDocs(collection(db, SPARKS_COL, id, "likes"))
    .then((snap) => {
      const el = document.getElementById("plkc-" + id);
      if (el) el.textContent = snap.size;
      if (currentUid && snap.docs.some((s) => s.id === currentUid)) {
        const likeBtn = document.getElementById("plk-" + id);
        if (likeBtn) {
          likeBtn.classList.add("liked");
          likeBtn.querySelector("i").className = "ph-fill ph-heart";
        }
      }
    })
    .catch(() => {
      const el = document.getElementById("plkc-" + id);
      if (el) el.textContent = "0";
    });

  // Fetch real reply count
  getDocs(collection(db, SPARKS_COL, id, "comments"))
    .then((snap) => {
      const el = document.getElementById("prpc-" + id);
      if (el) el.textContent = snap.size;
    })
    .catch(() => {});
}

// ══════════════════════════════════════════════════════════════
// START PROMPT FEED
// Shows skeleton while fetching, hides it when data is ready
// ══════════════════════════════════════════════════════════════
async function startPromptFeed() {
  const container = document.getElementById("realPromptFeed");
  if (!container) return;

  // Show skeleton while loading
  _showPromptSkeleton();

  // Clear previously rendered Firestore cards
  container.querySelectorAll(".spark-card[data-spark-id]").forEach((el) => el.remove());

  // Spin refresh button
  const refreshBtn = document.getElementById("promptRefreshBtn");
  const icon = document.getElementById("promptRefreshIcon");
  if (refreshBtn) refreshBtn.classList.add("spinning");
  if (icon) icon.style.animation = "spin .6s linear";

  try {
    const snap = await getDocs(
      query(collection(db, SPARKS_COL), where("tab", "==", PROMPT_TAB)),
    );

    if (!snap.empty) {
      const docs = [];
      snap.forEach((d) => docs.push({ id: d.id, data: d.data() }));

      const toMs = (ts) => {
        if (!ts) return 0;
        if (ts.toMillis) return ts.toMillis();
        const ms = new Date(ts).getTime();
        return isNaN(ms) ? 0 : ms;
      };
      docs.sort((a, b) => toMs(b.data.createdAt) - toMs(a.data.createdAt));

      // Fetch ranks for each unique author
      const uniqueUids = [...new Set(docs.slice(0, 50).map(({ data: d }) => d.uid).filter(Boolean))];
      const rankCache = {};
      await Promise.all(
        uniqueUids.map(async (uid) => {
          try {
            const uSnap = await getDoc(doc(db, "users", uid));
            if (uSnap.exists()) {
              const ud = uSnap.data();
              const pt = ud.accountStatus?.point || ud.point || {};
              const totalXP =
                (pt.spark || 0) * 20 + (pt.like || 0) * 10 +
                (pt.reply || 0) * 40 + (pt.follower || 0) * 25;
              const XP_THRESHOLDS = [
                0, 550, 1650, 3300, 5500, 8250, 11550, 15400, 19800, 24750,
                30250, 36300, 42900, 50050, 57750, 66000, 74800, 84150, 94050,
                104500, 115500, 127050, 139150, 151800, 165000, 178750, 193050,
                207900, 223300, 239250,
              ];
              let computedLevel = 1;
              for (let i = XP_THRESHOLDS.length - 1; i >= 0; i--) {
                if (totalXP >= XP_THRESHOLDS[i]) { computedLevel = i + 1; break; }
              }
              rankCache[uid] = `LV ${computedLevel}`;
            } else {
              rankCache[uid] = "LV 1";
            }
          } catch {
            rankCache[uid] = "LV 1";
          }
        }),
      );

      docs.slice(0, 50).forEach(({ id, data }) =>
        renderPromptCard(id, data, rankCache[data.uid] || "LV 1"),
      );
    }
  } catch (e) {
    console.error("startPromptFeed error:", e);
  }

  // Always reveal real content and stop skeleton regardless of outcome
  _hidePromptSkeleton();
  if (refreshBtn) refreshBtn.classList.remove("spinning");
  if (icon) icon.style.animation = "";
}

// ══════════════════════════════════════════════════════════════
// PROMPT COMPOSE — open / close / cycle / input
// ══════════════════════════════════════════════════════════════
function openPromptCompose() {
  const box = document.getElementById("promptComposeBox");
  const toggle = document.getElementById("promptComposeToggle");
  if (!box) return;
  box.classList.add("open");
  if (toggle) toggle.style.display = "none";
  renderActivePromptInBox();
  setTimeout(() => {
    const ta = document.getElementById("promptTa");
    if (ta) ta.focus();
  }, 100);
}

function closePromptCompose() {
  const box = document.getElementById("promptComposeBox");
  const toggle = document.getElementById("promptComposeToggle");
  if (box) box.classList.remove("open");
  if (toggle) toggle.style.display = "flex";
  const ta = document.getElementById("promptTa");
  if (ta) ta.value = "";
  const cc = document.getElementById("promptCharCount");
  if (cc) { cc.textContent = "0 / 1500"; cc.className = "char-count"; }
  const btn = document.getElementById("promptSubmitBtn");
  if (btn) btn.disabled = true;
  const strip = document.getElementById("promptMediaStrip");
  if (strip) strip.innerHTML = "";
}

function renderActivePromptInBox() {
  const prompt = PROMPT_LIBRARY[_activePromptIndex];
  if (!prompt) return;
  const qEl = document.getElementById("promptActiveQuestion");
  const hintEl = document.getElementById("promptActiveHint");
  if (qEl) qEl.textContent = prompt.question;
  if (hintEl) hintEl.textContent = prompt.hint;
}

function cyclePrompt(direction) {
  _activePromptIndex =
    (_activePromptIndex + direction + PROMPT_LIBRARY.length) % PROMPT_LIBRARY.length;
  renderActivePromptInBox();
  const ta = document.getElementById("promptTa");
  if (ta) { ta.value = ""; ta.focus(); }
  const cc = document.getElementById("promptCharCount");
  if (cc) { cc.textContent = "0 / 1500"; cc.className = "char-count"; }
  const btn = document.getElementById("promptSubmitBtn");
  if (btn) btn.disabled = true;
}

function onPromptInput(ta) {
  const len = ta.value.length;
  const trim = ta.value.trim().length;
  const cc = document.getElementById("promptCharCount");
  if (cc) {
    cc.textContent = `${len} / 1500`;
    cc.className = "char-count" + (len >= 1500 ? " over" : len >= 1400 ? " warn" : "");
  }
  const btn = document.getElementById("promptSubmitBtn");
  if (btn) btn.disabled = trim === 0;
}

// ══════════════════════════════════════════════════════════════
// IMAGE COMPRESSION — max 800px, JPEG 0.72
// ══════════════════════════════════════════════════════════════
function _compressImage(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 800;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width >= height) { height = Math.round((height * MAX) / width); width = MAX; }
        else { width = Math.round((width * MAX) / height); height = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ══════════════════════════════════════════════════════════════
// ATTACH MEDIA — compress before storing in DOM
// ══════════════════════════════════════════════════════════════
function attachPromptMedia(input) {
  const strip = document.getElementById("promptMediaStrip");
  if (!strip) return;
  Array.from(input.files).forEach((file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const compressed = await _compressImage(e.target.result);
      const d = document.createElement("div");
      d.className = "media-thumb";
      d.dataset.type = "image";
      d.innerHTML = `<img src="${compressed}" alt=""><div class="media-type-tag">image</div><button class="media-thumb-remove" onclick="this.parentElement.remove()"><i class="ph-bold ph-x"></i></button>`;
      strip.appendChild(d);
      const btn = document.getElementById("promptSubmitBtn");
      if (btn) btn.disabled = false;
    };
    reader.readAsDataURL(file);
  });
  input.value = "";
}

// ══════════════════════════════════════════════════════════════
// SUBMIT PROMPT SPARK
// ══════════════════════════════════════════════════════════════
async function submitPromptSpark() {
  const user = window._sparkUser;
  if (!user) return;

  const ta = document.getElementById("promptTa");
  const txt = ta ? ta.value.trim() : "";
  if (!txt) return;

  const activePrompt = PROMPT_LIBRARY[_activePromptIndex];

  const btn = document.getElementById("promptSubmitBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Posting\u2026"; }

  const ud = window._sparkUserData || {};
  const name = ud.fullName || user.displayName || "T1ERA User";
  const handle = ud.nickname || (user.email || "user").split("@")[0];
  const photo = ud.profilePicture?.url || user.photoURL || "";

  try {
    const sparkData = {
      uid: user.uid,
      authorName: name,
      authorHandle: handle,
      authorPhoto: photo,
      text: txt,
      tab: PROMPT_TAB,
      promptText: activePrompt ? activePrompt.question : "",
      promptId: activePrompt ? activePrompt.id : "",
      createdAt: serverTimestamp(),
      likes: 0,
      replies: 0,
      reposts: 0,
    };

    // Collect compressed images
    const promptImgs = document.querySelectorAll("#promptMediaStrip .media-thumb img");
    if (promptImgs.length > 0) {
      sparkData.images = Array.from(promptImgs).map((img) => img.src);
    }

    // Save quoteText if user inserted a quote block
    const quoteMatch = txt.match(/```quote\n([\s\S]*?)\n```/);
    if (quoteMatch) sparkData.quoteText = quoteMatch[1];

    await addDoc(collection(db, SPARKS_COL), sparkData);

    // Award +1 spark point (= +20 XP)
    try {
      await updateDoc(doc(db, "users", user.uid), { "point.spark": increment(1) });
    } catch (xpe) {
      console.warn("XP spark award error:", xpe);
    }

    // Log to activity history
    try {
      await addDoc(collection(db, "users", user.uid, "activityHistory"), {
        type: "spark",
        icon: "ph-chat-teardrop-dots",
        iconColor: "var(--purple)",
        bgClass: "purple-bg",
        text: `<strong>Posted a Prompt Spark</strong>: "${txt.slice(0, 50)}${txt.length > 50 ? "\u2026" : ""}"`,
        createdAt: serverTimestamp(),
      });
    } catch (ae) {
      console.warn("activity log error:", ae);
    }

    if (typeof window.showToast === "function")
      window.showToast("Prompt Spark posted \uD83D\uDCAC");

    if (btn) { btn.disabled = false; btn.textContent = "Spark \u26A1"; }
    closePromptCompose();
    await startPromptFeed();
  } catch (e) {
    console.error("submitPromptSpark error:", e);
    alert("Failed to post. Please try again.");
    if (btn) { btn.disabled = false; btn.textContent = "Spark \u26A1"; }
  }
}

// ══════════════════════════════════════════════════════════════
// EXPOSE TO WINDOW
// ══════════════════════════════════════════════════════════════
window.startPromptFeed = startPromptFeed;
window.openPromptCompose = openPromptCompose;
window.closePromptCompose = closePromptCompose;
window.cyclePrompt = cyclePrompt;
window.onPromptInput = onPromptInput;
window.submitPromptSpark = submitPromptSpark;
window.attachPromptMedia = attachPromptMedia;

// Quote button delegates to insertQuoteFormat in spark-core.js
window.insertPromptQuoteBlock = function () {
  if (typeof insertQuoteFormat === "function") insertQuoteFormat("promptTa");
  const ta = document.getElementById("promptTa");
  if (ta) onPromptInput(ta);
};
