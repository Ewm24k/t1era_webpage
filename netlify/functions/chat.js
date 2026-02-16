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

        // Call Azure VM Ollama with your custom t1era model
        const ollamaResponse = await fetch('http://70.153.112.17:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 't1era',  // ✅ UPDATED: Changed to your custom model
                prompt: message,
                stream: false,
                options: {
                    temperature: 0.7,
                    top_p: 0.9,
                    top_k: 40
                }
            }),
            timeout: 60000 // 60 second timeout for longer responses
        });

        if (!ollamaResponse.ok) {
            const errorText = await ollamaResponse.text();
            console.error('Ollama error:', ollamaResponse.status, errorText);
            throw new Error(`Ollama responded with status: ${ollamaResponse.status} - ${errorText}`);
        }

        const data = await ollamaResponse.json();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                error: false,
                response: data.response || 'No response from AI',
                model: 't1era'
            })
        };

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
