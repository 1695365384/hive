const GITHUB_REPO = '1695365384/hive';
const CACHE_TTL = 86400; // 24 hours

export default {
  async fetch(request: Request, _env: unknown, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    // /download/{tag}/{filename}
    const pathParts = url.pathname.replace('/download/', '').split('/');
    const tag = pathParts[0];
    const filename = pathParts.slice(1).join('/');

    if (!tag || !filename) {
      return new Response('Usage: /download/{tag}/{filename}', { status: 400 });
    }

    // Use Cache API for edge caching
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), request);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const githubUrl = `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`;
    const response = await fetch(githubUrl);

    if (!response.ok) {
      return new Response(`GitHub download failed: ${response.status}`, {
        status: response.status,
      });
    }

    const headers = new Headers(response.headers);
    headers.set('Cache-Control', `public, max-age=${CACHE_TTL}`);
    headers.delete('set-cookie');

    const newResponse = new Response(response.body, {
      status: 200,
      headers,
    });

    ctx.waitUntil(cache.put(cacheKey, newResponse.clone()));

    return newResponse;
  },
} satisfies ExportedHandler;
