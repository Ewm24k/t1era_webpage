/**
 * T1ERA Enhanced Markdown Renderer v2
 * Drop-in upgrade for CodeHighlighter.processText()
 * Renders: bold, italic, headers, bullet lists, numbered lists,
 *          framework labels, dividers, inline code, code blocks, line breaks
 */

class T1ERARenderer {
    constructor() {
        this.languages = {
            'javascript':  { name: 'JavaScript',  color: '#f7df1e' },
            'js':          { name: 'JavaScript',  color: '#f7df1e' },
            'python':      { name: 'Python',      color: '#3776ab' },
            'py':          { name: 'Python',      color: '#3776ab' },
            'java':        { name: 'Java',         color: '#007396' },
            'cpp':         { name: 'C++',          color: '#00599c' },
            'c':           { name: 'C',            color: '#00599c' },
            'csharp':      { name: 'C#',           color: '#239120' },
            'cs':          { name: 'C#',           color: '#239120' },
            'php':         { name: 'PHP',          color: '#777bb4' },
            'ruby':        { name: 'Ruby',         color: '#cc342d' },
            'rb':          { name: 'Ruby',         color: '#cc342d' },
            'go':          { name: 'Go',           color: '#00add8' },
            'rust':        { name: 'Rust',         color: '#ce422b' },
            'rs':          { name: 'Rust',         color: '#ce422b' },
            'typescript':  { name: 'TypeScript',   color: '#3178c6' },
            'ts':          { name: 'TypeScript',   color: '#3178c6' },
            'html':        { name: 'HTML',         color: '#e34c26' },
            'css':         { name: 'CSS',          color: '#1572b6' },
            'sql':         { name: 'SQL',          color: '#4479a1' },
            'bash':        { name: 'Bash',         color: '#4eaa25' },
            'sh':          { name: 'Shell',        color: '#4eaa25' },
            'shell':       { name: 'Shell',        color: '#4eaa25' },
            'json':        { name: 'JSON',         color: '#cbcb41' },
            'xml':         { name: 'XML',          color: '#e34c26' },
            'markdown':    { name: 'Markdown',     color: '#519aba' },
            'md':          { name: 'Markdown',     color: '#519aba' },
            'yaml':        { name: 'YAML',         color: '#cb171e' },
            'yml':         { name: 'YAML',         color: '#cb171e' },
            'plaintext':   { name: 'Plain Text',   color: '#888888' },
            'text':        { name: 'Plain Text',   color: '#888888' },
            'txt':         { name: 'Plain Text',   color: '#888888' },
        };

        // Known copywriting / storytelling framework names for pill rendering
        this.frameworkNames = new Set([
            'AIDA','PAS','FAB','BAB','4Ps','SLAP','PASTOR','StoryBrand',
            'PAS + AIDA','BAB + FAB','StoryBrand + PASTOR','SLAP + PAS',
            "Hero's Journey","Three-Act Structure","Story Spine","Pixar Method",
            'BDA','Before-During-After','Nested Loop'
        ]);
    }

    // ─── PUBLIC API ───────────────────────────────────────────────────────────

    processText(text) {
        if (!text) return '';
        return this._render(text);
    }

    hasCode(text) {
        return /```[\s\S]*?```/.test(text) || /`[^`]+`/.test(text);
    }

    // ─── MAIN RENDER PIPELINE ─────────────────────────────────────────────────

    _render(text) {
        // 1. Extract and protect fenced code blocks FIRST before any line splitting
        //    Handles: ```python\ncode``` or ```\ncode``` or ```plaintext\ncode```
        const codeBlocks = [];
        text = text.replace(/```(\w*)[^\S\r\n]*\r?\n([\s\S]*?)```/g, (_, lang, code) => {
            const idx = codeBlocks.length;
            codeBlocks.push({ lang: lang.trim().toLowerCase() || 'plaintext', code: code.trimEnd() });
            return `\n\x00CODE${idx}\x00\n`;
        });

        // Also handle single-line code blocks: ```code```
        text = text.replace(/```([^`\n]+)```/g, (_, code) => {
            const idx = codeBlocks.length;
            codeBlocks.push({ lang: 'plaintext', code: code.trim() });
            return `\n\x00CODE${idx}\x00\n`;
        });

        // 2. Split into lines for block-level processing
        const lines = text.split('\n');
        return this._processLines(lines, codeBlocks);
    }

    // ─── BLOCK-LEVEL PROCESSING ───────────────────────────────────────────────

