/* ═══════════════════════════════════════════════════════════
   T1ERA MODEL PICKER — t1era-model-picker.js
   Injects an overlay popup into spark22. No new window/tab.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── CSS ── */
  var STYLE = `
    /* overlay backdrop */
    #t1mpOverlay {
      position: fixed;
      inset: 0;
      z-index: 900;
      background: rgba(0,0,0,0.72);
      backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.22s ease;
    }
    #t1mpOverlay.open {
      opacity: 1;
      pointer-events: all;
    }

    /* popup sheet */
    #t1mpSheet {
      background: #111111;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 20px;
      width: 100%;
      max-width: 460px;
      max-height: 88vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: translateY(20px) scale(0.97);
      transition: transform 0.24s cubic-bezier(0.4,0,0.2,1);
      box-shadow: 0 24px 64px rgba(0,0,0,0.7);
    }
    #t1mpOverlay.open #t1mpSheet {
      transform: translateY(0) scale(1);
    }

    /* header */
    #t1mpHeader {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 18px 0;
      flex-shrink: 0;
    }
    .t1mp-logo {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: "Orbitron", sans-serif;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: rgba(255,255,255,0.65);
    }
    .t1mp-logo-mark {
      width: 26px; height: 26px;
      border-radius: 7px;
      background: linear-gradient(135deg, #c2185b, #8b5cf6);
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: 900; color: #fff;
      box-shadow: 0 0 10px rgba(194,24,91,0.3);
    }
    .t1mp-close {
      width: 30px; height: 30px;
      border-radius: 50%;
      border: 1px solid rgba(255,255,255,0.08);
      background: none;
      color: rgba(255,255,255,0.35);
      font-size: 15px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    .t1mp-close:hover { background: rgba(255,255,255,0.06); color: #fff; }

    /* title */
    .t1mp-title-wrap {
      padding: 14px 18px 16px;
      flex-shrink: 0;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .t1mp-title {
      font-family: "Orbitron", sans-serif;
      font-size: 16px; font-weight: 900;
      letter-spacing: 0.04em; color: #fff;
      margin-bottom: 3px;
    }
    .t1mp-sub {
      font-family: "Fira Code", monospace;
      font-size: 11px;
      color: rgba(255,255,255,0.35);
    }

    /* scrollable model list */
    .t1mp-list {
      flex: 1;
      overflow-y: auto;
      padding: 14px 14px 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .t1mp-list::-webkit-scrollbar { width: 3px; }
    .t1mp-list::-webkit-scrollbar-thumb { background: rgba(194,24,91,0.3); border-radius: 4px; }

    /* model card */
    .t1mp-card {
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.08);
      background: #141414;
      cursor: pointer;
      overflow: hidden;
      transition: border-color 0.18s, box-shadow 0.18s;
      position: relative;
    }
    .t1mp-card:hover { border-color: rgba(255,255,255,0.16); }
    .t1mp-card[data-model="v1"]:hover  { border-color: rgba(16,185,129,0.45); box-shadow: 0 0 18px rgba(16,185,129,0.14); }
    .t1mp-card[data-model="v2"]:hover  { border-color: rgba(139,92,246,0.45); box-shadow: 0 0 18px rgba(139,92,246,0.14); }
    .t1mp-card[data-model="v22"]:hover { border-color: rgba(233,30,140,0.45); box-shadow: 0 0 18px rgba(233,30,140,0.14); }
    .t1mp-card.selected[data-model="v1"]  { border-color: #10b981; box-shadow: 0 0 20px rgba(16,185,129,0.2); }
    .t1mp-card.selected[data-model="v2"]  { border-color: #8b5cf6; box-shadow: 0 0 20px rgba(139,92,246,0.2); }
    .t1mp-card.selected[data-model="v22"] { border-color: #e91e8c; box-shadow: 0 0 20px rgba(233,30,140,0.2); }

    /* top accent strip */
    .t1mp-strip {
      height: 3px;
    }
    .t1mp-card[data-model="v1"]  .t1mp-strip { background: linear-gradient(90deg, #10b981, transparent); }
    .t1mp-card[data-model="v2"]  .t1mp-strip { background: linear-gradient(90deg, #8b5cf6, transparent); }
    .t1mp-card[data-model="v22"] .t1mp-strip { background: linear-gradient(90deg, #e91e8c, transparent); }

    .t1mp-card-body { padding: 14px; }

    /* card head row */
    .t1mp-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
    }
    .t1mp-name-wrap { flex: 1; min-width: 0; }
    .t1mp-name {
      font-family: "Orbitron", sans-serif;
      font-size: 12px; font-weight: 800;
      letter-spacing: 0.05em;
      margin-bottom: 2px;
    }
    .t1mp-card[data-model="v1"]  .t1mp-name { color: #10b981; }
    .t1mp-card[data-model="v2"]  .t1mp-name { color: #8b5cf6; }
    .t1mp-card[data-model="v22"] .t1mp-name { color: #e91e8c; }
    .t1mp-ver {
      font-family: "Fira Code", monospace;
      font-size: 9px;
      color: rgba(255,255,255,0.3);
      letter-spacing: 0.05em;
    }
    .t1mp-badge {
      font-family: "Fira Code", monospace;
      font-size: 8px; font-weight: 700;
      letter-spacing: 0.08em;
      padding: 3px 8px; border-radius: 100px;
      white-space: nowrap; flex-shrink: 0;
    }
    .t1mp-card[data-model="v1"]  .t1mp-badge { background: rgba(16,185,129,0.1);  border: 1px solid rgba(16,185,129,0.25);  color: #10b981; }
    .t1mp-card[data-model="v2"]  .t1mp-badge { background: rgba(139,92,246,0.1);  border: 1px solid rgba(139,92,246,0.25);  color: #8b5cf6; }
    .t1mp-card[data-model="v22"] .t1mp-badge { background: rgba(233,30,140,0.1);  border: 1px solid rgba(233,30,140,0.25);  color: #e91e8c; }

    /* description */
    .t1mp-desc {
      font-size: 12px;
      color: rgba(255,255,255,0.6);
      line-height: 1.55;
      margin-bottom: 10px;
    }

    /* tags */
    .t1mp-tags {
      display: flex; flex-wrap: wrap; gap: 5px;
      margin-bottom: 12px;
    }
    .t1mp-tag {
      display: flex; align-items: center; gap: 4px;
      padding: 3px 8px; border-radius: 100px;
      font-size: 9px; font-family: "Fira Code", monospace;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.03);
      color: rgba(255,255,255,0.35);
    }

    /* expandable detail — appears on PC hover, tap to expand on mobile */
    .t1mp-detail {
      overflow: hidden;
      max-height: 0;
      opacity: 0;
      transition: max-height 0.26s ease, opacity 0.2s ease;
    }
    .t1mp-card:hover .t1mp-detail,
    .t1mp-card.open .t1mp-detail {
      max-height: 100px;
      opacity: 1;
    }
    .t1mp-detail-inner {
      border-top: 1px solid rgba(255,255,255,0.06);
      padding: 10px 0 4px;
      display: flex; flex-direction: column; gap: 5px;
    }
    .t1mp-detail-row {
      display: flex; align-items: center; gap: 8px;
      font-size: 11px;
      color: rgba(255,255,255,0.35);
    }
    .t1mp-detail-row strong { color: rgba(255,255,255,0.65); font-weight: 600; }

    /* select button */
    .t1mp-btn {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      width: 100%; padding: 9px;
      border-radius: 8px; border: none;
      font-family: "Orbitron", sans-serif;
      font-size: 9px; font-weight: 700;
      letter-spacing: 0.06em; color: #fff;
      cursor: pointer;
    }
    .t1mp-card[data-model="v1"]  .t1mp-btn { background: linear-gradient(135deg, #10b981, #059669); }
    .t1mp-card[data-model="v2"]  .t1mp-btn { background: linear-gradient(135deg, #8b5cf6, #7c3aed); }
    .t1mp-card[data-model="v22"] .t1mp-btn { background: linear-gradient(135deg, #e91e8c, #c2185b); }

    /* selected checkmark */
    .t1mp-check {
      position: absolute; top: 10px; right: 10px;
      width: 20px; height: 20px; border-radius: 50%;
      background: #10b981;
      display: none; align-items: center; justify-content: center;
      font-size: 11px; color: #fff;
    }
    .t1mp-card.selected .t1mp-check { display: flex; }

    /* footer */
    .t1mp-footer {
      padding: 10px 18px 14px;
      flex-shrink: 0;
      border-top: 1px solid rgba(255,255,255,0.06);
      font-family: "Fira Code", monospace;
      font-size: 9px;
      color: rgba(255,255,255,0.25);
      text-align: center;
    }
  `;

  /* ── HTML ── */
  var HTML = `
    <div id="t1mpOverlay" onclick="t1mpBgClose(event)">
      <div id="t1mpSheet">

        <div id="t1mpHeader">
          <div class="t1mp-logo">
            <div class="t1mp-logo-mark">T1</div>
            T1ERA AI
          </div>
          <button class="t1mp-close" onclick="closeModelPicker()">
            <i class="ph-bold ph-x"></i>
          </button>
        </div>

        <div class="t1mp-title-wrap">
          <div class="t1mp-title">Choose Model</div>
          <div class="t1mp-sub">Select your T1ERA AI model</div>
        </div>

        <div class="t1mp-list">

          <!-- V1.1 -->
          <div class="t1mp-card" data-model="v1" id="t1mpCard-v1"
               onclick="t1mpCardClick('T1x.V1.1','v1',event)">
            <div class="t1mp-strip"></div>
            <div class="t1mp-check"><i class="ph-bold ph-check"></i></div>
            <div class="t1mp-card-body">
              <div class="t1mp-head">
                <div class="t1mp-name-wrap">
                  <div class="t1mp-name">T1ERA T1x.V1.1</div>
                  <div class="t1mp-ver">Version 1.1 · Standard</div>
                </div>
                <span class="t1mp-badge">EFFICIENT</span>
              </div>
              <p class="t1mp-desc">
                Built for structured thinking, deep analysis, web search and summarising. Accurate, concise answers at the lowest cost — ideal for research and quick queries.
              </p>
              <div class="t1mp-tags">
                <span class="t1mp-tag"><i class="ph-bold ph-magnifying-glass"></i> Search</span>
                <span class="t1mp-tag"><i class="ph-bold ph-brain"></i> Analyse</span>
                <span class="t1mp-tag"><i class="ph-bold ph-list-bullets"></i> Summarise</span>
                <span class="t1mp-tag"><i class="ph-bold ph-coin"></i> Low Cost</span>
              </div>
              <div class="t1mp-detail">
                <div class="t1mp-detail-inner">
                  <div class="t1mp-detail-row">
                    <i class="ph-bold ph-lightning"></i>
                    <span>Best for: <strong>Research, fact-checking, quick Q&amp;A</strong></span>
                  </div>
                  <div class="t1mp-detail-row">
                    <i class="ph-bold ph-chart-bar"></i>
                    <span>Strength: <strong>Accuracy &amp; structured reasoning</strong></span>
                  </div>
                </div>
              </div>
              <button class="t1mp-btn"
                onclick="t1mpSelect('T1x.V1.1','v1'); event.stopPropagation()">
                <i class="ph-bold ph-check-circle"></i> Select T1x.V1.1
              </button>
            </div>
          </div>

          <!-- V2.1 -->
          <div class="t1mp-card" data-model="v2" id="t1mpCard-v2"
               onclick="t1mpCardClick('T1x.V2.1','v2',event)">
            <div class="t1mp-strip"></div>
            <div class="t1mp-check"><i class="ph-bold ph-check"></i></div>
            <div class="t1mp-card-body">
              <div class="t1mp-head">
                <div class="t1mp-name-wrap">
                  <div class="t1mp-name">T1ERA T1x.V2.1</div>
                  <div class="t1mp-ver">Version 2.1 · Dynamic</div>
                </div>
                <span class="t1mp-badge">DYNAMIC</span>
              </div>
              <p class="t1mp-desc">
                Everything in V1.1, plus natural conversation, copywriting and storytelling. Proper tone and vocabulary across Bahasa Malaysia, English and other languages — perfect for texting and creative content.
              </p>
              <div class="t1mp-tags">
                <span class="t1mp-tag"><i class="ph-bold ph-chat-circle-text"></i> Conversation</span>
                <span class="t1mp-tag"><i class="ph-bold ph-pencil-simple-line"></i> Copywriting</span>
                <span class="t1mp-tag"><i class="ph-bold ph-book-open"></i> Storytelling</span>
                <span class="t1mp-tag"><i class="ph-bold ph-globe"></i> Multilingual</span>
              </div>
              <div class="t1mp-detail">
                <div class="t1mp-detail-inner">
                  <div class="t1mp-detail-row">
                    <i class="ph-bold ph-lightning"></i>
                    <span>Best for: <strong>Content, copywriting, BM/EN texting</strong></span>
                  </div>
                  <div class="t1mp-detail-row">
                    <i class="ph-bold ph-chart-bar"></i>
                    <span>Strength: <strong>Natural language &amp; multilingual tone</strong></span>
                  </div>
                </div>
              </div>
              <button class="t1mp-btn"
                onclick="t1mpSelect('T1x.V2.1','v2'); event.stopPropagation()">
                <i class="ph-bold ph-check-circle"></i> Select T1x.V2.1
              </button>
            </div>
          </div>

          <!-- V2.2 Pro -->
          <div class="t1mp-card" data-model="v22" id="t1mpCard-v22"
               onclick="t1mpCardClick('T1x.V2.2 Pro','v22',event)">
            <div class="t1mp-strip"></div>
            <div class="t1mp-check"><i class="ph-bold ph-check"></i></div>
            <div class="t1mp-card-body">
              <div class="t1mp-head">
                <div class="t1mp-name-wrap">
                  <div class="t1mp-name">T1ERA T1x.V2.2 Pro</div>
                  <div class="t1mp-ver">Version 2.2 Pro · Advanced</div>
                </div>
                <span class="t1mp-badge">PRO</span>
              </div>
              <p class="t1mp-desc">
                The most capable T1ERA model. Builds on all of V2.1's strengths with deeper reasoning, richer output and higher precision across every task — from complex analysis to premium creative work.
              </p>
              <div class="t1mp-tags">
                <span class="t1mp-tag"><i class="ph-bold ph-sparkle"></i> Advanced</span>
                <span class="t1mp-tag"><i class="ph-bold ph-brain"></i> Deep Reasoning</span>
                <span class="t1mp-tag"><i class="ph-bold ph-star"></i> Premium Output</span>
                <span class="t1mp-tag"><i class="ph-bold ph-rocket-launch"></i> High Precision</span>
              </div>
              <div class="t1mp-detail">
                <div class="t1mp-detail-inner">
                  <div class="t1mp-detail-row">
                    <i class="ph-bold ph-lightning"></i>
                    <span>Best for: <strong>Complex tasks, premium creative work</strong></span>
                  </div>
                  <div class="t1mp-detail-row">
                    <i class="ph-bold ph-chart-bar"></i>
                    <span>Strength: <strong>Highest capability across all domains</strong></span>
                  </div>
                </div>
              </div>
              <button class="t1mp-btn"
                onclick="t1mpSelect('T1x.V2.2 Pro','v22'); event.stopPropagation()">
                <i class="ph-bold ph-check-circle"></i> Select T1x.V2.2 Pro
              </button>
            </div>
          </div>

        </div><!-- end t1mp-list -->

        <div class="t1mp-footer">
          T1ERA AI Models · Integrations coming soon
        </div>

      </div><!-- end t1mpSheet -->
    </div><!-- end t1mpOverlay -->
  `;

  /* ── Inject style + HTML on DOM ready ── */
  function inject() {
    /* style */
    var styleEl = document.createElement('style');
    styleEl.textContent = STYLE;
    document.head.appendChild(styleEl);

    /* overlay HTML */
    var wrapper = document.createElement('div');
    wrapper.innerHTML = HTML;
    document.body.appendChild(wrapper.firstElementChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }

  /* ── Public API — attached to window so spark22 inline handlers can call them ── */

  window.openModelPicker = function () {
    var ov = document.getElementById('t1mpOverlay');
    if (!ov) return;
    /* mark current model as selected */
    t1mpMarkSelected(window._activeModel || 'T1x.V1.1');
    ov.classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  window.closeModelPicker = function () {
    var ov = document.getElementById('t1mpOverlay');
    if (!ov) return;
    ov.classList.remove('open');
    document.body.style.overflow = '';
  };

  window.t1mpBgClose = function (e) {
    if (e.target.id === 't1mpOverlay') window.closeModelPicker();
  };

  /* card click — on mobile toggle expand; on desktop hover already handles it */
  window.t1mpCardClick = function (modelId, variant, e) {
    /* if click is directly on the button, let button handler run */
    if (e.target.closest('.t1mp-btn')) return;
    /* toggle expanded details on mobile */
    var card = document.getElementById('t1mpCard-' + variant);
    if (card) card.classList.toggle('open');
  };

  window.t1mpSelect = function (modelId, variant) {
    t1mpMarkSelected(modelId);
    /* call back into spark22's setActiveModel */
    if (typeof window.setActiveModel === 'function') {
      window.setActiveModel(modelId);
    }
    setTimeout(window.closeModelPicker, 280);
  };

  function t1mpMarkSelected(modelId) {
    var map = { 'T1x.V1.1': 'v1', 'T1x.V2.1': 'v2', 'T1x.V2.2 Pro': 'v22' };
    document.querySelectorAll('.t1mp-card').forEach(function (c) {
      c.classList.remove('selected');
    });
    var variant = map[modelId];
    if (variant) {
      var card = document.getElementById('t1mpCard-' + variant);
      if (card) card.classList.add('selected');
    }
  }

})();
