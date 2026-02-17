/**
 * T1ERA Paste Handler v3
 * - Detects long pastes (300+ chars) in the message input
 * - Auto-detects language/format
 * - Shows compact popup above input field
 * - Chip collapses snippet so input stays clean
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
        if (/\b(const|let|var)\s+\w+|=>\s*\{|require\s*\(|console\.log/.test(t))
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
            return { lang:'java',       label:'Java',        icon:'Jv',  color:'#007396' };
        if (/\bfunc\s+\w+\s*\(|package\s+main/.test(t))
            return { lang:'go',         label:'Go',          icon:'Go',  color:'#00add8' };
        if (/\bfn\s+\w+\s*\(|let\s+mut\s/.test(t))
            return { lang:'rust',       label:'Rust',        icon:'Rs',  color:'#ce422b' };
        if (/^[\w\-]+:\s*.+$/m.test(t) && /^\s{2}\w/m.test(t))
            return { lang:'yaml',       label:'YAML',        icon:'YM',  color:'#cb171e' };
        if (/<\?xml|<\/\w+>/.test(t))
            return { lang:'xml',        label:'XML',         icon:'</>',  color:'#e34c26' };

        return { lang:'plaintext', label:'Plain Text', icon:'Aa', color:'#888888' };
    }

    _validJSON(s) { try { JSON.parse(s); return true; } catch { return false; } }

    // ─── BUILD POPUP ─────────────────────────────────────────────────────────

    _buildPopup() {
        const inputArea   = this.input.closest('.input-area');
        const inputWrapper = this.input.closest('.input-wrapper');

        this.popup = document.createElement('div');
        this.popup.className = 'ph-popup';
        this.popup.innerHTML =
            '<div class="ph-header">' +
              '<div class="ph-header-left">' +
                '<span class="ph-icon"></span>' +
                '<span class="ph-label"></span>' +
                '<span class="ph-meta"></span>' +
              '</div>' +
              '<div class="ph-header-right">' +
                '<button class="ph-btn ph-inline-btn">Send as text</button>' +
                '<button class="ph-btn ph-accent-btn ph-attach-btn">Attach snippet ✦</button>' +
                '<button class="ph-close">✕</button>' +
              '</div>' +
            '</div>' +
            '<div class="ph-preview-wrap">' +
              '<pre class="ph-preview-code"></pre>' +
            '</div>';

        // Insert before input-wrapper so it appears above it
        inputArea.insertBefore(this.popup, inputWrapper);

        this.popup.querySelector('.ph-close').addEventListener('click', () => this._close());
        this.popup.querySelector('.ph-inline-btn').addEventListener('click', () => this._sendInline());
        this.popup.querySelector('.ph-attach-btn').addEventListener('click', () => this._attach());
    }

    _wireChip() {
        this.chipBar  = document.getElementById('pasteChipBar');
        this.chipIcon = document.getElementById('pasteChipIcon');
        this.chipLabel= document.getElementById('pasteChipLabel');
        this.chipSize = document.getElementById('pasteChipSize');
        const rm = document.getElementById('pasteChipRemove');
        if (rm) rm.addEventListener('click', () => this._removeChip());
    }

    // ─── PASTE EVENT ─────────────────────────────────────────────────────────

    _bindPaste() {
        this.input.addEventListener('paste', (e) => {
            const text = (e.clipboardData || window.clipboardData).getData('text');
            if (text && text.length >= this.THRESHOLD) {
                e.preventDefault();
                this._open(text);
            }
        });
    }

    // ─── POPUP CONTROL ───────────────────────────────────────────────────────

    _open(text) {
        this.pendingText  = text;
        this.detectedLang = this.detect(text);
        const d = this.detectedLang;

        this.popup.querySelector('.ph-icon').textContent  = d.icon;
        this.popup.querySelector('.ph-icon').style.color  = d.color;
        this.popup.querySelector('.ph-label').textContent = d.label;
        this.popup.querySelector('.ph-label').style.color = d.color;

        const lines = text.split('\n').length;
        this.popup.querySelector('.ph-meta').textContent =
            text.length.toLocaleString() + ' chars · ' + lines + ' lines';

        const preview = text.split('\n').slice(0, 35).join('\n') +
            (lines > 35 ? '\n…' : '');
        this.popup.querySelector('.ph-preview-code').textContent = preview;

        // Show with max-height animation
        this.popup.style.display = 'flex';
        // Force reflow then animate
        this.popup.getBoundingClientRect();
        this.popup.classList.add('ph-visible');
    }

    _close() {
        this.popup.classList.remove('ph-visible');
        // Hide after transition
        setTimeout(() => {
            if (!this.popup.classList.contains('ph-visible')) {
                this.popup.style.display = 'none';
            }
        }, 300);
        this.pendingText = null;
    }

    _sendInline() {
        if (!this.pendingText) return;
        this.input.value = this.pendingText;
        this.input.dispatchEvent(new Event('input'));
        this._close();
        this.input.focus();
    }

    _attach() {
        if (!this.pendingText) return;
        const attached = { content: this.pendingText, lang: this.detectedLang };

        if (this.chipBar) {
            const d = this.detectedLang;
            if (this.chipIcon)  { this.chipIcon.textContent = d.icon; this.chipIcon.style.color = d.color; }
            if (this.chipLabel)   this.chipLabel.textContent = d.label + ' snippet';
            if (this.chipSize)    this.chipSize.textContent  = this.pendingText.length.toLocaleString() + ' chars';

            const chip = document.getElementById('pasteChip');
            if (chip) chip.style.borderColor = d.color + '66';

            this.chipBar.style.display = 'flex';
        }

        this._close();
        this.input.focus();

        if (typeof this.onAttach === 'function') this.onAttach(attached);
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
        /* ── PASTE POPUP ─────────────────────────────────────────────── */
        .ph-popup {
            display: none;
            flex-direction: column;
            max-width: 900px;
            margin: 0 auto;
            width: 100%;
            box-sizing: border-box;
            background: #0f0f1a;
            border: 1px solid rgba(139,92,246,.45);
            border-bottom: none;
            border-radius: 12px 12px 0 0;
            overflow: hidden;
            max-height: 0;
            opacity: 0;
            transition: max-height .32s cubic-bezier(.4,0,.2,1), opacity .25s ease;
        }

        .ph-popup.ph-visible {
            max-height: 320px;
            opacity: 1;
        }

        .ph-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 9px 14px;
            background: rgba(139,92,246,.1);
            border-bottom: 1px solid rgba(255,255,255,.07);
            gap: 8px;
            flex-wrap: wrap;
            flex-shrink: 0;
        }

        .ph-header-left {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
            min-width: 0;
        }

        .ph-icon {
            font-size: 12px;
            font-weight: 800;
            font-family: 'Space Grotesk', monospace;
            flex-shrink: 0;
            min-width: 20px;
            text-align: center;
        }

        .ph-label {
            font-size: 11px;
            font-weight: 700;
            font-family: 'Space Grotesk', sans-serif;
            text-transform: uppercase;
            letter-spacing: .06em;
            flex-shrink: 0;
        }

        .ph-meta {
            font-size: 10px;
            color: rgba(255,255,255,.35);
            font-family: 'Space Grotesk', monospace;
        }

        .ph-header-right {
            display: flex;
            align-items: center;
            gap: 7px;
            flex-shrink: 0;
        }

        .ph-btn {
            padding: 4px 11px;
            border-radius: 100px;
            font-size: 11px;
            font-weight: 600;
            font-family: 'Space Grotesk', sans-serif;
            cursor: pointer;
            border: 1px solid rgba(255,255,255,.14);
            background: rgba(255,255,255,.07);
            color: rgba(255,255,255,.7);
            transition: all .2s;
            white-space: nowrap;
        }

        .ph-btn:hover {
            background: rgba(139,92,246,.25);
            border-color: rgba(139,92,246,.5);
            color: #fff;
        }

        .ph-accent-btn {
            background: rgba(139,92,246,.2);
            border-color: rgba(139,92,246,.5);
            color: #c4b5fd;
        }

        .ph-accent-btn:hover {
            background: rgba(139,92,246,.4);
            color: #fff;
        }

        .ph-close {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            border: 1px solid rgba(255,255,255,.14);
            background: rgba(255,255,255,.06);
            color: rgba(255,255,255,.4);
            font-size: 11px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all .2s;
            flex-shrink: 0;
        }

        .ph-close:hover {
            background: rgba(255,70,70,.2);
            border-color: rgba(255,70,70,.4);
            color: #ff4444;
        }

        .ph-preview-wrap {
            overflow-x: auto;
            overflow-y: auto;
            flex: 1;
            -webkit-overflow-scrolling: touch;
        }

        .ph-preview-wrap::-webkit-scrollbar { width:4px; height:4px; }
        .ph-preview-wrap::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,.1);
            border-radius: 4px;
        }

        .ph-preview-code {
            margin: 0;
            padding: 11px 16px;
            font-family: 'Fira Code','Cascadia Code','Consolas',monospace;
            font-size: 12px;
            line-height: 1.55;
            color: #c9d1d9;
            white-space: pre;
            background: transparent;
            min-width: max-content;
        }

        /* ── CHIP BAR ─────────────────────────────────────────────────── */
        .paste-chip-bar {
            align-items: center;
        }

        .paste-chip {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            padding: 5px 12px;
            background: rgba(139,92,246,.1);
            border: 1px solid rgba(139,92,246,.3);
            border-radius: 100px;
            font-size: 12px;
            font-family: 'Space Grotesk', sans-serif;
        }

        .paste-chip-icon {
            font-size: 12px;
            font-weight: 800;
            font-family: 'Space Grotesk', monospace;
            flex-shrink: 0;
        }

        .paste-chip-label {
            font-weight: 600;
            color: rgba(255,255,255,.85);
            white-space: nowrap;
        }

        .paste-chip-size {
            font-size: 10px;
            color: rgba(255,255,255,.38);
            flex-shrink: 0;
        }

        .paste-chip-remove {
            background: none;
            border: none;
            color: rgba(255,255,255,.35);
            font-size: 11px;
            cursor: pointer;
            padding: 0 0 0 2px;
            transition: color .2s;
            line-height: 1;
        }
        .paste-chip-remove:hover { color: #ff4444; }

        /* ── MOBILE ───────────────────────────────────────────────────── */
        @media (max-width: 768px) {
            .ph-header { padding: 8px 12px; }
            .ph-btn { font-size: 10px; padding: 4px 9px; }
            .ph-preview-code { font-size: 11px; padding: 9px 12px; }
            .ph-popup.ph-visible { max-height: 230px; }
        }

        @media (max-width: 400px) {
            .ph-header { flex-direction: column; align-items: flex-start; }
            .ph-header-right { width: 100%; justify-content: flex-end; }
        }
        `;
        document.head.appendChild(s);
    }
}
