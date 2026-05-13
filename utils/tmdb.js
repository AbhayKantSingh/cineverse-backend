// ================================================================
// CINEVERSE v4 — TMDB API Client (Fixed & Production-Ready)
// • Keys: TMDB_KEY_1 … TMDB_KEY_5
// • L1: In-memory cache | L2: MongoDB cache
// ================================================================
const axios    = require('axios');
const memCache = require('./cache');

let MovieCacheModel = null;
function getDB() {
  if (!MovieCacheModel) {
    try { MovieCacheModel = require('../models/MovieCache'); } catch {}
  }
  return MovieCacheModel;
}

const BASE = 'https://api.themoviedb.org/3';
const TTL  = { trending:1800, discover:3600, movie:86400, search:300, genres:604800, wtw:3600, default:600 };

// ── 5-KEY POOL ──
function getKeys() {
  return [
    process.env.TMDB_KEY_1, process.env.TMDB_KEY_2, process.env.TMDB_KEY_3,
    process.env.TMDB_KEY_4, process.env.TMDB_KEY_5
  ].filter(Boolean);
}

let ki = 0;
const kerr = {};
function pickKey() {
  const keys = getKeys();
  if (!keys.length) { console.error('[TMDB] No keys! Add TMDB_KEY_1 to .env'); return null; }
  for (let i = 0; i < keys.length; i++) {
    const k = keys[(ki + i) % keys.length];
    if ((kerr[k] || 0) < 3) { ki = (ki + i + 1) % keys.length; return k; }
  }
  Object.keys(kerr).forEach(k => delete kerr[k]); return keys[0];
}
function markErr(key) { kerr[key] = (kerr[key] || 0) + 1; setTimeout(() => { if(kerr[key]>0)kerr[key]--; }, 60000); }

// ── RAW FETCH with key rotation ──
async function tmdbFetch(path, params = {}, attempt = 0) {
  const keys = getKeys();
  if (!keys.length || attempt >= Math.max(keys.length, 1)) return null;
  const key = pickKey(); if (!key) return null;
  try {
    const { data } = await axios.get(`${BASE}${path}`, {
      params: { api_key: key, language: 'en-US', ...params }, timeout: 12000
    });
    return data;
  } catch (err) {
    const s = err.response?.status;
    if (s === 429 || s === 401) { markErr(key); return tmdbFetch(path, params, attempt + 1); }
    if (s === 404) return null;
    console.error(`[TMDB] ${path} → ${s||err.message}`); return null;
  }
}

// ── DB CACHE ──
async function dbGet(key) {
  const MC = getDB(); if (!MC) return null;
  try { const d = await MC.findOne({ key, expiresAt:{$gt:new Date()} }).lean(); return d?.data||null; } catch { return null; }
}
async function dbSet(key, data, ttlSec) {
  const MC = getDB(); if (!MC) return;
  try { await MC.findOneAndUpdate({key},{key,data,fetchedAt:new Date(),expiresAt:new Date(Date.now()+ttlSec*1000)},{upsert:true}); } catch {}
}

// ── TWO-LAYER CACHED FETCH ──
async function tmdb(path, params = {}, ttl = TTL.default) {
  const ck = `tmdb:${path}:${JSON.stringify(params)}`;
  const m1 = await memCache.get(ck); if (m1) return m1;
  const m2 = await dbGet(ck); if (m2) { await memCache.set(ck, m2, Math.min(ttl,600)); return m2; }
  const r  = await tmdbFetch(path, params);
  if (r) { await memCache.set(ck, r, Math.min(ttl,600)); await dbSet(ck, r, ttl); }
  return r;
}

// Force-refresh (called by cron to pre-warm cache)
async function forceRefresh(path, params = {}, ttl = TTL.default) {
  const ck = `tmdb:${path}:${JSON.stringify(params)}`;
  const r  = await tmdbFetch(path, params);
  if (r) { await memCache.set(ck,r,Math.min(ttl,600)); await dbSet(ck,r,ttl); }
  return r;
}

// ── API METHODS ──
const trending    = (t='movie',w='week') => tmdb(`/trending/${t}/${w}`,    {},               TTL.trending);
const nowPlaying  = (p=1)  => tmdb('/movie/now_playing',  {page:p},        TTL.discover);
const popular     = (p=1)  => tmdb('/movie/popular',      {page:p},        TTL.discover);
const topRated    = (p=1)  => tmdb('/movie/top_rated',    {page:p},        TTL.discover);
const upcoming    = ()     => tmdb('/movie/upcoming',      {},              TTL.discover);
const popularTV   = (p=1)  => tmdb('/tv/popular',          {page:p},        TTL.discover);
const topRatedTV  = ()     => tmdb('/tv/top_rated',        {},              TTL.discover);
const airingToday = ()     => tmdb('/tv/airing_today',     {},              TTL.trending);

