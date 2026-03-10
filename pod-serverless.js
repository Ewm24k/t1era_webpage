/**
 * pod-serverless.js  –  T1ERA Compute
 * ─────────────────────────────────────────────────────────────────────
 * Dummy serverless instance manager. No real server connection.
 *
 * NEW FEATURES added to original:
 *   1. Auth gate  – redirects to auth.html if Firebase user not logged in
 *   2. Uptime persists across refresh using lastStartedAt timestamp
 *   3. New pods saved to Firebase Firestore: users/{uid}/pods/{id}
 *   4. syncBalanceDOMs syncs balanceAmount, sidebarBalance, slHeaderBalance, runwayBalance
 *   5. renderAll hides skeleton (#serverlessSkeleton) and shows #serverlessContent
 *
 * Firebase SDK scripts required in Pod-workflow.html (before this file):
 *   <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
 *   <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js"></script>
 *   <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js"></script>
 * ─────────────────────────────────────────────────────────────────────
 */

(function (global) {
  "use strict";

  /* ── Firebase config ───────────────────────────────────────────── */
  var FB_CONFIG = {
    apiKey: "AIzaSyBnt9mbb8LdMVeguSHUmS20L6uBHIfxwAs",
    authDomain: "t1era-v2.firebaseapp.com",
    projectId: "t1era-v2",
    storageBucket: "t1era-v2.firebasestorage.app",
    messagingSenderId: "279266491659",
    appId: "1:279266491659:web:28a03c7b7300fcb152b60e",
  };

  /* ── Storage keys ──────────────────────────────────────────────── */
  var KEY_INSTANCES = "t1era_sl_instances";
  var KEY_BALANCE = "t1era_sl_balance";
  var STARTING_BAL = 142.5;

  /* ── Storage keys (projects) ────────────────────────────────────── */
  var KEY_PROJECTS = "t1era_sl_projects";

  /* ── Runtime state ─────────────────────────────────────────────── */
  var _instances = [];
  var _balance = STARTING_BAL;
  var _ticker = null;
  var _fbApp = null;
  var _fbDb = null;
  var _fbAuth = null;
  var _currentUid = null;
  /* project state */
  var _projects = [];          // [{id, name, location, createdAt}]
  var _activeProjectId = null; // which project is selected in serverless tab

  /* ══════════════════════════════════════════════════════════════════
     1. FIREBASE INIT + AUTH GATE
  ══════════════════════════════════════════════════════════════════ */
  function initFirebase() {
    if (_fbApp) return;
    if (!global.firebase) {
      console.warn(
        "[SL] Firebase SDK not loaded. Auth gate and Firestore disabled.",
      );
      return;
    }
    _fbApp =
      !global.firebase.apps || global.firebase.apps.length === 0
        ? global.firebase.initializeApp(FB_CONFIG)
        : global.firebase.apps[0];
    _fbAuth = global.firebase.auth();
    _fbDb = global.firebase.firestore();
  }

  function checkAuthGate(callback) {
    if (!_fbAuth) {
      callback(null);
      return;
    }
    _fbAuth.onAuthStateChanged(function (user) {
      if (!user) {
        global.location.href = "auth.html";
        return;
      }
      _currentUid = user.uid;
      callback(user);
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     3. FIRESTORE SAVE / DELETE
  ══════════════════════════════════════════════════════════════════ */
  function fbSavePod(inst) {
    if (!_fbDb || !_currentUid) return;
    _fbDb
      .collection("users")
      .doc(_currentUid)
      .collection("pods")
      .doc(inst.id)
      .set({
        id: inst.id,
        name: inst.name,
        vram: inst.vram,
        pricePerHr: inst.pricePerHr,
        template: inst.template,
        disk: inst.disk,
        volume: inst.volume,
        state: inst.state,
        uptimeSec: inst.uptimeSec,
        totalCost: inst.totalCost,
        deployedAt: inst.deployedAt,
        lastStartedAt: inst.lastStartedAt || null,
        projectId: inst.projectId || null,
        updatedAt: new Date().toISOString(),
      })
      .catch(function (e) {
        console.warn("[SL] Firestore save failed:", e);
      });
  }

  function fbDeletePod(id) {
    if (!_fbDb || !_currentUid) return;
    _fbDb
      .collection("users")
      .doc(_currentUid)
      .collection("pods")
      .doc(id)
      .delete()
      .catch(function (e) {
        console.warn("[SL] Firestore delete failed:", e);
      });
  }

  /* ── Project Firestore helpers ──────────────────────────────────── */
  function fbSaveProject(proj) {
    if (!_fbDb || !_currentUid) return;
    _fbDb
      .collection("users")
      .doc(_currentUid)
      .collection("projects")
      .doc(proj.id)
      .set({
        id: proj.id,
        name: proj.name,
        location: proj.location || "",
        createdAt: proj.createdAt,
      })
      .catch(function (e) {
        console.warn("[SL] Firestore project save failed:", e);
      });
  }


  function fbDeleteProject(projectId) {
    if (!_fbDb || !_currentUid) return;
    _fbDb.collection('users').doc(_currentUid).collection('projects').doc(projectId).delete()
      .catch(function(e){ console.warn('[SL] project delete failed:', e); });
    _fbDb.collection('users').doc(_currentUid).collection('pods')
      .where('projectId','==',projectId).get()
      .then(function(snap){
        var batch = _fbDb.batch();
        snap.forEach(function(doc){ batch.delete(doc.ref); });
        return batch.commit();
      }).catch(function(e){ console.warn('[SL] pod batch delete failed:', e); });
  }

  /* ══════════════════════════════════════════════════════════════════
     PERSISTENCE  –  localStorage + uptime recovery on refresh
  ══════════════════════════════════════════════════════════════════ */
  function loadState() {
    try {
      var raw = localStorage.getItem(KEY_INSTANCES);
      _instances = raw ? JSON.parse(raw) : [];
    } catch (e) {
      _instances = [];
    }

    try {
      var b = localStorage.getItem(KEY_BALANCE);
      _balance = b !== null ? parseFloat(b) : STARTING_BAL;
      if (isNaN(_balance)) _balance = STARTING_BAL;
    } catch (e) {
      _balance = STARTING_BAL;
    }

    try {
      var rp = localStorage.getItem(KEY_PROJECTS);
      _projects = rp ? JSON.parse(rp) : [];
    } catch (e) {
      _projects = [];
    }

    /* set active project to first project if not already set */
    if (!_activeProjectId && _projects.length > 0) {
      _activeProjectId = _projects[0].id;
    }

    /* If instances have no projectId, assign them to the first real project.
       We do NOT create fake placeholder projects here — that was corrupting
       t1era_sl_projects with generic names and overwriting the user's real names.
       Display-time fallback handles the label if still unresolved. */
    var unlinked = _instances.filter(function (i) { return !i.projectId; });
    if (unlinked.length > 0 && _projects.length > 0) {
      var earliest = _projects.slice().sort(function (a, b) {
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      })[0];
      unlinked.forEach(function (i) { i.projectId = earliest.id; });
    }

    /* Set active project */
    if (!_activeProjectId && _projects.length > 0) {
      _activeProjectId = _projects[0].id;
    }

    /* 2. UPTIME PERSIST: for any instance that was "running" when the
       page closed, calculate elapsed real-world seconds and add them */
    var now = Date.now();
    _instances.forEach(function (inst) {
      if (inst.state === "running" && inst.lastStartedAt) {
        var elapsed = Math.floor(
          (now - new Date(inst.lastStartedAt).getTime()) / 1000,
        );
        if (elapsed > 0) {
          var drain = inst.pricePerHr * (elapsed / 3600);
          inst.uptimeSec += elapsed;
          inst.totalCost = (inst.totalCost || 0) + drain;
          _balance = Math.max(0, _balance - drain);
        }
      }
      // Come back as paused — user resumes manually
      if (inst.state === "running") inst.state = "paused";
    });

    saveState();
  }

  function saveState() {
    try {
      localStorage.setItem(KEY_INSTANCES, JSON.stringify(_instances));
      localStorage.setItem(KEY_BALANCE, _balance.toFixed(6));
      localStorage.setItem(KEY_PROJECTS, JSON.stringify(_projects));
    } catch (e) {}
  }

  /* ══════════════════════════════════════════════════════════════════
     TICKER  –  runs every second
  ══════════════════════════════════════════════════════════════════ */
  function startTicker() {
    if (_ticker) return;
    _ticker = setInterval(tick, 1000);
  }

  function stopTickerIfIdle() {
    var anyRunning = _instances.some(function (i) {
      return i.state === "running";
    });
    if (!anyRunning && _ticker) {
      clearInterval(_ticker);
      _ticker = null;
    }
  }

  function tick() {
    var changed = false;
    _instances.forEach(function (inst) {
      if (inst.state !== "running") return;
      var drain = inst.pricePerHr / 3600;
      inst.uptimeSec += 1;
      inst.totalCost = (inst.totalCost || 0) + drain;
      _balance = Math.max(0, _balance - drain);
      changed = true;

      if (_balance <= 0) {
        inst.state = "stopped";
        inst.lastStartedAt = null;
        stopTickerIfIdle();
        toast("⚠️ Balance depleted – " + inst.name + " stopped.");
        renderAll();
      }
    });

    if (changed) {
      saveState();
      syncBalanceDOMs();
      refreshLiveNumbers();
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     PUBLIC API  –  window.SL
  ══════════════════════════════════════════════════════════════════ */
  global.SL = {
    deploy: function (cfg) {
      var now = new Date().toISOString();
      var inst = {
        id: "sl_" + Date.now(),
        name: cfg.name || "Unknown GPU",
        vram: cfg.vram || "—",
        pricePerHr: cfg.pricePerHr || 0,
        template: cfg.template || "Ubuntu 22.04",
        disk: cfg.disk || 40,
        volume: cfg.volume || 100,
        state: "running",
        uptimeSec: 0,
        totalCost: 0,
        deployedAt: now,
        lastStartedAt: now,
        projectId: cfg.projectId || null,
      };
      _instances.push(inst);
      saveState();
      fbSavePod(inst);
      startTicker();
      renderAll();
      switchToServerlessTab();
      toast("🚀 " + inst.name + " is now running");
    },

    play: function (id) {
      var inst = find(id);
      if (!inst) return;
      if (_balance <= 0) {
        toast("Insufficient balance — top up to resume.");
        return;
      }
      inst.state = "running";
      inst.lastStartedAt = new Date().toISOString();
      saveState();
      fbSavePod(inst);
      startTicker();
      renderAll();
      toast("▶ " + inst.name + " resumed — balance draining.");
    },

    pause: function (id) {
      var inst = find(id);
      if (!inst) return;
      inst.state = "paused";
      inst.lastStartedAt = null;
      saveState();
      fbSavePod(inst);
      stopTickerIfIdle();
      renderAll();
      toast("⏸ " + inst.name + " paused — no charges while paused.");
    },

    stop: function (id) {
      var inst = find(id);
      if (!inst) return;
      inst.state = "stopped";
      inst.lastStartedAt = null;
      saveState();
      fbSavePod(inst);
      stopTickerIfIdle();
      renderAll();
      toast("■ " + inst.name + " stopped.");
    },

    remove: function (id) {
      _instances = _instances.filter(function (i) {
        return i.id !== id;
      });
      saveState();
      fbDeletePod(id);
      stopTickerIfIdle();
      renderAll();
    },

    /* ── Project management ── */
    addProject: function (proj) {
      /* proj = {id, name, location, createdAt} */
      _projects.push(proj);
      _activeProjectId = proj.id;
      saveState();
      fbSaveProject(proj);
      renderAll();
    },

    deleteProject: function (projectId) {
      /* Stop ticker on any running instances first */
      var toDelete = _instances.filter(function(i){ return i.projectId === projectId; });
      toDelete.forEach(function(i){ fbDeletePod(i.id); });
      _instances = _instances.filter(function(i){ return i.projectId !== projectId; });
      _projects  = _projects.filter(function(p){ return p.id !== projectId; });
      if (_activeProjectId === projectId) {
        _activeProjectId = _projects.length > 0 ? _projects[0].id : null;
      }
      saveState();
      fbDeleteProject(projectId);
      stopTickerIfIdle();
      renderAll();
      /* Re-render compute tab project panel */
      var panel = document.getElementById('gpuComputeProjectPanel');
      var emptyState = document.getElementById('gpuEmptyState');
      if (_projects.length === 0) {
        if (panel) panel.style.display = 'none';
        if (emptyState) emptyState.style.display = '';
      } else {
        if (global.SL && global.SL.renderComputeTab) global.SL.renderComputeTab();
      }
    },

    setActiveProject: function (projectId) {
      _activeProjectId = projectId;
      renderAll();
    },

    getProjects: function () {
      return _projects.slice();
    },

    getActiveProjectId: function () {
      return _activeProjectId;
    },

    /* Called by Pod-workflow.html when user switches to tab-compute.
       Renders the project list panel inside #gpuComputeProjectPanel.
       If no projects, shows empty state. If projects exist, shows each
       project with its deployed GPU instance count and an "Add GPU" button. */
    renderComputeTab: function () {
      var panel = document.getElementById('gpuComputeProjectPanel');
      var emptyState = document.getElementById('gpuEmptyState');
      var searchBox  = document.getElementById('gpuSearchBox');
      var gpuGrid    = document.getElementById('gpuGrid');

      if (!panel) return;

      if (_projects.length === 0) {
        // No projects yet — show original empty state
        panel.style.display = 'none';
        if (emptyState) emptyState.style.display = '';
        if (searchBox)  searchBox.style.display  = 'none';
        if (gpuGrid)    gpuGrid.style.display     = 'none';
        return;
      }

      // Has projects — hide empty state, hide GPU grid, show project panel
      if (emptyState) emptyState.style.display = 'none';
      if (searchBox)  searchBox.style.display  = 'none';
      if (gpuGrid)    gpuGrid.style.display     = 'none';
      panel.style.display = '';

      var html = '<div class="cp-header">'
        + '<span class="cp-title"><i class="ph-fill ph-stack"></i> Your Projects</span>'
        + '<span class="cp-subtitle">' + _projects.length + ' project' + (_projects.length !== 1 ? 's' : '') + '</span>'
        + '</div>';

      _projects.forEach(function (proj) {
        var podCount = _instances.filter(function (i) { return i.projectId === proj.id; }).length;
        var running  = _instances.filter(function (i) { return i.projectId === proj.id && i.state === 'running'; }).length;
        var isActive = proj.id === _activeProjectId;

        var locationLabels = {
          'us-east':     'US East (Virginia)',
          'us-west':     'US West (Oregon)',
          'eu-central':  'EU Central (Frankfurt)',
          'ap-southeast':'Asia Pacific (Singapore)'
        };
        var locLabel = locationLabels[proj.location] || proj.location || 'Global';

        var createdStr = new Date(proj.createdAt).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric'
        });

        html += '<div class="cp-card' + (isActive ? ' cp-card-active' : '') + '">'
          // Accent bar
          + '<div class="cp-accent"></div>'
          // Card header row
          + '<div class="cp-card-head">'
          + '<div class="cp-card-left">'
          + '<div class="cp-icon"><i class="ph-fill ph-folder' + (podCount > 0 ? '-open' : '') + '"></i></div>'
          + '<div>'
          + '<div class="cp-name">' + esc(proj.name) + '</div>'
          + '<div class="cp-meta">'
          + '<span><i class="ph ph-map-pin"></i>' + esc(locLabel) + '</span>'
          + '<span><i class="ph ph-calendar-blank"></i>' + createdStr + '</span>'
          + '</div>'
          + '</div>'
          + '</div>'
          + '<div class="cp-card-right">'
          + (running > 0
            ? '<span class="cp-running-badge"><span class="sl-blink"></span>' + running + ' running</span>'
            : '')
          + '<span class="cp-count-badge">' + podCount + ' GPU' + (podCount !== 1 ? 's' : '') + '</span>'
          + '</div>'
          + '</div>'
          // GPU list (names only, compact)
          + (podCount > 0
            ? '<div class="cp-gpu-list">'
              + _instances
                .filter(function (i) { return i.projectId === proj.id; })
                .map(function (i) {
                  var stateClass = i.state === 'running' ? 'cp-gpu-running'
                                 : i.state === 'paused'  ? 'cp-gpu-paused'
                                 : 'cp-gpu-stopped';
                  return '<div class="cp-gpu-row ' + stateClass + '">'
                    + '<i class="ph-fill ph-graphics-card"></i>'
                    + '<span class="cp-gpu-name">' + esc(i.name) + '</span>'
                    + '<span class="cp-gpu-vram">' + esc(i.vram) + '</span>'
                    + '<span class="cp-gpu-state">' + i.state + '</span>'
                    + '</div>';
                }).join('')
              + '</div>'
            : '<div class="cp-no-gpu">No GPUs deployed yet</div>')
          // Footer actions
          + '<div class="cp-card-footer">'
          + '<button class="cp-btn-add" onclick="computeTabAddGPU(\'' + proj.id + '\', \'' + esc(proj.name).replace(/\\/g,'\\\\').replace(/'/g,"\\'") + '\')">'
          + '<i class="ph-bold ph-plus"></i> Add GPU'
          + '</button>'
          + (isActive
            ? '<span class="cp-active-badge"><i class="ph-fill ph-check-circle"></i> Active Project</span>'
            : '<button class="cp-btn-switch" onclick="computeTabSwitchProject(\'' + proj.id + '\')">'
              + '<i class="ph-fill ph-arrow-square-right"></i> Switch to This'
              + '</button>')
          + '<button class="cp-btn-delete" onclick="slDeleteProject(\'' + proj.id + '\')" title="Delete project"><i class="ph-bold ph-trash"></i></button>'
          + '</div>'
          + '</div>';
      });

      panel.innerHTML = html;
    },
  };

  /* ══════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════ */
  function renderAll() {
    var wrap = document.getElementById("serverlessContent");
    if (!wrap) return;

    // Hide skeleton, show content
    var skel = document.getElementById("serverlessSkeleton");
    if (skel) skel.style.display = "none";
    wrap.style.display = "";

    /* Filter instances to active project if one is selected */
    var visibleInstances = _activeProjectId
      ? _instances.filter(function (i) { return i.projectId === _activeProjectId; })
      : _instances;

    if (_instances.length === 0) {
      wrap.innerHTML = emptyStateHTML();
      syncBalanceDOMs();
      return;
    }

    /* Build project selector bar if there are projects */
    var html = projectSelectorHTML();

    /* Active project info banner */
    var activeProj = _projects.filter(function (p) { return p.id === _activeProjectId; })[0] || null;
    if (activeProj) {
      html += projectBannerHTML(activeProj, visibleInstances.length);
    }

    if (visibleInstances.length === 0) {
      html += '<div class="sl-empty" style="padding: 40px 20px 24px;">'
        + '<div class="sl-empty-icon"><i class="ph-fill ph-cpu"></i></div>'
        + '<h3>No Instances in This Project</h3>'
        + '<p>Go to <strong>GPU Instances</strong> and deploy a GPU under this project.</p>'
        + '</div>';
    } else {
      html += headerBarHTML() + '<div id="slCards">' + visibleInstances.map(cardHTML).join("") + "</div>";
    }

    wrap.innerHTML = html;
    syncBalanceDOMs();
  }

  function refreshLiveNumbers() {
    _instances.forEach(function (inst) {
      var uptimeEl = document.getElementById("sl-uptime-" + inst.id);
      var costEl = document.getElementById("sl-cost-" + inst.id);
      if (uptimeEl) uptimeEl.textContent = fmtUptime(inst.uptimeSec);
      if (costEl) costEl.textContent = "$" + inst.totalCost.toFixed(5);
    });

    var pill = document.querySelector(".sl-running-pill");
    if (pill) {
      var running = _instances.filter(function (i) {
        return i.state === "running";
      }).length;
      if (running > 0) {
        pill.innerHTML =
          '<span class="sl-blink"></span> ' + running + " running";
        pill.style.display = "";
      } else {
        pill.style.display = "none";
      }
    }
  }

  /* 4. syncBalanceDOMs — syncs all 4 balance targets including runwayBalance */
  function syncBalanceDOMs() {
    var fmt = "$" + _balance.toFixed(2);
    [
      "balanceAmount",
      "sidebarBalance",
      "slHeaderBalance",
      "runwayBalance",
      "headerBalanceStat",
    ].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = fmt;
    });

    var sub = document.querySelector(".balance-subtext");
    if (sub) {
      if (_balance < 5) {
        sub.innerHTML =
          '<i class="ph-fill ph-warning-circle"></i> Critical – top up now';
        sub.style.color = "var(--b5)";
      } else if (_balance < 20) {
        sub.innerHTML =
          '<i class="ph-fill ph-warning"></i> Balance running low';
        sub.style.color = "var(--b4)";
      } else {
        sub.innerHTML =
          '<i class="ph-fill ph-check-circle"></i> Sufficient for active deployments';
        sub.style.color = "var(--b3)";
      }
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     HTML BUILDERS
  ══════════════════════════════════════════════════════════════════ */
  function projectSelectorHTML() {
    if (_projects.length === 0) return "";
    var html = '<div class="sl-proj-selector">';
    _projects.forEach(function (p) {
      var isActive = p.id === _activeProjectId;
      var count = _instances.filter(function (i) { return i.projectId === p.id; }).length;
      html += '<button class="sl-proj-tab' + (isActive ? " sl-proj-tab-active" : "") + '"'
        + ' onclick="SL.setActiveProject(\'' + p.id + '\')">'
        + '<i class="ph-fill ph-folder' + (isActive ? "-open" : "") + '"></i> '
        + esc(p.name)
        + '<span class="sl-proj-count">' + count + '</span>'
        + '</button>';
    });
    html += '</div>';
    return html;
  }

  function projectBannerHTML(proj, count) {
    return '<div class="sl-proj-banner">'
      + '<div class="sl-proj-banner-left">'
      + '<div class="sl-proj-banner-icon"><i class="ph-fill ph-folder-open"></i></div>'
      + '<div>'
      + '<div class="sl-proj-banner-name">' + esc(proj.name) + '</div>'
      + '<div class="sl-proj-banner-meta">'
      + (proj.location ? '<span><i class="ph ph-map-pin"></i> ' + esc(proj.location) + '</span>' : '')
      + '<span><i class="ph ph-calendar-blank"></i> Created ' + new Date(proj.createdAt).toLocaleDateString("en-US", {month:"short",day:"numeric",year:"numeric"}) + '</span>'
      + '</div>'
      + '</div>'
      + '</div>'
      + '<div class="sl-proj-banner-right">'
      + '<span class="sl-instance-pill">' + count + ' instance' + (count !== 1 ? 's' : '') + '</span>'
      + '</div>'
      + '</div>';
  }

  function emptyStateHTML() {
    return [
      '<div class="sl-empty">',
      '<div class="sl-empty-icon"><i class="ph-fill ph-lightning"></i></div>',
      "<h3>No Active Instances</h3>",
      "<p>Go to <strong>GPU Instances</strong>, choose a GPU,<br>",
      "and hit <strong>Deploy Now</strong> — it appears here automatically.</p>",
      "</div>",
    ].join("");
  }

  function headerBarHTML() {
    var running = _instances.filter(function (i) {
      return i.state === "running";
    }).length;
    var total = _instances.length;
    return [
      '<div class="sl-topbar">',
      '<div class="sl-topbar-left">',
      '<span class="sl-topbar-title"><i class="ph-fill ph-lightning"></i> Serverless Endpoints</span>',
      '<span class="sl-instance-pill">',
      total,
      " instance",
      total !== 1 ? "s" : "",
      "</span>",
      running > 0
        ? '<span class="sl-running-pill"><span class="sl-blink"></span> ' +
          running +
          " running</span>"
        : '<span class="sl-running-pill" style="display:none"></span>',
      "</div>",
      '<div class="sl-topbar-right">',
      '<div class="sl-balance-chip">',
      '<i class="ph ph-coins"></i>',
      '<span id="slHeaderBalance">$',
      _balance.toFixed(2),
      "</span>",
      "</div>",
      "</div>",
      "</div>",
    ].join("");
  }

  function cardHTML(inst) {
    var isRunning = inst.state === "running";
    var isStopped = inst.state === "stopped";
    var stateLabel = isRunning
      ? "● Running"
      : inst.state === "paused"
        ? "⏸ Paused"
        : "■ Stopped";

    var deployedStr = new Date(inst.deployedAt).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    var controls = "";
    if (isRunning) {
      controls += mkBtn(
        "SL.pause('" + esc(inst.id) + "')",
        "ph-pause",
        "Pause",
        "sl-btn-pause",
      );
    } else if (!isStopped) {
      controls += mkBtn(
        "SL.play('" + esc(inst.id) + "')",
        "ph-play",
        "Resume",
        "sl-btn-play",
      );
    } else {
      controls += mkBtn(
        "SL.play('" + esc(inst.id) + "')",
        "ph-play",
        "Restart",
        "sl-btn-play",
      );
    }
    if (!isStopped) {
      controls += mkBtn(
        "SL.stop('" + esc(inst.id) + "')",
        "ph-stop",
        "Stop",
        "sl-btn-stop",
      );
    }
    controls += [
      '<button class="sl-btn sl-btn-remove"',
      " onclick=\"if(confirm('Remove this instance permanently?'))SL.remove('" +
        esc(inst.id) +
        "')\"",
      ' title="Remove"><i class="ph-bold ph-trash"></i></button>',
    ].join("");

    /* resolve project name from _projects array */
    var projName = "";
    if (inst.projectId) {
      var projMatch = _projects.filter(function (p) { return p.id === inst.projectId; })[0];
      if (projMatch) projName = projMatch.name;
    }

    return [
      '<div class="sl-card sl-card-' +
        inst.state +
        '" id="slcard-' +
        inst.id +
        '">',
      '<div class="sl-card-accent"></div>',
      /* project tag strip — sits above card head */
      projName
        ? '<div class="sl-card-proj-tag"><i class="ph-fill ph-folder-open"></i> ' + esc(projName) + '</div>'
        : '',
      '<div class="sl-card-head">',
      '<div class="sl-title-row">',
      '<div class="sl-card-icon"><i class="ph-fill ph-graphics-card"></i></div>',
      "<div>",
      '<div class="sl-card-name">',
      esc(inst.name),
      "</div>",
      '<div class="sl-card-sub">',
      esc(inst.vram),
      " VRAM · ",
      esc(inst.template),
      "</div>",
      "</div>",
      "</div>",
      '<span class="sl-state-badge sl-state-',
      inst.state,
      '">',
      stateLabel,
      "</span>",
      "</div>",
      '<div class="sl-stats">',
      '<div class="sl-stat"><div class="sl-stat-lbl">Rate</div>',
      '<div class="sl-stat-val">$',
      inst.pricePerHr.toFixed(2),
      '<span class="sl-unit">/hr</span></div></div>',
      '<div class="sl-stat"><div class="sl-stat-lbl">Uptime</div>',
      '<div class="sl-stat-val" id="sl-uptime-',
      inst.id,
      '">',
      fmtUptime(inst.uptimeSec),
      "</div></div>",
      '<div class="sl-stat"><div class="sl-stat-lbl">Session Cost</div>',
      '<div class="sl-stat-val sl-val-cost" id="sl-cost-',
      inst.id,
      '">$',
      (inst.totalCost || 0).toFixed(5),
      "</div></div>",
      '<div class="sl-stat"><div class="sl-stat-lbl">Balance</div>',
      '<div class="sl-stat-val sl-val-bal">$',
      _balance.toFixed(2),
      "</div></div>",
      "</div>",
      '<div class="sl-config-row">',
      '<span><i class="ph ph-hard-drive"></i> Container ',
      inst.disk,
      " GB</span>",
      '<span><i class="ph ph-database"></i> Volume ',
      inst.volume,
      " GB</span>",
      '<span class="sl-config-date"><i class="ph ph-calendar-blank"></i> Deployed ',
      deployedStr,
      "</span>",
      "</div>",
      '<div class="sl-controls">',
      controls,
      "</div>",
      isRunning
        ? '<div class="sl-pulse-bar"><div class="sl-pulse-fill"></div></div>'
        : "",
      "</div>",
    ].join("");
  }

  function mkBtn(onclick, icon, label, cls) {
    return [
      '<button class="sl-btn ',
      cls,
      '" onclick="',
      onclick,
      '" title="',
      label,
      '">',
      '<i class="ph-bold ',
      icon,
      '"></i> ',
      label,
      "</button>",
    ].join("");
  }

  /* ══════════════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════════════ */
  function find(id) {
    return (
      _instances.find(function (i) {
        return i.id === id;
      }) || null
    );
  }

  function fmtUptime(s) {
    var h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60),
      sec = s % 60;
    var out = "";
    if (h) out += h + "h ";
    if (m || h) out += m + "m ";
    out += ("0" + sec).slice(-2) + "s";
    return out;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ══════════════════════════════════════════════════════════════════
     TAB SWITCHER
  ══════════════════════════════════════════════════════════════════ */
  function switchToServerlessTab() {
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle(
        "active",
        t.getAttribute("data-target") === "tab-serverless",
      );
    });
    document.querySelectorAll(".tab-content").forEach(function (tc) {
      tc.classList.toggle("active", tc.id === "tab-serverless");
    });
    var hdr = document.querySelector(".header-title");
    if (hdr) hdr.textContent = "Serverless Endpoints";
  }

  /* ══════════════════════════════════════════════════════════════════
     TOAST
  ══════════════════════════════════════════════════════════════════ */
  function toast(msg) {
    var old = document.getElementById("slToast");
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var el = document.createElement("div");
    el.id = "slToast";
    el.textContent = msg;
    Object.assign(el.style, {
      position: "fixed",
      bottom: "28px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "#1e1e24",
      border: "1px solid rgba(138,180,248,0.25)",
      color: "#f8f9fa",
      padding: "10px 22px",
      borderRadius: "9999px",
      fontSize: "13px",
      fontWeight: "600",
      fontFamily: "'DM Sans',sans-serif",
      zIndex: "9999",
      boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
      opacity: "0",
      transition: "opacity 0.25s",
      whiteSpace: "nowrap",
    });
    document.body.appendChild(el);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        el.style.opacity = "1";
      });
    });
    setTimeout(function () {
      el.style.opacity = "0";
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 300);
    }, 3200);
  }

  /* ══════════════════════════════════════════════════════════════════
     CSS – injected once
  ══════════════════════════════════════════════════════════════════ */
  function injectCSS() {
    if (document.getElementById("slStyles")) return;
    var s = document.createElement("style");
    s.id = "slStyles";
    s.textContent = [
      ".sl-empty{text-align:center;padding:72px 20px 40px;color:#5f6368;}",
      ".sl-empty-icon{font-size:52px;margin-bottom:18px;}",
      ".sl-empty-icon i{background:linear-gradient(135deg,#8ab4f8,#c58af9);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;}",
      ".sl-empty h3{font-size:17px;font-weight:600;color:#9aa0a6;margin-bottom:10px;}",
      ".sl-empty p{font-size:13px;color:#5f6368;line-height:1.75;max-width:300px;margin:0 auto;}",
      ".sl-topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px;}",
      ".sl-topbar-left{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}",
      ".sl-topbar-title{font-size:15px;font-weight:700;color:#f8f9fa;display:flex;align-items:center;gap:6px;}",
      ".sl-topbar-title i{color:#8ab4f8;}",
      ".sl-instance-pill{background:#1e1e24;border:1px solid rgba(255,255,255,0.08);color:#9aa0a6;font-size:11px;font-weight:600;padding:3px 9px;border-radius:9999px;}",
      ".sl-running-pill{background:rgba(129,201,149,0.1);border:1px solid rgba(129,201,149,0.25);color:#81c995;font-size:11px;font-weight:700;padding:3px 9px;border-radius:9999px;display:inline-flex;align-items:center;gap:5px;}",
      ".sl-blink{width:7px;height:7px;border-radius:50%;background:#81c995;display:inline-block;animation:slBlink 1.4s ease-in-out infinite;}",
      "@keyframes slBlink{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.25;transform:scale(0.6)}}",
      '.sl-balance-chip{display:inline-flex;align-items:center;gap:6px;background:#0a0a0c;border:1px solid rgba(138,180,248,0.2);border-radius:9999px;padding:6px 14px;font-size:13px;font-weight:700;font-family:"JetBrains Mono",monospace;color:#81c995;}',
      ".sl-balance-chip i{font-size:14px;color:#8ab4f8;}",
      ".sl-card{background:#131316;border:1px solid rgba(255,255,255,0.07);border-radius:20px;padding:22px;margin-bottom:16px;position:relative;overflow:hidden;transition:border-color 0.2s,box-shadow 0.2s;}",
      ".sl-card:hover{border-color:rgba(138,180,248,0.2);box-shadow:0 0 28px rgba(138,180,248,0.06);}",
      ".sl-card-running{border-color:rgba(129,201,149,0.15);}",
      ".sl-card-paused{border-color:rgba(253,214,99,0.12);}",
      ".sl-card-stopped{opacity:0.7;}",
      ".sl-card-accent{position:absolute;top:0;left:0;right:0;height:2px;}",
      ".sl-card-running .sl-card-accent{background:linear-gradient(90deg,#81c995,#8ab4f8);}",
      ".sl-card-paused .sl-card-accent{background:linear-gradient(90deg,#fdd663,#f97316);}",
      ".sl-card-stopped .sl-card-accent{background:rgba(255,255,255,0.07);}",
      ".sl-card-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;gap:12px;}",
      ".sl-title-row{display:flex;align-items:center;gap:12px;}",
      ".sl-card-icon{width:42px;height:42px;background:#1e1e24;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;color:#c58af9;border:1px solid rgba(255,255,255,0.07);flex-shrink:0;}",
      ".sl-card-name{font-size:15px;font-weight:600;color:#f8f9fa;margin-bottom:3px;}",
      '.sl-card-sub{font-size:11px;color:#5f6368;font-family:"JetBrains Mono",monospace;}',
      ".sl-state-badge{padding:4px 11px;border-radius:9999px;font-size:11px;font-weight:700;white-space:nowrap;flex-shrink:0;}",
      ".sl-state-running{background:rgba(129,201,149,0.1);color:#81c995;border:1px solid rgba(129,201,149,0.25);}",
      ".sl-state-paused{background:rgba(253,214,99,0.1);color:#fdd663;border:1px solid rgba(253,214,99,0.25);}",
      ".sl-state-stopped{background:rgba(242,139,130,0.1);color:#f28b82;border:1px solid rgba(242,139,130,0.25);}",
      ".sl-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;background:#0a0a0c;border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:14px;margin-bottom:12px;}",
      "@media(max-width:580px){.sl-stats{grid-template-columns:repeat(2,1fr);}}",
      ".sl-stat{display:flex;flex-direction:column;gap:5px;}",
      ".sl-stat-lbl{font-size:10px;color:#5f6368;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;}",
      '.sl-stat-val{font-size:13px;font-weight:600;color:#f8f9fa;font-family:"JetBrains Mono",monospace;}',
      ".sl-unit{font-size:10px;color:#5f6368;margin-left:1px;}",
      ".sl-val-cost{color:#8ab4f8 !important;}",
      ".sl-val-bal{color:#81c995 !important;}",
      ".sl-config-row{display:flex;flex-wrap:wrap;gap:16px;font-size:11px;color:#5f6368;margin-bottom:14px;}",
      ".sl-config-row i{margin-right:3px;color:#9aa0a6;}",
      ".sl-config-date{margin-left:auto;}",
      ".sl-controls{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}",
      '.sl-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 15px;border-radius:8px;font-size:12px;font-weight:600;border:1px solid;cursor:pointer;transition:all 0.15s;font-family:"Inter",sans-serif;line-height:1;}',
      ".sl-btn-play{background:rgba(129,201,149,0.09);border-color:rgba(129,201,149,0.3);color:#81c995;}",
      ".sl-btn-play:hover{background:#81c995;color:#000;border-color:#81c995;}",
      ".sl-btn-pause{background:rgba(253,214,99,0.09);border-color:rgba(253,214,99,0.3);color:#fdd663;}",
      ".sl-btn-pause:hover{background:#fdd663;color:#000;border-color:#fdd663;}",
      ".sl-btn-stop{background:rgba(242,139,130,0.09);border-color:rgba(242,139,130,0.3);color:#f28b82;}",
      ".sl-btn-stop:hover{background:#f28b82;color:#000;border-color:#f28b82;}",
      ".sl-btn-remove{background:rgba(255,255,255,0.03);border-color:rgba(255,255,255,0.08);color:#5f6368;padding:7px 10px;margin-left:auto;}",
      ".sl-btn-remove:hover{background:rgba(242,139,130,0.15);border-color:rgba(242,139,130,0.3);color:#f28b82;}",
      ".sl-pulse-bar{position:absolute;bottom:0;left:0;right:0;height:2px;background:rgba(255,255,255,0.04);}",
      ".sl-pulse-fill{height:100%;background:linear-gradient(90deg,transparent,#8ab4f8,#c58af9,#8ab4f8,transparent);background-size:300% 100%;animation:slSweep 2.2s linear infinite;}",
      "@keyframes slSweep{0%{background-position:100% 0}100%{background-position:-100% 0}}",
      ".sl-card-proj-tag{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#8ab4f8;background:rgba(138,180,248,0.08);border:1px solid rgba(138,180,248,0.18);border-radius:6px;padding:4px 10px;margin-bottom:12px;}",
      ".sl-card-proj-tag i{font-size:12px;}",
      ".sl-proj-selector{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;}",
      ".sl-proj-tab{display:inline-flex;align-items:center;gap:7px;padding:7px 14px;border-radius:9999px;font-size:12px;font-weight:600;border:1px solid rgba(255,255,255,0.1);background:#1e1e24;color:#9aa0a6;cursor:pointer;transition:all 0.15s;font-family:'DM Sans',sans-serif;}",
      ".sl-proj-tab:hover{border-color:rgba(138,180,248,0.3);color:#f8f9fa;}",
      ".sl-proj-tab-active{background:rgba(138,180,248,0.1);border-color:rgba(138,180,248,0.35);color:#8ab4f8;}",
      ".sl-proj-count{background:rgba(255,255,255,0.08);border-radius:9999px;padding:1px 7px;font-size:10px;font-weight:700;margin-left:2px;}",
      ".sl-proj-tab-active .sl-proj-count{background:rgba(138,180,248,0.2);color:#8ab4f8;}",
      /* project banner */
      ".sl-proj-banner{background:#131316;border:1px solid rgba(138,180,248,0.15);border-radius:16px;padding:16px 20px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;gap:12px;}",
      ".sl-proj-banner-left{display:flex;align-items:center;gap:14px;}",
      ".sl-proj-banner-icon{width:42px;height:42px;border-radius:11px;background:rgba(138,180,248,0.1);border:1px solid rgba(138,180,248,0.2);display:flex;align-items:center;justify-content:center;font-size:20px;color:#8ab4f8;flex-shrink:0;}",
      ".sl-proj-banner-name{font-size:15px;font-weight:700;color:#f8f9fa;margin-bottom:4px;}",
      ".sl-proj-banner-meta{display:flex;flex-wrap:wrap;gap:12px;font-size:11px;color:#5f6368;}",
      ".sl-proj-banner-meta i{margin-right:3px;color:#9aa0a6;}",
      ".sl-proj-banner-right{flex-shrink:0;}",
      /* ── Compute tab project panel ── */
      ".cp-header{display:flex;align-items:baseline;gap:10px;margin-bottom:18px;}",
      ".cp-title{font-size:15px;font-weight:700;color:#f8f9fa;display:flex;align-items:center;gap:7px;}",
      ".cp-title i{color:#8ab4f8;}",
      ".cp-subtitle{font-size:12px;color:#5f6368;margin-left:auto;}",
      ".cp-card{background:#131316;border:1px solid rgba(255,255,255,0.07);border-radius:18px;padding:20px;margin-bottom:14px;position:relative;overflow:hidden;transition:border-color 0.2s,box-shadow 0.2s;}",
      ".cp-card:hover{border-color:rgba(138,180,248,0.2);box-shadow:0 0 24px rgba(138,180,248,0.06);}",
      ".cp-card-active{border-color:rgba(138,180,248,0.25);box-shadow:0 0 20px rgba(138,180,248,0.07);}",
      ".cp-accent{position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#8ab4f8,#c58af9);}",
      ".cp-card-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;gap:10px;}",
      ".cp-card-left{display:flex;align-items:center;gap:12px;}",
      ".cp-icon{width:40px;height:40px;border-radius:10px;background:rgba(138,180,248,0.1);border:1px solid rgba(138,180,248,0.2);display:flex;align-items:center;justify-content:center;font-size:20px;color:#8ab4f8;flex-shrink:0;}",
      ".cp-name{font-size:14px;font-weight:700;color:#f8f9fa;margin-bottom:5px;}",
      ".cp-meta{display:flex;flex-wrap:wrap;gap:10px;font-size:11px;color:#5f6368;}",
      ".cp-meta i{margin-right:3px;color:#9aa0a6;}",
      ".cp-card-right{display:flex;align-items:center;gap:8px;flex-shrink:0;}",
      ".cp-running-badge{display:inline-flex;align-items:center;gap:5px;background:rgba(129,201,149,0.1);border:1px solid rgba(129,201,149,0.25);color:#81c995;font-size:10px;font-weight:700;padding:3px 9px;border-radius:9999px;}",
      ".cp-count-badge{background:#1e1e24;border:1px solid rgba(255,255,255,0.08);color:#9aa0a6;font-size:11px;font-weight:600;padding:3px 10px;border-radius:9999px;}",
      ".cp-gpu-list{background:#0a0a0c;border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:10px 12px;margin-bottom:14px;display:flex;flex-direction:column;gap:7px;}",
      ".cp-gpu-row{display:flex;align-items:center;gap:9px;font-size:12px;}",
      ".cp-gpu-row i{font-size:14px;color:#5f6368;flex-shrink:0;}",
      ".cp-gpu-name{flex:1;font-weight:600;color:#e8eaed;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
      ".cp-gpu-vram{font-size:10px;color:#5f6368;font-family:'DM Mono',monospace;flex-shrink:0;}",
      ".cp-gpu-state{font-size:10px;font-weight:700;padding:2px 7px;border-radius:9999px;flex-shrink:0;text-transform:capitalize;}",
      ".cp-gpu-running .cp-gpu-state{background:rgba(129,201,149,0.1);color:#81c995;}",
      ".cp-gpu-paused .cp-gpu-state{background:rgba(253,214,99,0.1);color:#fdd663;}",
      ".cp-gpu-stopped .cp-gpu-state{background:rgba(242,139,130,0.1);color:#f28b82;}",
      ".cp-no-gpu{font-size:12px;color:#5f6368;margin-bottom:14px;padding:10px 0;}",
      ".cp-card-footer{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}",
      ".cp-btn-add{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:9px;font-size:12px;font-weight:600;border:1px solid rgba(138,180,248,0.3);background:rgba(138,180,248,0.08);color:#8ab4f8;cursor:pointer;transition:all 0.15s;font-family:'DM Sans',sans-serif;}",
      ".cp-btn-add:hover{background:rgba(138,180,248,0.18);border-color:rgba(138,180,248,0.5);}",
      ".cp-btn-switch{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:9px;font-size:12px;font-weight:600;border:1px solid rgba(255,255,255,0.07);background:transparent;color:#9aa0a6;cursor:pointer;transition:all 0.15s;font-family:'DM Sans',sans-serif;}",
      ".cp-btn-switch:hover{border-color:rgba(255,255,255,0.15);color:#e8eaed;}",
      ".cp-active-badge{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:#81c995;}",
      ".cp-active-badge i{font-size:14px;}",
      ".cp-btn-delete{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:6px;font-size:13px;border:1px solid rgba(235,87,87,0.2);background:rgba(235,87,87,0.06);color:#f28b82;cursor:pointer;transition:all 0.15s;margin-left:auto;font-family:inherit;flex-shrink:0;}",
      ".cp-btn-delete:hover{background:rgba(235,87,87,0.2);border-color:rgba(235,87,87,0.5);}",
    ].join("");
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════════════════════════
     BOOT
  ══════════════════════════════════════════════════════════════════ */
  function boot() {
    injectCSS();
    initFirebase();

    loadState();
    renderAll();

    /* On page load, if projects exist in localStorage, immediately render
       the project panel in tab-compute so it never shows "No Server Configured"
       when the user has already created projects. */
    if (_projects.length > 0) {
      /* Use a small defer so the DOM is fully ready */
      setTimeout(function () {
        /* Trigger renderComputeTab via the public API so Pod-workflow.html
           helper function keeps its own state consistent too */
        if (typeof renderComputeTab === 'function') {
          renderComputeTab();
        } else {
          /* Fallback: directly render into the panel */
          var slObj = global.SL;
          if (slObj && slObj.renderComputeTab) slObj.renderComputeTab();
        }
      }, 50);
    }

    document
      .querySelectorAll('.tab[data-target="tab-serverless"]')
      .forEach(function (t) {
        t.addEventListener("click", function () {
          setTimeout(renderAll, 20);
        });
      });

    if (
      _instances.some(function (i) {
        return i.state === "running";
      })
    ) {
      startTicker();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
