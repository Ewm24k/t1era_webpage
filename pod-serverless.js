/**
 * pod-serverless.js  –  T1ERA Compute
 * ─────────────────────────────────────────────────────────────────────
 * Dummy serverless instance manager. No real server connection.
 *
 * How it works:
 *   1. When user deploys from the GPU modal, Pod-workflow.html calls
 *      window.SL.deploy({ name, vram, pricePerHr, template, disk, volume })
 *   2. The instance is stored in localStorage and rendered as a card
 *      inside #serverlessContent.
 *   3. While status === "running", a per-second tick drains the balance
 *      at (pricePerHr / 3600) per tick.
 *   4. Three balance DOM targets stay in sync every tick:
 *        #balanceAmount   – PAYG card large balance
 *        #sidebarBalance  – sidebar user chip
 *        #slHeaderBalance – balance chip inside the serverless tab header
 *
 * Controls per instance:
 *   Play  – start/resume draining
 *   Pause – freeze drain, keep uptime
 *   Stop  – freeze drain, mark stopped (can restart)
 *   Remove – delete permanently
 * ─────────────────────────────────────────────────────────────────────
 */

(function (global) {
  'use strict';

  /* ── Storage keys ──────────────────────────────────────────────── */
  var KEY_INSTANCES = 't1era_sl_instances';
  var KEY_BALANCE   = 't1era_sl_balance';
  var STARTING_BAL  = 142.50;

  /* ── Runtime state ─────────────────────────────────────────────── */
  var _instances = [];
  var _balance   = STARTING_BAL;
  var _ticker    = null;

  /* ══════════════════════════════════════════════════════════════════
     PERSISTENCE
  ══════════════════════════════════════════════════════════════════ */
  function loadState() {
    try {
      var raw = localStorage.getItem(KEY_INSTANCES);
      _instances = raw ? JSON.parse(raw) : [];
    } catch (e) { _instances = []; }

    try {
      var b = localStorage.getItem(KEY_BALANCE);
      _balance = b !== null ? parseFloat(b) : STARTING_BAL;
      if (isNaN(_balance)) _balance = STARTING_BAL;
    } catch (e) { _balance = STARTING_BAL; }

    // Any instance flagged "running" before page closed resumes as paused
    _instances.forEach(function (inst) {
      if (inst.state === 'running') inst.state = 'paused';
    });
  }

  function saveState() {
    try {
      localStorage.setItem(KEY_INSTANCES, JSON.stringify(_instances));
      localStorage.setItem(KEY_BALANCE, _balance.toFixed(6));
    } catch (e) { /* storage full – ignore */ }
  }

  /* ══════════════════════════════════════════════════════════════════
     TICKER  –  runs every second
  ══════════════════════════════════════════════════════════════════ */
  function startTicker() {
    if (_ticker) return;
    _ticker = setInterval(tick, 1000);
  }

  function stopTickerIfIdle() {
    var anyRunning = _instances.some(function (i) { return i.state === 'running'; });
    if (!anyRunning && _ticker) {
      clearInterval(_ticker);
      _ticker = null;
    }
  }

  function tick() {
    var changed = false;
    _instances.forEach(function (inst) {
      if (inst.state !== 'running') return;
      var drain = inst.pricePerHr / 3600;
      inst.uptimeSec += 1;
      inst.totalCost  = (inst.totalCost || 0) + drain;
      _balance        = Math.max(0, _balance - drain);
      changed = true;

      if (_balance <= 0) {
        inst.state = 'stopped';
        stopTickerIfIdle();
        toast('⚠️ Balance depleted – ' + inst.name + ' stopped.');
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

    /** Called by Pod-workflow.html after deploy animation */
    deploy: function (cfg) {
      var inst = {
        id:         'sl_' + Date.now(),
        name:       cfg.name        || 'Unknown GPU',
        vram:       cfg.vram        || '—',
        pricePerHr: cfg.pricePerHr  || 0,
        template:   cfg.template    || 'Ubuntu 22.04',
        disk:       cfg.disk        || 40,
        volume:     cfg.volume      || 100,
        state:      'running',      // auto-start on deploy
        uptimeSec:  0,
        totalCost:  0,
        deployedAt: new Date().toISOString()
      };
      _instances.push(inst);
      saveState();
      startTicker();
      renderAll();
      switchToServerlessTab();
      toast('🚀 ' + inst.name + ' is now running');
    },

    play: function (id) {
      var inst = find(id);
      if (!inst) return;
      if (_balance <= 0) { toast('Insufficient balance — top up to resume.'); return; }
      inst.state = 'running';
      saveState();
      startTicker();
      renderAll();
      toast('▶ ' + inst.name + ' resumed — balance draining.');
    },

    pause: function (id) {
      var inst = find(id);
      if (!inst) return;
      inst.state = 'paused';
      saveState();
      stopTickerIfIdle();
      renderAll();
      toast('⏸ ' + inst.name + ' paused — no charges while paused.');
    },

    stop: function (id) {
      var inst = find(id);
      if (!inst) return;
      inst.state = 'stopped';
      saveState();
      stopTickerIfIdle();
      renderAll();
      toast('■ ' + inst.name + ' stopped.');
    },

    remove: function (id) {
      _instances = _instances.filter(function (i) { return i.id !== id; });
      saveState();
      stopTickerIfIdle();
      renderAll();
    }
  };

  /* ══════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════ */
  function renderAll() {
    var wrap = document.getElementById('serverlessContent');
    if (!wrap) return;

    if (_instances.length === 0) {
      wrap.innerHTML = emptyStateHTML();
      syncBalanceDOMs();
      return;
    }

    wrap.innerHTML =
      headerBarHTML() +
      '<div id="slCards">' +
        _instances.map(cardHTML).join('') +
      '</div>';

    syncBalanceDOMs();
  }

  /** Only refresh numbers inside existing cards – no full re-render */
  function refreshLiveNumbers() {
    _instances.forEach(function (inst) {
      var uptimeEl = document.getElementById('sl-uptime-' + inst.id);
      var costEl   = document.getElementById('sl-cost-'   + inst.id);
      if (uptimeEl) uptimeEl.textContent = fmtUptime(inst.uptimeSec);
      if (costEl)   costEl.textContent   = '$' + inst.totalCost.toFixed(5);
    });

    /* Update running-pill count */
    var pill = document.querySelector('.sl-running-pill');
    if (pill) {
      var running = _instances.filter(function(i){ return i.state==='running'; }).length;
      if (running > 0) {
        pill.innerHTML = '<span class="sl-blink"></span> ' + running + ' running';
        pill.style.display = '';
      } else {
        pill.style.display = 'none';
      }
    }
  }

  /* ── Sync all balance displays ─────────────────────────────────── */
  function syncBalanceDOMs() {
    var fmt = '$' + _balance.toFixed(2);
    ['balanceAmount', 'sidebarBalance', 'slHeaderBalance'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = fmt;
    });

    /* PAYG subtext */
    var sub = document.querySelector('.balance-subtext');
    if (sub) {
      if (_balance < 5) {
        sub.innerHTML = '<i class="ph-fill ph-warning-circle"></i> Critical – top up now';
        sub.style.color = 'var(--danger)';
      } else if (_balance < 20) {
        sub.innerHTML = '<i class="ph-fill ph-warning"></i> Balance running low';
        sub.style.color = 'var(--warning)';
      } else {
        sub.innerHTML = '<i class="ph-fill ph-check-circle"></i> Sufficient for active deployments';
        sub.style.color = 'var(--success)';
      }
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     HTML BUILDERS
  ══════════════════════════════════════════════════════════════════ */
  function emptyStateHTML() {
    return [
      '<div class="sl-empty">',
        '<div class="sl-empty-icon"><i class="ph-fill ph-lightning"></i></div>',
        '<h3>No Active Instances</h3>',
        '<p>Go to <strong>Secure Cloud</strong>, choose a GPU,<br>',
        'and hit <strong>Deploy Now</strong> — it appears here automatically.</p>',
      '</div>'
    ].join('');
  }

  function headerBarHTML() {
    var running = _instances.filter(function(i){ return i.state==='running'; }).length;
    var total   = _instances.length;
    return [
      '<div class="sl-topbar">',
        '<div class="sl-topbar-left">',
          '<span class="sl-topbar-title">',
            '<i class="ph-fill ph-lightning"></i> Serverless Endpoints',
          '</span>',
          '<span class="sl-instance-pill">', total,
            ' instance', total !== 1 ? 's' : '',
          '</span>',
          running > 0
            ? '<span class="sl-running-pill"><span class="sl-blink"></span> ' + running + ' running</span>'
            : '<span class="sl-running-pill" style="display:none"></span>',
        '</div>',
        '<div class="sl-topbar-right">',
          '<div class="sl-balance-chip">',
            '<i class="ph ph-coins"></i>',
            '<span id="slHeaderBalance">$', _balance.toFixed(2), '</span>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');
  }

  function cardHTML(inst) {
    var isRunning = inst.state === 'running';
    var isStopped = inst.state === 'stopped';

    var stateLabel = isRunning ? '● Running'
                   : inst.state === 'paused' ? '⏸ Paused'
                   : '■ Stopped';

    var deployedStr = new Date(inst.deployedAt).toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    /* Control buttons */
    var controls = '';
    if (isRunning) {
      controls += mkBtn('SL.pause(\'' + esc(inst.id) + '\')', 'ph-pause',  'Pause',   'sl-btn-pause');
    } else if (!isStopped) {
      controls += mkBtn('SL.play(\''  + esc(inst.id) + '\')', 'ph-play',   'Resume',  'sl-btn-play');
    } else {
      controls += mkBtn('SL.play(\''  + esc(inst.id) + '\')', 'ph-play',   'Restart', 'sl-btn-play');
    }
    if (!isStopped) {
      controls += mkBtn('SL.stop(\'' + esc(inst.id) + '\')', 'ph-stop', 'Stop', 'sl-btn-stop');
    }
    controls += [
      '<button class="sl-btn sl-btn-remove"',
      ' onclick="if(confirm(\'Remove this instance permanently?\'))SL.remove(\'' + esc(inst.id) + '\')"',
      ' title="Remove">',
      '<i class="ph-bold ph-trash"></i>',
      '</button>'
    ].join('');

    return [
      '<div class="sl-card sl-card-' + inst.state + '" id="slcard-' + inst.id + '">',
        '<div class="sl-card-accent"></div>',

        /* Header */
        '<div class="sl-card-head">',
          '<div class="sl-title-row">',
            '<div class="sl-card-icon"><i class="ph-fill ph-graphics-card"></i></div>',
            '<div>',
              '<div class="sl-card-name">', esc(inst.name), '</div>',
              '<div class="sl-card-sub">', esc(inst.vram), ' VRAM · ', esc(inst.template), '</div>',
            '</div>',
          '</div>',
          '<span class="sl-state-badge sl-state-', inst.state, '">', stateLabel, '</span>',
        '</div>',

        /* Stats grid */
        '<div class="sl-stats">',

          '<div class="sl-stat">',
            '<div class="sl-stat-lbl">Rate</div>',
            '<div class="sl-stat-val">',
              '$' + inst.pricePerHr.toFixed(2),
              '<span class="sl-unit">/hr</span>',
            '</div>',
          '</div>',

          '<div class="sl-stat">',
            '<div class="sl-stat-lbl">Uptime</div>',
            '<div class="sl-stat-val" id="sl-uptime-', inst.id, '">', fmtUptime(inst.uptimeSec), '</div>',
          '</div>',

          '<div class="sl-stat">',
            '<div class="sl-stat-lbl">Session Cost</div>',
            '<div class="sl-stat-val sl-val-cost" id="sl-cost-', inst.id, '">',
              '$' + (inst.totalCost || 0).toFixed(5),
            '</div>',
          '</div>',

          '<div class="sl-stat">',
            '<div class="sl-stat-lbl">Balance</div>',
            '<div class="sl-stat-val sl-val-bal">$', _balance.toFixed(2), '</div>',
          '</div>',

        '</div>',

        /* Disk / config row */
        '<div class="sl-config-row">',
          '<span><i class="ph ph-hard-drive"></i> Container ', inst.disk, ' GB</span>',
          '<span><i class="ph ph-database"></i> Volume ', inst.volume, ' GB</span>',
          '<span class="sl-config-date"><i class="ph ph-calendar-blank"></i> Deployed ', deployedStr, '</span>',
        '</div>',

        /* Controls */
        '<div class="sl-controls">', controls, '</div>',

        /* Running shimmer bar */
        isRunning ? '<div class="sl-pulse-bar"><div class="sl-pulse-fill"></div></div>' : '',

      '</div>'
    ].join('');
  }

  function mkBtn(onclick, icon, label, cls) {
    return [
      '<button class="sl-btn ', cls, '" onclick="', onclick, '" title="', label, '">',
      '<i class="ph-bold ', icon, '"></i> ', label,
      '</button>'
    ].join('');
  }

  /* ══════════════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════════════ */
  function find(id) {
    return _instances.find(function (i) { return i.id === id; }) || null;
  }

  function fmtUptime(s) {
    var h   = Math.floor(s / 3600);
    var m   = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    var out = '';
    if (h) out += h + 'h ';
    if (m || h) out += m + 'm ';
    out += ('0' + sec).slice(-2) + 's';
    return out;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  /* ══════════════════════════════════════════════════════════════════
     TAB SWITCHER
  ══════════════════════════════════════════════════════════════════ */
  function switchToServerlessTab() {
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-target') === 'tab-serverless');
    });
    document.querySelectorAll('.tab-content').forEach(function (tc) {
      tc.classList.toggle('active', tc.id === 'tab-serverless');
    });
    var hdr = document.querySelector('.header-title');
    if (hdr) hdr.textContent = 'Serverless Endpoints';
  }

  /* ══════════════════════════════════════════════════════════════════
     TOAST
  ══════════════════════════════════════════════════════════════════ */
  function toast(msg) {
    var old = document.getElementById('slToast');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var el = document.createElement('div');
    el.id = 'slToast';
    el.textContent = msg;
    Object.assign(el.style, {
      position:'fixed', bottom:'28px', left:'50%',
      transform:'translateX(-50%)',
      background:'#1e1e24',
      border:'1px solid rgba(138,180,248,0.25)',
      color:'#f8f9fa', padding:'10px 22px',
      borderRadius:'9999px', fontSize:'13px', fontWeight:'600',
      fontFamily:"'Inter',sans-serif", zIndex:'9999',
      boxShadow:'0 4px 24px rgba(0,0,0,0.5)',
      opacity:'0', transition:'opacity 0.25s', whiteSpace:'nowrap'
    });
    document.body.appendChild(el);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { el.style.opacity = '1'; });
    });
    setTimeout(function () {
      el.style.opacity = '0';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
    }, 3200);
  }

  /* ══════════════════════════════════════════════════════════════════
     CSS – injected once
  ══════════════════════════════════════════════════════════════════ */
  function injectCSS() {
    if (document.getElementById('slStyles')) return;
    var s = document.createElement('style');
    s.id = 'slStyles';
    s.textContent = [

      /* Empty state */
      '.sl-empty{text-align:center;padding:72px 20px 40px;color:#5f6368;}',
      '.sl-empty-icon{font-size:52px;margin-bottom:18px;}',
      '.sl-empty-icon i{background:linear-gradient(135deg,#8ab4f8,#c58af9);',
        '-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;}',
      '.sl-empty h3{font-size:17px;font-weight:600;color:#9aa0a6;margin-bottom:10px;}',
      '.sl-empty p{font-size:13px;color:#5f6368;line-height:1.75;max-width:300px;margin:0 auto;}',

      /* Top bar */
      '.sl-topbar{display:flex;justify-content:space-between;align-items:center;',
        'margin-bottom:20px;flex-wrap:wrap;gap:10px;}',
      '.sl-topbar-left{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}',
      '.sl-topbar-title{font-size:15px;font-weight:700;color:#f8f9fa;',
        'display:flex;align-items:center;gap:6px;}',
      '.sl-topbar-title i{color:#8ab4f8;}',
      '.sl-instance-pill{background:#1e1e24;border:1px solid rgba(255,255,255,0.08);',
        'color:#9aa0a6;font-size:11px;font-weight:600;padding:3px 9px;border-radius:9999px;}',
      '.sl-running-pill{background:rgba(129,201,149,0.1);border:1px solid rgba(129,201,149,0.25);',
        'color:#81c995;font-size:11px;font-weight:700;padding:3px 9px;border-radius:9999px;',
        'display:inline-flex;align-items:center;gap:5px;}',

      /* Blink dot */
      '.sl-blink{width:7px;height:7px;border-radius:50%;background:#81c995;display:inline-block;',
        'animation:slBlink 1.4s ease-in-out infinite;}',
      '@keyframes slBlink{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.25;transform:scale(0.6)}}',

      /* Balance chip */
      '.sl-balance-chip{display:inline-flex;align-items:center;gap:6px;',
        'background:#0a0a0c;border:1px solid rgba(138,180,248,0.2);',
        'border-radius:9999px;padding:6px 14px;',
        'font-size:13px;font-weight:700;font-family:"JetBrains Mono",monospace;color:#81c995;}',
      '.sl-balance-chip i{font-size:14px;color:#8ab4f8;}',

      /* Card */
      '.sl-card{background:#131316;border:1px solid rgba(255,255,255,0.07);',
        'border-radius:20px;padding:22px;margin-bottom:16px;',
        'position:relative;overflow:hidden;',
        'transition:border-color 0.2s,box-shadow 0.2s;}',
      '.sl-card:hover{border-color:rgba(138,180,248,0.2);',
        'box-shadow:0 0 28px rgba(138,180,248,0.06);}',
      '.sl-card-running{border-color:rgba(129,201,149,0.15);}',
      '.sl-card-paused{border-color:rgba(253,214,99,0.12);}',
      '.sl-card-stopped{opacity:0.7;}',

      /* Accent stripe */
      '.sl-card-accent{position:absolute;top:0;left:0;right:0;height:2px;}',
      '.sl-card-running .sl-card-accent{background:linear-gradient(90deg,#81c995,#8ab4f8);}',
      '.sl-card-paused .sl-card-accent{background:linear-gradient(90deg,#fdd663,#f97316);}',
      '.sl-card-stopped .sl-card-accent{background:rgba(255,255,255,0.07);}',

      /* Card head */
      '.sl-card-head{display:flex;justify-content:space-between;align-items:flex-start;',
        'margin-bottom:16px;gap:12px;}',
      '.sl-title-row{display:flex;align-items:center;gap:12px;}',
      '.sl-card-icon{width:42px;height:42px;background:#1e1e24;border-radius:12px;',
        'display:flex;align-items:center;justify-content:center;font-size:22px;',
        'color:#c58af9;border:1px solid rgba(255,255,255,0.07);flex-shrink:0;}',
      '.sl-card-name{font-size:15px;font-weight:600;color:#f8f9fa;margin-bottom:3px;}',
      '.sl-card-sub{font-size:11px;color:#5f6368;font-family:"JetBrains Mono",monospace;}',

      /* State badge */
      '.sl-state-badge{padding:4px 11px;border-radius:9999px;font-size:11px;',
        'font-weight:700;white-space:nowrap;flex-shrink:0;}',
      '.sl-state-running{background:rgba(129,201,149,0.1);color:#81c995;',
        'border:1px solid rgba(129,201,149,0.25);}',
      '.sl-state-paused{background:rgba(253,214,99,0.1);color:#fdd663;',
        'border:1px solid rgba(253,214,99,0.25);}',
      '.sl-state-stopped{background:rgba(242,139,130,0.1);color:#f28b82;',
        'border:1px solid rgba(242,139,130,0.25);}',

      /* Stats grid */
      '.sl-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;',
        'background:#0a0a0c;border:1px solid rgba(255,255,255,0.05);',
        'border-radius:10px;padding:14px;margin-bottom:12px;}',
      '@media(max-width:580px){.sl-stats{grid-template-columns:repeat(2,1fr);}}',
      '.sl-stat{display:flex;flex-direction:column;gap:5px;}',
      '.sl-stat-lbl{font-size:10px;color:#5f6368;text-transform:uppercase;',
        'font-weight:600;letter-spacing:0.5px;}',
      '.sl-stat-val{font-size:13px;font-weight:600;color:#f8f9fa;',
        'font-family:"JetBrains Mono",monospace;}',
      '.sl-unit{font-size:10px;color:#5f6368;margin-left:1px;}',
      '.sl-val-cost{color:#8ab4f8 !important;}',
      '.sl-val-bal{color:#81c995 !important;}',

      /* Config row */
      '.sl-config-row{display:flex;flex-wrap:wrap;gap:16px;',
        'font-size:11px;color:#5f6368;margin-bottom:14px;}',
      '.sl-config-row i{margin-right:3px;color:#9aa0a6;}',
      '.sl-config-date{margin-left:auto;}',

      /* Controls */
      '.sl-controls{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}',
      '.sl-btn{display:inline-flex;align-items:center;gap:6px;',
        'padding:7px 15px;border-radius:8px;font-size:12px;font-weight:600;',
        'border:1px solid;cursor:pointer;transition:all 0.15s;',
        'font-family:"Inter",sans-serif;line-height:1;}',
      '.sl-btn-play{background:rgba(129,201,149,0.09);border-color:rgba(129,201,149,0.3);color:#81c995;}',
      '.sl-btn-play:hover{background:#81c995;color:#000;border-color:#81c995;}',
      '.sl-btn-pause{background:rgba(253,214,99,0.09);border-color:rgba(253,214,99,0.3);color:#fdd663;}',
      '.sl-btn-pause:hover{background:#fdd663;color:#000;border-color:#fdd663;}',
      '.sl-btn-stop{background:rgba(242,139,130,0.09);border-color:rgba(242,139,130,0.3);color:#f28b82;}',
      '.sl-btn-stop:hover{background:#f28b82;color:#000;border-color:#f28b82;}',
      '.sl-btn-remove{background:rgba(255,255,255,0.03);border-color:rgba(255,255,255,0.08);',
        'color:#5f6368;padding:7px 10px;margin-left:auto;}',
      '.sl-btn-remove:hover{background:rgba(242,139,130,0.15);',
        'border-color:rgba(242,139,130,0.3);color:#f28b82;}',

      /* Animated running bar */
      '.sl-pulse-bar{position:absolute;bottom:0;left:0;right:0;height:2px;',
        'background:rgba(255,255,255,0.04);}',
      '.sl-pulse-fill{height:100%;',
        'background:linear-gradient(90deg,transparent,#8ab4f8,#c58af9,#8ab4f8,transparent);',
        'background-size:300% 100%;',
        'animation:slSweep 2.2s linear infinite;}',
      '@keyframes slSweep{0%{background-position:100% 0}100%{background-position:-100% 0}}',

    ].join('');
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════════════════════════
     BOOT
  ══════════════════════════════════════════════════════════════════ */
  function boot() {
    injectCSS();
    loadState();
    renderAll();

    /* Re-render when Serverless tab is clicked */
    document.querySelectorAll('.tab[data-target="tab-serverless"]').forEach(function (t) {
      t.addEventListener('click', function () {
        setTimeout(renderAll, 20);
      });
    });

    /* Start ticker for any already-running instances */
    if (_instances.some(function (i) { return i.state === 'running'; })) {
      startTicker();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

}(window));
