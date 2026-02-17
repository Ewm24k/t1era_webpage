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
            'component', 'module', 'package', 'import', 'export'
        ];

        const lowerMessage = message.toLowerCase();
        const isCodingQuery = codingKeywords.some(keyword => lowerMessage.includes(keyword));
        const modelName = isCodingQuery ? 't1era-coder' : 't1era';

        console.log(`[SMART ROUTING] Using model: ${modelName} for query: "${message.substring(0, 60)}..."`);
        console.log(`[SMART ROUTING] Coding query detected: ${isCodingQuery}`);

        // Retry logic for handling timeouts
        let attempts = 0;
        const maxAttempts = 2;
        let lastError = null;

        while (attempts < maxAttempts) {
            attempts++;
            
            try {
                // Call Azure VM Ollama with dynamically selected model
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
                            num_predict: isCodingQuery ? 2048 : 1536  // Reduced for speed
                        }
                    }),
                    timeout: 90000  // 90 seconds total timeout
                });

                if (!ollamaResponse.ok) {
                    const errorText = await ollamaResponse.text();
                    console.error('Ollama error:', ollamaResponse.status, errorText);
                    throw new Error(`Ollama API error (${ollamaResponse.status}): ${errorText.substring(0, 200)}`);
                }

                // Handle streaming response
                let fullResponse = '';
                let buffer = '';

                // Read streaming chunks
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
                                // Skip invalid JSON lines
                                console.log('Skipping invalid JSON:', line.substring(0, 50));
                            }
                        }
                    }
                }

                // Process any remaining buffer
                if (buffer.trim()) {
                    try {
                        const data = JSON.parse(buffer);
                        if (data.response) {
                            fullResponse += data.response;
                        }
                    } catch (e) {
                        // Ignore
                    }
                }

                if (!fullResponse || fullResponse.trim() === '') {
                    fullResponse = 'No response generated';
                }

                // ========================================
                // ENHANCED THINKING EXTRACTION
                // ========================================
                let thinking = null;
                let finalResponse = fullResponse;

                console.log('=== RAW RESPONSE (first 1000 chars) ===');
                console.log(fullResponse.substring(0, 1000));
                console.log('=== END RAW RESPONSE ===');

                // Try multiple patterns to match thinking text
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
                    
                    console.log('✅ THINKING EXTRACTED');
                    console.log('Thinking length:', thinking.length);
                    console.log('Thinking preview:', thinking.substring(0, 200));
                    console.log('Final response preview:', finalResponse.substring(0, 200));
                } else {
                    console.log('❌ NO THINKING PATTERN FOUND');
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
                            rawResponsePreview: fullResponse.substring(0, 300),
                            thinkingFound: thinking !== null,
                            thinkingLength: thinking ? thinking.length : 0,
                            patterns_tested: 4,
                            modelUsed: modelName,
                            codingDetected: isCodingQuery
                        }
                    })
                };

            } catch (fetchError) {
                lastError = fetchError;
                console.error(`Attempt ${attempts} failed:`, fetchError.message);
                
                // If this was the last attempt, throw the error
                if (attempts >= maxAttempts) {
                    throw fetchError;
                }
                
                // Wait before retrying (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, 2000 * attempts));
            }
        }

        // This shouldn't be reached, but just in case
        throw lastError || new Error('Failed after maximum retry attempts');

    } catch (error) {
        console.error('Error:', error);
        
        // Return friendly error message instead of generic error
        let errorMessage = 'Internal server error';
        
        if (error.message.includes('timeout')) {
            errorMessage = 'The AI is taking longer than expected. Please try a simpler question or try again.';
        } else if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
            errorMessage = 'Cannot connect to AI server. Please try again in a moment.';
        } else if (error.message.includes('Ollama API error')) {
            errorMessage = 'AI model is currently unavailable. Please try again.';
        }
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: true,
                message: errorMessage,
                technicalDetails: error.message
            })
        };
    }
};
```

## Key Changes Made:

1. **Removed AbortController** - It was causing immediate timeouts
2. **Increased timeout to 90 seconds** - Gives more time for generation
3. **Better error handling** - Returns friendly messages instead of throwing errors
4. **Proper retry logic** - Retries up to 2 times with exponential backoff
5. **Better logging** - Console logs help debug issues

## Test Again:

Now try these prompts:
```
Write a Python function to reverse a string
```
```
Create a simple HTML page with a button
```
```
What is recursion?
