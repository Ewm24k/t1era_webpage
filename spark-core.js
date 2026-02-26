/* ══════════════════════════════════
   TABS
══════════════════════════════════ */
      function switchTab(i, btn) {
        document
          .querySelectorAll(".tab-btn")
          .forEach((b, j) => b.classList.toggle("active", j === i));
        document
          .querySelectorAll(".tab-panel")
          .forEach((p, j) => p.classList.toggle("active", j === i));

        // Tab 1 = Spark Prompt — start/stop its 35s auto-refresh timer
        if (i === 1) {
          if (typeof window.startPromptAutoRefresh === "function")
            window.startPromptAutoRefresh();
        } else {
          if (typeof window.stopPromptAutoRefresh === "function")
            window.stopPromptAutoRefresh();
        }
      }

      /* ══════════════════════════════════
   EMOJI PICKER
══════════════════════════════════ */
      const _EMOJIS = [
        "🪩",
        "🫧",
        "🌊",
        "🫠",
        "🥹",
        "🫶",
        "🦋",
        "🌸",
        "✨",
        "🔮",
        "🪄",
        "🫐",
        "🍄",
        "🦄",
        "🐉",
        "🌙",
        "⚡",
        "🔥",
        "💎",
        "🎯",
        "🫴",
        "🤌",
        "🫣",
        "🥷",
        "🌀",
        "🎪",
        "🪐",
        "🫀",
        "🧬",
        "🪬",
        "🛸",
        "🎭",
      ];
      let _emojiTargetId = "";

      function openEmojiPicker(targetId) {
        _emojiTargetId = targetId;
        const overlay = document.getElementById("emojiPickerOverlay");
        if (!overlay) return;
        const grid = document.getElementById("emojiPickerGrid");
        if (grid && grid.childElementCount === 0) {
          _EMOJIS.forEach((em) => {
            const btn = document.createElement("button");
            btn.textContent = em;
            btn.setAttribute("type", "button");
            btn.onclick = () => insertEmoji(em);
            grid.appendChild(btn);
          });
        }
        overlay.classList.add("open");
      }

      function closeEmojiPicker() {
        const overlay = document.getElementById("emojiPickerOverlay");
        if (overlay) overlay.classList.remove("open");
      }

      function insertEmoji(em) {
        const ta = document.getElementById(_emojiTargetId);
        if (!ta) {
          closeEmojiPicker();
          return;
        }
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        ta.value = ta.value.slice(0, start) + em + ta.value.slice(end);
        ta.selectionStart = ta.selectionEnd = start + em.length;
        ta.focus();
        // Trigger compose input update if it's the main compose box
        if (_emojiTargetId === "composeTa") onComposeInput(ta);
        // Trigger prompt input update if it's the prompt compose box
        if (_emojiTargetId === "promptTa" && typeof onPromptInput === "function") onPromptInput(ta);
        closeEmojiPicker();
      }

      /* ══════════════════════════════════
   QUOTE FORMAT
══════════════════════════════════ */
      function insertQuoteFormat(targetId) {
        const ta = document.getElementById(targetId);
        if (!ta) return;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const selected = ta.value.slice(start, end);
        const quoteText = selected.length > 0 ? selected : "Your quote here";
        const insert = `\`\`\`quote\n${quoteText}\n\`\`\``;
        ta.value = ta.value.slice(0, start) + insert + ta.value.slice(end);
        ta.selectionStart = ta.selectionEnd = start + insert.length;
        ta.focus();
        if (targetId === "composeTa") onComposeInput(ta);
        if (targetId === "promptTa" && typeof onPromptInput === "function") onPromptInput(ta);
      }

      /* ══════════════════════════════════
   COMPOSE BOX
══════════════════════════════════ */
      function openCompose() {
        document.getElementById("composeBox").classList.add("open");
        document.getElementById("composeToggle").style.display = "none";
        setTimeout(() => document.getElementById("composeTa").focus(), 100);
      }
      function closeCompose() {
        document.getElementById("composeBox").classList.remove("open");
        document.getElementById("composeToggle").style.display = "flex";
        document.getElementById("composeTa").value = "";
        document.getElementById("charCount").textContent = "0 / 500";
        document.getElementById("charCount").className = "char-count";
        document.getElementById("submitBtn").disabled = true;
        document.getElementById("mediaStrip").innerHTML = "";
        // Clear any YouTube preview
        window._pendingYtId = null;
        const ytPrev = document.getElementById("ytComposePreview");
        if (ytPrev) ytPrev.remove();
      }
      function getYtId(text) {
        const m = text.match(
          /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/))([a-zA-Z0-9_-]{11})/,
        );
        return m ? m[1] : null;
      }

      function onComposeInput(ta) {
        const n = ta.value.length;
        const trim = ta.value.trim().length;
        const cc = document.getElementById("charCount");
        cc.textContent = `${n} / 500`;
        cc.className =
          "char-count" + (n >= 500 ? " over" : n >= 400 ? " warn" : "");
        document.getElementById("submitBtn").disabled = trim === 0;

        // Detect YouTube URL in compose text
        const ytId = getYtId(ta.value);
        const existing = document.getElementById("ytComposePreview");

        if (ytId) {
          window._pendingYtId = ytId;
          if (!existing) {
            // Insert preview above the compose footer
            const footer = document.querySelector(".compose-footer");
            const wrap = document.createElement("div");
            wrap.id = "ytComposePreview";
            wrap.className = "yt-preview-wrap";
            wrap.innerHTML = `
        <div class="yt-thumb-wrap" onclick="openYtModal('${ytId}')">
          <img src="https://i.ytimg.com/vi/${ytId}/hqdefault.jpg" alt="YouTube preview">
          <div class="yt-play-btn"><div class="yt-play-icon"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div></div>
        </div>
        <div class="yt-label">
          <div class="yt-logo"><svg viewBox="0 0 24 24"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z"/></svg></div>
          <span class="yt-url-text">youtube.com/watch?v=${ytId}</span>
          <button class="yt-remove-btn" onclick="event.stopPropagation();removeYtPreview()"><i class="ph-bold ph-x"></i></button>
        </div>
      `;
            footer.parentNode.insertBefore(wrap, footer);
          }
        } else {
          window._pendingYtId = null;
          if (existing) existing.remove();
        }
      }

      function removeYtPreview() {
        window._pendingYtId = null;
        const el = document.getElementById("ytComposePreview");
        if (el) el.remove();
      }

      function openYtModal(videoId) {
        const wrap = document.getElementById("ytModalIframeWrap");
        wrap.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>`;
        document.getElementById("ytModalOverlay").classList.add("open");
      }

      function closeYtModal() {
        document.getElementById("ytModalOverlay").classList.remove("open");
        document.getElementById("ytModalIframeWrap").innerHTML = "";
      }

      /* ══════════════════════════════════
   MEDIA ATTACH
══════════════════════════════════ */
      const IMAGE_MAX = 4;

      function attachMedia(input, type) {
        const strip = document.getElementById("mediaStrip");
        const files = Array.from(input.files);

        // For images, enforce 4-per-upload max
        if (type === "image") {
          const existing = strip.querySelectorAll(".media-thumb[data-type='image']").length;
          const slots = IMAGE_MAX - existing;
          if (slots <= 0) {
            if (typeof window.showToast === "function")
              window.showToast("Max 4 images per Spark 📷");
            input.value = "";
            return;
          }
          // Slice to however many slots remain
          const allowed = files.slice(0, slots);
          if (files.length > slots && typeof window.showToast === "function")
            window.showToast(`Only ${slots} image slot${slots === 1 ? "" : "s"} remaining — added ${allowed.length}`);
          allowed.forEach((file) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              const d = document.createElement("div");
              d.className = "media-thumb";
              d.dataset.type = "image";
              d.innerHTML =
                `<img src="${e.target.result}" alt="">` +
                `<div class="media-type-tag">image</div>` +
                `<button class="media-thumb-remove" onclick="this.parentElement.remove()"><i class="ph-bold ph-x"></i></button>`;
              strip.appendChild(d);
            };
            reader.readAsDataURL(file);
          });
        } else {
          // Non-image types — no count restriction
          files.forEach((file) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              const d = document.createElement("div");
              d.className = "media-thumb";
              d.dataset.type = type;
              const ext = file.name.split(".").pop().toUpperCase();
              let inner = "";
              if (type === "video")
                inner = `<video src="${e.target.result}" muted></video>`;
              else if (type === "audio")
                inner = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-3);font-size:26px;"><i class="ph-bold ph-music-note"></i></div>`;
              else
                inner = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-3);font-size:26px;"><i class="ph-bold ph-file-text"></i></div>`;
              d.innerHTML =
                inner +
                `<div class="media-type-tag">${type === "file" ? ext : type}</div>` +
                `<button class="media-thumb-remove" onclick="this.parentElement.remove()"><i class="ph-bold ph-x"></i></button>`;
              strip.appendChild(d);
            };
            reader.readAsDataURL(file);
          });
        }

        document.getElementById("submitBtn").disabled = false;
        input.value = "";
      }

      function attachPromptMedia(input) {
        const strip = document.getElementById("promptMediaStrip");
        if (!strip) return;
        const files = Array.from(input.files);
        const existing = strip.querySelectorAll(".media-thumb[data-type='image']").length;
        const slots = IMAGE_MAX - existing;
        if (slots <= 0) {
          if (typeof window.showToast === "function")
            window.showToast("Max 4 images per Spark 📷");
          input.value = "";
          return;
        }
        const allowed = files.slice(0, slots);
        if (files.length > slots && typeof window.showToast === "function")
          window.showToast(`Only ${slots} slot${slots === 1 ? "" : "s"} left — added ${allowed.length}`);
        allowed.forEach((file) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const d = document.createElement("div");
            d.className = "media-thumb";
            d.dataset.type = "image";
            d.innerHTML =
              `<img src="${e.target.result}" alt="">` +
              `<div class="media-type-tag">image</div>` +
              `<button class="media-thumb-remove" onclick="this.parentElement.remove()"><i class="ph-bold ph-x"></i></button>`;
            strip.appendChild(d);
          };
          reader.readAsDataURL(file);
        });
        const ta = document.getElementById("promptTa");
        const btn = document.getElementById("promptSubmitBtn");
        if (btn && ta && ta.value.trim().length > 0) btn.disabled = false;
        input.value = "";
      }
      window.attachPromptMedia = attachPromptMedia;

      function submitSpark() {
        // Delegated to Firebase module — window._submitSparkFn is set by the module script below
        if (typeof window._submitSparkFn === "function") {
          window._submitSparkFn();
        }
      }

      function toggleNotifPanel() {
        // Close settings if open
        document.getElementById("settingsPanel").classList.remove("open");
        const panel = document.getElementById("notifPanel");
        const backdrop = document.getElementById("notifBackdrop");
        const isOpen = panel.classList.toggle("open");
        backdrop.classList.toggle("open", isOpen);
        if (isOpen && typeof window._loadNotifsFn === "function")
          window._loadNotifsFn();
      }
      function closeNotifPanel() {
        document.getElementById("notifPanel").classList.remove("open");
        document.getElementById("notifBackdrop").classList.remove("open");
      }
      window.closeNotifPanel = closeNotifPanel;
      function toggleSettingsPanel() {
        // Close notif panel if open
        document.getElementById("notifPanel").classList.remove("open");
        const panel = document.getElementById("settingsPanel");
        const backdrop = document.getElementById("settingsBackdrop");
        const isOpen = panel.classList.toggle("open");
        backdrop.classList.toggle("open", isOpen);
      }
      function closeSettingsPanel() {
        document.getElementById("settingsPanel").classList.remove("open");
        document.getElementById("settingsBackdrop").classList.remove("open");
      }
      function markAllRead() {
        if (typeof window._markAllReadFn === "function")
          window._markAllReadFn();
      }

      function triggerFeedRefresh() {
        const btn = document.getElementById("feedRefreshBtn");
        const icon = document.getElementById("feedRefreshIcon");
        if (!btn) return;
        btn.classList.add("spinning");
        icon.style.animation = "spin .6s linear";
        setTimeout(() => {
          btn.classList.remove("spinning");
          icon.style.animation = "";
        }, 650);
        if (typeof window._startFeedFn === "function") window._startFeedFn();
      }

      /* ══════════════════════════════════
   LIKE / REPOST / SHARE / BOOKMARK
══════════════════════════════════ */
      function toggleLike(btn) {
        const card = btn.closest(".spark-card[data-spark-id]");

        // Demo cards (no data-spark-id) — local toggle only, no Firestore
        if (!card) {
          const on = btn.classList.toggle("liked");
          const icon = btn.querySelector("i");
          const cnt = btn.querySelector("span");
          const n = parseInt(cnt.textContent.replace(/[^0-9]/g, "")) || 0;
          icon.className = on ? "ph-fill ph-heart" : "ph-bold ph-heart";
          cnt.textContent = on ? n + 1 : Math.max(0, n - 1);
          return;
        }

        const sparkId = card.dataset.sparkId;
        const ownerUid = card.dataset.ownerUid;
        const sparkText =
          card.querySelector(".spark-text")?.textContent?.slice(0, 80) || "";

        // Optimistic UI update immediately
        const on = btn.classList.toggle("liked");
        const icon = btn.querySelector("i");
        const cnt = btn.querySelector("span");
        const n = parseInt(cnt.textContent.replace(/[^0-9]/g, "")) || 0;
        icon.className = on ? "ph-fill ph-heart" : "ph-bold ph-heart";
        cnt.textContent = on ? n + 1 : Math.max(0, n - 1);

        // Persist to Firestore via module
        if (typeof window._toggleLikeFn === "function") {
          window._toggleLikeFn({ liked: on, sparkId, ownerUid, sparkText });
        }
      }
      function toggleRepost(btn) {
        const on = btn.classList.toggle("reposted");
        const cnt = btn.querySelector("span");
        const n = parseInt(cnt.textContent.replace(/[^0-9]/g, "")) || 0;
        cnt.textContent = on ? n + 1 : Math.max(0, n - 1);
      }
      function toggleBookmark(btn) {
        const on = btn.classList.toggle("bookmarked");
        const icon = btn.querySelector("i");
        icon.className = on
          ? "ph-fill ph-bookmark-simple"
          : "ph-bold ph-bookmark-simple";
        if (on) btn.style.color = "var(--gold)";
        else btn.style.color = "";
        // Fire notification to post owner on bookmark (not on unbookmark)
        if (on && typeof window._sendNotifFn === "function") {
          const card = btn.closest(".spark-card[data-spark-id]");
          if (card) {
            const sparkId = card.dataset.sparkId;
            const ownerUid = card.dataset.ownerUid;
            const sparkText =
              card.querySelector(".spark-text")?.textContent?.slice(0, 80) ||
              "";
            window._sendNotifFn({
              type: "bookmark",
              ownerUid,
              sparkId,
              sparkText,
            });
          }
        }
      }
      function shareSpark() {
        if (navigator.share)
          navigator.share({ title: "T1ERA Spark", url: location.href });
        else
          navigator.clipboard
            .writeText(location.href)
            .then(() => alert("Link copied!"));
      }

      /* ══════════════════════════════════
   FOLLOW TOGGLES
══════════════════════════════════ */
      function toggleFollow(btn) {
        // pill buttons on demo cards (no data-spark-id on parent) — delegate to _followFn if ownerUid available
        const card = btn.closest(".spark-card");
        const ownerUid = card ? card.dataset.ownerUid : "";
        if (ownerUid && typeof window._followFn === "function") {
          window._followFn({ ownerUid, btn, type: "pill" });
        } else {
          // fallback UI-only for demo static cards
          const on = btn.classList.toggle("on");
          btn.innerHTML = on
            ? "Following"
            : '<i class="ph-bold ph-plus"></i> Follow';
        }
      }
      function toggleWtf(btn) {
        const on = btn.classList.toggle("on");
        btn.textContent = on ? "✓ Following" : "+ Follow";
      }
      function togglePopupFollow(btn) {
        const on = btn.classList.toggle("on");
        btn.textContent = on ? "✓ Following" : "+ Follow";
      }
      // Follow badge on feed cards — wired to Firestore
      function toggleFollowBadge(btn) {
        const card = btn.closest(".spark-card");
        const ownerUid = card ? card.dataset.ownerUid : "";
        if (ownerUid && typeof window._followFn === "function") {
          window._followFn({ ownerUid, btn, type: "badge" });
        }
      }

      /* ══════════════════════════════════
   PROFILE POPUP
══════════════════════════════════ */
      let _pName = "",
        _pAv = "",
        _pColor = "";
      function showProfile(
        name,
        handle,
        rank,
        following,
        followers,
        bio,
        color,
        verified,
      ) {
        _pName = name;
        _pAv = handle[0].toUpperCase();
        _pColor = color;
        document.getElementById("popupName").textContent = name;
        document.getElementById("popupHandle").textContent = "@" + handle;
        document.getElementById("popupBio").textContent = bio;
        document.getElementById("popupAv").textContent = name[0].toUpperCase();
        document.getElementById("popupAv").style.background =
          `linear-gradient(135deg,${color},#8b5cf6)`;
        document.getElementById("popupBanner").style.background =
          `linear-gradient(135deg,${color}66,rgba(139,92,246,.35))`;
        document.getElementById("popupStats").innerHTML = `
    <div class="popup-stat"><div class="pstat-num">${following}</div><div class="pstat-label">Following</div></div>
    <div class="popup-stat"><div class="pstat-num">${followers}</div><div class="pstat-label">Followers</div></div>
    <div class="popup-stat"><div class="pstat-num">${Math.floor(Math.random() * 80 + 5)}</div><div class="pstat-label">Sparks</div></div>
  `;
        document.getElementById("popupBadges").innerHTML =
          `<span class="badge rank">${rank}</span>` +
          (verified ? '<span class="badge verified">✓ Verified</span>' : "");
        // reset follow btn
        const fb = document.getElementById("popupFollowBtn");
        fb.classList.remove("on");
        fb.textContent = "+ Follow";
        if (handle === "ewm24k") {
          fb.classList.add("on");
          fb.textContent = "✓ Following";
        }
        document.getElementById("popupOverlay").classList.add("open");
      }
      function closeProfile() {
        document.getElementById("popupOverlay").classList.remove("open");
      }

      /* ══════════════════════════════════
   REPLY MODAL
══════════════════════════════════ */
      // Global reply context — set when reply sheet opens
      window._replyCtx = {};

      function openReply(
        author,
        initials,
        color,
        text,
        sparkId,
        ownerUid,
        ownerHandle,
        ownerPhoto,
      ) {
        // Store context for submitReply
        window._replyCtx = {
          sparkId: sparkId || "",
          ownerUid: ownerUid || "",
          ownerHandle: ownerHandle || "",
          author: author || "",
        };

        // Populate origAv — photo if available, else initial
        const origAvEl = document.getElementById("origAv");
        origAvEl.style.background = `linear-gradient(135deg,${color || "#c2185b"},#8b5cf6)`;
        if (ownerPhoto) {
          origAvEl.innerHTML = `<img src="${ownerPhoto}" referrerpolicy="no-referrer" alt="" onerror="this.parentElement.innerHTML='${initials || "?"}';this.parentElement.style.background='linear-gradient(135deg,${color || "#c2185b"},#8b5cf6)'">`;
        } else {
          origAvEl.textContent = initials || "?";
        }
        document.getElementById("origAuthor").textContent = author || "";
        document.getElementById("origText").textContent = text || "";

        // Auto-mention the post owner in the textarea
        const mention = ownerHandle ? `@${ownerHandle} ` : "";
        document.getElementById("replyTa").value = mention;

        document.getElementById("replyOverlay").classList.add("open");

        // Load real replies from Firestore if sparkId present
        if (sparkId && typeof window._loadRepliesFn === "function") {
          window._loadRepliesFn(sparkId);
        } else {
          // clear static demo replies for demo cards
          document.getElementById("repliesList").innerHTML = "";
        }

        setTimeout(() => {
          const ta = document.getElementById("replyTa");
          ta.focus();
          // Move cursor to end
          ta.selectionStart = ta.selectionEnd = ta.value.length;
        }, 320);
      }

      function closeReply() {
        document.getElementById("replyOverlay").classList.remove("open");
        window._replyCtx = {};
      }
      window.closeReply = closeReply; // expose to module script

      function submitReply() {
        const txt = document.getElementById("replyTa").value.trim();
        if (!txt) return;
        if (typeof window._submitReplyFn === "function") {
          window._submitReplyFn(txt);
        }
      }

      /* ══════════════════════════════════
   SPARK DETAIL (click card body)
══════════════════════════════════ */
      function openSparkDetail(card) {
        const nameEl = card.querySelector(".author-name");
        const textEl = card.querySelector(".spark-text");
        const avEl = card.querySelector(".spark-av");
        const handleEl = card.querySelector(".author-handle");
        if (!nameEl || !textEl) return;

        const sparkId = card.dataset.sparkId || "";
        const ownerUid = card.dataset.ownerUid || "";
        const ownerHandle = handleEl
          ? handleEl.textContent.trim().replace("@", "")
          : "";
        const initial = avEl ? avEl.textContent.trim() : "?";
        // Extract photo URL from spark-av img if present
        const avImg = avEl ? avEl.querySelector("img") : null;
        const ownerPhoto = avImg ? avImg.src : "";

        openReply(
          nameEl.textContent.trim(),
          initial,
          "#c2185b",
          textEl.textContent.trim().slice(0, 120),
          sparkId,
          ownerUid,
          ownerHandle,
          ownerPhoto,
        );
      }

      /* ══════════════════════════════════
   KEYBOARD
══════════════════════════════════ */
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          closeProfile();
          closeReply();
          closeCompose();
        }
      });

      /* ══════════════════════════════════
   TOAST
══════════════════════════════════ */
      function showToast(msg) {
        let t = document.getElementById("globalToast");
        if (!t) {
          t = document.createElement("div");
          t.id = "globalToast";
          t.className = "toast-msg";
          document.body.appendChild(t);
        }
        t.textContent = msg;
        t.classList.add("show");
        clearTimeout(t._hideTimer);
        t._hideTimer = setTimeout(() => {
          t.classList.remove("show");
        }, 2600);
      }
      window.showToast = showToast;

      /* ══════════════════════════════════
   REPLY FROM NOTIFICATION
══════════════════════════════════ */
      function replyFromNotif(
        sparkId,
        ownerUid,
        fromName,
        fromHandle,
        sparkText,
        notifId,
        ownerPhoto,
      ) {
        closeNotifPanel();
        openReply(
          fromName,
          fromName[0].toUpperCase(),
          "#8b5cf6",
          sparkText || "",
          sparkId,
          ownerUid,
          fromHandle,
          ownerPhoto || "",
        );
        // Store notifId so _submitReplyFn can mark it as read on successful reply
        if (window._replyCtx) window._replyCtx.notifId = notifId || "";
      }
      window.replyFromNotif = replyFromNotif;

      /* ══════════════════════════════════
   REPLY TO A REPLY ITEM (in-sheet)
══════════════════════════════════ */
      function replyToReplyItem(authorHandle, mentionedUid) {
        const ta = document.getElementById("replyTa");
        if (!ta) return;
        const mention = authorHandle ? `@${authorHandle} ` : "";
        ta.value = mention;
        ta.focus();
        ta.selectionStart = ta.selectionEnd = ta.value.length;
        ta.scrollIntoView({ behavior: "smooth", block: "center" });
        // Store mentionedUid so _submitReplyFn can notify the person you're replying to
        if (window._replyCtx) {
          window._replyCtx.mentionedUid = mentionedUid || "";
          window._replyCtx.mentionedHandle = authorHandle || "";
        }
      }
      window.replyToReplyItem = replyToReplyItem;

      /* ══════════════════════════════════
   FOLLOW BACK FROM NOTIFICATION
══════════════════════════════════ */
      function notifFollowBack(btn, targetUid, notifId) {
        if (!targetUid || typeof window._followFn !== "function") return;
        // Mark notification as read
        if (notifId && window._sparkUser?.uid) {
          const row = btn.closest(".notif-row");
          markOneRead(window._sparkUser.uid, notifId, row);
        }
        // Delegate to the same _followFn used everywhere else
        window._followFn({ ownerUid: targetUid, btn, type: "followback" });
      }
      window.notifFollowBack = notifFollowBack;

      // Internal markOneRead reference exposed so notifFollowBack can call it
      function markOneRead(uid, notifId, rowEl) {
        if (typeof window._markOneReadFn === "function")
          window._markOneReadFn(uid, notifId, rowEl);
      }

      /* ══════════════════════════════════
   SEARCH BAR
══════════════════════════════════ */
      function toggleSearchBar() {
        const wrap = document.getElementById("searchBarWrap");
        const input = document.getElementById("searchInput");
        if (!wrap) return;
        const isOpen = wrap.classList.toggle("open");
        if (isOpen) {
          setTimeout(() => { if (input) input.focus(); }, 30);
        } else {
          if (input) input.value = "";
          filterFeedByQuery("");
        }
      }

      function closeSearchBar() {
        const wrap = document.getElementById("searchBarWrap");
        const input = document.getElementById("searchInput");
        if (wrap) wrap.classList.remove("open");
        if (input) input.value = "";
        filterFeedByQuery("");
      }

      function onSearchInput(inputEl) {
        filterFeedByQuery(inputEl.value);
      }

      function filterFeedByQuery(query) {
        const q = query.trim().toLowerCase();
        const feed = document.getElementById("realFeed");
        const noResults = document.getElementById("searchNoResults");
        if (!feed) return;
        const cards = feed.querySelectorAll(".spark-card");
        let visibleCount = 0;
        cards.forEach((card) => {
          if (!q) {
            card.style.display = "";
            visibleCount++;
            return;
          }
          const textEl = card.querySelector(".spark-text");
          const nameEl = card.querySelector(".author-name");
          const handleEl = card.querySelector(".author-handle");
          const cardText = (textEl ? textEl.textContent : "").toLowerCase();
          const cardName = (nameEl ? nameEl.textContent : "").toLowerCase();
          const cardHandle = (handleEl ? handleEl.textContent : "").toLowerCase();
          const matches = cardText.includes(q) || cardName.includes(q) || cardHandle.includes(q);
          card.style.display = matches ? "" : "none";
          if (matches) visibleCount++;
        });
        if (noResults) {
          noResults.style.display = (q && visibleCount === 0) ? "block" : "none";
        }
      }

      window.toggleSearchBar = toggleSearchBar;
      window.closeSearchBar = closeSearchBar;
      window.onSearchInput = onSearchInput;
