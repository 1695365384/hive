/**
 * Web Search 和 Web Fetch 工具单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWebSearchTool } from '../../../src/tools/built-in/web-search-tool.js';
import { createWebFetchTool } from '../../../src/tools/built-in/web-fetch-tool.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('createWebSearchTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return formatted search results', async () => {
    const html = `
      <table>
        <tr class="result-link"><td><a href="https://example.com">Example</a></td>
          <td class="result-snippet">A test website</td></tr>
        <tr class="result-link"><td><a href="https://other.com">Other</a></td>
          <td class="result-snippet">Another site</td></tr>
      </table>`;
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    });

    const tool = createWebSearchTool();
    const result = await tool.execute!({ query: 'test search' }, {} as any);

    expect(result).toContain('Example');
    expect(result).toContain('https://example.com');
    expect(result).toContain('Other');
    expect(result).toContain('https://other.com');
    expect(result).toContain('A test website');
  });

  it('should return empty message when no results', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html><body>No results</body></html>'),
    });

    const tool = createWebSearchTool();
    const result = await tool.execute!({ query: 'xyznonexistent' }, {} as any);

    expect(result).toContain('未找到');
  });

  it('should handle HTTP errors', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    const tool = createWebSearchTool();
    const result = await tool.execute!({ query: 'test' }, {} as any);

    expect(result).toContain('[Error]');
    expect(result).toContain('500');
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const tool = createWebSearchTool();
    const result = await tool.execute!({ query: 'test' }, {} as any);

    expect(result).toContain('[Error]');
    expect(result).toContain('Network error');
  });
});

describe('createWebFetchTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch and convert HTML to markdown', async () => {
    const html = `<!DOCTYPE html>
<html><head><title>Test</title></head>
<body><h1>Hello World</h1><p>This is <strong>bold</strong> text.</p>
<script>console.log('noise');</script></body></html>`;

    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    });

    const tool = createWebFetchTool();
    const result = await tool.execute!({ url: 'https://example.com' }, {} as any);

    expect(result).toContain('# Hello World');
    expect(result).toContain('**bold**');
    expect(result).not.toContain('console.log');
  });

  it('should truncate long content', async () => {
    const longHtml = `<body><p>${'x'.repeat(50000)}</p></body>`;
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(longHtml),
    });

    const tool = createWebFetchTool();
    const result = await tool.execute!({
      url: 'https://example.com',
      maxChars: 1000,
    }, {} as any);

    expect(result.length).toBeLessThan(50000);
    expect(result).toContain('[输出已截断');
  });

  it('should handle HTTP errors', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
    });

    const tool = createWebFetchTool();
    const result = await tool.execute!({ url: 'https://example.com/404' }, {} as any);

    expect(result).toContain('[Error]');
    expect(result).toContain('404');
  });

  it('should handle empty page content', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html><body></body></html>'),
    });

    const tool = createWebFetchTool();
    const result = await tool.execute!({ url: 'https://example.com/empty' }, {} as any);

    expect(result).toContain('[Error]');
    expect(result).toContain('空');
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValue(new TypeError('fetch failed'));

    const tool = createWebFetchTool();
    const result = await tool.execute!({ url: 'https://invalid.example' }, {} as any);

    expect(result).toContain('[Error]');
  });
});
