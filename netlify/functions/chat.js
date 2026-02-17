const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // Only allow POST
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

        // Retry logic for handling timeouts
        let attempts = 0;
        const maxAttempts = 2;
        let lastError = null;

        while (attempts < maxAttempts) {
            attempts++;
            
            try {
                // Call Azure VM Ollama with your custom t1era model
                const ollamaResponse = await fetch('http://70.153.112.17:11434/api/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: 't1era',
                        prompt: message,
                        stream: true,  // ✅ CHANGED: Enable streaming
                        options: {
                            temperature: 0.7,
                            top_p: 0.9,
                            top_k: 40,
                            num_predict: 2048  // Limit tokens to prevent timeout
                        }
                    }),
                    timeout: 120000 // Increased to 120 seconds (2 minutes)
                });

                if (!ollamaResponse.ok) {
                    const errorText = await ollamaResponse.text();
                    console.error('Ollama error:', ollamaResponse.status, errorText);
                    throw new Error(`Ollama API error (${ollamaResponse.status}): ${errorText.substring(0, 200)}`);
                }

                // ✅ CHANGED: Handle streaming response
                let fullResponse = '';
                let buffer = '';

                // Read streaming chunks
                for await (const chunk of ollamaResponse.body) {
                    buffer += chunk.toString();
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || ''; // Keep incomplete line in buffer

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
                    fullResponse = 'No response from AI';
                }

                // ========================================
                // ENHANCED THINKING EXTRACTION
                // ========================================
                let thinking = null;
                let finalResponse = fullResponse;

                // Log first 1000 chars for debugging
                console.log('=== RAW RESPONSE (first 1000 chars) ===');
                console.log(fullResponse.substring(0, 1000));
                console.log('=== END RAW RESPONSE ===');

                // Try multiple patterns to match thinking text
                // Pattern 1: Standard format with periods
                let thinkingMatch = fullResponse.match(/Thinking\.\.\.\s*([\s\S]*?)\s*\.\.\.done thinking\.\s*([\s\S]*)/i);
                
                // Pattern 2: Without final period
                if (!thinkingMatch) {
                    thinkingMatch = fullResponse.match(/Thinking\.\.\.\s*([\s\S]*?)\s*\.\.\.done thinking\s*([\s\S]*)/i);
                }
                
                // Pattern 3: Case insensitive with flexible dots
                if (!thinkingMatch) {
                    thinkingMatch = fullResponse.match(/thinking\.{2,}\s*([\s\S]*?)\s*\.{2,}done thinking\.?\s*([\s\S]*)/i);
                }

                // Pattern 4: Very flexible - just look for "Thinking" and "done thinking"
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
                    console.log('Searched patterns: Thinking... / ...done thinking.');
                }

                // ✅ ADDED: Return fullText for frontend streaming simulation
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        error: false,
                        response: finalResponse,
                        thinking: thinking,
                        fullText: fullResponse,  // ✅ ADDED: Full text for live streaming
                        model: 't1era',
                        hasThinking: thinking !== null,
                        // Debug info
                        debug: {
                            rawResponseLength: fullResponse.length,
                            rawResponsePreview: fullResponse.substring(0, 300),
                            thinkingFound: thinking !== null,
                            thinkingLength: thinking ? thinking.length : 0,
                            patterns_tested: 4
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
