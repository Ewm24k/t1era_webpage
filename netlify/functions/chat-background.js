const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    // Set background function flag
    context.callbackWaitsForEmptyEventLoop = false;
    
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

        const codingKeywords = [
            'code', 'function', 'class', 'debug', 'error', 'bug',
            'python', 'javascript', 'java', 'cpp', 'c++', 'html', 'css',
            'react', 'node', 'typescript', 'sql', 'database',
            'algorithm', 'program', 'script', 'api', 'framework',
            'library', 'syntax', 'compile', 'runtime', 'variable',
            'loop', 'array', 'object', 'async', 'promise', 'callback',
            'write', 'create', 'build', 'develop', 'implement',
            'design', 'webpage', 'website', 'layout', 'style'
        ];

        const lowerMessage = message.toLowerCase();
        const isCodingQuery = codingKeywords.some(keyword => lowerMessage.includes(keyword));
        const modelName = isCodingQuery ? 't1era-coder' : 't1era';

        // Quick timeout for free tier
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 seconds max

        try {
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
                        num_predict: isCodingQuery ? 1536 : 1024  // Reduced for speed
                    }
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!ollamaResponse.ok) {
                throw new Error(`Ollama error: ${ollamaResponse.status}`);
            }

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
                fullResponse = 'No response generated';
            }

            // Extract thinking
            let thinking = null;
            let finalResponse = fullResponse;

            let thinkingMatch = fullResponse.match(/Thinking\.\.\.\s*([\s\S]*?)\s*\.\.\.done thinking\.\s*([\s\S]*)/i);
            
            if (!thinkingMatch) {
                thinkingMatch = fullResponse.match(/Thinking\.\.\.\s*([\s\S]*?)\s*\.\.\.done thinking\s*([\s\S]*)/i);
            }
            
            if (thinkingMatch) {
                thinking = thinkingMatch[1].trim();
                finalResponse = thinkingMatch[2].trim();
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
                    hasThinking: thinking !== null
                })
            };

        } catch (fetchError) {
            clearTimeout(timeoutId);
            
            if (fetchError.name === 'AbortError') {
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        error: false,
                        response: '⚠️ The response is taking longer than expected. For complex code generation, please try breaking your request into smaller parts.',
                        thinking: null,
                        fullText: '',
                        model: modelName,
                        timeout: true
                    })
                };
            }
            
            throw fetchError;
        }

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: true,
                message: error.message || 'Internal server error'
            })
        };
    }
};
