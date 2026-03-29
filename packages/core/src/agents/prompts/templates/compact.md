## Task

Compress the following agent phase output into a structured summary. Extract the most important information while removing noise, repetition, and low-value details.

## Phase

{{phase}}

## Raw Output to Compress

```
{{rawText}}
```

## Output Format

Return a valid JSON object with exactly these fields:

```json
{
  "summary": "A concise summary of what was discovered or decided (max 2000 characters)",
  "keyFiles": ["list of important file paths mentioned"],
  "findings": ["key discoveries or conclusions (max 20 items)"],
  "suggestions": ["recommended next steps or actions (max 10 items)"]
}
```

## Rules

1. **Preserve ALL file paths** mentioned in the raw output in `keyFiles`
2. **Extract key findings** — facts, patterns, issues discovered — not opinions
3. **Prioritize actionable suggestions** in `suggestions`
4. **Keep summary concise** but information-dense (under 2000 chars)
5. **Use the same language** as the raw output (Chinese output → Chinese summary)
6. **Do NOT invent** information not present in the raw output
7. Return ONLY the JSON object, no markdown fencing, no explanation
