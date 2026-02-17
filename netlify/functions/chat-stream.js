exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: true, message: 'Method not allowed' })
        };
    }

    try {
        const { message, enableReasoning } = JSON.parse(event.body);

        if (!message || message.trim() === '') {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: true, message: 'Message is required' })
            };
        }

        // ========================================
        // STRIP CONVERSATION HISTORY FROM PROMPT
        // Only send the LAST user message to Ollama
        // Conversation history was making prompt too long = timeout
        // ========================================
        let cleanMessage = message;

        // If message contains "Previous conversation:" header, extract only last user message
        if (message.includes('Previous conversation:')) {
            const lastUserMatch = message.match(/User:\s*([^\n]+)\s*\nAssistant:\s*$/);
            if (lastUserMatch) {
                cleanMessage = lastUserMatch[1].trim();
            } else {
                // Fallback: grab everything after last "User:" line
                const parts = message.split('User:');
                const lastPart = parts[parts.length - 1];
                const assistantIdx = lastPart.indexOf('\nAssistant:');
                cleanMessage = assistantIdx !== -1 
                    ? lastPart.substring(0, assistantIdx).trim() 
                    : lastPart.trim();
            }
        }

        console.log(`[CLEAN MESSAGE] ${cleanMessage.substring(0, 100)}`);

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
            'npm', 'yarn', 'pip', 'install', 'dependency',
            'calculator', 'compute', 'math', 'calculate'
        ];

        const lowerMessage = cleanMessage.toLowerCase();
        const isCodingQuery = codingKeywords.some(keyword => lowerMessage.includes(keyword));
        const modelName = isCodingQuery ? 't1era-coder' : 't1era';

        console.log(`[SMART ROUTING] Model: ${modelName} | Coding: ${isCodingQuery}`);

        // ========================================
        // CALL OLLAMA
        // Built-in fetch, same as proxy pattern
        // AbortSignal.timeout = 24s (under Netlify 26s limit)
        // ========================================
        const ollamaResponse = await fetch('http://70.153.112.17:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: modelName,
                prompt: cleanMessage,
                stream: true,
                options: {
                    temperature: 0.7,
                    top_p: 0.9,
                    top_k: 40,
                    num_predict: isCodingQuery ? 2048 : 1024,
                    num_ctx: 4096,
                    repeat_penalty: 1.1
                }
            }),
            signal: AbortSignal.timeout(24000)
        });

        if (!ollamaResponse.ok) {
            const errorText = await ollamaResponse.text();
            throw new Error(`Ollama API error (${ollamaResponse.status}): ${errorText.substring(0, 200)}`);
        }

        // ========================================
        // COLLECT CHUNKS
        // ========================================
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
                        if (data.done === true) {
                            buffer = '';
                            break;
                        }
                    } catch (e) {
                        continue;
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
            fullResponse = 'No response from AI. Please try again.';
        }

        // ========================================
        // THINKING EXTRACTION
        // ========================================
        let thinking = null;
        let finalResponse = fullResponse;

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
            console.log('THINKING EXTRACTED - Length:', thinking.length);
        } else {
            console.log('NO THINKING PATTERN FOUND');
        }

        return {
            statusCode: 200,
            headers,
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
                    codingDetected: isCodingQuery,
                    cleanMessageLength: cleanMessage.length
                }
            })
        };

    } catch (error) {
        console.error('Error:', error);

        let errorMessage = 'Internal server error';
        let statusCode = 500;

        if (error.name === 'AbortError' || error.name === 'TimeoutError') {
            errorMessage = 'Request timed out. Please try again.';
            statusCode = 504;
        } else if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
            errorMessage = 'Cannot connect to AI server. Please try again.';
            statusCode = 503;
        } else if (error.message.includes('Ollama API error')) {
            errorMessage = 'AI model is currently unavailable. Please try again.';
            statusCode = 503;
        }

        return {
            statusCode,
            headers,
            body: JSON.stringify({
                error: true,
                message: errorMessage,
                technicalDetails: error.message
            })
        };
    }
};
