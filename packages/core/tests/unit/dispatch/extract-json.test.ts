import { describe, it, expect } from 'vitest'
import { extractJSON } from '../../../src/agents/dispatch/llm-utils.js'

describe('extractJSON', () => {
  it('extracts a flat JSON object', () => {
    const result = extractJSON<{ name: string; value: number }>('response: { "name": "test", "value": 42 }')
    expect(result).toEqual({ name: 'test', value: 42 })
  })

  it('extracts nested JSON objects', () => {
    const result = extractJSON<{ a: { b: number } }>('output: { "a": { "b": 1 } } end')
    expect(result).toEqual({ a: { b: 1 } })
  })

  it('handles braces inside strings', () => {
    const input = '{ "code": "if (x > 0) { return true; }" }'
    const result = extractJSON<{ code: string }>(input)
    expect(result).toEqual({ code: 'if (x > 0) { return true; }' })
  })

  it('handles empty strings in JSON', () => {
    const input = '{ "name": "", "value": null }'
    const result = extractJSON(input)
    expect(result).toEqual({ name: '', value: null })
  })

  it('returns null for malformed JSON', () => {
    const result = extractJSON('{ "name": ')
    expect(result).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(extractJSON('')).toBeNull()
  })

  it('returns null for input without braces', () => {
    expect(extractJSON('no json here')).toBeNull()
  })

  it('handles arrays inside JSON', () => {
    const input = '{ "items": [1, 2, 3] }'
    const result = extractJSON<{ items: number[] }>(input)
    expect(result).toEqual({ items: [1, 2, 3] })
  })

  it('handles escaped quotes in strings', () => {
    const input = '{ "text": "hello \\"world\\"" }'
    const result = extractJSON<{ text: string }>(input)
    expect(result).toEqual({ text: 'hello "world"' })
  })

  it('ignores text before first brace', () => {
    const input = 'Some preamble { "key": "value" } trailing'
    const result = extractJSON<{ key: string }>(input)
    expect(result).toEqual({ key: 'value' })
  })

  it('returns null for unclosed braces', () => {
    expect(extractJSON('{ "key": "value" ')).toBeNull()
  })
})