    _processLines(lines, codeBlocks) {
        const output = [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];

            // ── Code block placeholder ──
            const codeMatch = line.match(/^\x00CODE(\d+)\x00$/);
            if (codeMatch) {
                const idx = parseInt(codeMatch[1]);
                const { lang, code } = codeBlocks[idx];
                output.push(this._renderCodeBlock(code, lang));
                i++; continue;
            }

            // ── Horizontal rule --- or *** or ___ ──
            if (/^[-*_]{3,}\s*$/.test(line.trim())) {
                output.push('<hr class="md-hr">');
                i++; continue;
            }

            // ── Headings ──
            if (/^###\s+/.test(line)) {
                output.push(`<h3 class="md-h3">${this._inline(line.replace(/^###\s+/, ''))}</h3>`);
                i++; continue;
            }
            if (/^##\s+/.test(line)) {
                output.push(`<h2 class="md-h2">${this._inline(line.replace(/^##\s+/, ''))}</h2>`);
                i++; continue;
            }
            if (/^#\s+/.test(line)) {
                output.push(`<h1 class="md-h1">${this._inline(line.replace(/^#\s+/, ''))}</h1>`);
                i++; continue;
            }

            // ── Framework label: **PAS Version:** on its own line ──
            if (/^\*\*[^*]+\*\*:?\s*$/.test(line.trim())) {
                const label = line.trim().replace(/^\*\*/, '').replace(/\*\*:?\s*$/, '');
                const isFramework = [...this.frameworkNames].some(f =>
                    label.toUpperCase().includes(f.toUpperCase())
                );
                if (isFramework) {
                    output.push(`<div class="md-framework-label">${this._escapeHtml(label)}</div>`);
                } else {
                    output.push(`<p class="md-bold-label">${this._inline(line.trim())}</p>`);
                }
                i++; continue;
            }

            // ── Bullet list ──
            if (/^[-*•]\s+/.test(line)) {
                const items = [];
                while (i < lines.length && /^[-*•]\s+/.test(lines[i])) {
                    items.push(`<li>${this._inline(lines[i].replace(/^[-*•]\s+/, ''))}</li>`);
                    i++;
                }
                output.push(`<ul class="md-ul">${items.join('')}</ul>`);
                continue;
            }

            // ── Numbered list ──
            if (/^\d+[.)]\s+/.test(line)) {
                const items = [];
                while (i < lines.length && /^\d+[.)]\s+/.test(lines[i])) {
                    items.push(`<li>${this._inline(lines[i].replace(/^\d+[.)]\s+/, ''))}</li>`);
                    i++;
                }
                output.push(`<ol class="md-ol">${items.join('')}</ol>`);
                continue;
            }

            // ── Copywriting framework key-value row ──
            if (/^(Attention|Interest|Desire|Action|Problem|Agitate|Solution|Before|After|Bridge|Promise|Picture|Proof|Push|Stop|Look|Act|Purchase|Amplify|Story|Transformation|Offer|Response|Character|Guide|Plan|CTA|Success|Failure|Feature|Advantage|Benefit)\s*:/i.test(line.trim())) {
                const colonIdx = line.indexOf(':');
                const key = line.slice(0, colonIdx).trim();
                const val = line.slice(colonIdx + 1).trim();
                output.push(`
                    <div class="md-copy-row">
                        <span class="md-copy-key">${this._escapeHtml(key)}</span>
                        <span class="md-copy-val">${this._inline(val)}</span>
                    </div>`);
                i++; continue;
            }

            // ── Blockquote ──
            if (/^>\s+/.test(line)) {
                output.push(`<blockquote class="md-blockquote">${this._inline(line.replace(/^>\s+/, ''))}</blockquote>`);
                i++; continue;
            }

            // ── Empty line → spacer ──
            if (line.trim() === '') {
                output.push('<div class="md-spacer"></div>');
                i++; continue;
            }

            // ── Plain paragraph ──
            output.push(`<p class="md-p">${this._inline(line)}</p>`);
            i++;
        }

        return output.join('\n');
    }

    // ─── INLINE FORMATTING ────────────────────────────────────────────────────

    _inline(text) {
        if (!text) return '';

        // Orphaned code block placeholders → inline code
        text = text.replace(/\x00CODE(\d+)\x00/g, '<code class="inline-code">[code]</code>');

        // Inline code `...`  (do this BEFORE bold/italic to avoid conflicts)
        text = text.replace(/`([^`]+)`/g, (_, code) =>
            `<code class="inline-code">${this._escapeHtml(code)}</code>`);

        // Bold+Italic ***text***
        text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');

        // Bold **text**
        text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');

        // Italic *text*  (only single *)
        text = text.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');

        // Strikethrough ~~text~~
        text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');

        // [text](url) links
        text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
            '<a href="$2" target="_blank" rel="noopener" class="md-link">$1</a>');

        // Em dash —
        text = text.replace(/ — /g, ' <span class="md-emdash">—</span> ');

        // Arrow →
        text = text.replace(/→/g, '<span class="md-arrow">→</span>');

        return text;
    }

    // ─── CODE BLOCK RENDERER ─────────────────────────────────────────────────

    _renderCodeBlock(code, language) {
        const lang = (language || 'plaintext').toLowerCase().trim();
        const langInfo = this.languages[lang] || { name: lang || 'Code', color: '#888888' };
        const escapedCode = this._escapeHtml(code);
        const blockId = 'code-' + Math.random().toString(36).substr(2, 9);

        return `<div class="code-block-container">
            <div class="code-block-header">
                <div class="code-language" style="color:${langInfo.color}">
                    <span class="code-icon">⟨/⟩</span>
                    ${this._escapeHtml(langInfo.name)}
                </div>
            </div>
            <div style="position:relative;">
                <pre class="code-block"><code id="${blockId}" class="language-${lang}">${escapedCode}</code></pre>
                <button class="code-copy-btn" onclick="copyCodeBlock('${blockId}')">📋</button>
            </div>
        </div>`;
    }

    // ─── HELPERS ──────────────────────────────────────────────────────────────

    _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// copyCodeBlock() is defined in chat.html — no change needed here.
