/**
 * T1ERA Paste Handler v2
 * - Detects long pastes (300+ chars) in the message input
 * - Auto-detects language/format (Python, JS, JSON, SQL, etc.)
 * - Shows animated popup preview above the input field
 * - Chip bar collapses the snippet so input stays clean
 */

class PasteHandler {
    constructor(inputEl, onAttach) {
        this.input       = inputEl;
        this.onAttach    = onAttach;
        this.THRESHOLD   = 300;
        this.pendingText = null;
        this.detectedLang = null;

        this._injectStyles();
        this._buildPopup();
        this._wireChip();
        this._bindPaste();
    }

    // ─── LANGUAGE DETECTION ──────────────────────────────────────────────────

    detect(text) {
        const t = text.trim();

        if (/^\s*[{[]/.test(t) && this._validJSON(t))
            return { lang:'json',       label:'JSON',        icon:'{}',  color:'#cbcb41' };
        if (/\bdef\s+\w+\s*\(|^\s*(import|from)\s+\w+|print\s*\(/m.test(t))
            return { lang:'python',     label:'Python',      icon:'Py',  color:'#3776ab' };
        if (/:\s*(string|number|boolean|any|void)\b|interface\s+\w+/.test(t))
            return { lang:'typescript', label:'TypeScript',  icon:'TS',  color:'#3178c6' };
        if (/\b(const|let|var)\s+\w+|=>\s*{|require\s*\(|console\.log/.test(t))
            return { lang:'javascript', label:'JavaScript',  icon:'JS',  color:'#f7df1e' };
        if (/<(!DOCTYPE|html|head|body|div|span|p\b|script)[^>]*>/i.test(t))
            return { lang:'html',       label:'HTML',        icon:'</>',  color:'#e34c26' };
        if (/\b[.#]?\w+\s*\{[^}]*:[^}]+\}/.test(t))
            return { lang:'css',        label:'CSS',         icon:'{}',  color:'#1572b6' };
        if (/\b(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/i.test(t))
            return { lang:'sql',        label:'SQL',         icon:'DB',  color:'#4479a1' };
        if (/^#!/.test(t) || /\b(sudo|apt|npm|pip|echo|chmod|grep|curl)\b/.test(t))
            return { lang:'bash',       label:'Bash/Shell',  icon:'$_',  color:'#4eaa25' };
        if (/\bpublic\s+(class|static|void)\b|System\.out\.print/.test(t))
            return { lang:'java',       label:'Java',        icon:'☕',  color:'#007396' };
        if (/\bfunc\s+\w+\s*\(|package\s+main/.test(t))
            return { lang:'go',         label:'Go',          icon:'Go',  color:'#00add8' };
        if (/\bfn\s+\w+\s*\(|let\s+mut\s/.test(t))
            return { lang:'rust',       label:'Rust',        icon:'Rs',  color:'#ce422b' };
        if (/^[\w\-]+:\s*.+$/m.test(t) && /^\s{2}\w/m.test(t))
            return { lang:'yaml',       label:'YAML',        icon:'⚙',  color:'#cb171e' };
        if (/<\?xml|<\/\w+>/.test(t))
            return { lang:'xml',        label:'XML',         icon:'</>',  color:'#e34c26' };

        return { lang:'plaintext', label:'Plain Text', icon:'📄', color:'#888888' };
    }

    _validJSON(s) { try { JSON.parse(s); return true; } catch { return false; } }

    // ─── BUILD POPUP ─────────────────────────────────────────────────────────

    _buildPopup() {
        // Insert popup INSIDE .input-area, ABOVE .input-wrapper
        const inputArea = this.input.closest('.input-area');
        const inputWrapper = this.input.closest('.input-wrapper');

        this.popup = document.createElement('div');
        this.popup.className = 'ph-popup';
        this.popup.innerHTML = `
            <div class="ph-popup-header">
                <div class="ph-popup-left">
                    <span class="ph-icon"></span>
                    <span class="ph-label"></span>
                    <span class="ph-meta"></span>
                </div>
                <div class="ph-popup-right">
                    <button class="ph-btn ph-send-inline">Send as text</button>
                    <button class="ph-btn ph-btn-accent ph-attach">Attach snippet</button>
                    <button class="ph-dismiss">✕</button>
                </div>
            </div>
            <div class="ph-preview-wrap">
                <pre class="ph-preview-code"></pre>
            </div>
        `;

        // Insert before input-wrapper
        inputArea.insertBefore(this.popup, inputWrapper);

        this.popup.querySelector('.ph-dismiss').addEventListener('click', () => this._closePopup());
        this.popup.querySelector('.ph-send-inline').addEventListener('click', () => this._sendInline());
        this.popup.querySelector('.ph-attach').addEventListener('click', () => this._attachSnippet());
    }

    _wireChip() {
        // Chip bar is already in the HTML — just grab references
        this.chipBar    = document.getElementById('pasteChipBar');
        this.chipIcon   = document.getElementById('pasteChipIcon');
        this.chipLabel  = document.getElementById('pasteChipLabel');
        this.chipSize   = document.getElementById('pasteChipSize');
        const removeBtn = document.getElementById('pasteChipRemove');
        if (removeBtn) removeBtn.addEventListener('click', () => this._removeChip());
    }

    // ─── PASTE EVENT ─────────────────────────────────────────────────────────

    _bindPaste() {
        this.input.addEventListener('paste', (e) => {
            const text = e.clipboardData?.getData('text') || '';
            if (text.length >= this.THRESHOLD) {
                e.preventDefault();
                this._openPopup(text);
            }
        });
    }

    // ─── POPUP ACTIONS ───────────────────────────────────────────────────────

    _openPopup(text) {
        this.pendingText  = text;
        this.detectedLang = this.detect(text);
        const lang        = this.detectedLang;

        // Fill header
        const iconEl  = this.popup.querySelector('.ph-icon');
        const labelEl = this.popup.querySelector('.ph-label');
        const metaEl  = this.popup.querySelector('.ph-meta');
        iconEl.textContent  = lang.icon;
        iconEl.style.color  = lang.color;
        labelEl.textContent = lang.label;
        labelEl.style.color = lang.color;
        const lines = text.split('\n').length;
        metaEl.textContent  = `${text.length.toLocaleString()} chars · ${lines} line${lines !== 1 ? 's' : ''}`;

        // Preview — first 40 lines
        const preview = text.split('\n').slice(0, 40).join('\n')
            + (lines > 40 ? '\n\n…and more' : '');
        const pre = this.popup.querySelector('.ph-preview-code');
        pre.textContent = preview;

        this.popup.classList.add('ph-visible');
    }

    _closePopup() {
        this.popup.classList.remove('ph-visible');
        this.pendingText = null;
    }

    _sendInline() {
        if (!this.pendingText) return;
        this.input.value = this.pendingText;
        this.input.dispatchEvent(new Event('input'));
        this._closePopup();
        this.input.focus();
    }

    _attachSnippet() {
        if (!this.pendingText) return;

        const attached = { content: this.pendingText, lang: this.detectedLang };

        // Update chip
        if (this.chipBar && this.chipIcon && this.chipLabel && this.chipSize) {
            this.chipIcon.textContent  = this.detectedLang.icon;
            this.chipIcon.style.color  = this.detectedLang.color;
            this.chipLabel.textContent = this.detectedLang.label + ' snippet';
            this.chipSize.textContent  = this.pendingText.length.toLocaleString() + ' chars';

            const chip = document.getElementById('pasteChip');
            if (chip) {
                chip.style.borderColor = this.detectedLang.color + '55';
            }

            this.chipBar.style.display = 'flex';
        }

        this._closePopup();
        this.input.focus();

        if (typeof this.onAttach === 'function') {
            this.onAttach(attached);
        }
    }

    _removeChip() {
        if (this.chipBar) this.chipBar.style.display = 'none';
        if (typeof this.onAttach === 'function') this.onAttach(null);
    }

    // ─── STYLES ──────────────────────────────────────────────────────────────

    _injectStyles() {
        if (document.getElementById('ph-styles')) return;
        const s = document.createElement('style');
        s.id = 'ph-styles';
        s.textContent = `
        /* ── PASTE POPUP ────────────────────────────────────────────────── */
        .ph-popup {
            max-width: 900px;
            margin: 0 auto;
            width: 100%;
            box-sizing: border-box;
            background: #12121a;
            border: 1px solid rgba(139,92,246,.4);
            border-bottom: none;
            border-radius: 14px 14px 0 0;
            overflow: hidden;
            display: grid;
            grid-template-rows: 0fr;
            transition: grid-template-rows .3s cubic-bezier(.4,0,.2,1),
                        opacity .25s ease,
                        margin .3s ease;
            opacity: 0;
            pointer-events: none;
        }

        .ph-popup.ph-visible {
            grid-template-rows: 1fr;
            opacity: 1;
            pointer-events: all;
            margin-bottom: 0;
        }

        /* inner wrapper needed for grid row animation */
        .ph-popup > * { overflow: hidden; }

        .ph-popup-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 9px 14px;
            background: rgba(139,92,246,.09);
            border-bottom: 1px solid rgba(255,255,255,.07);
            flex-wrap: wrap;
            gap: 8px;
        }

        .ph-popup-left {
            display: flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
            flex-wrap: wrap;
        }

        .ph-icon {
            font-size: 13px;
            font-weight: 800;
            font-family: 'Space Grotesk', monospace;
            flex-shrink: 0;
        }

        .ph-label {
            font-size: 12px;
            font-weight: 700;
            font-family: 'Space Grotesk', sans-serif;
            text-transform: uppercase;
            letter-spacing: .05em;
            flex-shrink: 0;
        }

        .ph-meta {
            font-size: 11px;
            color: rgba(255,255,255,.38);
            font-family: 'Space Grotesk', monospace;
        }

        .ph-popup-right {
            display: flex;
            align-items: center;
            gap: 7px;
            flex-shrink: 0;
        }

        .ph-btn {
            padding: 5px 12px;
            border-radius: 100px;
            font-size: 11px;
            font-weight: 600;
            font-family: 'Space Grotesk', sans-serif;
            cursor: pointer;
            border: 1px solid rgba(255,255,255,.15);
            background: rgba(255,255,255,.07);
            color: rgba(255,255,255,.75);
            transition: all .2s;
            white-space: nowrap;
        }

        .ph-btn:hover {
            background: rgba(139,92,246,.25);
            border-color: rgba(139,92,246,.5);
            color: #fff;
        }

        .ph-btn-accent {
            background: rgba(139,92,246,.18);
            border-color: rgba(139,92,246,.45);
            color: #a78bfa;
        }

        .ph-btn-accent:hover {
            background: rgba(139,92,246,.38);
            color: #fff;
        }

        .ph-dismiss {
            width: 26px;
            height: 26px;
            border-radius: 50%;
            border: 1px solid rgba(255,255,255,.14);
            background: rgba(255,255,255,.06);
            color: rgba(255,255,255,.45);
            font-size: 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all .2s;
            flex-shrink: 0;
        }

        .ph-dismiss:hover {
            background: rgba(255,80,80,.2);
            border-color: rgba(255,80,80,.4);
            color: #ff5050;
        }

        .ph-preview-wrap {
            overflow-x: auto;
            overflow-y: auto;
            max-height: 260px;
            -webkit-overflow-scrolling: touch;
        }

        .ph-preview-wrap::-webkit-scrollbar { width: 4px; height: 4px; }
        .ph-preview-wrap::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,.1);
            border-radius: 4px;
        }

        .ph-preview-code {
            margin: 0;
            padding: 12px 16px;
            font-family: 'Fira Code','Cascadia Code','Consolas',monospace;
            font-size: 12px;
            line-height: 1.55;
            color: #c9d1d9;
            white-space: pre;
            background: transparent;
            min-width: max-content;
        }

        /* ── CHIP BAR ───────────────────────────────────────────────────── */
        .paste-chip-bar {
            display: flex;
            align-items: center;
        }

        .paste-chip {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            padding: 5px 11px;
            background: rgba(139,92,246,.1);
            border: 1px solid rgba(139,92,246,.3);
            border-radius: 100px;
            font-size: 12px;
            font-family: 'Space Grotesk', sans-serif;
            max-width: 100%;
            box-sizing: border-box;
        }

        .paste-chip-icon {
            font-size: 13px;
            font-weight: 800;
            font-family: 'Space Grotesk', monospace;
            flex-shrink: 0;
        }

        .paste-chip-label {
            font-weight: 600;
            color: rgba(255,255,255,.85);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .paste-chip-size {
            font-size: 10px;
            color: rgba(255,255,255,.38);
            flex-shrink: 0;
        }

        .paste-chip-remove {
            background: none;
            border: none;
            color: rgba(255,255,255,.38);
            font-size: 11px;
            cursor: pointer;
            padding: 0 0 0 3px;
            line-height: 1;
            flex-shrink: 0;
            transition: color .2s;
        }

        .paste-chip-remove:hover { color: #ff5050; }

        /* ── MOBILE ─────────────────────────────────────────────────────── */
        @media (max-width: 768px) {
            .ph-popup-header { padding: 8px 12px; }
            .ph-btn { font-size: 10px; padding: 4px 10px; }
            .ph-preview-code { font-size: 11px; padding: 10px 12px; }
            .ph-preview-wrap { max-height: 200px; }
            .ph-dismiss { width: 24px; height: 24px; font-size: 11px; }
        }

        @media (max-width: 420px) {
            .ph-popup-header { flex-direction: column; align-items: flex-start; gap: 6px; }
            .ph-popup-right { width: 100%; justify-content: flex-end; }
        }
        `;
        document.head.appendChild(s);
    }
}
