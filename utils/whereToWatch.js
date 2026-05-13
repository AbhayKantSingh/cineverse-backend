// ================================================================
// CINEVERSE v4 — Where To Watch (WatchMode + TMDB fallback)
// Fixed: uses getKeys()[0] instead of hardcoded TMDB_KEY_1
// ================================================================
const axios  = require('axios');
const cache  = require('./cache');
const TMDB   = require('./tmdb');

const WATCHMODE_BASE = 'https://api.watchmode.com/v1';

// ── TMDB PROVIDERS (always available, no extra key) ──
async function getTMDBProviders(tmdbId, type = 'movie') {
  const ck = `wtw:tmdb:${type}:${tmdbId}`;
  const cached = await cache.get(ck); if (cached) return cached;
  try {
    const key = TMDB.getKeys()[0];
    if (!key) return null;
    const { data } = await axios.get(
      `https://api.themoviedb.org/3/${type}/${tmdbId}/watch/providers`,
      { params: { api_key: key }, timeout: 8000 }
    );
    const results = data?.results || {};
    const region  = results.IN || results.US || Object.values(results)[0] || {};
    const providers = {
      link:     region.link || null,
      flatrate: fmt(region.flatrate, 'stream'),
      rent:     fmt(region.rent,     'rent'),
      buy:      fmt(region.buy,      'buy'),
      free:     fmt(region.free,     'free'),
      _source: 'tmdb'
    };
    await cache.set(ck, providers, 3600);
    return providers;
  } catch { return null; }
}

function fmt(list, type) {
  if (!list?.length) return [];
  return list.map(p => ({
    id:   p.provider_id,
    name: p.provider_name,
    logo: p.logo_path ? `https://image.tmdb.org/t/p/w92${p.logo_path}` : null,
    type,
    url:  null
  }));
}

// ── WATCHMODE (richer data, direct links) ──
async function getWatchModeProviders(tmdbId, type = 'movie') {
  const key = process.env.WATCHMODE_API_KEY;
  if (!key || key === 'YOUR_WATCHMODE_API_KEY') return null;
  const ck = `wtw:wm:${type}:${tmdbId}`;
  const cached = await cache.get(ck); if (cached) return cached;
  try {
    const sr = await axios.get(`${WATCHMODE_BASE}/search/`, {
      params: { apiKey: key, search_field: 'tmdb_movie_id', search_value: tmdbId }, timeout: 8000
    });
    const wmId = sr.data?.title_results?.[0]?.id;
    if (!wmId) return null;
    const sources = await axios.get(`${WATCHMODE_BASE}/title/${wmId}/sources/`, {
      params: { apiKey: key, regions: 'IN,US' }, timeout: 8000
    });
    const result = { flatrate:[], rent:[], buy:[], free:[], _source:'watchmode' };
    for (const s of (sources.data || [])) {
      const item = { id:s.source_id, name:s.name, logo:s.logo_100px||null, url:s.web_url||null, price:s.price?`₹${Math.round(s.price*83)}`:null };
      if (s.type==='sub')  result.flatrate.push(item);
      else if(s.type==='rent') result.rent.push(item);
      else if(s.type==='buy')  result.buy.push(item);
      else if(s.type==='free') result.free.push(item);
    }
    await cache.set(ck, result, 3600);
    return result;
  } catch(e) { console.warn('[WatchMode]', e.message); return null; }
}

function dedup(list) { const s=new Set(); return list.filter(p=>{const k=p.name||p.id;return s.has(k)?false:(s.add(k),true);}); }

async function getWhereToWatch(tmdbId, type = 'movie') {
  const [tmdb, wm] = await Promise.all([
    getTMDBProviders(tmdbId, type),
    getWatchModeProviders(tmdbId, type)
  ]);
  const p = wm || tmdb;
  if (!p) return { available: false, providers: {} };
  const has = (p.flatrate?.length||0) + (p.rent?.length||0) + (p.buy?.length||0) + (p.free?.length||0) > 0;
  return {
    available: has,
    link:      p.link || null,
    providers: { stream:dedup(p.flatrate||[]), rent:dedup(p.rent||[]), buy:dedup(p.buy||[]), free:dedup(p.free||[]) },
    _source:   p._source
  };
}

module.exports = { getWhereToWatch };
