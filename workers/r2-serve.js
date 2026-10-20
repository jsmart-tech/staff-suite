/**
 * Cloudflare Worker — r2-serve
 *
 * Serves objects from the R2 bucket with:
 *   - Cache-Control: public, max-age=31536000, immutable  (browser + edge)
 *   - Cloudflare Cache API for true edge-cache HIT on the second request
 *   - ETag / 304 support
 *   - CORS for cross-origin image loads from the Vercel app
 *
 * Deploy steps:
 *   1. wrangler deploy workers/r2-serve.js
 *   2. Add your domain to the Worker in CF Dashboard:
 *        Workers & Pages → r2-serve → Settings → Domains → Add domain
 *        (do NOT use R2 → Custom Domains — that is a different, conflicting feature)
 *   3. Set NEXT_PUBLIC_CDN_URL=https://<your-domain> in Vercel env vars + redeploy
 *
 * wrangler.toml:
 *   name = "r2-serve"
 *   main = "workers/r2-serve.js"
 *   compatibility_date = "2024-01-01"
 *
 *   [[r2_buckets]]
 *   binding = "BUCKET"
 *   bucket_name = "blessedpathstaffsuite"
 */

export default {
  async fetch(request, env, ctx) {
    // Only GET and HEAD make sense for a CDN serving static objects
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const url = new URL(request.url);
    const key = decodeURIComponent(url.pathname.slice(1)); // strip leading /

    if (!key) {
      return new Response('Not Found', { status: 404 });
    }
    // Only finalized objects are public; staging objects can never be served.
    if (key.startsWith('staging/')) return new Response('Not Found', { status: 404 });
    // Direct-message attachments are private: the app serves them through
    // /api/files after checking conversation membership. Never serve them here.
    if (key.startsWith('dm/')) return new Response('Not Found', { status: 404 });
    // SVG is deliberately not served: it can contain active script content.
    if (/\.svg$/i.test(key)) return new Response('Unsupported media type', { status: 415 });

    // ── Optional: HMAC token verification ────────────────────────────────────
    // Uncomment + set R2_CDN_SECRET in wrangler.toml [vars] to restrict
    // downloads to URLs signed by your Next.js server.
    //
    // const token = url.searchParams.get('t');
    // if (!token) return new Response('Forbidden', { status: 403 });
    // const expectedHmac = await computeHmac(env.R2_CDN_SECRET, key);
    // if (token !== expectedHmac) return new Response('Forbidden', { status: 403 });
    // ─────────────────────────────────────────────────────────────────────────

    // ── Cloudflare Cache API ──────────────────────────────────────────────────
    // Workers don't share the automatic edge cache that R2 Custom Domains get.
    // We must explicitly use caches.default so that the second request from
    // any browser anywhere in the world returns a CF edge HIT, not a Worker
    // execution + R2 fetch.
    const cache = caches.default;

    // Use the canonical URL as the cache key (strip auth tokens if any)
    const cacheKey = new Request(url.origin + url.pathname, { method: 'GET' });

    // ── Check cache first ─────────────────────────────────────────────────────
    const cached = await cache.match(cacheKey);
    if (cached) {
      // Return the cached response, but honour If-None-Match for 304
      const ifNoneMatch = request.headers.get('If-None-Match');
      if (ifNoneMatch && ifNoneMatch === cached.headers.get('ETag')) {
        return new Response(null, {
          status: 304,
          headers: {
            'Cache-Control': cached.headers.get('Cache-Control') ?? '',
            'ETag': ifNoneMatch,
          },
        });
      }
      return cached;
    }

    // ── Cache MISS — fetch from R2 ────────────────────────────────────────────
    const object = await env.BUCKET.get(key);

    if (!object) {
      return new Response('Not Found', { status: 404 });
    }

    const etag = object.httpEtag;

    // ETag short-circuit before reading body bytes
    const ifNoneMatch = request.headers.get('If-None-Match');
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          'Cache-Control': 'public, max-age=31536000, immutable',
          'ETag': etag,
        },
      });
    }

    const headers = new Headers({
      // Keys include Date.now() — content-addressed, safe to cache 1 year.
      'Cache-Control': 'public, max-age=31536000, immutable',
      'ETag': etag,
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Length': String(object.size),
      // CORS — required for <img> cross-origin loads from the Vercel app
      'Access-Control-Allow-Origin': '*',
      'Vary': 'Origin',
    });
    const servedType = object.httpMetadata?.contentType || '';
    // Images and verified audio/video display inline; everything else downloads.
    if (!/^image\/(jpeg|png|gif|webp|bmp|tiff|avif|heic|heif)$/i.test(servedType) &&
        !/^(video\/(mp4|quicktime|webm|3gpp|x-msvideo)|audio\/(mpeg|mp4|wav|ogg|flac))$/i.test(servedType)) {
      headers.set('Content-Disposition', 'attachment');
    }

    // Read body into an ArrayBuffer so we can store it in the cache AND return
    // it. (A ReadableStream can only be consumed once.)
    const bodyBytes = await object.arrayBuffer();
    const response = new Response(bodyBytes, { headers });

    // Store in the Cloudflare edge cache — waitUntil so we don't delay the
    // response to the user waiting for the cache.put() to complete.
    ctx.waitUntil(cache.put(cacheKey, response.clone()));

    return response;
  },
};

// ── Helper: HMAC-SHA256 (uncomment if using token verification above) ─────────
// async function computeHmac(secret, data) {
//   const enc = new TextEncoder();
//   const key = await crypto.subtle.importKey(
//     'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
//   );
//   const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
//   return btoa(String.fromCharCode(...new Uint8Array(sig)))
//     .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
// }
