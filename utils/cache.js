// ================================================================
// CINEVERSE v4 — Smart Cache (node-cache, upgradeable to Redis)
// ================================================================
const NodeCache = require('node-cache');

// Default TTLs (seconds)
const TTL = {
  trending:  parseInt(process.env.CACHE_TRENDING_TTL) || 1800,  // 30 min
  movie:     parseInt(process.env.CACHE_MOVIE_TTL)    || 86400, // 24 hr
  search:    parseInt(process.env.CACHE_SEARCH_TTL)   || 300,   // 5 min
  discover:  1800,
  genres:    86400,
  wtw:       3600,  // where-to-watch: 1 hr
  default:   600
};

const cache = new NodeCache({ stdTTL: TTL.default, checkperiod: 120, useClones: false });

let hits = 0, misses = 0;

function makeKey(prefix, ...parts) {
  return `${prefix}:${parts.join(':')}`;
}

async function get(key) {
  const val = cache.get(key);
  if (val !== undefined) { hits++; return val; }
  misses++;
  return null;
}

async function set(key, value, ttl) {
  cache.set(key, value, ttl || TTL.default);
}

async function del(key) {
  cache.del(key);
}

async function flush() {
  cache.flushAll();
}

function stats() {
  return { hits, misses, keys: cache.keys().length, hitRate: hits + misses > 0 ? ((hits / (hits + misses)) * 100).toFixed(1) + '%' : '0%' };
}

// Wrap async function with caching
async function cached(key, ttl, fn) {
  const existing = await get(key);
  if (existing !== null) return existing;
  const result = await fn();
  if (result !== null && result !== undefined) await set(key, result, ttl);
  return result;
}

module.exports = { get, set, del, flush, stats, makeKey, cached, TTL };
