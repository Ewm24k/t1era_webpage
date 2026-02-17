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
        // CALL OLLAMA WITH TIMEOUT PROTECTION
        // ========================================
        const controller = new AbortController();
        const timeout = setTimeout(() => {
            controller.abort();
        }, 20000); // 20 second timeout to stay under Netlify's 26s limit

        let ollamaResponse;
        try {
            ollamaResponse = await fetch('http://70.153.112.17:11434/api/generate', {
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
                        num_predict: isCodingQuery ? 4096 : 2048,
                        // Add faster response options
                        num_ctx: 2048,
                        repeat_penalty: 1.1
                    }
                }),
                signal: controller.signal
            });
        } catch (fetchError) {
            clearTimeout(timeout);
            if (fetchError.name === 'AbortError') {
                throw new Error('Request timed out. Please try a simpler query or break it into smaller parts.');
            }
            throw fetchError;
        }

        clearTimeout(timeout);

        if (!ollamaResponse.ok) {
            const errorText = await ollamaResponse.text();
            throw new Error(`Ollama API error (${ollamaResponse.status}): ${errorText.substring(0, 200)}`);
        }

        // ========================================
        // FAST RESPONSE COLLECTION WITH TIMEOUT
        // ========================================
        let fullResponse = '';
        let buffer = '';
        const startTime = Date.now();
        const MAX_COLLECTION_TIME = 18000; // 18 seconds max collection time

        try {
            for await (const chunk of ollamaResponse.body) {
                // Check if we're running out of time
                if (Date.now() - startTime > MAX_COLLECTION_TIME) {
                    console.log('[TIMEOUT] Collection time exceeded, returning partial response');
                    if (fullResponse.trim() === '') {
                        throw new Error('Response generation is taking too long. Please try a shorter query.');
                    }
                    break;
                }

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
                            // If model signals it's done, break early
                            if (data.done === true) {
                                buffer = '';
                                break;
                            }
                        } catch (e) {
                            // Skip invalid JSON
                            continue;
                        }
                    }
                }
            }

            // Process remaining buffer
            if (buffer.trim()) {
                try {
                    const data = JSON.parse(buffer);
                    if (data.response) fullResponse += data.response;
                } catch (e) {
                    // Ignore parse error for final buffer
                }
            }
        } catch (streamError) {
            console.error('[STREAM ERROR]', streamError);
            if (fullResponse.trim() === '') {
                throw new Error('Failed to receive response from AI model');
            }
            // Continue with partial response if we have something
        }

        if (!fullResponse || fullResponse.trim() === '') {
            fullResponse = 'The AI model did not generate a response. Please try rephrasing your question.';
        }

        // ========================================
        // ENHANCED THINKING EXTRACTION
        // ========================================
        let thinking = null;
        let finalResponse = fullResponse;

        console.log('=== RESPONSE LENGTH:', fullResponse.length);

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

        const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`[COMPLETE] Total processing time: ${totalTime}s`);

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
                processingTime: totalTime,
                debug: {
                    rawResponseLength: fullResponse.length,
                    thinkingFound: thinking !== null,
                    thinkingLength: thinking ? thinking.length : 0,
                    modelUsed: modelName,
                    codingDetected: isCodingQuery,
                    processingTimeSeconds: totalTime
                }
            })
        };

    } catch (error) {
        console.error('Error:', error);

        let errorMessage = 'Internal server error';
        let statusCode = 500;

        if (error.message.includes('timed out') || error.message.includes('taking too long')) {
            errorMessage = 'The request is taking too long. For complex code generation, try:\n\n1. Breaking your request into smaller parts\n2. Being more specific about what you need\n3. Asking for a simpler version first';
            statusCode = 504;
        } else if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
            errorMessage = 'Cannot connect to AI server. Please try again in a moment.';
            statusCode = 503;
        } else if (error.message.includes('Ollama API error')) {
            errorMessage = 'AI model is currently unavailable. Please try again.';
            statusCode = 503;
        } else if (error.message.includes('AbortError')) {
            errorMessage = 'Request was cancelled due to timeout. Please try a simpler query.';
            statusCode = 504;
        }

        return {
            statusCode: statusCode,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: true,
                message: errorMessage,
                technicalDetails: error.message,
                suggestion: 'Try breaking complex requests into smaller, more focused questions.'
            })
        };
    }
};
