import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { tokenIsValid } from '@/lib/private-auth';
import { FORM_FLAG, QUERY_KEY, proxyPrefix, rewriteCss, rewriteHtml } from '@/lib/proxy-rewrite';

/**
 * The personal web proxy: /private/p/<sign-in pass>?__px_u=<address>
 *
 * SAFETY LOCK: every response carries `Content-Security-Policy: sandbox`
 * without `allow-same-origin`. That makes the browser treat each proxied page
 * as coming from nowhere, so its scripts and ads cannot read the portal's
 * login cookies, storage or pages, even though it is served from our domain.
 * Do not remove it.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const SANDBOX =
  'sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock allow-presentation';

const FORWARD_REQUEST_HEADERS = ['accept', 'accept-language', 'content-type', 'range', 'user-agent', 'if-none-match', 'if-modified-since'];
const KEEP_RESPONSE_HEADERS = ['content-type', 'content-disposition', 'content-range', 'accept-ranges', 'etag', 'last-modified'];

type Ctx = { params: { token: string } };

function page(status: number, title: string, text: string, extra: Record<string, string> = {}) {
  const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>` +
      `<body style="font-family:system-ui,sans-serif;padding:24px;max-width:560px;margin:auto"><h2>${esc(title)}</h2><p>${esc(text)}</p>` +
      `<p><a href="/private">Back</a></p></body>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', ...extra } },
  );
}

function privateIPv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function privateIP(ip: string): boolean {
  if (isIP(ip) === 4) return privateIPv4(ip);
  const v = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return privateIPv4(mapped[1]);
  return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('ff') || v.startsWith('64:ff9b');
}

/** Refuse anything that is not a public website (and never our own site). */
async function allowed(url: URL, ownHost: string): Promise<boolean> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return false;
  if (host === ownHost.toLowerCase()) return false;
  if (isIP(host)) return !privateIP(host);
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length > 0 && addrs.every(a => !privateIP(a.address));
  } catch {
    return false;
  }
}

function charsetOf(contentType: string, bytes: Uint8Array): string {
  const m = /charset=["']?([\w-]+)/i.exec(contentType);
  if (m) return m[1];
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 2048));
  const meta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head);
  return meta ? meta[1] : 'utf-8';
}

function decode(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

async function handle(req: Request, { params }: Ctx): Promise<Response> {
  const token = params.token;
  if (!tokenIsValid(token)) {
    return page(401, 'Signed out', 'Your private session has ended. Sign in again.', { 'content-security-policy': SANDBOX });
  }

  // Work out the real address being asked for.
  const here = new URL(req.url);
  const raw = here.searchParams.get(QUERY_KEY);
  if (!raw) return Response.redirect(new URL('/private', req.url), 302);
  let target: URL;
  try {
    target = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
  } catch {
    return page(400, 'That address does not look right', 'Check the web address and try again.');
  }
  if (here.searchParams.has(FORM_FLAG)) {
    // A GET form: the browser put the form's fields in the query string.
    const fields = new URLSearchParams();
    here.searchParams.forEach((v, k) => { if (k !== QUERY_KEY && k !== FORM_FLAG) fields.append(k, v); });
    target.search = fields.toString();
  }
  target.hash = '';

  const ownHost = req.headers.get('host')?.split(':')[0] ?? '';
  if (!(await allowed(target, ownHost))) {
    return page(403, 'Address not allowed', 'Only public websites can be opened here.', { 'content-security-policy': SANDBOX });
  }

  // Build the outgoing request. Our own cookies are never passed on.
  const headers = new Headers();
  for (const h of FORWARD_REQUEST_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has('user-agent')) headers.set('user-agent', 'Mozilla/5.0');
  headers.set('referer', target.origin + '/');
  const method = req.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';
  if (hasBody) headers.set('origin', target.origin);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    });
  } catch (e: any) {
    const timedOut = e?.name === 'TimeoutError';
    return page(502, timedOut ? 'The site took too long' : 'Could not reach that site',
      timedOut ? 'It did not answer within 25 seconds.' : 'The address may be wrong, or the site may be down.',
      { 'content-security-policy': SANDBOX });
  }

  const prefix = proxyPrefix(token);
  const out = new Headers({
    'content-security-policy': SANDBOX,
    'x-robots-tag': 'noindex, nofollow',
    'referrer-policy': 'no-referrer',
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'content-type, content-length, etag',
  });

  // Redirects: send the browser to the new address, still through the proxy.
  const location = upstream.headers.get('location');
  if (upstream.status >= 300 && upstream.status < 400 && location) {
    let next: string;
    try { next = new URL(location, target).href; } catch { return page(502, 'Bad redirect', 'The site sent an invalid redirect.'); }
    out.set('location', prefix + encodeURIComponent(next));
    out.set('cache-control', 'no-store');
    return new Response(null, { status: upstream.status === 307 || upstream.status === 308 ? upstream.status : 302, headers: out });
  }

  for (const h of KEEP_RESPONSE_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  const type = (upstream.headers.get('content-type') || '').toLowerCase();

  if (type.includes('text/html') || type.includes('application/xhtml')) {
    const bytes = new Uint8Array(await upstream.arrayBuffer());
    const html = rewriteHtml(decode(bytes, charsetOf(type, bytes)), target.href, token);
    out.set('content-type', 'text/html; charset=utf-8');
    out.set('cache-control', 'private, no-store');
    return new Response(method === 'HEAD' ? null : html, { status: upstream.status, headers: out });
  }
  if (type.includes('text/css')) {
    const bytes = new Uint8Array(await upstream.arrayBuffer());
    const css = rewriteCss(decode(bytes, charsetOf(type, bytes)), target.href, prefix);
    out.set('content-type', 'text/css; charset=utf-8');
    out.set('cache-control', 'private, max-age=300');
    return new Response(method === 'HEAD' ? null : css, { status: upstream.status, headers: out });
  }

  // Images, scripts, fonts, downloads: pass through unchanged.
  out.set('cache-control', 'private, max-age=300');
  return new Response(method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers: out });
}

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;

/** Let the proxied page's own background requests through the browser's cross-site checks. */
export async function OPTIONS(req: Request) {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS',
      'access-control-allow-headers': req.headers.get('access-control-request-headers') || '*',
      'access-control-max-age': '600',
    },
  });
}
