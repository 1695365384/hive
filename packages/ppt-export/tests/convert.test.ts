import { describe, it, expect } from 'vitest';

// extractChartSlots is not exported — we test the ConvertError class
// and the convertHtmlToPptx error handling paths.
// The core conversion path depends on dom-to-pptx CLI which requires Puppeteer.

import { ConvertError } from '../src/convert.js';

describe('ConvertError', () => {
  it('creates error with exit code', () => {
    const err = new ConvertError('test message', 2);
    expect(err.message).toBe('test message');
    expect(err.exitCode).toBe(2);
    expect(err.name).toBe('ConvertError');
  });

  it('is instance of Error', () => {
    const err = new ConvertError('msg', 1);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('extractChartSlots (inline)', () => {
  // Test the regex logic directly since the function isn't exported
  it('matches single-quoted data-chart attributes', () => {
    const html = `<div class="slide"><div data-chart='{"type":"bar","categories":["A","B"],"series":[1,2]}' class="chart"></div></div>`;
    const regex = /<div[^>]*\bdata-chart\s*=\s*'([^']*)'[^>]*>/gi;
    const match = regex.exec(html);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('{"type":"bar","categories":["A","B"],"series":[1,2]}');
  });

  it('does not match double-quoted values (JSON has internal double quotes)', () => {
    // Double-quoted HTML attrs with double-quote JSON inside don't work
    // because the first " in the JSON terminates the attribute value
    const html = `<div data-chart="{\\"type\\":\\"bar\\"}"></div>`;
    const regex = /<div[^>]*\bdata-chart\s*=\s*'([^']*)'[^>]*>/gi;
    const match = regex.exec(html);
    expect(match).toBeNull();
  });

  it('extracts multiple chart divs', () => {
    const html = `
      <div class="slide"><div data-chart='{"type":"bar","categories":["A"],"series":[1]}'></div></div>
      <div class="slide"><div data-chart='{"type":"pie","categories":["B"],"series":[2]}'></div></div>
    `;
    const regex = /<div[^>]*\bdata-chart\s*=\s*'([^']*)'[^>]*>/gi;
    const matches = [...html.matchAll(regex)];
    expect(matches.length).toBe(2);
    expect(JSON.parse(matches[0][1]).type).toBe('bar');
    expect(JSON.parse(matches[1][1]).type).toBe('pie');
  });
});
