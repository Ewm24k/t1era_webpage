import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
      import {
        getAuth,
        onAuthStateChanged,
        signOut,
      } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
      import {
        getFirestore,
        doc,
        getDoc,
        updateDoc,
        setDoc,
        deleteDoc,
        serverTimestamp,
        collection,
        addDoc,
        getDocs,
        query,
        where,
        orderBy,
        limit,
      } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

      // ── Expose for user-peek.js ──
      window._t1db = db;
      window._t1FirestoreFns = {
        doc,
        getDoc,
        collection,
        getDocs,
        query,
        where,
        orderBy,
        limit,
        setDoc,
        deleteDoc,
        serverTimestamp,
        addDoc,
        updateDoc,
      };

      // ── SIGN OUT ──
      window.handleSignOut = async function () {
        try {
          await signOut(auth);
          window.location.replace("home.html");
        } catch (e) {
          console.error("Sign out error:", e);
          alert("Sign out failed. Please try again.");
        }
      };

      // ── POPULATE FROM FIREBASE ──
      // Hide page until auth state is known — prevents flash of content for unauthenticated users
      // Show page immediately with skeleton state — no invisible flash
      document.documentElement.classList.add("profile-loading");

      onAuthStateChanged(auth, async (user) => {
        if (!user) {
          // Not authenticated — redirect immediately to home
          window.location.replace("home.html");
          return;
        }

        // Authenticated — fetch data (skeleton stays visible until applyUserData finishes)
        try {
          const snap = await getDoc(doc(db, "users", user.uid));
          if (snap.exists()) {
            const d = snap.data();
            applyUserData(d, user);
          } else {
            loadDemoData();
          }
        } catch (err) {
          console.warn("Firestore fetch error:", err);
          loadDemoData();
        }
      });

      async function applyUserData(d, user) {
        // Profile photo
        const photoURL = d.profilePicture?.url || user.photoURL || "";
        if (photoURL) {
          const container = document.getElementById("avatarContainer");
          const fallback = document.getElementById("avatarFallback");
          const img = document.createElement("img");
          img.className = "avatar-img";
          img.src = photoURL;
          img.alt = "Profile";
          img.referrerPolicy = "no-referrer";
          img.onerror = () => {
            img.style.display = "none";
          };
          container.insertBefore(img, fallback);
          fallback.style.display = "none";
        }

        // Banner image
        applyBannerImage(d);

        // Fallback initial
        const initial = (d.fullName ||
          d.nickname ||
          user.email ||
          "U")[0].toUpperCase();
        const fallback = document.getElementById("avatarFallback");
        if (fallback) fallback.textContent = initial;

        // Name
        const fn = d.fullName || user.displayName || "User";
        const nn = d.nickname ? `(${d.nickname})` : "";
        document.getElementById("displayFullName").textContent = fn;
        document.getElementById("displayNickname").textContent = nn;

        // Email
        document.getElementById("displayEmail").textContent =
          d.emailPrimary || user.email || "";

        // Rank
        const rank = d.accountStatus?.rank || d.rank || {};
        const level = rank.level ?? 1;
        const title = rank.title ?? "Recruit";
        const callsign = d.callsign ?? "Alpha";

        // Compute total XP from point sub-fields (spark=20, like=10, reply=40)
        const pt = d.accountStatus?.point || d.point || {};
        const totalXP =
          (pt.spark || 0) * 20 + (pt.like || 0) * 10 + (pt.reply || 0) * 40;

        // Level thresholds — each step = 550 × step number (cumulative: 550×n(n-1)/2)
        // LV1=0, LV2=550, LV3=1650, LV4=3300 ... LV30=239250. MAX = LV30.
        const XP_THRESHOLDS = [
          0, // LV1
          550, // LV2
          1650, // LV3
          3300, // LV4
          5500, // LV5
          8250, // LV6
          11550, // LV7
          15400, // LV8
          19800, // LV9
          24750, // LV10
          30250, // LV11
          36300, // LV12
          42900, // LV13
          50050, // LV14
          57750, // LV15
          66000, // LV16
          74800, // LV17
          84150, // LV18
          94050, // LV19
          104500, // LV20
          115500, // LV21
          127050, // LV22
          139150, // LV23
          151800, // LV24
          165000, // LV25
          178750, // LV26
          193050, // LV27
          207900, // LV28
          223300, // LV29
          239250, // LV30 (MAX)
        ];
        // Rank titles — 5 tiers, 6 levels each
        // LV1-6: Recruit | LV7-12: Operative | LV13-18: Guardian | LV19-24: Inferno | LV25-30: Elite
        const RANK_TITLES = [
          "Recruit",
          "Recruit",
          "Recruit",
          "Recruit",
          "Recruit",
          "Recruit",
          "Operative",
          "Operative",
          "Operative",
          "Operative",
          "Operative",
          "Operative",
          "Guardian",
          "Guardian",
          "Guardian",
          "Guardian",
          "Guardian",
          "Guardian",
          "Inferno",
          "Inferno",
          "Inferno",
          "Inferno",
          "Inferno",
          "Inferno",
          "Elite",
          "Elite",
          "Elite",
          "Elite",
          "Elite",
          "Elite",
        ];
        let computedLevel = 1;
        for (let i = XP_THRESHOLDS.length - 1; i >= 0; i--) {
          if (totalXP >= XP_THRESHOLDS[i]) {
            computedLevel = i + 1;
            break;
          }
        }
        window._computedLevel = computedLevel;
        const computedTitle = RANK_TITLES[computedLevel - 1] || title;
        const nextThreshold =
          XP_THRESHOLDS[computedLevel] ||
          XP_THRESHOLDS[XP_THRESHOLDS.length - 1];
        const prevThreshold = XP_THRESHOLDS[computedLevel - 1] || 0;
        const xpIntoLevel = totalXP - prevThreshold;
        const xpNeededForLevel = nextThreshold - prevThreshold;
        const xpPct =
          computedLevel >= XP_THRESHOLDS.length
            ? 100
            : Math.min(100, (xpIntoLevel / xpNeededForLevel) * 100);

        document.getElementById("rankLevelNum").textContent =
          `LV ${computedLevel}`;
        document.getElementById("rankLevelSvg").textContent = computedLevel;
        document.getElementById("rankTitleText").textContent = computedTitle;
        document.getElementById("callsignText").textContent =
          callsign.toUpperCase();
        document.getElementById("xpVal").textContent = totalXP;
        const xpNextEl = document.getElementById("xpNext");
        if (xpNextEl)
          xpNextEl.textContent =
            computedLevel >= XP_THRESHOLDS.length ? totalXP : nextThreshold;
        document.getElementById("intelRankTitle").textContent =
          computedTitle.toUpperCase();
        document.getElementById("intelLevel").textContent = computedLevel;
        document.getElementById("intelCallsign").textContent = callsign;
        const intelShieldLevelEl = document.getElementById("intelShieldLevel");
        if (intelShieldLevelEl) intelShieldLevelEl.textContent = computedLevel;

        // ── Rank badge cards — unlock earned tiers, highlight active tier ──
        const RANK_ORDER = [
          "Recruit",
          "Operative",
          "Guardian",
          "Inferno",
          "Elite",
        ];
        const currentTierIndex = RANK_ORDER.indexOf(computedTitle);
        document
          .querySelectorAll("#rankBadgesGrid .badge-card[data-rank]")
          .forEach((card) => {
            const cardTierIndex = RANK_ORDER.indexOf(card.dataset.rank);
            card.classList.remove("locked", "active");
            if (cardTierIndex < currentTierIndex) {
              // already passed — unlocked but not active
            } else if (cardTierIndex === currentTierIndex) {
              card.classList.add("active");
            } else {
              card.classList.add("locked");
            }
          });

        document.getElementById("xpFill").style.width = `${xpPct}%`;
        const rankXpFillEl = document.getElementById("rankXpFill");
        if (rankXpFillEl) rankXpFillEl.style.width = `${xpPct}%`;

        // Update Intel tab XP text labels
        const intelXpCurrentEl = document.getElementById("intelXpCurrent");
        if (intelXpCurrentEl) intelXpCurrentEl.textContent = `${totalXP} XP`;
        const intelXpNextEl = document.getElementById("intelXpNext");
        const nextRankName = RANK_TITLES[computedLevel] || "Legend";
        if (intelXpNextEl) {
          if (computedLevel >= XP_THRESHOLDS.length) {
            intelXpNextEl.textContent = "Max Level Reached";
          } else {
            const xpToNext = nextThreshold - totalXP;
            intelXpNextEl.textContent = `${xpToNext} XP to ${nextRankName}`;
          }
        }
        // Update NEXT RANK name (top-right of rank card)
        const intelNextRankNameEl =
          document.getElementById("intelNextRankName");
        if (intelNextRankNameEl) {
          if (computedLevel >= XP_THRESHOLDS.length) {
            intelNextRankNameEl.textContent = "MAX";
          } else {
            intelNextRankNameEl.textContent = nextRankName.toUpperCase();
          }
        }
        // Also update the rank-level-label span in Intel card
        const intelLevelLabel = document.querySelector(".rank-level-label");
        if (intelLevelLabel)
          intelLevelLabel.innerHTML = `Level <span id="intelLevel">${computedLevel}</span> · ${totalXP} / ${nextThreshold} XP`;

        // ── Sync rank.xp, rank.level, rank.title back to Firestore ──
        try {
          await updateDoc(doc(db, "users", user.uid), {
            "accountStatus.rank.xp": totalXP,
            "accountStatus.rank.level": computedLevel,
            "accountStatus.rank.title": computedTitle,
            "accountStatus.rank.updatedAt": new Date().toISOString(),
          });
        } catch (_rankWriteErr) {
          console.warn("rank write error:", _rankWriteErr);
        }

        // ── Apply saved profile ring color ──
        // Users below level 20: default is no ring. They can choose white or white-grey only.
        // Users level 20+: full ring options unlocked.
        const savedRing = d.profileRing || (computedLevel >= 20 ? "pink-purple" : "none");
        if (typeof window.applyRingColor === "function") window.applyRingColor(savedRing);

        // Account status
        const acctStatus = d.accountStatus || {};
        const isVerified = acctStatus.verified ?? false;
        const acctType = acctStatus.type ?? "standard";

        const verifiedTag = document.getElementById("verifiedTag");
        if (isVerified) {
          verifiedTag.className = "verified-tag verified";
          verifiedTag.innerHTML = "✓ Verified";
        }

        document.getElementById("acctTypeBadge").innerHTML =
          `<i class="ph-fill ph-star" style="font-size:9px;"></i> ${capitalize(acctType)}`;

        // Plan
        const planType = d.plan?.type ?? "free";
        document.getElementById("planTypeBadge").textContent =
          `${capitalize(planType)} Plan`;
        document.getElementById("planVal").textContent = capitalize(planType);

        // Balance
        const bal = d.balance || {};
        const currency = bal.currency || "MYR";
        const amount = (bal.amount || 0).toFixed(2);
        document.getElementById("balanceAmount").textContent =
          `${currency} ${amount}`;

        // Points
        const pts = d.points || {};
        document.getElementById("pointsTotal").textContent = pts.total ?? 0;
        document.getElementById("pointsAvail").textContent = pts.available ?? 0;
        document.getElementById("pointsSpent").textContent = pts.spent ?? 0;

        // AI Level
        document.getElementById("aiLevelVal").textContent =
          d.aiLevel ?? "beginner";

        // Affiliate
        const aff = d.affiliate || {};
        document.getElementById("affStatus").textContent = capitalize(
          aff.status || "none",
        );
        document.getElementById("totalReferred").textContent =
          aff.totalReferred ?? 0;

        // Member since
        if (d.setupCompletedAt?.toDate) {
          const dt = d.setupCompletedAt.toDate();
          document.getElementById("memberSince").textContent =
            dt.toLocaleDateString("en-MY", {
              day: "numeric",
              month: "short",
              year: "numeric",
            });
        }

        // Chips
        buildChips(d);

        // Status
        window._currentUid = user.uid;
        window._currentUserEmail = user.email || "";
        window._userDocRef = doc(db, "users", user.uid);
        window._myUserData = d; // store for follow operations
        fetchAndApplyStatus(user.uid);
        fetchAndApplyBio(user.uid);
        loadActivityHistory(user.uid);
        loadProfileSparks(user.uid);
        loadFollowStats(user.uid);

        // Remove skeleton overlays and reveal page now that data is applied
        const nsk = document.getElementById("nameSkeleton");
        if (nsk) nsk.remove();
        const ask = document.getElementById("avatarSkeleton");
        if (ask) ask.remove();
        document.documentElement.classList.remove("profile-loading");
      }

      function loadDemoData() {
        // Demo data matching the Firestore structure provided
        buildChips({
          industry: "tech",
          city: "Shah Alam",
          country: "MY",
          language: "en",
          aiLevel: "beginner",
          contactPref: "whatsapp",
          plan: { type: "free" },
        });
        const nsk = document.getElementById("nameSkeleton");
        if (nsk) nsk.remove();
        const ask = document.getElementById("avatarSkeleton");
        if (ask) ask.remove();
        document.documentElement.classList.remove("profile-loading");
      }

      function buildChips(d) {
        const row = document.getElementById("chipsRow");
        const chips = [
          d.industry
            ? { icon: "ph-briefcase", label: capitalize(d.industry) }
            : null,
          d.city
            ? { icon: "ph-map-pin", label: `${d.city}, ${d.country || ""}` }
            : null,
          d.language
            ? { icon: "ph-translate", label: d.language.toUpperCase(), cls: "" }
            : null,
          d.aiLevel
            ? {
                icon: "ph-robot",
                label: `AI: ${capitalize(d.aiLevel)}`,
                cls: "highlight",
              }
            : null,
          d.contactPref
            ? { icon: "ph-chat-circle-dots", label: capitalize(d.contactPref) }
            : null,
          d.plan?.type
            ? {
                icon: "ph-crown",
                label: `${capitalize(d.plan.type)} Plan`,
                cls: d.plan.type === "free" ? "" : "gold-chip",
              }
            : null,
        ].filter(Boolean);

        row.innerHTML = chips
          .map(
            (c) =>
              `<span class="chip ${c.cls || ""}"><i class="ph-bold ${c.icon}"></i>${c.label}</span>`,
          )
          .join("");
      }

      function capitalize(str) {
        if (!str) return "";
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
      }

      // ══════════════════════════════════════════════════════
      // AVATAR UPLOAD — Cloudinary + Firestore
      // ══════════════════════════════════════════════════════
      const CLOUDINARY_CLOUD = "dcmsz0wbz";
      const CLOUDINARY_PRESET = "t1era-uploads"; // your unsigned preset name

      // Called when user picks a file from the file input
      window.handleAvatarChange = async function (input) {
        const file = input.files[0];
        if (!file) return;

        // ── Validate ──
        if (!file.type.startsWith("image/")) {
          alert("Please select an image file.");
          input.value = "";
          return;
        }
        if (file.size > 10 * 1024 * 1024) {
          alert("Image must be under 10 MB.");
          input.value = "";
          return;
        }

        // ── Show spinner overlay ──
        const overlay = document.getElementById("avatarUploadOverlay");
        overlay.classList.add("active");

        try {
          // ── Upload to Cloudinary ──
          const url = await uploadAvatarToCloudinary(file);

          // ── Save URL to Firestore ──
          await setDoc(
            window._userDocRef,
            {
              profilePicture: {
                url: url,
                source: "cloudinary",
                updatedAt: serverTimestamp(),
              },
            },
            { merge: true },
          );

          // ── Log activity ──
          await logActivity({
            type: "avatar_update",
            icon: "ph-user-circle",
            iconColor: "var(--purple)",
            bgClass: "purple-bg",
            text: "<strong>Profile photo updated</strong>",
          });

          // ── Reload to reflect new photo ──
          window.location.reload();
        } catch (e) {
          console.error("Avatar upload error:", e);
          alert("Upload failed — please try again.");
          overlay.classList.remove("active");
          input.value = "";
        }
      };

      async function uploadAvatarToCloudinary(file) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", CLOUDINARY_PRESET);
        formData.append("folder", `t1era/profiles/${window._currentUid}`);
        formData.append("public_id", "avatar");

        const res = await fetch(
          `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,
          { method: "POST", body: formData },
        );

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(
            err.error?.message || `Cloudinary error ${res.status}`,
          );
        }

        const data = await res.json();
        if (!data.secure_url)
          throw new Error("No URL returned from Cloudinary");
        return data.secure_url;
      }

      // ══════════════════════════════════════════════════════
      // BANNER UPLOAD — Cloudinary + Firestore + 30-day cooldown
      // ══════════════════════════════════════════════════════
      const BANNER_COOLDOWN_DAYS = 30;
      const DEV_BYPASS_EMAIL = "ewm24k@gmail.com"; // no cooldown for this account

      // Preset definitions — maps key → CSS class + Firestore value
      const BANNER_PRESETS = {
        default: { cls: "banner-preset-default", label: "T1ERA Default" },
        midnight: { cls: "banner-preset-midnight", label: "Midnight Blue" },
        cyber: { cls: "banner-preset-cyber", label: "Cyber Grid" },
        pinky: { cls: "banner-preset-pinky", label: "Pinky Vibe" },
      };

      // ── OPEN BANNER OPTIONS MODAL ──
      window.handleBannerClick = function () {
        if (!window._currentUid) return;
        window._pendingBannerPreset = null; // reset pending
        _refreshBannerOptionsUI();
        // reset apply button
        const applyBtn = document.getElementById("bannerApplyBtn");
        if (applyBtn) {
          applyBtn.disabled = true;
          applyBtn.style.opacity = "0.4";
        }
        document.getElementById("bannerOptionsOverlay").classList.add("open");
      };

      window.closeBannerOptions = function () {
        document
          .getElementById("bannerOptionsOverlay")
          .classList.remove("open");
        window._pendingBannerPreset = null;
      };

      function _refreshBannerOptionsUI() {
        const current = window._currentBannerPreset || "default";
        Object.keys(BANNER_PRESETS).forEach((key) => {
          const card = document.getElementById(`bopt-${key}`);
          if (card) card.classList.toggle("active", key === current);
        });
      }

      // Step 1: user clicks a card — highlight it, enable Apply button
      window.pendingBannerSelect = function (preset, cardEl) {
        window._pendingBannerPreset = preset;

        // Highlight selected card
        document
          .querySelectorAll(".banner-option-card")
          .forEach((c) => c.classList.remove("pending"));
        if (cardEl) cardEl.classList.add("pending");

        // Enable apply button
        const applyBtn = document.getElementById("bannerApplyBtn");
        if (applyBtn) {
          applyBtn.disabled = false;
          applyBtn.style.opacity = "1";
        }
      };

      // Step 2: user clicks Apply — save and apply
      window.applyPendingBanner = async function () {
        const preset = window._pendingBannerPreset;
        if (!preset || !window._userDocRef) return;

        const applyBtn = document.getElementById("bannerApplyBtn");
        if (applyBtn) {
          applyBtn.textContent = "Applying…";
          applyBtn.disabled = true;
        }

        // Apply visually immediately
        _applyBannerPresetToDOM(preset);
        window._currentBannerPreset = preset;
        _refreshBannerOptionsUI();

        // Save to Firestore
        try {
          await setDoc(
            window._userDocRef,
            {
              bannerImage: {
                preset: preset,
                url: null,
                source: "preset",
              },
            },
            { merge: true },
          );

          await logActivity({
            type: "banner_update",
            icon: "ph-paint-brush",
            iconColor: "var(--purple)",
            bgClass: "purple-bg",
            text: `<strong>Banner style changed</strong> — ${BANNER_PRESETS[preset].label}`,
          });

          // Live activity tab update
          const nowStr = new Date().toLocaleString("en-MY", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
          appendActivityItemToFeed(
            {
              type: "banner_update",
              icon: "ph-paint-brush",
              iconColor: "var(--purple)",
              bgClass: "purple-bg",
              text: `<strong>Banner style changed</strong> — ${BANNER_PRESETS[preset].label}`,
            },
            nowStr,
          );
        } catch (e) {
          console.warn("applyPendingBanner save error:", e);
        }

        closeBannerOptions();
      };

      function _applyBannerPresetToDOM(preset) {
        const banner = document.getElementById("profileBanner");
        const bgImg = document.getElementById("bannerBgImg");
        if (!banner) return;

        // Remove all preset classes
        Object.values(BANNER_PRESETS).forEach((p) =>
          banner.classList.remove(p.cls),
        );

        // Clear custom image layer
        if (bgImg) bgImg.style.backgroundImage = "";

        // Apply new preset class
        const p = BANNER_PRESETS[preset];
        if (p) banner.classList.add(p.cls);
      }

      // ── TRIGGER CUSTOM UPLOAD (from options modal) ──
      window.triggerBannerUpload = async function () {
        closeBannerOptions();

        // Dev bypass — no cooldown
        const isDev = window._currentUserEmail === DEV_BYPASS_EMAIL;

        if (isDev) {
          document.getElementById("bannerFileInput").click();
          return;
        }

        // Normal users — check cooldown
        const { allowed, lastUpload, nextAllowed } =
          await checkBannerCooldown();
        if (allowed) {
          document.getElementById("bannerFileInput").click();
        } else {
          showBannerCooldownModal(lastUpload, nextAllowed);
        }
      };

      // Check Firestore for last banner upload date
      async function checkBannerCooldown() {
        try {
          const snap = await getDoc(doc(db, "users", window._currentUid));
          if (!snap.exists())
            return { allowed: true, lastUpload: null, nextAllowed: null };

          const data = snap.data();
          const uploadedAt = data.bannerImage?.uploadedAt;

          // Never uploaded a custom photo — allow
          if (!uploadedAt)
            return { allowed: true, lastUpload: null, nextAllowed: null };

          const lastUpload = uploadedAt.toDate
            ? uploadedAt.toDate()
            : new Date(uploadedAt);
          const nextAllowed = new Date(lastUpload);
          nextAllowed.setDate(nextAllowed.getDate() + BANNER_COOLDOWN_DAYS);

          const now = new Date();
          const allowed = now >= nextAllowed;

          return { allowed, lastUpload, nextAllowed };
        } catch (e) {
          console.warn("checkBannerCooldown error:", e);
          return { allowed: true, lastUpload: null, nextAllowed: null };
        }
      }

      // Show cooldown modal with reason and next allowed date
      function showBannerCooldownModal(lastUpload, nextAllowed) {
        const msgEl = document.getElementById("cooldownMessage");
        const nextDateEl = document.getElementById("cooldownNextDate");
        const overlay = document.getElementById("bannerCooldownOverlay");

        const lastStr = lastUpload.toLocaleDateString("en-MY", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
        const nextStr = nextAllowed.toLocaleDateString("en-MY", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });

        const daysLeft = Math.ceil(
          (nextAllowed - new Date()) / (1000 * 60 * 60 * 24),
        );
        msgEl.textContent = `You last changed your banner on ${lastStr}. You need to wait ${daysLeft} more day${daysLeft === 1 ? "" : "s"} before you can update it again.`;
        nextDateEl.textContent = nextStr;

        overlay.classList.add("open");
      }

      window.closeBannerCooldown = function () {
        document
          .getElementById("bannerCooldownOverlay")
          .classList.remove("open");
      };

      // Called when user picks a banner file
      window.handleBannerChange = async function (input) {
        const file = input.files[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
          alert("Please select an image file.");
          input.value = "";
          return;
        }

        if (file.size > 3 * 1024 * 1024) {
          alert(
            "Banner image must be under 3MB. Please choose a smaller or compressed image.",
          );
          input.value = "";
          return;
        }

        // Dev bypass — skip double-check
        const isDev = window._currentUserEmail === DEV_BYPASS_EMAIL;
        if (!isDev) {
          const { allowed } = await checkBannerCooldown();
          if (!allowed) {
            input.value = "";
            return;
          }
        }

        const uploadOverlay = document.getElementById("bannerUploadOverlay");
        uploadOverlay.classList.add("active");

        try {
          const url = await uploadBannerToCloudinary(file);

          await setDoc(
            window._userDocRef,
            {
              bannerImage: {
                url: url,
                preset: null, // clear any preset
                source: "cloudinary",
                uploadedAt: serverTimestamp(), // only custom uploads set this timestamp
              },
            },
            { merge: true },
          );

          await logActivity({
            type: "banner_update",
            icon: "ph-image",
            iconColor: "var(--pink-2)",
            bgClass: "pink-bg",
            text: "<strong>Banner photo updated</strong>",
          });

          window.location.reload();
        } catch (e) {
          console.error("Banner upload error:", e);
          alert("Banner upload failed — please try again.");
          uploadOverlay.classList.remove("active");
          input.value = "";
        }
      };

      async function uploadBannerToCloudinary(file) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", CLOUDINARY_PRESET);
        formData.append("folder", `t1era/banners/${window._currentUid}`);
        formData.append("public_id", "banner");

        const res = await fetch(
          `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,
          { method: "POST", body: formData },
        );

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(
            err.error?.message || `Cloudinary error ${res.status}`,
          );
        }

        const data = await res.json();
        if (!data.secure_url)
          throw new Error("No URL returned from Cloudinary");
        return data.secure_url;
      }

      // Apply saved banner on page load (called from applyUserData)
      function applyBannerImage(d) {
        const bannerData = d.bannerImage;
        if (!bannerData) return;

        if (bannerData.url && bannerData.source === "cloudinary") {
          // Custom uploaded photo
          const layer = document.getElementById("bannerBgImg");
          if (layer) layer.style.backgroundImage = `url('${bannerData.url}')`;
          window._currentBannerPreset = null;
        } else if (bannerData.preset) {
          // Preset design
          _applyBannerPresetToDOM(bannerData.preset);
          window._currentBannerPreset = bannerData.preset;
        }
      }

      // ── STATUS INPUT HANDLER ──
      window.onStatusInput = function (input) {
        const len = input.value.length;
        const counter = document.getElementById("statusCharCount");
        counter.textContent = `${len} / 60`;
        counter.classList.remove("near-limit", "at-limit");
        if (len >= 60) counter.classList.add("at-limit");
        else if (len >= 45) counter.classList.add("near-limit");
      };

      // ── SET QUICK STATUS ──
      window.setQuickStatus = function (text) {
        const input = document.getElementById("statusInput");
        input.value = text.slice(0, 60);
        input.focus();
        window.onStatusInput(input);
      };

      // ── SHOW STATUS TOAST ──
      function showStatusToast(msg, type) {
        const toast = document.getElementById("statusToast");
        if (!toast) return;
        toast.textContent = msg;
        toast.className = "status-toast show " + type;
        clearTimeout(toast._hideTimer);
        toast._hideTimer = setTimeout(() => {
          toast.className = "status-toast";
        }, 3500);
      }

      // ── SAVE STATUS ──
      window.saveStatus = async function () {
        const input = document.getElementById("statusInput");
        const btn = document.querySelector(".status-save-btn");
        const val = input.value.trim();

        // Guard: not signed in
        if (!window._userDocRef) {
          showStatusToast(
            "✗ Not signed in — please sign in to save your status.",
            "fail",
          );
          return;
        }

        // Set button to saving state — keep visible while async runs
        btn.disabled = true;
        btn.classList.add("saving");
        btn.textContent = "Saving…";

        let saved = false;

        try {
          // Primary: setDoc with merge so it creates field if not existing
          await setDoc(
            window._userDocRef,
            { userStatus: val },
            { merge: true },
          );
          saved = true;
        } catch (e) {
          // Fallback: updateDoc
          try {
            await updateDoc(window._userDocRef, { userStatus: val });
            saved = true;
          } catch (e2) {
            console.warn("saveStatus error:", e2);
          }
        }

        if (saved) {
          // Build activity data
          const activityData = {
            type: "status_update",
            icon: "ph-chat-circle-dots",
            iconColor: "var(--pink-2)",
            bgClass: "pink-bg",
            text: `<strong>Status updated</strong> — "${val}"`,
          };

          // Log to Firestore (correct path via _currentUid)
          try {
            await logActivity(activityData);
          } catch (e) {
            console.warn("logActivity error after save:", e);
          }

          // Immediately update the Activity tab DOM — no refresh needed
          const nowStr = new Date().toLocaleString("en-MY", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
          appendActivityItemToFeed(activityData, nowStr);

          btn.classList.remove("saving");
          btn.classList.add("saved");
          btn.textContent = "✓ Saved";
          showStatusToast("✓ Status saved successfully.", "success");

          setTimeout(() => {
            window.location.reload();
          }, 2000);
        } else {
          btn.classList.remove("saving");
          btn.classList.add("error");
          btn.textContent = "✗ Failed";
          showStatusToast(
            "✗ Failed to save — check your connection and try again.",
            "fail",
          );

          setTimeout(() => {
            btn.disabled = false;
            btn.classList.remove("error");
            btn.textContent = "Save";
          }, 3000);
        }
      };

      // ── FETCH AND APPLY STATUS ──
      async function fetchAndApplyStatus(uid) {
        try {
          const snap = await getDoc(doc(db, "users", uid));
          if (snap.exists()) {
            const d = snap.data();
            const statusVal = d.userStatus || "";
            const input = document.getElementById("statusInput");
            if (input) {
              input.value = statusVal;
              window.onStatusInput(input);
            }
          }
        } catch (e) {
          console.warn("fetchAndApplyStatus error:", e);
        }
      }

      // ── FETCH AND APPLY BIO ──
      async function fetchAndApplyBio(uid) {
        try {
          const snap = await getDoc(doc(db, "users", uid));
          if (snap.exists()) {
            const d = snap.data();
            const bioText = d.userBio || "";
            const bioLinks = d.userBioLinks || [];
            renderBioDisplay(bioText, bioLinks);
            // Pre-fill edit box
            const ta = document.getElementById("bioTextarea");
            if (ta) {
              ta.value = bioText;
              onBioInput(ta);
            }
            // Pre-fill link inputs
            const editor = document.getElementById("bioLinksEditor");
            if (editor) {
              editor.innerHTML = "";
              bioLinks.forEach((url) => _addBioLinkRow(url));
            }
            _updateAddLinkBtn();
          }
        } catch (e) {
          console.warn("fetchAndApplyBio error:", e);
        }
      }

      // ── RENDER BIO DISPLAY ──
      function renderBioDisplay(text, links) {
        const display = document.getElementById("bioDisplay");
        const linksDiv = document.getElementById("bioLinksDisplay");
        if (!display || !linksDiv) return;

        if (text.trim()) {
          display.textContent = text;
          display.classList.add("has-content");
        } else {
          display.textContent = "Bio";
          display.classList.remove("has-content");
        }

        linksDiv.innerHTML = "";
        if (Array.isArray(links)) {
          links
            .filter((l) => l.trim())
            .forEach((url) => {
              const href = url.startsWith("http") ? url : "https://" + url;
              const a = document.createElement("a");
              a.className = "bio-link-pill";
              a.href = href;
              a.target = "_blank";
              a.rel = "noopener noreferrer";
              a.innerHTML = `<i class="ph-bold ph-link"></i>${url.replace(/^https?:\/\//, "")}`;
              linksDiv.appendChild(a);
            });
        }
      }

      // ── TOGGLE BIO EDIT ──
      window.toggleBioEdit = function (open) {
        const box = document.getElementById("bioEditBox");
        const display = document.getElementById("bioDisplay");
        const linksDisplay = document.getElementById("bioLinksDisplay");
        if (!box) return;
        if (open) {
          box.classList.add("open");
          display.style.display = "none";
          linksDisplay.style.display = "none";
          document.getElementById("bioTextarea").focus();
        } else {
          box.classList.remove("open");
          display.style.display = "";
          linksDisplay.style.display = "";
        }
      };

      // ── BIO INPUT HANDLER ──
      window.onBioInput = function (ta) {
        const len = ta.value.length;
        const counter = document.getElementById("bioCharCount");
        if (!counter) return;
        counter.textContent = `${len} / 80`;
        counter.classList.remove("near-limit", "at-limit");
        if (len >= 80) counter.classList.add("at-limit");
        else if (len >= 60) counter.classList.add("near-limit");
      };

      // ── ADD BIO LINK ROW ──
      function _addBioLinkRow(value) {
        const editor = document.getElementById("bioLinksEditor");
        if (!editor) return;
        const row = document.createElement("div");
        row.className = "bio-link-input-row";
        row.innerHTML = `
    <input type="url" class="bio-link-input" placeholder="https://yourlink.com" value="${value || ""}" />
    <button class="bio-link-remove-btn" onclick="removeBioLink(this)" title="Remove">
      <i class="ph-bold ph-x"></i>
    </button>
  `;
        editor.appendChild(row);
      }

      window.addBioLink = function () {
        const editor = document.getElementById("bioLinksEditor");
        if (!editor) return;
        const count = editor.querySelectorAll(".bio-link-input-row").length;
        if (count >= 3) return;
        _addBioLinkRow("");
        _updateAddLinkBtn();
      };

      window.removeBioLink = function (btn) {
        btn.closest(".bio-link-input-row").remove();
        _updateAddLinkBtn();
      };

      function _updateAddLinkBtn() {
        const editor = document.getElementById("bioLinksEditor");
        const addBtn = document.getElementById("bioAddLinkBtn");
        if (!editor || !addBtn) return;
        const count = editor.querySelectorAll(".bio-link-input-row").length;
        addBtn.disabled = count >= 3;
        addBtn.title = count >= 3 ? "Maximum 3 links allowed" : "Add a link";
      }

      // ── SHOW BIO TOAST ──
      function showBioToast(msg, type) {
        const toast = document.getElementById("bioToast");
        if (!toast) return;
        toast.textContent = msg;
        toast.className = "bio-toast show " + type;
        clearTimeout(toast._hideTimer);
        toast._hideTimer = setTimeout(() => {
          toast.className = "bio-toast";
        }, 3500);
      }

      // ── SAVE BIO ──
      window.saveBio = async function () {
        const btn = document.getElementById("bioSaveBtn");
        const ta = document.getElementById("bioTextarea");
        const bioText = ta.value.trim();

        // Collect links — max 3, filter empty
        const editor = document.getElementById("bioLinksEditor");
        const bioLinks = Array.from(editor.querySelectorAll(".bio-link-input"))
          .map((inp) => inp.value.trim())
          .filter((v) => v.length > 0)
          .slice(0, 3);

        if (!window._userDocRef) {
          showBioToast("✗ Not signed in.", "fail");
          return;
        }

        btn.disabled = true;
        btn.classList.add("saving");
        btn.textContent = "Saving…";

        let saved = false;
        try {
          await setDoc(
            window._userDocRef,
            { userBio: bioText, userBioLinks: bioLinks },
            { merge: true },
          );
          saved = true;
        } catch (e) {
          try {
            await updateDoc(window._userDocRef, {
              userBio: bioText,
              userBioLinks: bioLinks,
            });
            saved = true;
          } catch (e2) {
            console.warn("saveBio error:", e2);
          }
        }

        if (saved) {
          // Log activity
          try {
            await logActivity({
              type: "bio_update",
              icon: "ph-pencil-line",
              iconColor: "var(--purple)",
              bgClass: "purple-bg",
              text: `<strong>Bio updated</strong> — "${bioText.slice(0, 40)}${bioText.length > 40 ? "…" : ""}"`,
            });
          } catch (e) {
            console.warn("logActivity bio error:", e);
          }

          // Live DOM update on activity tab
          const nowStr = new Date().toLocaleString("en-MY", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
          appendActivityItemToFeed(
            {
              type: "bio_update",
              icon: "ph-pencil-line",
              iconColor: "var(--purple)",
              bgClass: "purple-bg",
              text: `<strong>Bio updated</strong> — "${bioText.slice(0, 40)}${bioText.length > 40 ? "…" : ""}"`,
            },
            nowStr,
          );

          // Update display
          renderBioDisplay(bioText, bioLinks);

          btn.classList.remove("saving");
          btn.classList.add("saved");
          btn.textContent = "✓ Saved";
          showBioToast("✓ Bio saved successfully.", "success");

          setTimeout(() => {
            window.location.reload();
          }, 1800);
        } else {
          btn.classList.remove("saving");
          btn.classList.add("error");
          btn.textContent = "✗ Failed";
          showBioToast("✗ Failed to save — check your connection.", "fail");
          setTimeout(() => {
            btn.disabled = false;
            btn.classList.remove("error");
            btn.textContent = "Save";
          }, 3000);
        }
      };

      // ── APPEND ACTIVITY ITEM TO FEED (live DOM update) ──
      function appendActivityItemToFeed(a, timeStr) {
        const feed = document.getElementById("activityFeed");
        if (!feed) return;
        const item = document.createElement("div");
        item.className = "activity-item db-activity-item";
        item.innerHTML = `
    <div class="activity-line"></div>
    <div class="activity-icon-wrap ${a.bgClass || ""}">
      <i class="ph-bold ${a.icon || "ph-activity"}" style="color:${a.iconColor || "var(--text-3)"};font-size:14px;"></i>
    </div>
    <div class="activity-body">
      <div class="activity-text">${a.text || ""}</div>
      <div class="activity-time">${timeStr}</div>
    </div>
  `;
        // Insert at the very top of the feed, above static items
        feed.insertBefore(item, feed.firstChild);
      }
      window.appendActivityItemToFeed = appendActivityItemToFeed;

      // ── LOG ACTIVITY ──
      async function logActivity(activityData) {
        if (!window._currentUid) return;
        try {
          const activityCol = collection(
            db,
            "users",
            window._currentUid,
            "activityHistory",
          );
          await addDoc(activityCol, {
            ...activityData,
            createdAt: serverTimestamp(),
          });
        } catch (e) {
          console.warn("logActivity error:", e);
        }
      }

      // ── LOAD ACTIVITY HISTORY ──
      async function loadActivityHistory(uid) {
        const feed = document.getElementById("activityFeed");
        if (!feed) return;

        // Remove previously injected DB items to avoid duplicates on refresh
        feed.querySelectorAll(".db-activity-item").forEach((el) => el.remove());

        try {
          const activityCol = collection(db, "users", uid, "activityHistory");

          // Fetch WITHOUT orderBy to avoid requiring a Firestore composite index.
          // We sort client-side after fetch.
          const snap = await getDocs(activityCol);

          if (snap.empty) return;

          const items = [];
          snap.forEach((docSnap) => {
            const a = docSnap.data();
            // createdAt may be null on the first read if serverTimestamp() hasn't resolved yet
            const ts =
              typeof a.createdAt?.toDate === "function"
                ? a.createdAt.toDate()
                : null;
            const timeStr = ts
              ? ts.toLocaleString("en-MY", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Just now";
            items.push({ a, timeStr, ts });
          });

          // Sort newest first client-side (nulls go to top as "Just now")
          items.sort((x, y) => {
            if (!x.ts && !y.ts) return 0;
            if (!x.ts) return -1;
            if (!y.ts) return 1;
            return y.ts - x.ts;
          });

          // Insert oldest-first so that insertBefore(firstChild) leaves newest at top
          for (let i = items.length - 1; i >= 0; i--) {
            appendActivityItemToFeed(items[i].a, items[i].timeStr);
          }
        } catch (e) {
          console.error("loadActivityHistory error:", e);
        }
      }
      window.loadActivityHistory = loadActivityHistory;

      // ══════════════════════════════════════════════════════
      // PROFILE SPARKS TAB — load user's sparks from Firebase
      // ══════════════════════════════════════════════════════
      async function loadProfileSparks(uid) {
        const grid = document.getElementById("profileSparksGrid");
        if (!grid) return;

        // Remove previously loaded Firebase spark cards to avoid duplicates
        grid
          .querySelectorAll(".spark-card[data-spark-id]")
          .forEach((el) => el.remove());
        // Keep HTML skeleton cards visible while loading
        const skels = Array.from(grid.querySelectorAll(".sk-profile-card"));

        try {
          const snap = await getDocs(
            query(
              collection(db, "sparks"),
              where("uid", "==", uid),
              where("tab", "==", "standard"),
            ),
          );

          // Remove skeletons
          skels.forEach((s) => s.remove());

          if (snap.empty) {
            grid.innerHTML =
              '<div style="padding:32px 16px;text-align:center;font-size:13px;color:var(--text-3)">No sparks posted yet</div>';
            return;
          }

          const docs = [];
          snap.forEach((d) => docs.push({ id: d.id, data: d.data() }));

          // Sort newest first client-side
          docs.sort((a, b) => {
            const ta = a.data.createdAt?.toMillis
              ? a.data.createdAt.toMillis()
              : 0;
            const tb = b.data.createdAt?.toMillis
              ? b.data.createdAt.toMillis()
              : 0;
            return tb - ta;
          });

          // Update spark count stat
          const sparkCountEl = document.getElementById("sparkCount");
          if (sparkCountEl) sparkCountEl.textContent = docs.length;

          // Render each spark card
          docs.forEach(({ id, data: d }) => {
            const name = d.authorName || "User";
            const initial = name[0].toUpperCase();
            const photo = d.authorPhoto || "";
            const txt = d.text || "";
            const time = d.createdAt?.toDate
              ? d.createdAt.toDate().toLocaleString("en-MY", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Just now";

            const avHtml = photo
              ? `<img src="${photo}" referrerpolicy="no-referrer" class="spark-avatar" onerror="this.style.display='none'">`
              : `<div class="spark-avatar-fallback">${initial}</div>`;

            const linkedTxt = txt
              .replace(/(#\w+)/g, '<span class="spark-tag">$1</span>')
              .replace(
                /(@\w+)/g,
                '<span style="color:var(--purple)">$1</span>',
              );

            const ytBlock = d.youtubeId
              ? `
        <div style="margin-top:8px;border-radius:10px;overflow:hidden;border:1px solid var(--border-2);cursor:pointer" onclick="event.stopPropagation();openYtModalProfile('${d.youtubeId}')">
          <div style="position:relative;aspect-ratio:16/9">
            <img src="https://i.ytimg.com/vi/${d.youtubeId}/hqdefault.jpg" style="width:100%;height:100%;object-fit:cover;display:block">
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.35)">
              <div style="width:44px;height:44px;border-radius:50%;background:rgba(255,0,0,0.9);display:flex;align-items:center;justify-content:center">
                <svg viewBox="0 0 24 24" fill="#fff" width="18" height="18"><path d="M8 5v14l11-7z"/></svg>
              </div>
            </div>
          </div>
        </div>`
              : "";

            const card = document.createElement("div");
            card.className = "spark-card";
            card.dataset.sparkId = id;
            card.innerHTML = `
        <div class="spark-header">
          ${avHtml}
          <div class="spark-meta">
            <div class="spark-name">${name} <span class="spark-rank-chip">LV1 · Recruit</span></div>
            <div class="spark-time">${time}</div>
          </div>
          <button onclick="event.stopPropagation();deleteProfileSpark('${id}',this)" title="Delete" style="margin-left:auto;background:none;border:none;color:var(--text-3);cursor:pointer;padding:4px;border-radius:6px;font-size:14px;display:flex;align-items:center;">
            <i class="ph-bold ph-trash"></i>
          </button>
        </div>
        <div class="spark-body">${linkedTxt}${ytBlock}</div>
        <div class="spark-actions">
          <button class="spark-action"><i class="ph-bold ph-heart"></i> ${d.likes || 0}</button>
          <button class="spark-action"><i class="ph-bold ph-chat-circle"></i> ${d.replies || 0}</button>
          <button class="spark-action"><i class="ph-bold ph-arrows-clockwise"></i> ${d.reposts || 0}</button>
          <button class="spark-action" style="margin-left:auto;"><i class="ph-bold ph-share-fat"></i></button>
        </div>
      `;

            grid.appendChild(card);
          });
        } catch (e) {
          skels.forEach((s) => s.remove());
          console.error("loadProfileSparks error:", e.code, e.message);
        }
      }
      window.loadProfileSparks = loadProfileSparks;

      // ── DELETE SPARK FROM PROFILE TAB ──
      window.deleteProfileSpark = async function (sparkId, btn) {
        if (!confirm("Delete this Spark? This cannot be undone.")) return;
        try {
          await deleteDoc(doc(db, "sparks", sparkId));
          const card = btn.closest(".spark-card[data-spark-id]");
          if (card) card.remove();
          // Update count
          const countEl = document.getElementById("sparkCount");
          if (countEl)
            countEl.textContent = Math.max(
              0,
              parseInt(countEl.textContent || "0") - 1,
            );
        } catch (e) {
          alert("Failed to delete. Try again.");
          console.error(e);
        }
      };

      // ── YOUTUBE MODAL FOR PROFILE PAGE ──
      window.openYtModalProfile = function (videoId) {
        let overlay = document.getElementById("ytProfileModal");
        if (!overlay) {
          overlay = document.createElement("div");
          overlay.id = "ytProfileModal";
          overlay.style.cssText =
            "position:fixed;inset:0;z-index:600;background:rgba(0,0,0,0.92);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;";
          overlay.onclick = (e) => {
            if (e.target === overlay) overlay.remove();
          };
          document.body.appendChild(overlay);
        }
        overlay.innerHTML = `
    <div style="width:90vw;max-width:900px;position:relative">
      <button onclick="document.getElementById('ytProfileModal').remove()" style="position:absolute;top:-40px;right:0;width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;">
        <i class="ph-bold ph-x"></i>
      </button>
      <div style="width:100%;aspect-ratio:16/9;border-radius:14px;overflow:hidden;background:#000">
        <iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1" allow="autoplay;encrypted-media;fullscreen" allowfullscreen style="width:100%;height:100%;border:none;display:block"></iframe>
      </div>
    </div>
  `;
      };
      // ══════════════════════════════════════════════════════
      // FOLLOWING / FOLLOWERS — real Firestore data
      // ══════════════════════════════════════════════════════

      // Cache: raw follow docs + built profiles
      window._followCache = { following: null, followers: null };
      window._profileCache = {}; // uid → profile object
      window._modalType = null; // 'following' | 'followers'
      window._allProfiles = []; // full list for current open modal (for search)
      window._followStatsPromise = null; // in-flight loadFollowStats promise — prevents race condition

      // ── Load counts + cache raw follow lists ──
      async function loadFollowStats(uid) {
        // If already in-flight, return the same promise so callers share the result
        if (window._followStatsPromise) return window._followStatsPromise;

        window._followStatsPromise = (async () => {
          try {
            const [followingSnap, followersSnap] = await Promise.all([
              getDocs(
                query(
                  collection(db, "follows"),
                  where("followerId", "==", uid),
                ),
              ),
              getDocs(
                query(
                  collection(db, "follows"),
                  where("followedId", "==", uid),
                ),
              ),
            ]);

            const myUid = window._currentUid;

            // Filter self-follow docs out at the source
            const followingDocs = [];
            followingSnap.forEach((d) => {
              const data = d.data();
              if (data.followedId !== myUid)
                followingDocs.push({ id: d.id, ...data });
            });
            const followersDocs = [];
            followersSnap.forEach((d) => {
              const data = d.data();
              if (data.followerId !== myUid)
                followersDocs.push({ id: d.id, ...data });
            });

            window._followCache.following = followingDocs;
            window._followCache.followers = followersDocs;

            // Build in-memory set of who current user follows (for button states)
            window._myFollowingSet = new Set(
              followingDocs.map((d) => d.followedId).filter(Boolean),
            );

            const felEl = document.getElementById("followingCount");
            const ferEl = document.getElementById("followersCount");
            if (felEl) felEl.textContent = followingDocs.length;
            if (ferEl) ferEl.textContent = followersDocs.length;
          } catch (e) {
            console.warn("loadFollowStats error:", e.code, e.message);
            const felEl = document.getElementById("followingCount");
            const ferEl = document.getElementById("followersCount");
            if (felEl) felEl.textContent = "—";
            if (ferEl) ferEl.textContent = "—";
          }
        })();

        // Wait for completion then clear so future manual refreshes can re-fetch
        window._followStatsPromise.then(() => {
          window._followStatsPromise = null;
        });

        return window._followStatsPromise;
      }
      window.loadFollowStats = loadFollowStats;

      // ── XP rank helper — computes level+title from point fields ──
      function _xpRank(d) {
        const pt = d.accountStatus?.point || d.point || {};
        const xp =
          (pt.spark || 0) * 20 + (pt.like || 0) * 10 + (pt.reply || 0) * 40;
        const T = [
          0, 550, 1650, 3300, 5500, 8250, 11550, 15400, 19800, 24750, 30250,
          36300, 42900, 50050, 57750, 66000, 74800, 84150, 94050, 104500,
          115500, 127050, 139150, 151800, 165000, 178750, 193050, 207900,
          223300, 239250,
        ];
        const N = [
          "Recruit",
          "Recruit",
          "Recruit",
          "Recruit",
          "Recruit",
          "Recruit",
          "Operative",
          "Operative",
          "Operative",
          "Operative",
          "Operative",
          "Operative",
          "Guardian",
          "Guardian",
          "Guardian",
          "Guardian",
          "Guardian",
          "Guardian",
          "Inferno",
          "Inferno",
          "Inferno",
          "Inferno",
          "Inferno",
          "Inferno",
          "Elite",
          "Elite",
          "Elite",
          "Elite",
          "Elite",
          "Elite",
        ];
        let lvl = 1;
        for (let i = T.length - 1; i >= 0; i--) {
          if (xp >= T[i]) {
            lvl = i + 1;
            break;
          }
        }
        return { level: lvl, title: N[lvl - 1] || "Recruit" };
      }

      // ── Fetch a single user profile doc (with cache) ──
      async function fetchUserProfile(uid) {
        // Never cache or return own profile in this context
        if (uid === window._currentUid) return null;
        if (window._profileCache[uid]) return window._profileCache[uid];
        try {
          const snap = await getDoc(doc(db, "users", uid));
          if (!snap.exists()) return null;
          const d = snap.data();
          const profile = {
            uid,
            name: d.fullName || d.nickname || "T1ERA User",
            handle: d.nickname || "",
            email: d.emailPrimary || d.accountStatus?.emailPrimary || "",
            photo:
              d.accountStatus?.profilePicture?.url ||
              d.profilePicture?.url ||
              "",
            rank: _xpRank(d).title,
            level: _xpRank(d).level,
          };
          window._profileCache[uid] = profile;
          return profile;
        } catch (e) {
          return null;
        }
      }

      // ── Build a profile from a follow doc (fast path) or fetch (slow path) ──
      async function resolveProfile(entry, uidField) {
        const targetUid = entry[uidField];
        if (!targetUid) return null;
        // Never resolve own profile into the follow list
        if (targetUid === window._currentUid) return null;
        if (window._profileCache[targetUid])
          return window._profileCache[targetUid];

        // Fast path: follow doc already carries name/photo
        if (entry.fromName || entry.fromHandle) {
          const p = {
            uid: targetUid,
            name: entry.fromName || "T1ERA User",
            handle: entry.fromHandle || "",
            email: "",
            photo: entry.fromPhoto || "",
            rank: "Recruit",
            level: 1,
          };
          // still fetch full profile in background to fill email & rank
          fetchUserProfile(targetUid).then((full) => {
            if (full) window._profileCache[targetUid] = full;
          });
          window._profileCache[targetUid] = p;
          return p;
        }
        return fetchUserProfile(targetUid);
      }

      // ── Render a single user row with action button ──
      function renderUserRow(profile, modalType) {
        if (!profile) return "";
        const myUid = window._currentUid;
        const isSelf = profile.uid === myUid;
        const avHtml = profile.photo
          ? `<img src="${profile.photo}" referrerpolicy="no-referrer"
               style="width:42px;height:42px;border-radius:50%;object-fit:cover;display:block"
               onerror="this.style.display='none'">`
          : `<span style="font-size:15px;font-weight:700;font-family:var(--font-display);color:#fff">${(profile.name[0] || "?").toUpperCase()}</span>`;

        let btnHtml = "";
        if (!isSelf) {
          const iFollow =
            window._myFollowingSet && window._myFollowingSet.has(profile.uid);
          if (modalType === "following") {
            // In following list → show Unfollow
            btnHtml = `<button class="modal-action-btn unfollow"
              data-uid="${profile.uid}"
              onclick="window.modalToggleFollow(this,'${profile.uid}','unfollow')">Unfollow</button>`;
          } else {
            // In followers list → show Follow / Friends
            if (iFollow) {
              btnHtml = `<button class="modal-action-btn friends"
                data-uid="${profile.uid}"
                onclick="window.modalToggleFollow(this,'${profile.uid}','unfollow')">
                <i class="ph-bold ph-check" style="margin-right:3px;font-size:9px"></i>Friends</button>`;
            } else {
              btnHtml = `<button class="modal-action-btn follow"
                data-uid="${profile.uid}"
                onclick="window.modalToggleFollow(this,'${profile.uid}','follow')">Follow</button>`;
            }
          }
        }

        return `
          <div class="user-list-item" data-uid="${profile.uid}"
               data-name="${(profile.name || "").toLowerCase()}"
               data-handle="${(profile.handle || "").toLowerCase()}"
               data-email="${(profile.email || "").toLowerCase()}"
               onclick="window.openPeekCard('${profile.uid}')"
               style="cursor:pointer;">
            <div class="user-list-avatar"
                 style="background:linear-gradient(135deg,rgba(194,24,91,.7),rgba(139,92,246,.6))">
              ${avHtml}
            </div>
            <div class="user-list-info">
              <div class="user-list-name">${profile.name}</div>
              <div class="user-list-meta">${profile.handle ? "@" + profile.handle : ""}</div>
            </div>
            <span class="user-list-badge" style="margin-right:6px">LV${profile.level} · ${profile.rank}</span>
            ${btnHtml}
          </div>`;
      }

      // ── Skeleton rows ──
      function renderModalSkeletons(count) {
        return (
          `<div class="user-list">` +
          Array.from(
            { length: count },
            () => `
          <div class="modal-loading-row">
            <div class="modal-loading-av"></div>
            <div class="modal-loading-lines">
              <div class="modal-loading-line" style="width:52%"></div>
              <div class="modal-loading-line" style="width:34%"></div>
            </div>
          </div>`,
          ).join("") +
          `</div>`
        );
      }

      // ── Main openModal — always fetches fresh, never relies on cache ──
      window.openModal = async function (type) {
        window._modalType = type;
        const myUid = window._currentUid;

        // Set title
        const title = type === "following" ? "Following" : "Followers";
        document.getElementById("modalTitle").childNodes[0].textContent =
          title + " ";
        document.getElementById("modalTitleCount").textContent = "";

        // Reset search
        const searchEl = document.getElementById("modalSearchInput");
        const clearBtn = document.getElementById("modalSearchClear");
        const dropdown = document.getElementById("modalSearchDropdown");
        const searchInner = document.getElementById("modalSearchInner");
        if (searchEl) searchEl.value = "";
        if (clearBtn) clearBtn.classList.remove("visible");
        if (dropdown) {
          dropdown.innerHTML = "";
          dropdown.classList.add("hidden");
        }
        if (searchInner) searchInner.classList.remove("has-dropdown");

        // Open overlay — skeleton is already visible
        document.getElementById("modalOverlay").classList.add("open");
        document.body.style.overflow = "hidden";

        const bodyEl = document.getElementById("modalBody");

        // Show skeleton FIRST — nothing else renders until Firebase returns
        bodyEl.innerHTML = renderModalSkeletons(5);

        if (!myUid) {
          bodyEl.innerHTML =
            '<div class="modal-empty"><i class="ph-bold ph-wifi-slash"></i>Not signed in</div>';
          return;
        }

        try {
          // ── STEP 1: Fetch follow docs fresh from Firestore ──
          const fieldFilter =
            type === "following"
              ? where("followerId", "==", myUid)
              : where("followedId", "==", myUid);
          const uidField = type === "following" ? "followedId" : "followerId";

          const snap = await getDocs(
            query(collection(db, "follows"), fieldFilter),
          );

          // Build list of target UIDs — strictly exclude own UID
          const entries = [];
          snap.forEach((d) => {
            const data = d.data();
            const targetUid = data[uidField];
            if (targetUid && targetUid !== myUid) {
              entries.push({ id: d.id, ...data });
            }
          });

          // Update title count
          document.getElementById("modalTitleCount").textContent =
            entries.length;

          if (entries.length === 0) {
            const emptyMsg =
              type === "following"
                ? "You're not following anyone yet"
                : "No followers yet";
            bodyEl.innerHTML = `<div class="modal-empty"><i class="ph-bold ph-users"></i>${emptyMsg}</div>`;
            window._allProfiles = [];
            return;
          }

          // ── STEP 2: Fetch each user profile from Firestore ──
          const profiles = (
            await Promise.all(
              entries.map(async (entry) => {
                const targetUid = entry[uidField];
                try {
                  // Try cache first to avoid redundant reads
                  if (window._profileCache[targetUid])
                    return window._profileCache[targetUid];
                  const uSnap = await getDoc(doc(db, "users", targetUid));
                  if (!uSnap.exists()) return null;
                  const d = uSnap.data();
                  const p = {
                    uid: targetUid,
                    name: d.fullName || d.nickname || "T1ERA User",
                    handle: d.nickname || "",
                    email:
                      d.accountStatus?.emailPrimary || d.emailPrimary || "",
                    photo:
                      d.accountStatus?.profilePicture?.url ||
                      d.profilePicture?.url ||
                      "",
                    rank: _xpRank(d).title,
                    level: _xpRank(d).level,
                  };
                  window._profileCache[targetUid] = p;
                  return p;
                } catch (_) {
                  return null;
                }
              }),
            )
          ).filter((p) => p && p.uid !== myUid); // final safety: strip any self entry

          window._allProfiles = profiles;

          // ── STEP 3: Render — only NOW after all data is ready ──
          const html =
            '<div class="user-list">' +
            profiles.map((p) => renderUserRow(p, type)).join("") +
            "</div>";
          bodyEl.innerHTML = html;
        } catch (e) {
          console.error("openModal error:", e);
          bodyEl.innerHTML = `<div class="modal-empty"><i class="ph-bold ph-warning"></i>Failed to load. Please try again.</div>`;
        }
      };

      // ── Follow / Unfollow from inside modal ──
      window.modalToggleFollow = async function (btn, targetUid, action) {
        if (!window._currentUid || !targetUid) return;
        const myUid = window._currentUid;

        // Loading state
        const originalHtml = btn.innerHTML;
        const originalClass = btn.className;
        btn.classList.add("loading");
        btn.innerHTML = "…";

        const ud = window._myUserData || {};
        const fromName = ud.fullName || ud.nickname || "";
        const fromHandle = ud.nickname || myUid.slice(0, 8);
        const fromPhoto = ud.profilePicture?.url || "";
        const followDocId = `${myUid}_${targetUid}`;

        try {
          if (action === "follow") {
            await setDoc(doc(db, "follows", followDocId), {
              followerId: myUid,
              followedId: targetUid,
              fromName,
              fromHandle,
              fromPhoto,
              createdAt: serverTimestamp(),
            });

            // Send notification (deterministic ID = no duplicate)
            try {
              await setDoc(
                doc(
                  db,
                  "users",
                  targetUid,
                  "notifications",
                  `follow_${myUid}_${targetUid}`,
                ),
                {
                  type: "follow",
                  fromUid: myUid,
                  fromName,
                  fromHandle,
                  fromPhoto,
                  sparkId: "",
                  sparkText: "",
                  message: `<strong>${fromName || "Someone"}</strong> started following you`,
                  read: false,
                  createdAt: serverTimestamp(),
                },
              );
            } catch (_) {}

            // Add to local set
            if (!window._myFollowingSet) window._myFollowingSet = new Set();
            window._myFollowingSet.add(targetUid);

            // Update following cache list
            if (window._followCache.following) {
              window._followCache.following.push({
                id: followDocId,
                followerId: myUid,
                followedId: targetUid,
                fromName,
                fromHandle,
                fromPhoto,
              });
            }

            // Update stat count
            const felEl = document.getElementById("followingCount");
            if (felEl)
              felEl.textContent = (window._followCache.following || []).length;

            // Update button: in followers modal → Friends
            btn.className = "modal-action-btn friends";
            btn.innerHTML =
              '<i class="ph-bold ph-check" style="margin-right:3px;font-size:9px"></i>Friends';
            btn.setAttribute(
              "onclick",
              `window.modalToggleFollow(this,'${targetUid}','unfollow')`,
            );
          } else {
            // Unfollow — deleteDoc is imported at module top
            await deleteDoc(doc(db, "follows", followDocId));

            // Remove from local set
            if (window._myFollowingSet)
              window._myFollowingSet.delete(targetUid);

            // Remove from following cache
            if (window._followCache.following) {
              window._followCache.following =
                window._followCache.following.filter(
                  (d) => d.followedId !== targetUid,
                );
            }

            // Update stat
            const felEl = document.getElementById("followingCount");
            if (felEl)
              felEl.textContent = (window._followCache.following || []).length;

            if (window._modalType === "following") {
              // Remove the row entirely from following list
              const row = btn.closest(".user-list-item");
              if (row) {
                row.style.transition = "opacity .2s, max-height .25s";
                row.style.opacity = "0";
                row.style.overflow = "hidden";
                row.style.maxHeight = row.offsetHeight + "px";
                setTimeout(() => {
                  row.style.maxHeight = "0";
                  row.style.padding = "0";
                }, 10);
                setTimeout(() => row.remove(), 260);
              }
              // Update count badge
              const countEl = document.getElementById("modalTitleCount");
              if (countEl)
                countEl.textContent = Math.max(
                  0,
                  parseInt(countEl.textContent || "0") - 1,
                );
            } else {
              // In followers modal → revert to Follow button
              btn.className = "modal-action-btn follow";
              btn.innerHTML = "Follow";
              btn.setAttribute(
                "onclick",
                `window.modalToggleFollow(this,'${targetUid}','follow')`,
              );
            }
          }
        } catch (e) {
          console.error("modalToggleFollow error:", e.code, e.message);
          btn.className = originalClass;
          btn.innerHTML = originalHtml;
        }
      };

      // ── Highlight matching text ──
      function _highlightMatch(text, query) {
        if (!query || !text) return _escHtml(text);
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`(${escaped})`, "gi");
        return _escHtml(text).replace(re, "<mark>$1</mark>");
      }

      function _escHtml(str) {
        return (str || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      }

      // ── Render one dropdown result card ──
      function _renderDropdownItem(profile, q) {
        const myUid = window._currentUid;
        const isSelf = profile.uid === myUid;

        // Avatar
        const avHtml = profile.photo
          ? `<img src="${profile.photo}" referrerpolicy="no-referrer" onerror="this.style.display='none'">`
          : `${(profile.name[0] || "?").toUpperCase()}`;

        // Highlighted name & handle
        const nameHl = _highlightMatch(profile.name, q);
        const handleHl = profile.handle
          ? _highlightMatch("@" + profile.handle, q)
          : "";

        // Action button
        let btnHtml = "";
        if (!isSelf) {
          const modalType = window._modalType;
          const iFollow =
            window._myFollowingSet && window._myFollowingSet.has(profile.uid);
          if (modalType === "following") {
            btnHtml = `<button class="search-result-btn unfollow"
              onclick="event.stopPropagation();window.modalToggleFollow(this,'${profile.uid}','unfollow');_syncMainListBtn('${profile.uid}','unfollow')">Unfollow</button>`;
          } else {
            if (iFollow) {
              btnHtml = `<button class="search-result-btn friends"
                onclick="event.stopPropagation();window.modalToggleFollow(this,'${profile.uid}','unfollow');_syncMainListBtn('${profile.uid}','unfollow')">
                <i class="ph-bold ph-check" style="margin-right:2px;font-size:8px"></i>Friends</button>`;
            } else {
              btnHtml = `<button class="search-result-btn follow"
                onclick="event.stopPropagation();window.modalToggleFollow(this,'${profile.uid}','follow');_syncMainListBtn('${profile.uid}','follow')">Follow</button>`;
            }
          }
        }

        return `
          <div class="search-result-item" data-uid="${profile.uid}" onclick="window.openPeekCard('${profile.uid}')">
            <div class="search-result-avatar">${avHtml}</div>
            <div class="search-result-info">
              <div class="search-result-name">${nameHl}</div>
              ${handleHl ? `<div class="search-result-handle">${handleHl}</div>` : ""}
            </div>
            <span class="search-result-badge">LV${profile.level} · ${profile.rank}</span>
            ${btnHtml}
          </div>`;
      }

      // ── Keep main list button in sync after action in dropdown ──
      window._syncMainListBtn = function (targetUid, action) {
        const rows = document.querySelectorAll(
          `#modalUserList .user-list-item[data-uid="${targetUid}"]`,
        );
        rows.forEach((row) => {
          const btn = row.querySelector(".modal-action-btn");
          if (!btn) return;
          if (window._modalType === "following" && action === "unfollow") {
            // row will be removed by modalToggleFollow already
          } else if (action === "follow") {
            btn.className = "modal-action-btn friends";
            btn.innerHTML =
              '<i class="ph-bold ph-check" style="margin-right:3px;font-size:9px"></i>Friends';
            btn.setAttribute(
              "onclick",
              `window.modalToggleFollow(this,'${targetUid}','unfollow')`,
            );
          } else if (action === "unfollow") {
            btn.className = "modal-action-btn follow";
            btn.innerHTML = "Follow";
            btn.setAttribute(
              "onclick",
              `window.modalToggleFollow(this,'${targetUid}','follow')`,
            );
          }
        });
      };

      // ── Search ──
      window.onModalSearch = function (query) {
        const clearBtn = document.getElementById("modalSearchClear");
        const dropdown = document.getElementById("modalSearchDropdown");
        const searchInner = document.getElementById("modalSearchInner");
        if (clearBtn) clearBtn.classList.toggle("visible", query.length > 0);

        const q = query.trim().toLowerCase();

        // No query — close dropdown, show full list
        if (!q) {
          if (dropdown) {
            dropdown.innerHTML = "";
            dropdown.classList.add("hidden");
          }
          if (searchInner) searchInner.classList.remove("has-dropdown");
          const items = document.querySelectorAll(
            "#modalUserList .user-list-item",
          );
          items.forEach((el) => (el.style.display = ""));
          return;
        }

        // Hide main list items (dropdown takes over display)
        const items = document.querySelectorAll(
          "#modalUserList .user-list-item",
        );
        items.forEach((el) => (el.style.display = "none"));

        // Filter from in-memory profile list
        const profiles = window._allProfiles || [];
        const matched = profiles.filter((p) => {
          const name = (p.name || "").toLowerCase();
          const handle = (p.handle || "").toLowerCase();
          const email = (p.email || "").toLowerCase();
          return name.includes(q) || handle.includes(q) || email.includes(q);
        });

        // Build dropdown
        if (dropdown) {
          dropdown.classList.remove("hidden");
          searchInner && searchInner.classList.add("has-dropdown");

          if (matched.length === 0) {
            dropdown.innerHTML = `
              <div class="search-no-results">
                <i class="ph-bold ph-magnifying-glass"></i>
                No results for "<strong>${_escHtml(query)}</strong>"
              </div>`;
          } else {
            dropdown.innerHTML = `
              <div class="search-dropdown-header">
                <span class="search-dropdown-label">Results</span>
                <span class="search-dropdown-count">${matched.length} found</span>
              </div>
              <div class="search-dropdown-list">
                ${matched.map((p) => _renderDropdownItem(p, q)).join("")}
              </div>`;
          }
        }
      };

      window.clearModalSearch = function () {
        const searchEl = document.getElementById("modalSearchInput");
        const clearBtn = document.getElementById("modalSearchClear");
        const dropdown = document.getElementById("modalSearchDropdown");
        const searchInner = document.getElementById("modalSearchInner");
        if (searchEl) {
          searchEl.value = "";
          searchEl.focus();
        }
        if (clearBtn) clearBtn.classList.remove("visible");
        if (dropdown) {
          dropdown.innerHTML = "";
          dropdown.classList.add("hidden");
        }
        if (searchInner) searchInner.classList.remove("has-dropdown");
        const items = document.querySelectorAll(
          "#modalUserList .user-list-item",
        );
        items.forEach((el) => (el.style.display = ""));
      };
