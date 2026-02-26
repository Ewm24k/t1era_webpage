import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
      import {
        getAuth,
        onAuthStateChanged,
      } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
      import {
        getFirestore,
        collection,
        addDoc,
        query,
        where,
        getDocs,
        doc,
        getDoc,
        setDoc,
        deleteDoc,
        serverTimestamp,
        onSnapshot,
        updateDoc,
        writeBatch,
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

      const app = initializeApp(firebaseConfig);
      const auth = getAuth(app);
      const db = getFirestore(app);

      const DAILY_LIMIT = 3;
      const DEV_EMAIL = "ewm24k@gmail.com";
      const SPARKS_COL = "sparks";

      // ── AUTH STATE ──
      onAuthStateChanged(auth, async (user) => {
        if (!user) {
          window.location.replace("home.html");
          return;
        }

        window._sparkUser = user;

        // Load user profile for avatar / name
        try {
          const snap = await getDoc(doc(db, "users", user.uid));
          const d = snap.exists() ? snap.data() : {};
          window._sparkUserData = d;
          const photoURL = d.profilePicture?.url || user.photoURL || "";
          const initial = (d.fullName ||
            user.displayName ||
            user.email ||
            "U")[0].toUpperCase();
          applyComposeAvatar(photoURL, initial);
        } catch (e) {
          window._sparkUserData = {};
          applyComposeAvatar(
            "",
            (user.displayName || user.email || "U")[0].toUpperCase(),
          );
        }

        // Ensure point map fields exist (initializes to 0 if missing, no-op if already set)
        ensurePointMap(user.uid);

        // Check quota
        await checkQuota(user.uid);

        // Reveal real content, hide skeletons
        hidePageSkeleton();

        // Start standard feed
        startFeed();

        // Start prompt feed — safe regardless of which module loaded first
        window._promptAuthReady = true;
        if (typeof window.startPromptFeed === "function") {
          window.startPromptFeed();
        } else {
          // Prompt module hasn't finished loading yet — wait for its ready event
          window.addEventListener("promptModuleReady", () => {
            if (typeof window.startPromptFeed === "function")
              window.startPromptFeed();
          }, { once: true });
        }

        // Auto-refresh feed every 35 seconds
        if (window._feedAutoRefreshTimer)
          clearInterval(window._feedAutoRefreshTimer);
        window._feedAutoRefreshTimer = setInterval(() => {
          if (typeof triggerFeedRefresh === "function") triggerFeedRefresh();
        }, 35000);

        // Start notification listener — live badge count
        startNotifListener(user.uid);

        // Load the set of UIDs the current user is following (used to hydrate follow buttons)
        await loadFollowingSet(user.uid);

        // Load real users into Who to Follow widget
        await loadWhoToFollow(user.uid);
      });

      // ── ENSURE point map fields exist on first load ──
      async function ensurePointMap(uid) {
        try {
          const snap = await getDoc(doc(db, "users", uid));
          const existing = snap.exists()
            ? snap.data().accountStatus?.point || snap.data().point || {}
            : {};
          const patch = {};

          // spark and reply: only initialize if missing (no reliable backfill source)
          if (existing.spark === undefined) patch["point.spark"] = 0;
          if (existing.reply === undefined) patch["point.reply"] = 0;

          // like: ALWAYS recalculate from actual sparks/{sparkId}/likes/{uid} subcollection
          // This is the source of truth — fixes any dirty/wrong values from previous bugs
          try {
            const sparksSnap = await getDocs(
              query(collection(db, SPARKS_COL), where("tab", "==", "standard")),
            );
            let likeCount = 0;
            const likeChecks = sparksSnap.docs.map((sparkDoc) =>
              getDoc(doc(db, SPARKS_COL, sparkDoc.id, "likes", uid))
                .then((l) => {
                  if (l.exists()) likeCount++;
                })
                .catch(() => {}),
            );
            await Promise.all(likeChecks);
            patch["point.like"] = likeCount;
          } catch (le) {
            console.warn("like backfill error:", le);
            if (existing.like === undefined) patch["point.like"] = 0;
          }

          if (Object.keys(patch).length > 0) {
            await updateDoc(doc(db, "users", uid), patch);
          }
        } catch (e) {
          console.warn("ensurePointMap error:", e);
        }
      }

      // ── WHO TO FOLLOW — fetch real users from Firestore ──
      async function loadWhoToFollow(currentUid) {
        const container = document.getElementById("wtfList");
        if (!container) return;

        try {
          // Fetch all users
          const snap = await getDocs(collection(db, "users"));
          if (snap.empty) {
            container.innerHTML =
              '<div style="font-size:12px;color:var(--text-3);padding:8px 0;">No users found.</div>';
            return;
          }

          // Filter out current user, shuffle, pick up to 4
          const allUsers = [];
          snap.forEach((d) => {
            if (d.id !== currentUid) {
              allUsers.push({ uid: d.id, data: d.data() });
            }
          });

          // Fisher-Yates shuffle
          for (let i = allUsers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allUsers[i], allUsers[j]] = [allUsers[j], allUsers[i]];
          }

          const picked = allUsers.slice(0, 4);

          if (picked.length === 0) {
            container.innerHTML =
              '<div style="font-size:12px;color:var(--text-3);padding:8px 0;">No other users yet.</div>';
            return;
          }

          container.innerHTML = "";

          // Gradient palette for avatars without photos
          const gradients = [
            "linear-gradient(135deg,#8b5cf6,#c2185b)",
            "linear-gradient(135deg,#f59e0b,#f97316)",
            "linear-gradient(135deg,#10b981,#0ea5e9)",
            "linear-gradient(135deg,#ef4444,#f97316)",
          ];

          picked.forEach(({ uid, data: u }, idx) => {
            const name =
              u.fullName ||
              u.nickname ||
              u.email?.split("@")[0] ||
              "T1ERA User";
            const handle = u.nickname || u.email?.split("@")[0] || "user";
            const photo = u.profilePicture?.url || u.photoURL || "";
            const initial = name[0].toUpperCase();
            const grad = gradients[idx % gradients.length];

            const isFollowing =
              window._followingSet && window._followingSet.has(uid);

            const avHtml = photo
              ? `<img src="${photo}" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" onerror="this.style.display='none';this.parentElement.textContent='${initial}'">`
              : initial;

            const row = document.createElement("div");
            row.className = "wtf-row";
            row.dataset.uid = uid;
            row.innerHTML = `
              <div class="wtf-av" style="background:${grad};overflow:hidden;">${avHtml}</div>
              <div class="wtf-info">
                <div class="wtf-name">${name}</div>
                <div class="wtf-sub">@${handle}</div>
              </div>
              <button class="wtf-btn${isFollowing ? " on" : ""}" onclick="window._wtfFollowClick(this,'${uid}')">${isFollowing ? "✓ Following" : "+ Follow"}</button>
            `;
            container.appendChild(row);
          });
        } catch (e) {
          console.warn("loadWhoToFollow error:", e);
          const container2 = document.getElementById("wtfList");
          if (container2)
            container2.innerHTML =
              '<div style="font-size:12px;color:var(--text-3);padding:8px 0;">Could not load.</div>';
        }
      }

      // ── WTF FOLLOW BUTTON CLICK — wired to same _followFn used by feed cards ──
      window._wtfFollowClick = function (btn, ownerUid) {
        if (!ownerUid || typeof window._followFn !== "function") {
          // Fallback UI-only toggle
          const on = btn.classList.toggle("on");
          btn.textContent = on ? "✓ Following" : "+ Follow";
          return;
        }
        window._followFn({ ownerUid, btn, type: "wtf" });
      };

      // ── EXPOSE startFeed to non-module scripts ──
      window._startFeedFn = startFeed;

      // ══════════════════════════════════════════════════════
      // FOLLOW MODULE
      // ══════════════════════════════════════════════════════

      // In-memory set of UIDs the current user follows — loaded once on auth
      window._followingSet = new Set();

      // Load who the current user is following into memory
      // Reads from /follows where followerId == uid (matches Firestore rules)
      async function loadFollowingSet(uid) {
        try {
          const snap = await getDocs(
            query(collection(db, "follows"), where("followerId", "==", uid)),
          );
          window._followingSet = new Set(
            snap.docs.map((d) => d.data().followedId),
          );
        } catch (e) {
          console.warn("loadFollowingSet error:", e.code, e.message);
          window._followingSet = new Set();
        }
      }

      // Core follow/unfollow toggle — called by both pill and badge buttons
      window._followFn = async function ({ ownerUid, btn, type }) {
        const user = window._sparkUser;
        if (!user || !ownerUid || ownerUid === user.uid) return;

        const isFollowing = window._followingSet.has(ownerUid);
        const willFollow = !isFollowing;

        // ── Show loading state immediately on the clicked button ──
        btn.disabled = true;
        if (type === "badge") {
          btn.classList.add("loading");
          btn.innerHTML =
            '<i class="ph-bold ph-circle-dashed" style="animation:follow-pulse .8s ease infinite"></i> …';
        } else if (type === "followback") {
          btn.style.opacity = "0.6";
          btn.style.pointerEvents = "none";
          btn.innerHTML =
            '<i class="ph-bold ph-circle-dashed" style="animation:follow-pulse .8s ease infinite"></i> …';
        } else {
          btn.classList.add("loading");
          btn.innerHTML =
            '<i class="ph-bold ph-circle-dashed" style="animation:follow-pulse .8s ease infinite"></i> …';
        }

        // ── Update in-memory set immediately (optimistic) ──
        if (willFollow) {
          window._followingSet.add(ownerUid);
        } else {
          window._followingSet.delete(ownerUid);
        }

        // ── Persist to Firestore ──
        const ud = window._sparkUserData || {};
        const fromName =
          ud.fullName ||
          user.displayName ||
          user.email?.split("@")[0] ||
          "Someone";
        const fromHandle = ud.nickname || user.email?.split("@")[0] || "user";
        const fromPhoto = ud.profilePicture?.url || user.photoURL || "";

        try {
          if (willFollow) {
            // ── Write to /follows/{myUid}_{targetUid} — matches rules: create if followerId == auth.uid ──
            const followDocId = `${user.uid}_${ownerUid}`;
            await setDoc(doc(db, "follows", followDocId), {
              followerId: user.uid,
              followedId: ownerUid,
              fromName,
              fromHandle,
              fromPhoto,
              createdAt: serverTimestamp(),
            });

            // ── Send follow notification to target — rules allow create if isSignedIn() ──
            const notifId = `follow_${user.uid}_${ownerUid}`;
            try {
              await setDoc(
                doc(db, "users", ownerUid, "notifications", notifId),
                {
                  type: "follow",
                  fromUid: user.uid,
                  fromName,
                  fromHandle,
                  fromPhoto,
                  sparkId: "",
                  sparkText: "",
                  message: `<strong>${fromName}</strong> started following you`,
                  read: false,
                  createdAt: serverTimestamp(),
                },
              );
            } catch (ne) {
              console.warn("follow notif error:", ne.code, ne.message);
            }

            // ── Log to YOUR activity history — rules allow write if isOwner(userId) ──
            try {
              await addDoc(
                collection(db, "users", user.uid, "activityHistory"),
                {
                  type: "follow",
                  icon: "ph-user-plus",
                  iconColor: "var(--green)",
                  bgClass: "green-bg",
                  text: `<strong>Followed</strong> @${fromHandle}`,
                  createdAt: serverTimestamp(),
                },
              );
            } catch (ae) {
              console.warn("follow activity log error:", ae.code, ae.message);
            }

            // Toast confirmation
            if (typeof window.showToast === "function")
              window.showToast("Now following! 🤝");
          } else {
            // ── Unfollow: delete /follows/{myUid}_{targetUid} — rules allow delete if followerId == auth.uid ──
            const followDocId = `${user.uid}_${ownerUid}`;
            await deleteDoc(doc(db, "follows", followDocId));

            // Toast confirmation
            if (typeof window.showToast === "function")
              window.showToast("Unfollowed");
          }

          // ── Settle button into final state after Firestore confirms ──
          btn.disabled = false;
          if (type === "badge") {
            btn.classList.remove("loading");
            if (willFollow) {
              btn.classList.add("following");
              btn.innerHTML = '<i class="ph-bold ph-check"></i> Following';
            } else {
              btn.classList.remove("following");
              btn.innerHTML = '<i class="ph-bold ph-user-plus"></i> Follow';
            }
          } else if (type === "followback") {
            btn.style.opacity = "";
            btn.style.pointerEvents = "";
            if (willFollow) {
              btn.innerHTML = '<i class="ph-bold ph-check"></i> Following';
              btn.style.borderColor = "rgba(16,185,129,.4)";
              btn.style.color = "var(--green)";
              btn.style.background = "rgba(16,185,129,.08)";
            } else {
              btn.innerHTML =
                '<i class="ph-bold ph-user-plus"></i> Follow Back';
              btn.style.borderColor = "";
              btn.style.color = "";
              btn.style.background = "";
            }
          } else {
            btn.classList.remove("loading");
            if (willFollow) {
              btn.classList.add("on");
              btn.innerHTML = "Following";
            } else {
              btn.classList.remove("on");
              btn.innerHTML = '<i class="ph-bold ph-plus"></i> Follow';
            }
          }

          // ── Sync all other buttons on page for the same user ──
          document.querySelectorAll(".spark-card").forEach((card) => {
            if (card.dataset.ownerUid !== ownerUid) return;
            card.querySelectorAll(".badge.follow-badge").forEach((b) => {
              if (b === btn) return;
              if (willFollow) {
                b.classList.add("following");
                b.innerHTML = '<i class="ph-bold ph-check"></i> Following';
              } else {
                b.classList.remove("following");
                b.innerHTML = '<i class="ph-bold ph-user-plus"></i> Follow';
              }
            });
            card.querySelectorAll(".follow-pill").forEach((b) => {
              if (b === btn) return;
              if (willFollow) {
                b.classList.add("on");
                b.innerHTML = "Following";
              } else {
                b.classList.remove("on");
                b.innerHTML = '<i class="ph-bold ph-plus"></i> Follow';
              }
            });
          });
        } catch (e) {
          console.error("_followFn Firestore error:", e.code, e.message);
          // Rollback in-memory set
          if (willFollow) {
            window._followingSet.delete(ownerUid);
          } else {
            window._followingSet.add(ownerUid);
          }
          // Rollback button UI
          btn.disabled = false;
          if (type === "badge") {
            btn.classList.remove("loading");
            if (!willFollow) {
              btn.classList.add("following");
              btn.innerHTML = '<i class="ph-bold ph-check"></i> Following';
            } else {
              btn.classList.remove("following");
              btn.innerHTML = '<i class="ph-bold ph-user-plus"></i> Follow';
            }
          } else if (type === "followback") {
            btn.style.opacity = "";
            btn.style.pointerEvents = "";
            if (!willFollow) {
              btn.innerHTML = '<i class="ph-bold ph-check"></i> Following';
              btn.style.borderColor = "rgba(16,185,129,.4)";
              btn.style.color = "var(--green)";
              btn.style.background = "rgba(16,185,129,.08)";
            } else {
              btn.innerHTML =
                '<i class="ph-bold ph-user-plus"></i> Follow Back';
              btn.style.borderColor = "";
              btn.style.color = "";
              btn.style.background = "";
            }
          } else {
            btn.classList.remove("loading");
            if (!willFollow) {
              btn.classList.add("on");
              btn.innerHTML = "Following";
            } else {
              btn.classList.remove("on");
              btn.innerHTML = '<i class="ph-bold ph-plus"></i> Follow';
            }
          }
          if (typeof window.showToast === "function")
            window.showToast("Action failed — try again");
        }
      };

      // ── LISTEN for current user's unread notifications ──
      let _notifUnsub = null;

      function startNotifListener(uid) {
        if (_notifUnsub) _notifUnsub();
        const notifCol = collection(db, "users", uid, "notifications");
        _notifUnsub = onSnapshot(
          query(notifCol, where("read", "==", false)),
          (snap) => {
            const count = snap.size;
            const label = count > 99 ? "99+" : String(count);
            const visible = count > 0;
            // Desktop badge
            const badge = document.getElementById("notifBadge");
            if (badge) {
              badge.textContent = label;
              badge.classList.toggle("visible", visible);
            }
            // Mobile badge
            const mobBadge = document.getElementById("mobNotifBadge");
            if (mobBadge) {
              mobBadge.textContent = label;
              mobBadge.classList.toggle("visible", visible);
            }
            // If the panel is currently open, refresh its list live so new follow notifs appear instantly
            const panel = document.getElementById("notifPanel");
            if (
              panel &&
              panel.classList.contains("open") &&
              typeof window._loadNotifsFn === "function"
            ) {
              window._loadNotifsFn();
            }
          },
          (err) => console.error("notif listener:", err),
        );
      }

      // ── SEND a notification to another user ──
      window._sendNotifFn = async function ({
        type,
        ownerUid,
        sparkId,
        sparkText,
        extraMsg,
      }) {
        const currentUser = window._sparkUser;
        if (!currentUser || !ownerUid) return;
        // Never notify yourself
        if (ownerUid === currentUser.uid) return;

        const ud = window._sparkUserData || {};
        const fromName =
          ud.fullName ||
          currentUser.displayName ||
          currentUser.email?.split("@")[0] ||
          "Someone";
        const fromPhoto = ud.profilePicture?.url || currentUser.photoURL || "";

        const messages = {
          like: `<strong>${fromName}</strong> liked your Spark`,
          bookmark: `<strong>${fromName}</strong> bookmarked your Spark`,
          reply: `<strong>${fromName}</strong> replied to your Spark`,
        };

        try {
          await addDoc(collection(db, "users", ownerUid, "notifications"), {
            type,
            fromUid: currentUser.uid,
            fromName,
            fromPhoto,
            sparkId: sparkId || "",
            sparkText: sparkText || "",
            message:
              extraMsg ||
              messages[type] ||
              `<strong>${fromName}</strong> interacted with your Spark`,
            read: false,
            createdAt: serverTimestamp(),
          });
        } catch (e) {
          console.error("sendNotif error:", e.code, e.message);
        }
      };

      // ── TOGGLE LIKE — write to Firestore ──
      window._toggleLikeFn = async function ({
        liked,
        sparkId,
        ownerUid,
        sparkText,
      }) {
        const user = window._sparkUser;
        if (!user || !sparkId) return;

        // likes subcollection: sparks/{sparkId}/likes/{uid}
        const likeRef = doc(db, "sparks", sparkId, "likes", user.uid);

        // Deterministic notification ID so we can delete it on unlike
        // Pattern: like_{likerUid}_{sparkId}
        const notifId = `like_${user.uid}_${sparkId}`;
        const notifRef =
          ownerUid && ownerUid !== user.uid
            ? doc(db, "users", ownerUid, "notifications", notifId)
            : null;

        try {
          if (liked) {
            // 1. Record the like
            await setDoc(likeRef, {
              uid: user.uid,
              createdAt: serverTimestamp(),
            });

            // 2. Award +10 XP only if liking someone else's post (not own post)
            if (ownerUid !== user.uid) {
              try {
                await updateDoc(doc(db, "users", user.uid), {
                  "point.like": increment(1),
                });
              } catch (xpe) {
                console.warn("XP like award error:", xpe);
              }
            }

            // 3. Write like notification with deterministic ID (overwrites if already exists)
            if (notifRef) {
              const ud = window._sparkUserData || {};
              const fromName =
                ud.fullName ||
                user.displayName ||
                user.email?.split("@")[0] ||
                "Someone";
              const fromPhoto = ud.profilePicture?.url || user.photoURL || "";
              try {
                await setDoc(notifRef, {
                  type: "like",
                  fromUid: user.uid,
                  fromName,
                  fromPhoto,
                  sparkId: sparkId || "",
                  sparkText: sparkText || "",
                  message: `<strong>${fromName}</strong> liked your Spark`,
                  read: false,
                  createdAt: serverTimestamp(),
                });
              } catch (ne) {
                console.warn("like notif error:", ne);
              }
            }
          } else {
            // 1. Remove the like record
            await deleteDoc(likeRef);

            // 2. Deduct XP only if unliking someone else's post (never go below 0)
            if (ownerUid !== user.uid) {
              try {
                const userSnap = await getDoc(doc(db, "users", user.uid));
                const currentLike = userSnap.exists()
                  ? userSnap.data().point?.like || 0
                  : 0;
                await updateDoc(doc(db, "users", user.uid), {
                  "point.like": increment(currentLike > 0 ? -1 : 0),
                });
              } catch (xpe) {
                console.warn("XP unlike deduct error:", xpe);
              }
            }

            // 3. Delete the like notification from post owner (if it exists and unread)
            if (notifRef) {
              try {
                const notifSnap = await getDoc(notifRef);
                if (notifSnap.exists() && !notifSnap.data().read) {
                  await deleteDoc(notifRef);
                }
              } catch (ne) {
                console.warn("unlike notif cleanup error:", ne);
              }
            }
          }
        } catch (e) {
          console.error("toggleLike Firestore error:", e.code, e.message);
        }
      };

      // ── LOAD notifications into the panel ──
      window._loadNotifsFn = async function () {
        const uid = window._sparkUser?.uid;
        if (!uid) return;
        const list = document.getElementById("notifList");
        const empty = document.getElementById("notifEmpty");
        if (!list) return;

        try {
          const snap = await getDocs(
            collection(db, "users", uid, "notifications"),
          );
          if (snap.empty) {
            if (empty) empty.style.display = "flex";
            list.innerHTML = "";
            list.appendChild(empty);
            return;
          }

          // Sort newest first client-side
          const docs = [];
          snap.forEach((d) => docs.push({ id: d.id, data: d.data() }));
          docs.sort((a, b) => {
            const ta = a.data.createdAt?.toMillis?.() || 0;
            const tb = b.data.createdAt?.toMillis?.() || 0;
            return tb - ta;
          });

          // Bucket by type — followers is a separate bucket from follow
          const buckets = {
            like: [],
            bookmark: [],
            reply: [],
            follow: [],
            message: [],
          };
          docs.forEach((d) => {
            const t = d.data.type || "message";
            if (buckets[t] !== undefined) buckets[t].push(d);
            else buckets.message.push(d);
          });

          // Clear list
          list.innerHTML = "";

          const sectionMeta = [
            {
              key: "follow",
              label: "Followers",
              icon: "ph-user-plus",
              cls: "follow",
            },
            { key: "like", label: "Likes", icon: "ph-heart", cls: "like" },
            {
              key: "reply",
              label: "Replies & Mentions",
              icon: "ph-chat-circle",
              cls: "reply",
            },
            {
              key: "bookmark",
              label: "Bookmarks",
              icon: "ph-bookmark-simple",
              cls: "bookmark",
            },
            {
              key: "message",
              label: "System",
              icon: "ph-bell",
              cls: "message",
            },
          ];

          let hasAny = false;

          sectionMeta.forEach(({ key, label, icon, cls }) => {
            const items = buckets[key];

            // Skip empty sections entirely — no clutter
            if (!items || items.length === 0) return;

            hasAny = true;

            // Check if any item in this section is unread
            const hasUnread = items.some(({ data: d }) => !d.read);
            const unreadCount = items.filter(({ data: d }) => !d.read).length;

            // ── Section header (clickable accordion toggle) ──
            const header = document.createElement("div");
            header.className =
              "notif-section-header" + (hasUnread ? " has-unread" : "");
            header.innerHTML = `
        <span class="notif-section-dot"></span>
        <span class="notif-section-label"><i class="ph-bold ${icon}" style="margin-right:5px;font-size:10px"></i>${label}</span>
        <span class="notif-section-count ${hasUnread ? "has-new" : ""}">${hasUnread ? unreadCount + " new" : items.length}</span>
        <i class="ph-bold ph-caret-down notif-section-chevron" style="${hasUnread ? "transform:rotate(180deg)" : ""}"></i>
      `;

            // ── Section body (collapsible) ──
            const body = document.createElement("div");
            body.className = "notif-section-body" + (hasUnread ? " open" : "");

            // Toggle on header click
            header.addEventListener("click", () => {
              const isOpen = body.classList.toggle("open");
              const chevron = header.querySelector(".notif-section-chevron");
              if (chevron)
                chevron.style.transform = isOpen
                  ? "rotate(180deg)"
                  : "rotate(0deg)";
            });

            // ── Build notification rows ──
            items.forEach(({ id, data: d }) => {
              const avInner = d.fromPhoto
                ? `<img src="${d.fromPhoto}" referrerpolicy="no-referrer" onerror="this.style.display='none'">`
                : (d.fromName?.[0] || "?").toUpperCase();

              const ts = d.createdAt?.toDate?.();
              const timeStr = ts
                ? ts.toLocaleString("en-MY", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Just now";

              const row = document.createElement("div");
              row.className = "notif-row" + (d.read ? "" : " unread");
              row.dataset.notifId = id;

              const replyBtn =
                key === "reply" && d.sparkId
                  ? `<button class="notif-reply-btn" onclick="event.stopPropagation();replyFromNotif('${d.sparkId}','${d.fromUid || ""}','${(d.fromName || "").replace(/'/g, "\\'")}','${(d.fromHandle || d.fromName || "").replace(/'/g, "\\'")}','${(d.sparkText || "").replace(/'/g, "\\'").slice(0, 60)}','${id}','${(d.fromPhoto || "").replace(/'/g, "\\'")}')"><i class="ph-bold ph-chat-circle"></i> Reply</button>`
                  : "";

              const alreadyFollowingBack =
                window._followingSet &&
                window._followingSet.has(d.fromUid || "");
              const followBackBtn =
                key === "follow" &&
                d.fromUid &&
                d.fromUid !== window._sparkUser?.uid
                  ? `<button class="notif-reply-btn notif-follow-back-btn" data-target-uid="${d.fromUid}" style="${alreadyFollowingBack ? "border-color:rgba(16,185,129,.4);color:var(--green);background:rgba(16,185,129,.08)" : ""}" onclick="event.stopPropagation();notifFollowBack(this,'${d.fromUid}','${id}')"><i class="ph-bold ${alreadyFollowingBack ? "ph-check" : "ph-user-plus"}"></i> ${alreadyFollowingBack ? "Following" : "Follow Back"}</button>`
                  : "";

              row.innerHTML = `
          <div class="notif-av">${avInner}</div>
          <div class="notif-body">
            <div class="notif-text">${d.message || `<strong>${d.fromName}</strong> interacted with your account`}</div>
            ${d.sparkText ? `<div class="notif-sub">"${d.sparkText}"</div>` : ""}
            <div class="notif-time">${timeStr}</div>
            ${replyBtn}${followBackBtn}
          </div>
          <div class="notif-type-icon ${cls}"><i class="ph-bold ${icon}"></i></div>
        `;

              row.addEventListener("click", () => {
                markOneRead(uid, id, row);
                // Update unread count in header after marking read
                const stillUnread =
                  body.querySelectorAll(".notif-row.unread").length - 1;
                const countEl = header.querySelector(".notif-section-count");
                if (stillUnread <= 0) {
                  header.classList.remove("has-unread");
                  if (countEl) {
                    countEl.classList.remove("has-new");
                    countEl.textContent = items.length;
                  }
                  const dot = header.querySelector(".notif-section-dot");
                  if (dot) dot.style.display = "none";
                } else {
                  if (countEl) countEl.textContent = stillUnread + " new";
                }
              });

              body.appendChild(row);
            });

            list.appendChild(header);
            list.appendChild(body);
          });

          if (empty) empty.style.display = hasAny ? "none" : "flex";
        } catch (e) {
          console.error("loadNotifs error:", e);
        }
      };

      // ── MARK ONE notification as read ──
      async function markOneRead(uid, notifId, rowEl) {
        try {
          await updateDoc(doc(db, "users", uid, "notifications", notifId), {
            read: true,
          });
          if (rowEl) rowEl.classList.remove("unread");
        } catch (e) {
          console.error("markOneRead:", e);
        }
      }
      window._markOneReadFn = markOneRead;

      // ── MARK ALL notifications as read ──
      // ══════════════════════════════════════════════════════
      // REPLIES MODULE
      // ══════════════════════════════════════════════════════

      // Load replies for a spark into the reply sheet
      window._loadRepliesFn = async function (sparkId) {
        const list = document.getElementById("repliesList");
        if (!list) return;

        // Show shimmer skeleton
        list.innerHTML = `
    <div class="reply-item" style="opacity:.5">
      <div class="ri-av" style="background:var(--bg-4);position:relative;overflow:hidden"><div style="position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.06),transparent);animation:sk-shimmer 1.4s infinite"></div></div>
      <div class="ri-body" style="flex:1">
        <div style="height:9px;width:40%;border-radius:4px;background:var(--bg-4);margin-bottom:7px;position:relative;overflow:hidden"><div style="position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.06),transparent);animation:sk-shimmer 1.4s infinite"></div></div>
        <div style="height:11px;width:85%;border-radius:4px;background:var(--bg-4);position:relative;overflow:hidden"><div style="position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.06),transparent);animation:sk-shimmer 1.4s infinite"></div></div>
      </div>
    </div>`;

        try {
          const snap = await getDocs(
            collection(db, "sparks", sparkId, "comments"),
          );
          list.innerHTML = "";

          if (snap.empty) {
            list.innerHTML =
              '<div style="padding:16px 18px;font-size:12px;color:var(--text-3);text-align:center">No replies yet — be the first!</div>';
            return;
          }

          const replies = [];
          snap.forEach((d) => replies.push({ id: d.id, data: d.data() }));
          replies.sort((a, b) => {
            const ta = a.data.createdAt?.toMillis?.() || 0;
            const tb = b.data.createdAt?.toMillis?.() || 0;
            return tb - ta; // newest first
          });

          replies.forEach(({ id, data: r }) => {
            const initial = (r.authorName || "U")[0].toUpperCase();
            const photo = r.authorPhoto || "";
            const avInner = photo
              ? `<img src="${photo}" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.display='none'">`
              : initial;
            const timeStr = r.createdAt ? timeAgo(r.createdAt) : "just now";

            const item = document.createElement("div");
            item.className = "reply-item";
            item.innerHTML = `
        <div class="ri-av" style="background:linear-gradient(135deg,var(--pink),var(--purple))">${avInner}</div>
        <div class="ri-body">
          <span class="ri-author">${r.authorName || "User"}</span>
          <span class="ri-time">${timeStr}</span>
          <p class="ri-text">${r.text || ""}</p>
          <button class="ri-reply-btn" onclick="replyToReplyItem('${(r.authorHandle || r.authorName || "").replace(/'/g, "\\'")}','${(r.uid || "").replace(/'/g, "\\'")}')"><i class="ph-bold ph-arrow-bend-up-left"></i> Reply</button>
        </div>
      `;
            list.appendChild(item);
          });
        } catch (e) {
          console.error("loadReplies error:", e.code, e.message);
          list.innerHTML =
            '<div style="padding:16px 18px;font-size:12px;color:var(--text-3);text-align:center">Could not load replies.</div>';
        }
      };

      // Submit a reply
      window._submitReplyFn = async function (txt) {
        const user = window._sparkUser;
        if (!user || !txt) return;

        const ctx = window._replyCtx || {};
        const {
          sparkId,
          ownerUid,
          ownerHandle,
          author,
          mentionedUid,
          mentionedHandle,
          notifId,
        } = ctx;

        const ud = window._sparkUserData || {};
        const authorName =
          ud.fullName ||
          user.displayName ||
          user.email?.split("@")[0] ||
          "User";
        const authorPhoto = ud.profilePicture?.url || user.photoURL || "";
        const handle = ud.nickname || user.email?.split("@")[0] || "user";

        // Disable submit btn to prevent double submit
        const submitBtn = document.querySelector(".reply-submit");
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = "Sending…";
        }

        if (!sparkId) {
          // Demo card — just show optimistic item and close
          const list = document.getElementById("repliesList");
          const item = document.createElement("div");
          item.className = "reply-item fu";
          item.innerHTML = `
      <div class="ri-av" style="background:linear-gradient(135deg,var(--pink),var(--purple))">${authorName[0].toUpperCase()}</div>
      <div class="ri-body">
        <span class="ri-author">${authorName}</span>
        <span class="ri-time">just now</span>
        <p class="ri-text">${txt}</p>
      </div>`;
          if (list) list.insertBefore(item, list.firstChild);
          document.getElementById("replyTa").value = "";
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Reply ⚡";
          }
          setTimeout(() => {
            if (typeof window.closeReply === "function") window.closeReply();
          }, 300);
          return;
        }

        try {
          // 1. Write reply to sparks/{sparkId}/comments subcollection
          const replyData = {
            uid: user.uid,
            authorName,
            authorHandle: handle,
            authorPhoto,
            text: txt,
            sparkId,
            createdAt: serverTimestamp(),
          };
          await addDoc(
            collection(db, "sparks", sparkId, "comments"),
            replyData,
          );

          // 2. Fetch updated reply count for this spark and update feed card counter
          const repliesSnap = await getDocs(
            collection(db, "sparks", sparkId, "comments"),
          );
          const newCount = repliesSnap.size;
          const countEl = document.getElementById("replycount-" + sparkId);
          if (countEl) countEl.textContent = newCount;

          // 3. Send notification to post owner (skip self-replies)
          if (ownerUid && ownerUid !== user.uid) {
            try {
              await addDoc(collection(db, "users", ownerUid, "notifications"), {
                type: "reply",
                fromUid: user.uid,
                fromName: authorName,
                fromHandle: handle,
                fromPhoto: authorPhoto,
                sparkId,
                sparkText: txt.slice(0, 80),
                message: `<strong>${authorName}</strong> replied to your Spark`,
                read: false,
                createdAt: serverTimestamp(),
              });
            } catch (ne) {
              console.warn("reply notif error:", ne.code, ne.message);
            }
          }

          // 3b. Send notification to the @mentioned replier (when replying to someone's reply)
          //     Only fires if mentionedUid is set, is not yourself, and is not the spark owner (already notified above)
          if (
            mentionedUid &&
            mentionedUid !== user.uid &&
            mentionedUid !== ownerUid
          ) {
            try {
              await addDoc(
                collection(db, "users", mentionedUid, "notifications"),
                {
                  type: "reply",
                  fromUid: user.uid,
                  fromName: authorName,
                  fromHandle: handle,
                  fromPhoto: authorPhoto,
                  sparkId,
                  sparkText: txt.slice(0, 80),
                  message: `<strong>${authorName}</strong> replied to your comment`,
                  read: false,
                  createdAt: serverTimestamp(),
                },
              );
            } catch (me) {
              console.warn("mention notif error:", me.code, me.message);
            }
          }

          // 4. Log to replier's activity history
          try {
            await addDoc(collection(db, "users", user.uid, "activityHistory"), {
              type: "reply",
              icon: "ph-chat-circle",
              iconColor: "var(--purple)",
              bgClass: "purple-bg",
              text: `<strong>Replied</strong> to @${ownerHandle || author}: "${txt.slice(0, 50)}${txt.length > 50 ? "…" : ""}"`,
              createdAt: serverTimestamp(),
            });
          } catch (ae) {
            console.warn("activity log error:", ae);
          }

          // 4b. Award +40 XP for replying to a spark (increment count by 1; profile.html multiplies by 40)
          try {
            await updateDoc(doc(db, "users", user.uid), {
              "point.reply": increment(1),
            });
          } catch (xpe) {
            console.warn("XP reply award error:", xpe);
          }

          // 5. Clear textarea — DB write confirmed, show toast and close immediately
          document.getElementById("replyTa").value = "";
          // Mark the source notification as read if this reply came from the notif panel
          if (notifId && window._sparkUser?.uid) {
            markOneRead(
              window._sparkUser.uid,
              notifId,
              document.querySelector(`.notif-row[data-notif-id="${notifId}"]`),
            );
          }
          if (typeof window.showToast === "function")
            window.showToast("Reply posted ⚡");
          if (typeof window.closeReply === "function") window.closeReply();

          // 6. Reload replies in the sheet (fire-and-forget, panel may already be closing)
          window._loadRepliesFn(sparkId);
        } catch (e) {
          console.error("submitReply error:", e.code, e.message);
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Reply ⚡";
          }
          return;
        }

        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Reply ⚡";
        }
      };

      window._markAllReadFn = async function () {
        const uid = window._sparkUser?.uid;
        if (!uid) return;
        try {
          const snap = await getDocs(
            query(
              collection(db, "users", uid, "notifications"),
              where("read", "==", false),
            ),
          );
          if (snap.empty) {
            if (typeof window.closeNotifPanel === "function")
              window.closeNotifPanel();
            return;
          }
          const batch = writeBatch(db);
          snap.forEach((d) => batch.update(d.ref, { read: true }));
          await batch.commit();

          // Remove all unread row highlights
          document
            .querySelectorAll(".notif-row.unread")
            .forEach((r) => r.classList.remove("unread"));

          // Remove all section has-unread states and reset counts
          document
            .querySelectorAll(".notif-section-header.has-unread")
            .forEach((h) => {
              h.classList.remove("has-unread");
              const dot = h.querySelector(".notif-section-dot");
              if (dot) dot.style.display = "none";
              const countEl = h.querySelector(".notif-section-count");
              const body = h.nextElementSibling;
              if (countEl && body) {
                const total = body.querySelectorAll(".notif-row").length;
                countEl.classList.remove("has-new");
                countEl.textContent = total;
              }
              const chevron = h.querySelector(".notif-section-chevron");
              if (chevron) chevron.style.transform = "rotate(0deg)";
              // Collapse the section body
              if (body) body.classList.remove("open");
            });

          // Auto-close panel after short delay so user sees the update
          setTimeout(() => {
            if (typeof window.closeNotifPanel === "function")
              window.closeNotifPanel();
          }, 420);
        } catch (e) {
          console.error("markAllRead:", e);
        }
      };

      // ── SKELETON SHOW/HIDE ──
      function hidePageSkeleton() {
        ["skLeft", "skFeed", "skRight", "skPromptFeed"].forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.classList.add("sk-hidden");
        });
        ["realLeft", "realFeed", "realRight", "realPromptFeedWrap"].forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.classList.remove("sk-hidden");
        });
      }

      // ── FEED — fetch all standard sparks, sort client-side ──

      function buildSkeleton() {
        const s = document.createElement("div");
        s.className = "skeleton-card";
        s.innerHTML = `
    <div class="skeleton-head">
      <div class="skeleton-av"></div>
      <div class="skeleton-meta">
        <div class="skeleton-line w60"></div>
        <div class="skeleton-line w40"></div>
      </div>
    </div>
    <div class="skeleton-line w90"></div>
    <div class="skeleton-line w75"></div>
    <div class="skeleton-actions">
      <div class="skeleton-act"></div>
      <div class="skeleton-act"></div>
      <div class="skeleton-act"></div>
      <div class="skeleton-act"></div>
    </div>
  `;
        return s;
      }

      async function startFeed() {
        // Target realFeed — the revealed content container inside panel-0
        const container = document.getElementById("realFeed");
        if (!container) return;

        // Remove any previously rendered Firestore cards
        container
          .querySelectorAll(".spark-card[data-spark-id]")
          .forEach((el) => el.remove());

        try {
          const snap = await getDocs(
            query(collection(db, SPARKS_COL), where("tab", "==", "standard")),
          );

          if (snap.empty) return;

          const docs = [];
          snap.forEach((d) => docs.push({ id: d.id, data: d.data() }));

          // Sort newest-first client-side — handles Firestore Timestamp, ISO string, or null
          const toMs = (ts) => {
            if (!ts) return 0;
            if (ts.toMillis) return ts.toMillis();
            const ms = new Date(ts).getTime();
            return isNaN(ms) ? 0 : ms;
          };
          docs.sort((a, b) => toMs(b.data.createdAt) - toMs(a.data.createdAt));

          // ── Fetch rank for each unique author UID ──
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
                  // Compute level from XP so it's always accurate regardless of stored value
                  const pt = ud.accountStatus?.point || ud.point || {};
                  const totalXP =
                    (pt.spark || 0) * 20 +
                    (pt.like || 0) * 10 +
                    (pt.reply || 0) * 40;
                  const XP_THRESHOLDS = [
                    0, 550, 1650, 3300, 5500, 8250, 11550, 15400, 19800, 24750,
                    30250, 36300, 42900, 50050, 57750, 66000, 74800, 84150,
                    94050, 104500, 115500, 127050, 139150, 151800, 165000,
                    178750, 193050, 207900, 223300, 239250,
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
              } catch (rankErr) {
                console.warn(
                  "rank fetch error for uid",
                  uid,
                  rankErr?.code,
                  rankErr?.message,
                );
                rankCache[uid] = "LV 1";
              }
            }),
          );

          docs
            .slice(0, 50)
            .forEach(({ id, data }) =>
              renderCard(id, data, rankCache[data.uid] || "LV 1"),
            );
        } catch (e) {
          console.error("startFeed error:", e);
        }
      }

      // ── RELATIVE TIME HELPER ──
      function timeAgo(ts) {
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

      // ── MEDIA GRID HTML BUILDER (shared by renderCard + renderPromptCard) ──
      function buildMediaGridHtml(images) {
        if (!images || images.length === 0) return "";
        const count = Math.min(images.length, 4);
        const gridClass = ["", "g1", "g2", "g3", "g4"][count];
        const items = images.slice(0, 4).map(
          (src) =>
            `<div class="mi"><img src="${src}" alt="" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`
        ).join("");
        return `<div class="media-grid ${gridClass}" style="margin-top:10px">${items}</div>`;
      }
      window._buildMediaGridHtml = buildMediaGridHtml;

      // ── RENDER ONE CARD INTO FEED ──
      function renderCard(id, d, rankLabel) {
        const panel = document.getElementById("realFeed");
        if (!panel) return;

        const name = d.authorName || "T1ERA User";
        const handle = d.authorHandle || "user";
        const photo = d.authorPhoto || "";
        const txt = d.text || "";
        const initial = name[0].toUpperCase();

        const avBg =
          "background:linear-gradient(135deg,var(--pink),var(--purple))";
        const avInner = photo
          ? `<img src="${photo}" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" onerror="this.style.display='none'">`
          : initial;

        const linkedTxt = txt
          .replace(/(#\w+)/g, '<span class="ht">$1</span>')
          .replace(/(@\w+)/g, '<span class="mn">$1</span>');

        // Detect ```quote ... ``` blocks and extract quote content
        const quoteMatch = txt.match(/```quote\n([\s\S]*?)\n```/);
        const quoteContent = quoteMatch ? quoteMatch[1] : null;
        const displayTxt = quoteContent
          ? linkedTxt.replace(/```quote\n[\s\S]*?\n```/, "").trim()
          : linkedTxt;

        const quoteBlockHtml = quoteContent
          ? `<div class="quote-block"><div class="quote-block-label"><i class="ph-bold ph-quotes"></i> Quote</div>${quoteContent.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`
          : d.quoteText
            ? `<div class="quote-block"><div class="quote-block-label"><i class="ph-bold ph-quotes"></i> Quote</div>${String(d.quoteText).replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`
            : "";

        const safeText = txt.replace(/'/g, "\\'").slice(0, 80);
        const safePhoto = photo.replace(/'/g, "\\'");

        const isOwner =
          d.uid && window._sparkUser && d.uid === window._sparkUser.uid;

        const dotsOrDelete = isOwner
          ? `<button class="dots-btn" onclick="event.stopPropagation();deleteSparkCard(this)" title="Delete Spark" style="color:var(--text-3)"><i class="ph-bold ph-trash"></i></button>`
          : `<button class="dots-btn" onclick="event.stopPropagation()"><i class="ph-bold ph-dots-three-vertical"></i></button>`;

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
          <span class="spark-time">${timeAgo(d.createdAt)}</span>
        </div>
        <div class="badges-row">
          <span class="badge rank">${rankLabel || "LV 1"}</span>
          ${(() => {
            const _lvNum =
              parseInt((rankLabel || "LV 1").replace("LV ", "")) || 1;
            if (_lvNum >= 25)
              return `<span class="badge verified-gold" title="Gold Verified · LV 25+"><i class="ph-fill ph-seal-check"></i></span>`;
            if (_lvNum >= 20)
              return `<span class="badge verified-grey" title="Verified · LV 20+"><i class="ph-fill ph-seal-check"></i></span>`;
            return "";
          })()}
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
      <p class="spark-text">${displayTxt}</p>
      ${quoteBlockHtml}
      ${buildMediaGridHtml(d.images)}
      ${
        d.youtubeId
          ? `<div class="yt-card" onclick="event.stopPropagation();openYtModal('` +
            d.youtubeId +
            `')">
        <div class="yt-thumb-wrap">
          <img src="https://i.ytimg.com/vi/` +
            d.youtubeId +
            `/hqdefault.jpg" alt="YouTube video">
          <div class="yt-play-btn"><div class="yt-play-icon"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div></div>
        </div>
        <div class="yt-label">
          <div class="yt-logo"><svg viewBox="0 0 24 24" fill="#fff"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z"/></svg></div>
          <span class="yt-url-text">youtube.com/watch?v=` +
            d.youtubeId +
            `</span>
          <span style="font-size:10px;color:var(--text-3);margin-left:auto;flex-shrink:0;padding-right:4px">▶ Play</span>
        </div>
      </div>`
          : ""
      }
    </div>
    <div class="action-bar">
      <button class="act-btn like" id="like-${id}" onclick="event.stopPropagation();toggleLike(this)"><i class="ph-bold ph-heart"></i><span id="likecount-${id}">0</span></button>
      <button class="act-btn reply" onclick="event.stopPropagation();openReply('${name}','${initial}','#c2185b','${safeText}','${id}','${d.uid || ""}','${handle}','${safePhoto}')"><i class="ph-bold ph-chat-circle"></i><span id="replycount-${id}">0</span></button>
      <button class="act-btn repost" onclick="event.stopPropagation();toggleRepost(this)"><i class="ph-bold ph-repeat"></i><span>${d.reposts || 0}</span></button>
      <button class="act-btn share" onclick="event.stopPropagation();shareSpark()"><i class="ph-bold ph-share-network"></i><span></span></button>
      <button class="act-btn bookmark" onclick="event.stopPropagation();toggleBookmark(this)" style="margin-left:auto"><i class="ph-bold ph-bookmark-simple"></i></button>
    </div>
  `;

        // Place before the first demo card inside realFeed (demo cards have no data-spark-id)
        const firstDemo = panel.querySelector(
          ".spark-card:not([data-spark-id])",
        );
        if (firstDemo) {
          panel.insertBefore(article, firstDemo);
        } else {
          panel.appendChild(article);
        }

        // Fetch likes subcollection — get real count + check if current user liked
        const currentUid = window._sparkUser?.uid;
        getDocs(collection(db, "sparks", id, "likes"))
          .then((likesSnap) => {
            // Real count
            const countEl = document.getElementById("likecount-" + id);
            if (countEl) countEl.textContent = likesSnap.size;
            // Highlight if current user liked
            if (currentUid) {
              const alreadyLiked = likesSnap.docs.some(
                (d) => d.id === currentUid,
              );
              if (alreadyLiked) {
                const likeBtn = document.getElementById("like-" + id);
                if (likeBtn) {
                  likeBtn.classList.add("liked");
                  likeBtn.querySelector("i").className = "ph-fill ph-heart";
                  likeBtn.querySelector("span").textContent = likesSnap.size;
                }
              }
            }
          })
          .catch(() => {
            const countEl = document.getElementById("likecount-" + id);
            if (countEl) countEl.textContent = "0";
          });

        // Fetch reply count from subcollection
        getDocs(collection(db, "sparks", id, "comments"))
          .then((repliesSnap) => {
            const el = document.getElementById("replycount-" + id);
            if (el) el.textContent = repliesSnap.size;
          })
          .catch(() => {});
      }

      // ── DELETE SPARK (owner only) ──
      window.deleteSparkCard = async function (btn) {
        const card = btn.closest(".spark-card[data-spark-id]");
        if (!card) return;
        const sparkId = card.dataset.sparkId;
        if (!sparkId) return;

        if (!confirm("Delete this Spark? This cannot be undone.")) return;

        try {
          await deleteDoc(doc(db, SPARKS_COL, sparkId));
          // Remove card from DOM immediately
          card.remove();
        } catch (e) {
          console.error("Delete failed:", e);
          alert("Failed to delete. Please try again.");
        }
      };

      // ── POST NEW SPARK ──
      window._submitSparkFn = async function () {
        const user = window._sparkUser;
        if (!user) return;

        const txt = document.getElementById("composeTa").value.trim();
        if (!txt) return;

        // Dev bypass — ewm24k@gmail.com unlimited
        const isDev = user.email === DEV_EMAIL;

        if (!isDev && (window._todayCount || 0) >= DAILY_LIMIT) {
          alert(
            `You have reached your daily limit of ${DAILY_LIMIT} Sparks. Come back tomorrow!`,
          );
          return;
        }

        const btn = document.getElementById("submitBtn");
        if (btn) {
          btn.disabled = true;
          btn.textContent = "Posting…";
        }

        const ud = window._sparkUserData || {};
        const name = ud.fullName || user.displayName || "T1ERA User";
        const handle = (user.email || "user").split("@")[0];
        const photo = ud.profilePicture?.url || user.photoURL || "";
        const today = getToday();

        try {
          const sparkData = {
            uid: user.uid,
            authorName: name,
            authorHandle: handle,
            authorPhoto: photo,
            text: txt,
            tab: "standard",
            dateStr: today,
            createdAt: serverTimestamp(),
            likes: 0,
            replies: 0,
            reposts: 0,
          };
          // Collect attached images (base64 data URLs from mediaStrip)
          const imgThumbs = document.querySelectorAll("#mediaStrip .media-thumb[data-type='image'] img");
          if (imgThumbs.length > 0) {
            sparkData.images = Array.from(imgThumbs).map((img) => img.src);
          }
          // Attach YouTube video ID if user pasted a YouTube link
          if (window._pendingYtId) {
            sparkData.youtubeId = window._pendingYtId;
          }
          // Attach quoteText if user inserted a ```quote block
          const quoteMatch = txt.match(/```quote\n([\s\S]*?)\n```/);
          if (quoteMatch) {
            sparkData.quoteText = quoteMatch[1];
          }
          await addDoc(collection(db, SPARKS_COL), sparkData);

          // Award +20 XP for posting a spark (increment count by 1; profile.html multiplies by 20)
          try {
            await updateDoc(doc(db, "users", user.uid), {
              "point.spark": increment(1),
            });
          } catch (xpe) {
            console.warn("XP spark award error:", xpe);
          }

          // Show success toast
          if (typeof window.showToast === "function")
            window.showToast("Spark posted ⚡");

          // Reset button
          if (btn) {
            btn.disabled = false;
            btn.textContent = "Spark ⚡";
          }

          // Close compose box
          if (typeof window.closeCompose === "function") window.closeCompose();

          // Reload feed so new post appears immediately
          await startFeed();

          // Refresh quota count
          if (!isDev) await checkQuota(user.uid);
        } catch (e) {
          console.error("Post failed:", e);
          alert("Failed to post. Please try again.");
          if (btn) {
            btn.disabled = false;
            btn.textContent = "Spark ⚡";
          }
        }
      };

      // ── DAILY QUOTA ──
      async function checkQuota(uid) {
        const banner = document.getElementById("quotaBanner");
        const quotaMsg = document.getElementById("quotaMsg");
        const quotaReset = document.getElementById("quotaReset");
        const btn = document.getElementById("submitBtn");
        const toggle = document.getElementById("composeToggle");

        // Dev = unlimited
        if (window._sparkUser && window._sparkUser.email === DEV_EMAIL) {
          banner.classList.remove("show", "warn", "full");
          if (btn)
            btn.disabled =
              document.getElementById("composeTa")?.value.trim().length === 0;
          if (toggle) {
            toggle.style.opacity = "1";
            toggle.style.pointerEvents = "auto";
          }
          window._todayCount = 0;
          return;
        }

        try {
          const today = getToday();
          const snap = await getDocs(
            query(
              collection(db, SPARKS_COL),
              where("uid", "==", uid),
              where("dateStr", "==", today),
              where("tab", "==", "standard"),
            ),
          );
          const count = snap.size;
          window._todayCount = count;

          banner.classList.remove("show", "warn", "full");

          if (count === 0) {
            if (btn)
              btn.disabled =
                document.getElementById("composeTa")?.value.trim().length === 0;
            if (toggle) {
              toggle.style.opacity = "1";
              toggle.style.pointerEvents = "auto";
            }
          } else if (count < DAILY_LIMIT) {
            const remaining = DAILY_LIMIT - count;
            banner.classList.add("show", "warn");
            quotaMsg.textContent = `${count} of ${DAILY_LIMIT} daily Sparks used — ${remaining} remaining`;
            quotaReset.textContent = getMidnightText();
            if (btn)
              btn.disabled =
                document.getElementById("composeTa")?.value.trim().length === 0;
            if (toggle) {
              toggle.style.opacity = "1";
              toggle.style.pointerEvents = "auto";
            }
            setTimeout(() => banner.classList.remove("show", "warn"), 2000);
          } else {
            banner.classList.add("show", "full");
            quotaMsg.textContent = `Daily limit reached — ${DAILY_LIMIT} Sparks per day maximum`;
            quotaReset.textContent = getMidnightText();
            if (btn) btn.disabled = true;
            if (toggle) {
              toggle.style.opacity = "0.45";
              toggle.style.pointerEvents = "none";
            }
            if (typeof window.closeCompose === "function")
              window.closeCompose();
          }
        } catch (e) {
          window._todayCount = 0;
        }
      }

      // ── HELPERS ──
      function getToday() {
        const n = new Date();
        return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
      }

      function getMidnightText() {
        const now = new Date();
        const mid = new Date(now);
        mid.setHours(24, 0, 0, 0);
        const ms = mid - now;
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        return h > 0 ? `Resets in ${h}h ${m}m` : `Resets in ${m}m`;
      }

      // ── APPLY AVATAR TO COMPOSE BOXES ──
      function applyComposeAvatar(photoURL, initial) {
        const miniAv = document.getElementById("miniAv");
        const composeAv = document.getElementById("composeAv");
        const promptMiniAv = document.getElementById("promptMiniAv");
        const promptComposeAv = document.getElementById("promptComposeAv");
        const replyAvs = document.querySelectorAll(".reply-av");

        if (photoURL) {
          [miniAv, composeAv, promptMiniAv, promptComposeAv].forEach((el) => {
            if (!el) return;
            el.textContent = "";
            el.style.background = "none";
            el.style.padding = "0";
            const img = document.createElement("img");
            img.src = photoURL;
            img.alt = "avatar";
            img.referrerPolicy = "no-referrer";
            img.style.cssText =
              "width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;";
            img.onerror = () => {
              el.textContent = initial;
              el.style.background = "";
            };
            el.appendChild(img);
          });
          replyAvs.forEach((el) => {
            el.textContent = "";
            el.style.background = "none";
            el.style.padding = "0";
            const img = document.createElement("img");
            img.src = photoURL;
            img.alt = "avatar";
            img.referrerPolicy = "no-referrer";
            img.style.cssText =
              "width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;";
            img.onerror = () => {
              el.textContent = initial;
              el.style.background = "";
            };
            el.appendChild(img);
          });
        } else {
          if (miniAv) miniAv.textContent = initial;
          if (composeAv) composeAv.textContent = initial;
          if (promptMiniAv) promptMiniAv.textContent = initial;
          if (promptComposeAv) promptComposeAv.textContent = initial;
          replyAvs.forEach((el) => {
            el.textContent = initial;
          });
        }
      }
