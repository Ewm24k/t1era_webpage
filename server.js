const express = require('express');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;
const OLLAMA_URL = 'http://70.153.112.17:11434';

app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.get('/', (req, res) => res.json({ status: 'T1ERA Chat Server Running' }));

app.post('/api/chat-stream', async (req, res) => {
    try {
        const { message, enableReasoning } = req.body;

        if (!message || message.trim() === '') {
            return res.status(400).json({ error: true, message: 'Message is required' });
        }

        // Strip conversation history — extract ONLY the final user message
        let cleanMessage = message;
        if (message.includes('Previous conversation') || message.includes('User:')) {
            // Find the LAST "User:" occurrence before final "Assistant:"
            // Handles both single and multi-line user messages
            const lines = message.split('\n');
            let lastUserLines = [];
            let collecting = false;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.startsWith('User:')) {
                    lastUserLines = [line.replace(/^User:\s*/, '').trim()];
                    collecting = true;
                } else if (line.startsWith('Assistant:') && collecting) {
                    // Stop at next Assistant marker
                    if (i === lines.length - 1 || lines.slice(i+1).every(l => l.trim() === '')) {
                        // This is the final Assistant: marker — we have our message
                        break;
                    }
                    collecting = false;
                    lastUserLines = [];
                } else if (collecting && line.trim() !== '') {
                    lastUserLines.push(line.trim());
                }
            }

            if (lastUserLines.length > 0) {
                cleanMessage = lastUserLines.join(' ').trim();
            }
        }

        console.log('[CLEAN MESSAGE]', cleanMessage.substring(0, 120));

        // Smart model routing
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

        const isCodingQuery = codingKeywords.some(k => cleanMessage.toLowerCase().includes(k));
        const modelName = isCodingQuery ? 't1era-coder' : 't1era';

        console.log(`[${new Date().toISOString()}] Model: ${modelName} | Message: ${cleanMessage.substring(0, 80)}`);

        const ollamaResponse = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: modelName,
                prompt: message, // Send full context to Ollama, cleanMessage only used for model routing
                stream: true,
                options: {
                    temperature: 0.7,
                    top_p: 0.9,
                    top_k: 40,
                    num_predict: isCodingQuery ? 4096 : 2048,
                    num_ctx: 4096,
                    repeat_penalty: 1.1
                }
            })
        });

        if (!ollamaResponse.ok) {
            const errorText = await ollamaResponse.text();
            throw new Error(`Ollama error (${ollamaResponse.status}): ${errorText.substring(0, 200)}`);
        }

        // Collect full response — no timeout, Render has no function limit
        let fullResponse = '';
        let buffer = '';

        for await (const chunk of ollamaResponse.body) {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const data = JSON.parse(line);
                        if (data.response) fullResponse += data.response;
                        if (data.done === true) { buffer = ''; break; }
                    } catch (e) { continue; }
                }
            }
        }

        if (buffer.trim()) {
            try {
                const data = JSON.parse(buffer);
                if (data.response) fullResponse += data.response;
            } catch (e) {}
        }

        if (!fullResponse || fullResponse.trim() === '') {
            fullResponse = 'No response from AI. Please try again.';
        }

        // Thinking extraction
        let thinking = null;
        let finalResponse = fullResponse;

        let thinkingMatch = fullResponse.match(/Thinking\.\.\.\s*([\s\S]*?)\s*\.\.\.done thinking\.\s*([\s\S]*)/i);
        if (!thinkingMatch) thinkingMatch = fullResponse.match(/Thinking\.\.\.\s*([\s\S]*?)\s*\.\.\.done thinking\s*([\s\S]*)/i);
        if (!thinkingMatch) thinkingMatch = fullResponse.match(/thinking\.{2,}\s*([\s\S]*?)\s*\.{2,}done thinking\.?\s*([\s\S]*)/i);
        if (!thinkingMatch) thinkingMatch = fullResponse.match(/Thinking[.\s]*([\s\S]*?)[.\s]*done thinking[.\s]*([\s\S]*)/i);

        if (thinkingMatch) {
            thinking = thinkingMatch[1].trim();
            finalResponse = thinkingMatch[2].trim();
        }

        // Strip any leaked thinking patterns from finalResponse
        finalResponse = finalResponse
            .replace(/^Thinking\.\.\.[\s\S]*?\.\.\.done thinking\.?\s*/i, '')
            .replace(/^<think>[\s\S]*?<\/think>\s*/i, '')
            .trim();

        // If finalResponse is empty after stripping, use fullResponse as fallback
        if (!finalResponse || finalResponse.trim() === '') {
            finalResponse = fullResponse.replace(/^Thinking\.\.\.[\s\S]*?\.\.\.done thinking\.?\s*/i, '').trim();
        }

        res.json({
            error: false,
            response: finalResponse,
            thinking: thinking,
            fullText: fullResponse,
            model: modelName,
            isCodingQuery: isCodingQuery,
            hasThinking: thinking !== null,
            debug: {
                rawResponseLength: fullResponse.length,
                thinkingFound: thinking !== null,
                modelUsed: modelName,
                codingDetected: isCodingQuery
            }
        });

    } catch (error) {
        console.error('[ERROR]', error.message);
        let statusCode = 500;
        let errorMessage = 'Internal server error';

        if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
            errorMessage = 'Cannot connect to AI server. Please try again.';
            statusCode = 503;
        }

        res.status(statusCode).json({ error: true, message: errorMessage, technicalDetails: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`T1ERA Chat Server running on port ${PORT}`);
    console.log(`Ollama: ${OLLAMA_URL}`);
});
