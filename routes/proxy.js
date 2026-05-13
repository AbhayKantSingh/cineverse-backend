// ================================================================
// CINEVERSE — Embed Proxy Route
// Fetches embed pages server-side, strips popup/ad JS, serves clean
// ================================================================
const express = require('express');
const router  = express.Router();
const https   = require('https');
const http    = require('http');
const { URL } = require('url');

const ALLOWED_DOMAINS = [
  'vidfast.pro','vidsrc.xyz','player.vidify.top','vidsrc.cc',
  'player.vidplus.to','willow.arlen.icu','nunflix.org','111movies.com',
  'player.videasy.net','vidrock.net','vidapi.xyz','spencerdevs.xyz',
  'player.vidzee.wtf','tmovie.tv','multiembed.mov',
];

const POPUP_PATTERNS = [
  /window\.open\s*\([^;)]*\)/g,
  /\.target\s*=\s*['"]_blank['"]/g,
  /(?:top|parent|window)\.location(?:\.href)?\s*=\s*['"][^'"]{10,}['"]/g,
  /(?:popunder|popUp|pop_under|newTab|openTab|openWindow)\s*\([^)]*\)/gi,
];

const AD_SCRIPT_SRC_RE = /<script[^>]+src=["'][^"']*(?:popunder|pop_under|adsterra|propellerads|hilltopads|popad|trafficjunky|exoclick|juicyads|plugrush|adspyglass|adskeeper|adcash|monetag|hilltop)[^"']*["'][^>]*>\s*<\/script>/gi;

function stripPopups(html, baseUrl) {
  let h = html;

  // 1. Remove known ad external scripts
  h = h.replace(AD_SCRIPT_SRC_RE, '');

  // 2. Strip popup calls inside inline scripts
  h = h.replace(/<script(\b[^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, code) => {
    if (/\bsrc\s*=/i.test(attrs)) return m;
    let c = code;
    for (const p of POPUP_PATTERNS) c = c.replace(p, '/* cv-blocked */');
    return `<script${attrs}>${c}</script>`;
  });

  // 3. Remove _blank from anchors
  h = h.replace(/(<a\b[^>]*)\btarget\s*=\s*["']_blank["']([^>]*>)/gi, '$1target="_self"$2');

  // 4. Remove any X-Frame or CSP meta tags the page itself sets
  h = h.replace(/<meta[^>]+(?:x-frame-options|content-security-policy)[^>]*>/gi, '');

  // 5. Inject blocker + base tag
  const base   = new URL(baseUrl);
  const inject = `<base href="${base.origin}/"><script>window.open=function(){return{close:function(){},focus:function(){},blur:function(){},document:{write:function(){},close:function(){}},location:{href:''}};};document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a'):null;if(a&&a.target==='_blank')a.target='_self';},true);</script>`;

  if (/<head[^>]*>/i.test(h)) {
    h = h.replace(/<head([^>]*)>/i, `<head$1>${inject}`);
  } else {
    h = inject + h;
  }

  return h;
}

function fetchUrl(targetUrl, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 6) return reject(new Error('Too many redirects'));
    const parsed = new URL(targetUrl);
    const lib = parsed.protocol === 'https:' ? https : http;

    const req = lib.request({
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   'GET',
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Referer':         `${parsed.protocol}//${parsed.hostname}/`,
        'Origin':          `${parsed.protocol}//${parsed.hostname}`,
        'DNT':             '1',
        'Cache-Control':   'no-cache',
      },
      timeout: 20000,
    }, (res) => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        return fetchUrl(new URL(res.headers.location, targetUrl).href, redirectCount+1).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        body:        Buffer.concat(chunks).toString('utf8'),
        statusCode:  res.statusCode,
        contentType: res.headers['content-type'] || 'text/html',
      }));
    });

    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

// GET /api/proxy/embed?url=...
router.get('/embed', async (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).send('Missing url');

  let targetUrl;
  try {
    targetUrl = decodeURIComponent(rawUrl);
    const parsed   = new URL(targetUrl);
    const hostname = parsed.hostname.replace(/^www\./, '');
    if (!ALLOWED_DOMAINS.some(d => hostname === d || hostname.endsWith('.'+d))) {
      return res.status(403).send('Domain not allowed');
    }
  } catch { return res.status(400).send('Invalid URL'); }

  try {
    const { body, statusCode, contentType } = await fetchUrl(targetUrl);

    // ── Key fix: headers that allow this response to be framed by OUR site ──
    res.removeHeader('X-Frame-Options');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache, no-store');

    if (!contentType.includes('text/html')) {
      res.setHeader('Content-Type', contentType);
      return res.status(statusCode).send(body);
    }

    const clean = stripPopups(body, targetUrl);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Do NOT set X-Frame-Options — we WANT this to be frameable by our frontend
    res.status(200).send(clean);

  } catch (err) {
    console.error('[PROXY]', err.message);
    res.status(502).send(`<html><body style="margin:0;background:#000;color:#fff;display:flex;height:100vh;align-items:center;justify-content:center;flex-direction:column;font-family:sans-serif"><h2 style="color:#00e5ff">⚠️ Player Unavailable</h2><p style="color:#888">Try a different server above</p></body></html>`);
  }
});

module.exports = router;
