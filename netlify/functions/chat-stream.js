const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: true, message: 'Method not allowed' })
        };
    }

    try {
        const { message, enableReasoning } = JSON.parse(event.body);

        if (!message || message.trim() === '') {
            return {
                statusCode: 400,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: true, message: 'Message is required' })
            };
        }

        // ========================================
        // SMART MODEL ROUTING
        // ========================================
        const codingKeywords = [
            'code', 'function', 'class', 'debug', 'error', 'bug',
            'python', 'javascript', 'java', 'cpp', 'c++', 'html', 'css',
            'react', 'node', 'typescript', 'sql', 'database',
            'algorithm', 'program', 'script', 'api', 'framework',
            'library', 'syntax', 'compile', 'runtime', 'variable',
            'loop', 'array', 'object', 'async', 'promise', 'callback',
            'write', 'create', 'build', 'develop', 'implement',
            'design', 'webpage', 'website', 'layout', 'style',
            'fix', 'solve', 'optimize', 'refactor', 'test',
            'method', 'constructor', 'inheritance', 'interface',
            'component', 'module', 'package', 'import', 'export',
            'fetch', 'axios', 'request', 'response', 'endpoint',
            'query', 'mutation', 'schema', 'model', 'controller',
            'route', 'middleware', 'auth', 'token', 'session',
            'docker', 'container', 'deploy', 'webpack',
            'npm', 'yarn', 'pip', 'install', 'dependency'
        ];

        const lowerMessage = message.toLowerCase();
        const isCodingQuery = codingKeywords.some(keyword => lowerMessage.includes(keyword));
        const modelName = isCodingQuery ? 't1era-coder' : 't1era';

        console.log(`[SMART ROUTING] Using model: ${modelName} | Coding: ${isCodingQuery}`);

        // ========================================
        // CALL OLLAMA - COLLECT FULL RESPONSE
        // Netlify doesn't support true SSE streaming
        // but we collect fast and return full response
        // ========================================
        const ollamaResponse = await fetch('http://70.153.112.17:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: modelName,
                prompt: message,
                stream: true,
                options: {
                    temperature: 0.7,
                    top_p: 0.9,
                    top_k: 40,
                    num_predict: isCodingQuery ? 4096 : 2048
                }
            })
        });

        if (!ollamaResponse.ok) {
            const errorText = await ollamaResponse.text();
            throw new Error(`Ollama API error (${ollamaResponse.status}): ${errorText.substring(0, 200)}`);
        }

        // Collect full response from streaming
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
                        if (data.response) {
                            fullResponse += data.response;
                        }
                    } catch (e) {
                        // Skip invalid JSON
                    }
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
            fullResponse = 'No response from AI';
        }

        // ========================================
        // ENHANCED THINKING EXTRACTION
        // ========================================
        let thinking = null;
        let finalResponse = fullResponse;

        console.log('=== RAW RESPONSE (first 500 chars) ===');
        console.log(fullResponse.substring(0, 500));

        let thinkingMatch = fullResponse.match(/Thinking\.\.\.\s*([\s\S]*?)\s*\.\.\.done thinking\.\s*([\s\S]*)/i);

        if (!thinkingMatch) {
            thinkingMatch = fullResponse.match(/Thinking\.\.\.\s*([\s\S]*?)\s*\.\.\.done thinking\s*([\s\S]*)/i);
        }

        if (!thinkingMatch) {
            thinkingMatch = fullResponse.match(/thinking\.{2,}\s*([\s\S]*?)\s*\.{2,}done thinking\.?\s*([\s\S]*)/i);
        }

        if (!thinkingMatch) {
            thinkingMatch = fullResponse.match(/Thinking[.\s]*([\s\S]*?)[.\s]*done thinking[.\s]*([\s\S]*)/i);
        }

        if (thinkingMatch) {
            thinking = thinkingMatch[1].trim();
            finalResponse = thinkingMatch[2].trim();
            console.log('✅ THINKING EXTRACTED - Length:', thinking.length);
        } else {
            console.log('❌ NO THINKING PATTERN FOUND');
        }

        return {
            statusCode: 200,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
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
                    thinkingLength: thinking ? thinking.length : 0,
                    modelUsed: modelName,
                    codingDetected: isCodingQuery
                }
            })
        };

    } catch (error) {
        console.error('Error:', error);

        let errorMessage = 'Internal server error';

        if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
            errorMessage = 'Cannot connect to AI server. Please try again in a moment.';
        } else if (error.message.includes('Ollama API error')) {
            errorMessage = 'AI model is currently unavailable. Please try again.';
        }

        return {
            statusCode: 500,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: true,
                message: errorMessage,
                technicalDetails: error.message
            })
        };
    }
};
