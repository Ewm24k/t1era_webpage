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

// ── CONFIG — same project as spark-module.js ──
const firebaseConfig = {
  apiKey: "AIzaSyBnt9mbb8LdMVeguSHUmS20L6uBHIfxwAs",
  authDomain: "t1era-v2.firebaseapp.com",
  projectId: "t1era-v2",
  storageBucket: "t1era-v2.firebasestorage.app",
  messagingSenderId: "279266491659",
  appId: "1:279266491659:web:28a03c7b7300fcb152b60e",
};

// Reuse existing Firebase app if already initialised (avoids duplicate-app error)
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);

const SPARKS_COL = "sparks";
const PROMPT_TAB = "prompt";
const DEV_EMAIL = "ewm24k@gmail.com";

// ══════════════════════════════════════════════════════════════
// PROMPT LIBRARY — rotating active prompts shown in compose box
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

// Track which prompt is active in the compose box
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

  const linkedTxt = txt
    .replace(/(#\w+)/g, '<span class="ht">$1</span>')
    .replace(/(@\w+)/g, '<span class="mn">$1</span>');

  const safeText = txt.replace(/'/g, "\\'").slice(0, 80);
  const safePhoto = photo.replace(/'/g, "\\'");

  const isOwner = d.uid && window._sparkUser && d.uid === window._sparkUser.uid;

  const dotsOrDelete = isOwner
    ? `<button class="dots-btn" onclick="event.stopPropagation();deletePromptCard(this)" title="Delete" style="color:var(--text-3)"><i class="ph-bold ph-trash"></i></button>`
    : `<button class="dots-btn" onclick="event.stopPropagation()"><i class="ph-bold ph-dots-three-vertical"></i></button>`;

  // Prompt block — shown above the reply text
  const promptBlockHtml = promptText
    ? `<div class="prompt-card">
               <div class="prompt-label"><i class="ph-bold ph-chat-teardrop-dots"></i> Prompt</div>
               <p class="prompt-q">${promptText.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
             </div>`
    : "";

  const article = document.createElement("article");
  article.className = "spark-card";
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
                  const isFollowing =
                    window._followingSet &&
                    window._followingSet.has(d.uid || "");
                  return isFollowing
                    ? `<button class="badge follow-badge following" onclick="event.stopPropagation();toggleFollowBadge(this)"><i class="ph-bold ph-check"></i> Following</button>`
                    : `<button class="badge follow-badge" onclick="event.stopPropagation();toggleFollowBadge(this)"><i class="ph-bold ph-user-plus"></i> Follow</button>`;
                })()
              : ""
          }
        </div>
      </div>
      ${dotsOrDelete}
    </div>
    <div class="card-content">
      ${promptBlockHtml}
      <p class="spark-text" style="margin-top:${promptText ? "10px" : "0"}">${linkedTxt}</p>
      ${typeof window._buildMediaGridHtml === "function" ? window._buildMediaGridHtml(d.images) : ""}
    </div>
    <div class="action-bar">
      <button class="act-btn like" id="plk-${id}" onclick="event.stopPropagation();toggleLike(this)"><i class="ph-bold ph-heart"></i><span id="plkc-${id}">0</span></button>
      <button class="act-btn reply" onclick="event.stopPropagation();openReply('${name}','${initial}','#8b5cf6','${safeText}','${id}','${d.uid || ""}','${handle}','${safePhoto}')"><i class="ph-bold ph-chat-circle"></i><span id="prpc-${id}">0</span></button>
      <button class="act-btn repost" onclick="event.stopPropagation();toggleRepost(this)"><i class="ph-bold ph-repeat"></i><span>${d.reposts || 0}</span></button>
      <button class="act-btn share" onclick="event.stopPropagation();shareSpark()"><i class="ph-bold ph-share-network"></i><span></span></button>
      <button class="act-btn bookmark" onclick="event.stopPropagation();toggleBookmark(this)" style="margin-left:auto"><i class="ph-bold ph-bookmark-simple"></i></button>
    </div>
  `;

  // Insert before first demo card (no data-spark-id) or append
  const firstDemo = panel.querySelector(".spark-card:not([data-spark-id])");
  if (firstDemo) {
    panel.insertBefore(article, firstDemo);
  } else {
    panel.appendChild(article);
  }

  // Fetch likes
  const currentUid = window._sparkUser?.uid;
  getDocs(collection(db, SPARKS_COL, id, "likes"))
    .then((snap) => {
      const el = document.getElementById("plkc-" + id);
      if (el) el.textContent = snap.size;
      if (currentUid) {
        const liked = snap.docs.some((d) => d.id === currentUid);
        if (liked) {
          const btn = document.getElementById("plk-" + id);
          if (btn) {
            btn.classList.add("liked");
            btn.querySelector("i").className = "ph-fill ph-heart";
            btn.querySelector("span").textContent = snap.size;
          }
        }
      }
    })
    .catch(() => {
      const el = document.getElementById("plkc-" + id);
      if (el) el.textContent = "0";
    });

  // Fetch reply count
  getDocs(collection(db, SPARKS_COL, id, "comments"))
    .then((snap) => {
      const el = document.getElementById("prpc-" + id);
      if (el) el.textContent = snap.size;
    })
    .catch(() => {});
}

// ══════════════════════════════════════════════════════════════
// START PROMPT FEED
// ══════════════════════════════════════════════════════════════
async function startPromptFeed() {
  const container = document.getElementById("realPromptFeed");
  if (!container) return;

  // Remove previously rendered Firestore cards
  container
    .querySelectorAll(".spark-card[data-spark-id]")
    .forEach((el) => el.remove());

  // Spin refresh icon
  const icon = document.getElementById("promptRefreshIcon");
  if (icon) icon.closest(".feed-refresh-btn")?.classList.add("spinning");

  try {
    const snap = await getDocs(
      query(collection(db, SPARKS_COL), where("tab", "==", PROMPT_TAB)),
    );

    if (snap.empty) {
      if (icon) icon.closest(".feed-refresh-btn")?.classList.remove("spinning");
      return;
    }

    const docs = [];
    snap.forEach((d) => docs.push({ id: d.id, data: d.data() }));

    // Sort newest-first
    const toMs = (ts) => {
      if (!ts) return 0;
      if (ts.toMillis) return ts.toMillis();
      const ms = new Date(ts).getTime();
      return isNaN(ms) ? 0 : ms;
    };
    docs.sort((a, b) => toMs(b.data.createdAt) - toMs(a.data.createdAt));

    // Fetch ranks
    const uniqueUids = [
      ...new Set(
        docs
          .slice(0, 50)
          .map(({ data: d }) => d.uid)
          .filter(Boolean),
      ),
    ];
    const rankCache = {};
    await Promise.all(
      uniqueUids.map(async (uid) => {
        try {
          const uSnap = await getDoc(doc(db, "users", uid));
          if (uSnap.exists()) {
            const ud = uSnap.data();
            const pt = ud.accountStatus?.point || ud.point || {};
            const totalXP =
              (pt.spark || 0) * 20 +
              (pt.like || 0) * 10 +
              (pt.reply || 0) * 40 +
              (pt.follower || 0) * 25;
            const XP_THRESHOLDS = [
              0, 550, 1650, 3300, 5500, 8250, 11550, 15400, 19800, 24750, 30250,
              36300, 42900, 50050, 57750, 66000, 74800, 84150, 94050, 104500,
              115500, 127050, 139150, 151800, 165000, 178750, 193050, 207900,
              223300, 239250,
            ];
            let computedLevel = 1;
            for (let i = XP_THRESHOLDS.length - 1; i >= 0; i--) {
              if (totalXP >= XP_THRESHOLDS[i]) {
                computedLevel = i + 1;
                break;
              }
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

    docs
      .slice(0, 50)
      .forEach(({ id, data }) =>
        renderPromptCard(id, data, rankCache[data.uid] || "LV 1"),
      );
  } catch (e) {
    console.error("startPromptFeed error:", e);
  }

  if (icon) icon.closest(".feed-refresh-btn")?.classList.remove("spinning");
}

// ══════════════════════════════════════════════════════════════
// PROMPT COMPOSE — open / close / switch prompt
// ══════════════════════════════════════════════════════════════
function openPromptCompose() {
  const box = document.getElementById("promptComposeBox");
  const toggle = document.getElementById("promptComposeToggle");
  if (!box) return;

  // Show the compose box
  box.classList.add("open");

  // Hide the toggle bar (match exactly how standard spark does it)
  if (toggle) toggle.style.display = "none";

  // Render the active prompt in the compose box
  renderActivePromptInBox();

  // Focus textarea with same delay pattern as openCompose() in spark-core.js
  setTimeout(() => {
    const ta = document.getElementById("promptTa");
    if (ta) ta.focus();
  }, 100);
}

function closePromptCompose() {
  const box = document.getElementById("promptComposeBox");
  const toggle = document.getElementById("promptComposeToggle");

  if (box) box.classList.remove("open");

  // Restore toggle — use "flex" to match its CSS display type (same as composeToggle)
  if (toggle) toggle.style.display = "flex";

  const ta = document.getElementById("promptTa");
  if (ta) ta.value = "";

  const cc = document.getElementById("promptCharCount");
  if (cc) {
    cc.textContent = "0 / 500";
    cc.className = "char-count";
  }

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
    (_activePromptIndex + direction + PROMPT_LIBRARY.length) %
    PROMPT_LIBRARY.length;
  renderActivePromptInBox();
  const ta = document.getElementById("promptTa");
  if (ta) {
    ta.value = "";
    ta.focus();
  }
  const cc = document.getElementById("promptCharCount");
  if (cc) {
    cc.textContent = "0 / 500";
    cc.className = "char-count";
  }
  const btn = document.getElementById("promptSubmitBtn");
  if (btn) btn.disabled = true;
}

function onPromptInput(ta) {
  const len = ta.value.length;
  const trim = ta.value.trim().length;
  const cc = document.getElementById("promptCharCount");
  if (cc) {
    cc.textContent = `${len} / 500`;
    cc.className =
      "char-count" + (len >= 500 ? " over" : len >= 400 ? " warn" : "");
  }
  const btn = document.getElementById("promptSubmitBtn");
  if (btn) btn.disabled = trim === 0;
}

// ══════════════════════════════════════════════════════════════
// ATTACH MEDIA (prompt compose strip)
// ══════════════════════════════════════════════════════════════
function attachPromptMedia(input) {
  const strip = document.getElementById("promptMediaStrip");
  if (!strip) return;
  Array.from(input.files).forEach((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const d = document.createElement("div");
      d.className = "media-thumb";
      d.dataset.type = "image";
      d.innerHTML = `<img src="${e.target.result}" alt=""><div class="media-type-tag">image</div><button class="media-thumb-remove" onclick="this.parentElement.remove()"><i class="ph-bold ph-x"></i></button>`;
      strip.appendChild(d);
    };
    reader.readAsDataURL(file);
  });
  const btn = document.getElementById("promptSubmitBtn");
  if (btn) btn.disabled = false;
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
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Posting…";
  }

  const ud = window._sparkUserData || {};
  const name = ud.fullName || user.displayName || "T1ERA User";
  const handle = (user.email || "user").split("@")[0];
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
    // Collect attached images from prompt media strip
    const promptImgs = document.querySelectorAll(
      "#promptMediaStrip .media-thumb[data-type='image'] img",
    );
    if (promptImgs.length > 0) {
      sparkData.images = Array.from(promptImgs).map((img) => img.src);
    }

    await addDoc(collection(db, SPARKS_COL), sparkData);

    // Award +20 XP for posting
    try {
      await updateDoc(doc(db, "users", user.uid), {
        "point.spark": increment(1),
      });
    } catch (xpe) {
      console.warn("XP spark award error:", xpe);
    }

    if (typeof window.showToast === "function")
      window.showToast("Prompt Spark posted 💬");

    if (btn) {
      btn.disabled = false;
      btn.textContent = "Spark ⚡";
    }

    closePromptCompose();
    await startPromptFeed();
  } catch (e) {
    console.error("submitPromptSpark error:", e);
    alert("Failed to post. Please try again.");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Spark ⚡";
    }
  }
}

// ══════════════════════════════════════════════════════════════
// DELETE PROMPT CARD (owner only)
// ══════════════════════════════════════════════════════════════
window.deletePromptCard = async function (btn) {
  const card = btn.closest(".spark-card[data-spark-id]");
  if (!card) return;
  const sparkId = card.dataset.sparkId;
  if (!sparkId) return;
  if (!confirm("Delete this Prompt Spark? This cannot be undone.")) return;
  try {
    await deleteDoc(doc(db, SPARKS_COL, sparkId));
    card.remove();
  } catch (e) {
    console.error("Delete failed:", e);
    alert("Failed to delete. Please try again.");
  }
};

// ══════════════════════════════════════════════════════════════
// EXPOSE TO WINDOW — called by HTML onclick attributes
// and by spark-module.js after auth + hidePageSkeleton()
// ══════════════════════════════════════════════════════════════
window.startPromptFeed = startPromptFeed;
window.openPromptCompose = openPromptCompose;
window.closePromptCompose = closePromptCompose;
window.cyclePrompt = cyclePrompt;
window.onPromptInput = onPromptInput;
window.submitPromptSpark = submitPromptSpark;
window.attachPromptMedia = attachPromptMedia;
