# T1ERA Chat — Ultra Detailed System Documentation
### For Internal Agents & Developers
**Last Updated:** February 2026  
**Version:** Production v3.0  
**Author:** MARKY LAB DEVELOPMENTS (MLD)

---

## TABLE OF CONTENTS
1. [System Overview](#1-system-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Infrastructure — Where Everything Runs](#3-infrastructure--where-everything-runs)
4. [Evolution History — How We Got Here](#4-evolution-history--how-we-got-here)
5. [File Structure & Responsibilities](#5-file-structure--responsibilities)
6. [Frontend — chatt1era.html](#6-frontend--chatt1erahtml)
7. [Backend — server.js on Render](#7-backend--serverjs-on-render)
8. [AI Models — Azure VM + Ollama](#8-ai-models--azure-vm--ollama)
9. [Smart Model Routing](#9-smart-model-routing)
10. [Context & Memory System](#10-context--memory-system)
11. [Thinking Process Extraction](#11-thinking-process-extraction)
12. [Code Highlighting System](#12-code-highlighting-system)
13. [How to Switch from Azure to RunPod](#13-how-to-switch-from-azure-to-runpod)
14. [Environment Variables](#14-environment-variables)
15. [Deployment Guide](#15-deployment-guide)
16. [Known Issues & Fixes Applied](#16-known-issues--fixes-applied)
17. [Critical Rules — Never Break These](#17-critical-rules--never-break-these)

---

## 1. System Overview

T1ERA Chat is a custom AI chat interface that connects users to **locally-hosted LLM models** (Ollama) running on an Azure Virtual Machine. It is NOT using OpenAI, Anthropic, or any third-party AI API. Every model is custom-built and self-hosted.

**What the system does:**
- User types a message in the browser
- Frontend detects topic, builds smart context
- Sends to Render Express server
- Render proxies to Azure VM running Ollama
- Ollama runs either `t1era` or `t1era-coder` model
- Response streams back, thinking is extracted, code is highlighted
- Final response displayed in chat UI with typing animation

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                            │
│                                                                 │
│   chatt1era.html (hosted on Netlify)                           │
│   ├── Topic Detection (JS)                                      │
│   ├── Smart Context Builder (JS)                                │
│   ├── Code Highlighter (JS)                                     │
│   └── Typing Animation + Thinking Dropdown (JS)                │
└─────────────────────────┬───────────────────────────────────────┘
                          │ POST /api/chat-stream
                          │ { message: "...[context]...", enableReasoning: true }
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    RENDER.COM (Web Service)                      │
│                                                                 │
│   server.js (Node.js Express)                                   │
│   ├── CORS handling                                             │
│   ├── Extract cleanMessage for routing                          │
│   ├── Smart Model Routing (t1era vs t1era-coder)               │
│   ├── Send full context prompt to Ollama                        │
│   ├── Collect streaming chunks                                  │
│   ├── Extract thinking blocks                                   │
│   └── Return JSON response                                      │
└─────────────────────────┬───────────────────────────────────────┘
                          │ POST /api/generate
                          │ { model: "t1era-coder", prompt: "...", stream: true }
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│              AZURE VM (IP: 70.153.112.17:11434)                 │
│                                                                 │
│   Ollama Server                                                 │
│   ├── t1era         (general model — based on Qwen3:8b)        │
│   └── t1era-coder   (coding model — based on Qwen3:8b)         │
│       ├── Custom SYSTEM prompt                                  │
│       ├── Thinking... / ...done thinking. format               │
│       └── num_predict: 4096                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Infrastructure — Where Everything Runs

### 3.1 Netlify (Static Hosting)
- **What runs here:** `chatt1era.html`, CSS files, static assets
- **What it does NOT do:** Any AI processing, API calls, serverless functions (deprecated)
- **Cost:** Free tier
- **URL:** Your Netlify domain (e.g. `t1era.netlify.app`)
- **Deploy method:** Push to GitHub → Netlify auto-deploys
- **Important:** Netlify functions (`chat-stream`, `chat-background`) are NO LONGER USED. They were removed because Netlify free plan has a 10-second function timeout which caused 504 errors on code generation.

### 3.2 Render (Express Server — API Backend)
- **What runs here:** `server.js` (Node.js Express)
- **What it does:** Acts as proxy between frontend and Ollama. Handles routing, context stripping, response parsing.
- **Cost:** Free tier (note: free tier spins down after inactivity — first request after idle takes ~30-50 seconds cold start)
- **URL:** `https://t1era-webpage.onrender.com`
- **API Endpoint:** `POST https://t1era-webpage.onrender.com/api/chat-stream`
- **Deploy method:** Push to GitHub → Render auto-deploys
- **Start command:** `node server.js`
- **Build command:** `npm install`
- **Runtime:** Node.js 22

### 3.3 Azure VM (AI Model Server)
- **What runs here:** Ollama + custom models `t1era` and `t1era-coder`
- **IP:** `70.153.112.17`
- **Port:** `11434`
- **Base model:** Qwen3:8b (quantized)
- **Access:** Direct HTTP from Render server (not exposed to public browser)
- **Important:** This is a private server. The IP is hardcoded in `server.js`. If this IP changes, update `server.js` and redeploy to Render.

---

## 4. Evolution History — How We Got Here

Understanding WHY the current architecture exists is critical for future agents.

### Phase 1 — Original Setup (Netlify Only)
```
Browser → Netlify Functions (chat-stream.js) → Azure Ollama
```
**Problem:** Netlify free plan = 10 second function timeout. Any code generation request took 15-30 seconds = 504 errors every time. Calculator, Python scripts, any code = always failed.

### Phase 2 — Attempted Fixes on Netlify
- Added `AbortController` with 20s timeout → still failed (Netlify kills at 10s)
- Added `MAX_COLLECTION_TIME = 18s` → cut off responses
- Added `netlify.toml` with `timeout = 35` → Netlify ignored it on free plan
- Used `node-fetch` library → caused compatibility issues with streaming

**Lesson learned:** Netlify serverless functions cannot handle long-running AI responses. No workaround exists on free plan.

### Phase 3 — Current Setup (Render + Netlify split)
```
Browser → Netlify (HTML only) → Render Express Server → Azure Ollama
```
**Why Render:** 
- No function timeout limits
- Persistent Node.js process
- Free tier available
- Supports long-running streaming connections

**Changes made:**
- Removed `require('node-fetch')` → used built-in `fetch` 
- Removed all artificial timeouts
- Moved all API logic to `server.js` on Render
- Netlify now only serves static HTML

### Key Technical Decisions Made Along the Way

| Decision | Why |
|---|---|
| Remove `write`, `create`, `build`, `design` from coding keywords | Too generic — matched "copywriting", "creative writing", "design thinking" |
| Remove `request`, `response` from coding keywords | Matched "what is my last request" as coding query |
| Use `cleanMessage` for routing, `message` for Ollama prompt | History context contained old coding words that wrongly triggered coder model |
| Strip assistant messages from context history | Old code blocks in history were being sent back to Ollama causing raw markdown display |
| Add numbered conversation turns | AI was confused about which message was "last" |
| Exclude current message from history | AI counted its own current question as the "last request" |

---

## 5. File Structure & Responsibilities

```
t1era_webpage/ (GitHub repo)
│
├── chatt1era.html          ← Main chat UI (deployed on Netlify)
├── code-highlighter.css    ← Syntax highlighting styles (deployed on Netlify)
├── server.js               ← Express API server (deployed on Render)
├── package.json            ← Node dependencies
├── netlify.toml            ← Netlify config (functions timeout, redirects)
└── netlify/
    └── functions/
        ├── chat-stream.js      ← DEPRECATED — not used anymore
        └── chat-background.js  ← DEPRECATED — not used anymore
```

### What to edit for what:

| Change Needed | File to Edit |
|---|---|
| UI changes, styling | `chatt1era.html` |
| Change AI model URL (Azure → RunPod etc.) | `server.js` → `OLLAMA_URL` |
| Change model routing logic | `server.js` → `codingKeywords` array |
| Change context/memory behavior | `chatt1era.html` → `buildContext()` |
| Change topic detection | `chatt1era.html` → `TOPIC_CATEGORIES` |
| Change thinking extraction | `server.js` → regex patterns |
| Add new API endpoint | `server.js` |

---

## 6. Frontend — chatt1era.html

### 6.1 Key JavaScript Variables
```javascript
const API = 'https://t1era-webpage.onrender.com/api/chat-stream'; // Render server
let showThinking = localStorage.getItem('showThinking') === 'true'; // Toggle thinking dropdown
let conversationHistory = [...]; // Stored in localStorage, user messages only
let currentTopicId = localStorage.getItem('currentTopicId'); // Current topic tracking
```

### 6.2 Advanced Topic Management System

The frontend has a full topic detection and context management system built in JavaScript.

#### Topic Categories (8 total)
```javascript
const TOPIC_CATEGORIES = {
    coding:   ['python','javascript','java','code','function','class',...],
    writing:  ['essay','article','blog','copywriting','content',...],
    marketing:['marketing','campaign','funnel','seo',...],
    science:  ['photosynthesis','biology','chemistry','physics',...],
    history:  ['history','historical','ancient','war','revolution',...],
    business: ['business','startup','investment','finance',...],
    health:   ['health','medical','disease','symptom',...],
    general:  [] // fallback
}
```

#### Topic Similarity — Jaccard Algorithm
```javascript
function getTopicSimilarity(msg1, msg2) {
    // Returns 0.0 (completely different) to 1.0 (identical)
    // Uses intersection/union of keywords
    // < 0.05 = new topic
    // > 0.10 = same topic, include context
}
```

#### Continuation Signal Detection
The system recognizes these as **always continuation** (never resets context):
- Single numbers: `"3"`, `"1"`, `"2"` (choosing from a list)
- Very short messages (under 15 chars, max 3 words): `"yes"`, `"ok"`, `"why"`, `"how"`
- Explicit continuation phrases: `"tell me more"`, `"elaborate"`, `"explain more"`
- Memory recall phrases: `"what i said"`, `"my last"`, `"do you remember"`, `"what is my last request"`

#### Context Format Sent to Ollama
When same topic detected:
```
[PAST CONVERSATION - these are PREVIOUS messages, NOT the current question]
User said: i like pizza
You replied: Pizza is such a delicious choice!...
[END OF PAST CONVERSATION]

Current question: what is my last request
Answer:
```

When new topic detected:
```
[just the raw user message, no history]
```

### 6.3 Message Flow in Frontend
```
User types message
    ↓
send() function called
    ↓
detectTopicCategory(msg) → get current topic
    ↓
addToHistory('user', msg, topic)
    ↓
buildContext(msg) → analyze topic shift → build context string
    ↓
POST to Render API with { message: contextString, enableReasoning: bool }
    ↓
createLiveStreamingResponse(data) → display with typing animation
    ↓
addToHistory('assistant', response, topic)
```

### 6.4 Smart Model Badge Display
The frontend displays different UI based on which model responded:
- **General model** (`t1era`): Purple badge "General", avatar "AI"
- **Coder model** (`t1era-coder`): Cyan badge "Coder", avatar "💻"

```javascript
const isCoder = data.model === 't1era-coder';
// Changes: bubble border color, avatar, sender name, badge, generation time label
```

---

## 7. Backend — server.js on Render

### 7.1 Full Request Flow
```javascript
POST /api/chat-stream
    ↓
Parse { message, enableReasoning }
    ↓
Extract cleanMessage from context
    // "Current question: XYZ" → cleanMessage = "XYZ"
    // Fallback: find last "User:" line
    ↓
Run codingKeywords check on cleanMessage ONLY
    // NOT on full message (history contains old coding words)
    ↓
Select model: t1era or t1era-coder
    ↓
Send FULL message (with context) to Ollama as prompt
    ↓
Collect streaming chunks → fullResponse
    ↓
Extract thinking: Thinking... [text] ...done thinking.
    ↓
Strip leaked thinking from finalResponse
    ↓
Return JSON: { response, thinking, fullText, model, hasThinking }
```

### 7.2 Critical Design: cleanMessage vs message

**This is one of the most important rules in the system:**

```javascript
// cleanMessage = ONLY used for model routing decision
// message = FULL context with history, sent to Ollama

const isCodingQuery = codingKeywords.some(k => cleanMessage.toLowerCase().includes(k));
// ✅ Routes correctly even if history contains "python", "code", etc.

prompt: message  // ← Full context sent to Ollama for memory
// ✅ AI has full conversation context
```

**Why this matters:** If you use `message` for routing, old coding conversations in history will trigger coder model for unrelated general questions like "i like pizza" (because history has "python calculator" in it).

### 7.3 Coding Keywords (Current List)
```javascript
const codingKeywords = [
    'code', 'function', 'class', 'debug', 'error', 'bug',
    'python', 'javascript', 'java', 'cpp', 'c++', 'html', 'css',
    'react', 'node', 'typescript', 'sql', 'database',
    'algorithm', 'program', 'script', 'api', 'framework',
    'library', 'syntax', 'compile', 'runtime', 'variable',
    'loop', 'array', 'object', 'async', 'promise', 'callback',
    'webpage', 'website', 'layout', 'stylesheet',
    'fix', 'solve', 'optimize', 'refactor', 'test',
    'method', 'constructor', 'inheritance', 'interface',
    'component', 'module', 'package', 'import', 'export',
    'fetch', 'axios', 'endpoint',
    'query', 'mutation', 'schema', 'model', 'controller',
    'route', 'middleware', 'auth', 'token', 'session',
    'docker', 'container', 'deploy', 'webpack',
    'npm', 'yarn', 'pip', 'install', 'dependency',
    'calculator', 'compute', 'math', 'calculate'
];
```

**Intentionally REMOVED keywords (do NOT add back):**
- `'write'` → matches "copywriting", "ghostwrite"
- `'create'` → matches "create a story", "create a poem"
- `'build'` → too generic
- `'develop'` → too generic
- `'implement'` → too generic
- `'design'` → matches "design thinking", "design principles"
- `'request'` → matches "what is my last request"
- `'response'` → matches "what was the response"

---

## 8. AI Models — Azure VM + Ollama

### 8.1 Model Details
| Property | t1era (General) | t1era-coder |
|---|---|---|
| Base model | Qwen3:8b | Qwen3:8b |
| Purpose | General conversation, Q&A, writing | Code generation, debugging |
| num_predict | 2048 | 4096 |
| Thinking format | Thinking.../...done thinking. | Thinking.../...done thinking. |
| Temperature | 0.7 | 0.7 |

### 8.2 t1era-coder Modelfile (Critical Parts)
```
FROM qwen3:8b
SYSTEM """
You are T1ERA CODER, an expert programming AI developed by MARKY LAB DEVELOPMENTS (MLD).

CRITICAL INSTRUCTION - RESPONSE FORMAT:
You MUST structure EVERY response in this exact format:
Thinking...
[Analyze the coding problem, plan the solution]
...done thinking.
[Your code solution with clear explanations]

CODE FORMAT:
- Use proper syntax highlighting markers (```language)
- Keep code clean and readable
"""
PARAMETER num_predict 4096
PARAMETER temperature 0.7
```

### 8.3 Ollama API Used
```
POST http://70.153.112.17:11434/api/generate
{
    "model": "t1era-coder",
    "prompt": "...",
    "stream": true,
    "options": {
        "temperature": 0.7,
        "top_p": 0.9,
        "top_k": 40,
        "num_predict": 4096,
        "num_ctx": 4096,
        "repeat_penalty": 1.1
    }
}
```

---

## 9. Smart Model Routing

### Decision Flow
```
User message: "create a python calculator"
    ↓
Extract cleanMessage: "create a python calculator"
    ↓
Check codingKeywords: ['python', 'calculator'] → MATCH
    ↓
modelName = 't1era-coder'
    ↓
Send to Ollama with t1era-coder model

---

User message: "show me list of copywriting frameworks"
    ↓
Extract cleanMessage: "show me list of copywriting frameworks"
    ↓
Check codingKeywords: NO MATCH
    ('write' was removed — 'copywriting' no longer triggers)
    ↓
modelName = 't1era'
    ↓
Send to Ollama with t1era model
```

---

## 10. Context & Memory System

### How Memory Works (End to End)

1. **User sends message** → stored in `conversationHistory` (localStorage) with topic tag
2. **`buildContext()`** called before sending to API
3. **Topic analysis** compares current message to recent history using Jaccard similarity
4. **If new topic** → send only current message (no history)
5. **If same topic** → build context string with past messages
6. **Context sent to Render** → Render sends FULL context to Ollama
7. **Ollama reads context** → AI answers with full awareness of history
8. **AI response stored** in history (code blocks stripped, truncated to 300 chars)

### localStorage Keys
```javascript
localStorage.getItem('conversationHistory') // JSON array of messages
localStorage.getItem('currentTopicId')       // Current topic string
localStorage.getItem('showThinking')         // 'true' or 'false'
```

### Memory Limitations
- Max 20 messages stored in localStorage
- Assistant messages stored but code blocks replaced with `[code block]` and truncated to 300 chars
- Memory is **per browser** — different browsers/devices have separate histories
- Clearing browser data clears all memory

---

## 11. Thinking Process Extraction

Both models output thinking in this format:
```
Thinking...
[AI reasoning here]
...done thinking.
[Final response here]
```

Server extracts this with 4 fallback regex patterns:
```javascript
// Pattern 1: Standard with period
/Thinking\.\.\.\s*([\s\S]*?)\s*\.\.\.done thinking\.\s*([\s\S]*)/i

// Pattern 2: Without final period  
/Thinking\.\.\.\s*([\s\S]*?)\s*\.\.\.done thinking\s*([\s\S]*)/i

// Pattern 3: Flexible dots
/thinking\.{2,}\s*([\s\S]*?)\s*\.{2,}done thinking\.?\s*([\s\S]*)/i

// Pattern 4: Very flexible
/Thinking[\.\s]*([\s\S]*?)[\.\s]*done thinking[\.\s]*([\s\S]*)/i
```

After extraction, leaked thinking is also stripped from `finalResponse`:
```javascript
finalResponse = finalResponse
    .replace(/^Thinking\.\.\.[\s\S]*?\.\.\.done thinking\.?\s*/i, '')
    .replace(/^<think>[\s\S]*?<\/think>\s*/i, '')
    .trim();
```

---

## 12. Code Highlighting System

### How It Works
- `CodeHighlighter` class embedded in `chatt1era.html`
- Converts ` ```python ... ``` ` markdown into styled HTML
- Copy button positioned at **bottom-right corner** of code block (icon only 📋)
- Button hidden by default, appears on hover

### Supported Languages
JavaScript, Python, Java, C++, C#, PHP, Ruby, Go, Rust, TypeScript, HTML, CSS, SQL, Bash, Shell, JSON, XML, Markdown, YAML

### Code Block Rendering Check
```javascript
if (codeHighlighter.hasCode(finalResponse)) {
    // Process immediately — no typing animation for code
    responseDiv.innerHTML = codeHighlighter.processText(finalResponse);
} else {
    // Typing animation for regular text
    // char by char with delays: space=20ms, period=150ms, comma=80ms, other=40ms
}
```

---

## 13. How to Switch from Azure to RunPod

This is the key section for future migration. The architecture is designed so that **only ONE line needs to change** in `server.js`.

### Step 1 — Get RunPod Ollama URL

When you deploy Ollama on RunPod, you get a public URL like:
```
https://abc123-11434.proxy.runpod.net
```
or with a custom domain:
```
https://ollama.yourrunpod.io
```

### Step 2 — Update server.js

Find this line in `server.js`:
```javascript
const OLLAMA_URL = 'http://70.153.112.17:11434'; // ← AZURE
```

Change to:
```javascript
const OLLAMA_URL = 'https://abc123-11434.proxy.runpod.net'; // ← RUNPOD
```

### Step 3 — Verify Ollama API format

RunPod Ollama uses the SAME API as Azure Ollama:
```
POST {OLLAMA_URL}/api/generate
```
No other changes needed. The rest of `server.js` stays identical.

### Step 4 — Push to GitHub

Render will auto-redeploy `server.js` with the new URL.

### Step 5 — Test
```bash
curl -X POST https://t1era-webpage.onrender.com/api/chat-stream \
  -H "Content-Type: application/json" \
  -d '{"message": "hello", "enableReasoning": false}'
```

### RunPod Setup Notes
- Make sure `t1era` and `t1era-coder` models are pulled on RunPod Ollama
- RunPod Ollama port is usually `11434` — confirm in your pod settings
- If RunPod requires API key authentication, add it to the fetch headers in `server.js`:
```javascript
headers: { 
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_RUNPOD_API_KEY'  // ← add this if needed
}
```

### Using Environment Variable (Recommended for RunPod)

Instead of hardcoding, use env variable so you never need to edit code:

In `server.js` change:
```javascript
const OLLAMA_URL = 'http://70.153.112.17:11434';
```
To:
```javascript
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://70.153.112.17:11434';
```

Then in Render dashboard → Environment → Add:
```
OLLAMA_URL = https://abc123-11434.proxy.runpod.net
```

No code push needed — just update the env variable.

---

## 14. Environment Variables

### Render (server.js)
| Variable | Current Value | Description |
|---|---|---|
| `PORT` | Auto-set by Render | Express server port |
| `OLLAMA_URL` | Hardcoded in code | AI server base URL — change here for RunPod migration |

### Netlify (static only)
No environment variables needed — Netlify only serves static files.

---

## 15. Deployment Guide

### Deploy Frontend (Netlify)
```
1. Push chatt1era.html to GitHub
2. Netlify auto-deploys (connected to repo)
3. No build step needed — pure HTML
```

### Deploy Backend (Render)
```
1. Push server.js + package.json to GitHub
2. Render auto-deploys
3. Build command: npm install
4. Start command: node server.js
5. Instance type: Free
```

### Deploy Models (Azure VM)
```bash
# On Azure VM
ollama pull qwen3:8b
ollama create t1era -f Modelfile-general
ollama create t1era-coder -f Modelfile-coder
ollama serve  # starts on port 11434
```

### Full Redeploy Checklist
- [ ] `server.js` pushed to GitHub → Render redeploys automatically
- [ ] `chatt1era.html` pushed to GitHub → Netlify redeploys automatically
- [ ] Azure VM running → `ollama serve` active on port 11434
- [ ] Render URL in HTML matches → `const API = 'https://t1era-webpage.onrender.com/api/chat-stream'`

---

## 16. Known Issues & Fixes Applied

### Issue 1: 504 Timeout on Code Generation
**Root cause:** Netlify free plan 10s function timeout  
**Fix:** Moved all API logic to Render Express server (no timeout limits)  
**Status:** RESOLVED

### Issue 2: Code Blocks Showing as Raw Markdown (```python)
**Root cause:** Old assistant messages with code were being stored in localStorage and sent back as context. Ollama received code as part of prompt and echoed it back.  
**Fix:** Strip code blocks from assistant history. Only send user messages. Use `cleanMessage` for routing, not full context.  
**Status:** RESOLVED

### Issue 3: General Questions Routed to Coder Model
**Root cause 1:** Keywords `'write'`, `'create'`, `'request'`, `'response'` too generic  
**Root cause 2:** History context containing coding words triggered routing  
**Fix:** Removed generic keywords. Added `cleanMessage` extraction to only check current question for routing.  
**Status:** RESOLVED

### Issue 4: AI Says "I Don't Have Memory"
**Root cause:** `server.js` was only sending `cleanMessage` (stripped history) to Ollama  
**Fix:** Send full `message` (with context) to Ollama. Use `cleanMessage` only for routing.  
**Status:** RESOLVED

### Issue 5: Thinking Process Showing in Final Response
**Root cause:** General model doesn't always follow exact `Thinking...done thinking.` format  
**Fix:** Added regex strip of leaked thinking from `finalResponse` after extraction  
**Status:** RESOLVED

### Issue 6: Replying "3" After AI Lists Options Loses Context
**Root cause:** Single character/number had zero topic similarity → treated as new topic  
**Fix:** Messages under 15 chars or single numbers always treated as continuation  
**Status:** RESOLVED

### Issue 7: "What is my last request" returns current question
**Root cause:** Current message was included in history, AI counted it as "last"  
**Fix:** Filter current message out of history before building context. Added clear labeling `[PAST CONVERSATION]` vs `Current question:`  
**Status:** RESOLVED

---

## 17. Critical Rules — Never Break These

```
⚠️  RULE 1: Never use cleanMessage as the Ollama prompt
    → cleanMessage is ONLY for model routing
    → Always send full `message` to Ollama

⚠️  RULE 2: Never add generic English words to codingKeywords
    → 'write', 'create', 'build', 'design', 'request', 'response' are BANNED
    → Only add words that ONLY appear in technical/coding context

⚠️  RULE 3: Never store full code blocks in conversation history
    → Replace with [code block] placeholder
    → Truncate assistant messages to 300 chars max

⚠️  RULE 4: Never remove the thinking extraction regex patterns
    → All 4 patterns are needed for different model output variations
    → Also keep the leaked thinking strip on finalResponse

⚠️  RULE 5: To change AI server URL (Azure → RunPod)
    → Only change OLLAMA_URL in server.js
    → Everything else stays the same
    → Prefer using process.env.OLLAMA_URL for flexibility

⚠️  RULE 6: Netlify functions (chat-stream.js, chat-background.js) are DEAD
    → Do not re-enable them
    → Do not add new Netlify functions for AI
    → All AI goes through Render server.js only

⚠️  RULE 7: Frontend API endpoint must always point to Render
    → const API = 'https://t1era-webpage.onrender.com/api/chat-stream'
    → Never point back to /.netlify/functions/

⚠️  RULE 8: isCodingQuery check must always use cleanMessage
    → const isCodingQuery = codingKeywords.some(k => cleanMessage.toLowerCase().includes(k))
    → NOT message.toLowerCase() — message contains history
```

---

## Appendix: Quick Reference Card

```
FRONTEND:   Netlify → chatt1era.html
BACKEND:    Render  → server.js → https://t1era-webpage.onrender.com
AI SERVER:  Azure   → Ollama    → http://70.153.112.17:11434
MODELS:     t1era (general) + t1era-coder (coding) based on Qwen3:8b

TO CHANGE AI SERVER:
  server.js line 5: const OLLAMA_URL = 'YOUR_NEW_URL'
  push to GitHub → Render auto-redeploys

TO CHANGE FRONTEND API:
  chatt1era.html: const API = 'YOUR_RENDER_URL/api/chat-stream'
  push to GitHub → Netlify auto-redeploys

RUNPOD MIGRATION: Change OLLAMA_URL only. Nothing else.
```