const movieDetail  = (id) => tmdb(`/movie/${id}`, { append_to_response:'credits,videos,similar,reviews,keywords,watch/providers,external_ids' }, TTL.movie);
const tvDetail     = (id) => tmdb(`/tv/${id}`,    { append_to_response:'credits,videos,similar,reviews,aggregate_credits,watch/providers,external_ids' }, TTL.movie);
const personDetail = (id) => tmdb(`/person/${id}`,{ append_to_response:'movie_credits,tv_credits,external_ids' }, TTL.movie);

const genres          = (t='movie') => tmdb(`/genre/${t}/list`, {}, TTL.genres);
const recommendations = (id)        => tmdb(`/movie/${id}/recommendations`, {}, TTL.discover);
const similar         = (id)        => tmdb(`/movie/${id}/similar`,         {}, TTL.discover);
const discover        = (p)         => tmdb('/discover/movie', {sort_by:'popularity.desc','vote_count.gte':50,...p},  TTL.discover);
const discoverTV      = (p)         => tmdb('/discover/tv',    {sort_by:'popularity.desc',...p},                       TTL.discover);

// ── MULTI-SEARCH ──
async function search(query, page = 1) {
  const ck = `search:${query.toLowerCase().trim()}:${page}`;
  const m  = await memCache.get(ck); if (m) return m;
  const [multi, movies, tv] = await Promise.all([
    tmdbFetch('/search/multi', {query:query.trim(),page,include_adult:false}),
    tmdbFetch('/search/movie', {query:query.trim(),page}),
    tmdbFetch('/search/tv',    {query:query.trim(),page}),
  ]);
  const seen=new Set(), out=[];
  const add=(items,ft)=>{ for(const x of (items||[])){if(x.media_type==='person')continue;const id=`${ft||x.media_type||'movie'}-${x.id}`;if(!seen.has(id)){seen.add(id);out.push({...x,media_type:ft||x.media_type||'movie'});}}};
  add(multi?.results); add(movies?.results,'movie'); add(tv?.results,'tv');
  const ql=query.toLowerCase().trim();
  out.sort((a,b)=>{
    const at=(a.title||a.name||'').toLowerCase(),bt=(b.title||b.name||'').toLowerCase();
    const as=at===ql?3:at.startsWith(ql)?2:at.includes(ql)?1:0,bs=bt===ql?3:bt.startsWith(ql)?2:bt.includes(ql)?1:0;
    return bs!==as?bs-as:(b.popularity||0)-(a.popularity||0);
  });
  const result={results:out.slice(0,15),total:out.length};
  await memCache.set(ck,result,TTL.search);
  return result;
}

// ── SMART RECOMMENDATIONS ──
async function smartRecommendations(seedIds=[], genreIds=[], lang='en', excludeIds=[]) {
  const excl=new Set(excludeIds.map(Number)); let merged=[];
  if(seedIds.length){const recs=await Promise.all(seedIds.slice(0,5).map(id=>recommendations(id)));for(const r of recs)for(const m of(r?.results||[]))if(!excl.has(m.id)){excl.add(m.id);merged.push({...m,_src:'recs'});}}
  for(const gid of genreIds.slice(0,3)){const d=await discover({with_genres:gid,sort_by:'vote_average.desc','vote_count.gte':200});for(const m of(d?.results||[]))if(!excl.has(m.id)){excl.add(m.id);merged.push({...m,_src:'genre'});}}
  if(lang&&lang!=='en'){const d=await discover({with_original_language:lang,sort_by:'popularity.desc'});for(const m of(d?.results||[]))if(!excl.has(m.id)){excl.add(m.id);merged.push(m);}}
  if(merged.length<8){const pop=await popular();for(const m of(pop?.results||[]))if(!excl.has(m.id)){excl.add(m.id);merged.push(m);}}
  merged.sort((a,b)=>{
    let sa=(a.vote_average||0)*Math.log((a.popularity||1)+1),sb=(b.vote_average||0)*Math.log((b.popularity||1)+1);
    if((a.genre_ids||[]).some(g=>genreIds.includes(g)))sa*=1.3;if((b.genre_ids||[]).some(g=>genreIds.includes(g)))sb*=1.3;
    if(a._src==='recs')sa*=1.2;if(b._src==='recs')sb*=1.2;return sb-sa;
  });
  return merged.slice(0,24);
}

module.exports = { tmdb, tmdbFetch, forceRefresh, trending, nowPlaying, popular, topRated, upcoming, popularTV, topRatedTV, airingToday, movieDetail, tvDetail, personDetail, genres, recommendations, similar, discover, discoverTV, search, smartRecommendations, getKeys, TTL };
