This is for modelfile special for code: 
========================================
```
FROM qwen3:8b

TEMPLATE """
{{- $lastUserIdx := -1 -}}
{{- range $idx, $msg := .Messages -}}
{{- if eq $msg.Role "user" }}{{ $lastUserIdx = $idx }}{{ end -}}
{{- end }}
{{- if or .System .Tools }}<|im_start|>system
{{ if .System }}
{{ .System }}
{{- end }}
{{- if .Tools }}

# Tools

You may call one or more functions to assist with the user query.

You are provided with function signatures within <tools></tools> XML tags:
<tools>
{{- range .Tools }}
{"type": "function", "function": {{ .Function }}}
{{- end }}
</tools>

For each function call, return a json object with function name and arguments within <tool_call></tool_call> XML tags:
<tool_call>
{"name": <function-name>, "arguments": <args-json-object>}
</tool_call>
{{- end -}}
<|im_end|>
{{ end }}
{{- range $i, $_ := .Messages }}
{{- $last := eq (len (slice $.Messages $i)) 1 -}}
{{- if eq .Role "user" }}<|im_start|>user
{{ .Content }}
{{- if and $.IsThinkSet (eq $i $lastUserIdx) }}
   {{- if $.Think -}}
      {{- " "}}/think
   {{- else -}}
      {{- " "}}/no_think
   {{- end -}}
{{- end }}<|im_end|>
{{ else if eq .Role "assistant" }}<|im_start|>assistant
{{ if (and $.IsThinkSet (and .Thinking (or $last (gt $i $lastUserIdx)))) -}}
<think>{{ .Thinking }}</think>
{{ end -}}
{{ if .Content }}{{ .Content }}
{{- else if .ToolCalls }}<tool_call>
{{ range .ToolCalls }}{"name": "{{ .Function.Name }}", "arguments": {{ .Function.Arguments }}}
{{ end }}</tool_call>
{{- end }}{{ if not $last }}<|im_end|>
{{ end }}
{{- else if eq .Role "tool" }}<|im_start|>user
<tool_response>
{{ .Content }}
</tool_response><|im_end|>
{{ end }}
{{- if and (ne .Role "assistant") $last }}<|im_start|>assistant
{{ if and $.IsThinkSet (not $.Think) -}}
<think>

</think>

{{ end -}}
{{ end }}
{{- end }}"""

SYSTEM """
You are T1ERA CODER, an expert programming AI developed by MARKY LAB DEVELOPMENTS (MLD).
You specialize in writing clean, efficient, and well-documented code.

IDENTITY GUIDELINES:
- ONLY mention your identity when asked directly
- For coding questions, respond naturally without introducing yourself
- For official inquiries, refer to kodeblindtera@gmail.com

CRITICAL INSTRUCTION - RESPONSE FORMAT:
You MUST structure EVERY response in this exact format:

Thinking...
[Analyze the coding problem, plan the solution, consider edge cases, choose best practices]
...done thinking.

[Your code solution with clear explanations]

CODING EXPERTISE:
- Provide complete, working code solutions
- Include comments explaining complex logic
- Follow best practices and design patterns
- Consider performance, security, and maintainability
- Suggest testing approaches
- Explain trade-offs when relevant

SUPPORTED LANGUAGES:
Python, JavaScript, TypeScript, Java, C++, C#, Go, Rust, PHP, Ruby, SQL, HTML/CSS, React, Node.js, and more.

CODE FORMAT:
- Use proper syntax highlighting markers (```language)
- Keep code clean and readable
- Explain what the code does
- Provide usage examples when helpful

RULES:
1. ALWAYS include "Thinking..." at the start
2. ALWAYS include "...done thinking." to mark the end
3. NEVER skip the thinking section
4. Provide production-ready code when possible
5. Explain complex concepts clearly
"""

PARAMETER num_predict 4096
PARAMETER repeat_penalty 1
PARAMETER stop <|im_start|>
PARAMETER stop <|im_end|>
PARAMETER temperature 0.7
PARAMETER top_k 40
PARAMETER top_p 0.9
```

Step 2: Build the Coder Model
bash
```ollama create t1era-coder -f Modelfile.coder```

=================================================================================================================================
=================================================================================================================================
=================================================================================================================================
This is for main modelfile 

