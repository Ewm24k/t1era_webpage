const dotsMenu = document.getElementById("dotsMenu");

      dotsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        dotsMenu.classList.toggle("open");
      });

      document.addEventListener("click", (e) => {
        if (!dotsBtn.contains(e.target)) dotsMenu.classList.remove("open");
      });

      // ══ EDIT MODE ══
      let editModeActive = false;

      window.toggleEditMode = function () {
        dotsMenu.classList.remove("open");
        editModeActive ? exitEditMode() : enterEditMode();
      };

      function enterEditMode() {
        editModeActive = true;
        document.body.classList.add("edit-mode");
        document.getElementById("editToast").classList.add("show");
      }

      window.exitEditMode = function () {
        editModeActive = false;
        document.body.classList.remove("edit-mode");
        document.getElementById("editToast").classList.remove("show");
      };

      // ══ TABS ══
      window.switchTab = function (idx, btn) {
        document
          .querySelectorAll(".tab-btn")
          .forEach((b) => b.classList.remove("active"));
        document
          .querySelectorAll(".tab-panel")
          .forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById(`tab-${idx}`).classList.add("active");
        // Auto-refresh Sparks tab
        if (
          idx === 0 &&
          window._currentUid &&
          typeof window.loadProfileSparks === "function"
        ) {
          window.loadProfileSparks(window._currentUid);
        }
        // Auto-refresh Activity feed every time the Activity tab is clicked
        if (
          idx === 1 &&
          window._currentUid &&
          typeof window.loadActivityHistory === "function"
        ) {
          window.loadActivityHistory(window._currentUid);
        }
      };

      window.closeModal = function () {
        const overlay = document.getElementById("modalOverlay");
        if (overlay) overlay.classList.remove("open");
        document.body.style.overflow = "";
        // Reset search & dropdown
        const searchEl = document.getElementById("modalSearchInput");
        const clearBtn = document.getElementById("modalSearchClear");
        const dropdown = document.getElementById("modalSearchDropdown");
        const searchInner = document.getElementById("modalSearchInner");
        if (searchEl) {
          searchEl.value = "";
        }
        if (clearBtn) clearBtn.classList.remove("visible");
        if (dropdown) {
          dropdown.innerHTML = "";
          dropdown.classList.add("hidden");
        }
        if (searchInner) searchInner.classList.remove("has-dropdown");
        document
          .querySelectorAll("#modalUserList .user-list-item")
          .forEach((el) => (el.style.display = ""));
      };

      window.handleOverlayClick = function (e) {
        if (e.target === document.getElementById("modalOverlay"))
          window.closeModal();
      };

      // ══════════════════════════════════════════════════════
      // PROFILE SETTINGS PANEL — Ring Border Customization
      // ══════════════════════════════════════════════════════

      const RING_OPTIONS = [
        {
          key: "white",
          label: "White",
          gradient: "#ffffff",
          solid: true,
          minLevel: 1,
        },
        {
          key: "white-grey",
          label: "White Grey",
          gradient: "linear-gradient(135deg,#ffffff,#888888)",
          solid: false,
          minLevel: 1,
        },
        {
          key: "pink-purple",
          label: "Pink Purple",
          gradient: "linear-gradient(135deg,var(--pink),var(--purple))",
          solid: false,
          minLevel: 3,
        },
        {
          key: "gold",
          label: "Gold",
          gradient: "linear-gradient(135deg,#f59e0b,#fbbf24)",
          solid: false,
          minLevel: 3,
        },
        {
          key: "green",
          label: "Cyber Green",
          gradient: "linear-gradient(135deg,#10b981,#34d399)",
          solid: false,
          minLevel: 3,
        },
        {
          key: "blue",
          label: "Ice Blue",
          gradient: "linear-gradient(135deg,#3b82f6,#60a5fa)",
          solid: false,
          minLevel: 3,
        },
        {
          key: "red",
          label: "Crimson",
          gradient: "linear-gradient(135deg,#ef4444,#f87171)",
          solid: false,
          minLevel: 3,
        },
        {
          key: "orange",
          label: "Inferno",
          gradient: "linear-gradient(135deg,#f97316,#fb923c)",
          solid: false,
          minLevel: 3,
        },
        {
          key: "rainbow",
          label: "Rainbow",
          gradient: "conic-gradient(#f59e0b,#ef4444,#8b5cf6,#3b82f6,#10b981,#f59e0b)",
          solid: false,
          minLevel: 3,
        },
      ];

      // The gradient string applied to .avatar-ring background
      const RING_GRADIENTS = {
        "white":       "#ffffff",
        "white-grey":  "linear-gradient(135deg,#ffffff,#888888)",
        "pink-purple": "conic-gradient(var(--pink) 0deg,var(--purple) 90deg,var(--pink-2) 180deg,var(--pink) 360deg)",
        "gold":        "linear-gradient(135deg,#f59e0b,#fbbf24)",
        "green":       "linear-gradient(135deg,#10b981,#34d399)",
        "blue":        "linear-gradient(135deg,#3b82f6,#60a5fa)",
        "red":         "linear-gradient(135deg,#ef4444,#f87171)",
        "orange":      "linear-gradient(135deg,#f97316,#fb923c)",
        "rainbow":     "conic-gradient(#f59e0b,#ef4444,#8b5cf6,#3b82f6,#10b981,#f59e0b)",
      };

      const DEV_RING_EMAIL = "ewm24k@gmail.com";
      let _pendingRingKey = null;
      let _currentRingKey = "pink-purple"; // default

      function applyRingColor(key) {
        const gradient = RING_GRADIENTS[key] || RING_GRADIENTS["pink-purple"];
        document.querySelectorAll(".avatar-ring").forEach((el) => {
          el.style.background = gradient;
        });
        _currentRingKey = key;
      }

      function buildRingOptionsGrid(userLevel, userEmail) {
        const grid = document.getElementById("ringOptionsGrid");
        const lockTip = document.getElementById("ringLockTip");
        if (!grid) return;
        const isDev = userEmail === DEV_RING_EMAIL;
        let hasLocked = false;
        grid.innerHTML = "";
        RING_OPTIONS.forEach((opt) => {
          const locked = !isDev && userLevel < opt.minLevel;
          if (locked) hasLocked = true;
          const isSelected = _currentRingKey === opt.key;
          const div = document.createElement("div");
          div.className = "ring-option" + (isSelected ? " selected" : "") + (locked ? " locked" : "");
          div.dataset.key = opt.key;
          div.innerHTML = `
            <div class="ring-preview" style="--ring-gradient:${opt.gradient};">
              <div class="ring-preview-inner"></div>
              ${locked ? '<div class="ring-lock-overlay"><i class="ph-bold ph-lock"></i></div>' : ""}
            </div>
            <span class="ring-option-label">${opt.label}</span>
          `;
          if (!locked) {
            div.addEventListener("click", () => selectRingOption(opt.key));
          }
          grid.appendChild(div);
        });
        if (lockTip) lockTip.style.display = hasLocked ? "block" : "none";
      }

      function selectRingOption(key) {
        _pendingRingKey = key;
        document.querySelectorAll(".ring-option").forEach((el) => {
          el.classList.toggle("selected", el.dataset.key === key);
        });
        // Show save footer
        const footer = document.getElementById("profSettingsFooter");
        if (footer) footer.classList.add("visible");
      }

      async function saveRingColor() {
        if (!_pendingRingKey) return;
        const btn = document.getElementById("profSettingsSaveBtn");
        if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
        try {
          const uid = window._currentUid;
          if (uid) {
            await updateDoc(doc(db, "users", uid), {
              "profileRing": _pendingRingKey,
            });
          }
          applyRingColor(_pendingRingKey);
          _currentRingKey = _pendingRingKey;
          _pendingRingKey = null;
          const footer = document.getElementById("profSettingsFooter");
          if (footer) footer.classList.remove("visible");
          if (btn) { btn.disabled = false; btn.textContent = "Save Changes"; }
        } catch (e) {
          console.warn("saveRingColor error:", e);
          if (btn) { btn.disabled = false; btn.textContent = "Save Changes"; }
        }
      }

      function openProfileSettingsPanel() {
        document.getElementById("profSettingsPanel").classList.add("open");
        document.getElementById("profSettingsBackdrop").classList.add("open");
        // Build grid using current level and email
        const level = window._computedLevel || 1;
        const email = window._currentUserEmail || "";
        buildRingOptionsGrid(level, email);
      }

      function closeProfileSettingsPanel() {
        document.getElementById("profSettingsPanel").classList.remove("open");
        document.getElementById("profSettingsBackdrop").classList.remove("open");
      }

      window.saveRingColor = saveRingColor;
      window.openProfileSettingsPanel = openProfileSettingsPanel;
      window.closeProfileSettingsPanel = closeProfileSettingsPanel;
