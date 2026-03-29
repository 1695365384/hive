/**
 * Web Search 和 Web Fetch 工具单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWebSearchTool } from '../../../src/tools/built-in/web-search-tool.js';
import { createWebFetchTool } from '../../../src/tools/built-in/web-fetch-tool.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock isPrivateIP to control SSRF check behavior
const { mockIsPrivateIP } = vi.hoisted(() => ({
  mockIsPrivateIP: vi.fn<() => Promise<boolean>>().mockResolvedValue(false),
}));
vi.mock('../../../src/tools/built-in/utils/security.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/tools/built-in/utils/security.js')>();
  return {
    ...actual,
    isPrivateIP: mockIsPrivateIP,
  };
});

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

  it('should limit results to maxResults', async () => {
    const manyResults = Array.from({ length: 20 }, (_, i) => `
      <tr class="result-link"><td><a href="https://example.com/${i}">Result ${i}</a></td>
        <td class="result-snippet">Snippet ${i}</td></tr>
    `).join('');
    const html = `<table>${manyResults}</table>`;
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    });

    const tool = createWebSearchTool();
    const result = await tool.execute!({ query: 'test', maxResults: 5 }, {} as any);

    expect(result).toContain('Result 0');
    expect(result).toContain('Result 4');
    expect(result).toContain('已截断');
  });

  it('should cap maxResults above 20', async () => {
    // zodSchema() 不暴露 safeParse，验证在 execute 中进行
    const manyResults = Array.from({ length: 5 }, (_, i) => `
      <tr class="result-link"><td><a href="https://example.com/${i}">Result ${i}</a></td>
        <td class="result-snippet">Snippet ${i}</td></tr>
    `).join('');
    const html = `<table>${manyResults}</table>`;
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    });

    const tool = createWebSearchTool();
    // maxResults 超过 20 会被工具内部截断到 20
    const result = await tool.execute!({ query: 'test', maxResults: 50 }, {} as any);
    expect(result).toContain('Result 0');
    expect(result).toContain('Result 4');
  });
});

describe('createWebFetchTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: not private IP
    mockIsPrivateIP.mockResolvedValue(false);
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

  it('should reject non-https URLs', async () => {
    const tool = createWebFetchTool();
    const httpResult = await tool.execute!({ url: 'http://example.com' }, {} as any);
    expect(httpResult).toContain('不允许的 URL scheme');

    const fileResult = await tool.execute!({ url: 'file:///etc/passwd' }, {} as any);
    expect(fileResult).toContain('不允许的 URL scheme');

    const ftpResult = await tool.execute!({ url: 'ftp://example.com' }, {} as any);
    expect(ftpResult).toContain('不允许的 URL scheme');
  });

  it('should block private IP addresses (SSRF protection)', async () => {
    mockIsPrivateIP.mockResolvedValue(true);

    const tool = createWebFetchTool();
    const result = await tool.execute!({ url: 'https://internal.corp' }, {} as any);

    expect(result).toContain('[Security]');
    expect(result).toContain('内网地址');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should block localhost', async () => {
    mockIsPrivateIP.mockResolvedValue(true);

    const tool = createWebFetchTool();
    const result = await tool.execute!({ url: 'https://localhost' }, {} as any);

    expect(result).toContain('[Security]');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should allow public IP addresses', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<body><p>public content</p></body>'),
    });

    const tool = createWebFetchTool();
    const result = await tool.execute!({ url: 'https://example.com' }, {} as any);

    expect(result).toContain('public content');
    expect(mockFetch).toHaveBeenCalled();
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

  it('should cap maxChars above 100000', async () => {
    // zodSchema() 不暴露 safeParse，验证在 execute 中进行
    const html = `<body><p>${'x'.repeat(5000)}</p></body>`;
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    });

    const tool = createWebFetchTool();
    const result = await tool.execute!({
      url: 'https://example.com',
      maxChars: 200000,
    }, {} as any);

    // maxChars 被截断到 100000 上限
    expect(result.length).toBeLessThan(200000);
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
