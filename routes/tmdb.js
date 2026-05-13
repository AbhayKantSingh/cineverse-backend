// ================================================================
// CINEVERSE v4 — TMDB Routes (production-ready)
// ================================================================
const express = require('express');
const TMDB    = require('../utils/tmdb');
const WTW     = require('../utils/whereToWatch');
const cache   = require('../utils/cache');
const router  = express.Router();

// ── SEARCH ──
router.get('/search', async (req, res) => {
  const { q, page = 1 } = req.query;
  if (!q?.trim()) return res.status(400).json({ success: false, message: 'Query required.' });
  const data = await TMDB.search(q.trim(), parseInt(page));
  res.json({ success: true, results: data?.results || [], total: data?.total_results });
});

// ── TRENDING ──
router.get('/trending/:type/:win', async (req, res) => {
  const d = await TMDB.trending(req.params.type, req.params.win);
  res.json(d || { results: [] });
});

// ── MOVIE DETAIL ──
router.get('/movie/:id', async (req, res) => {
  const d = await TMDB.movieDetail(parseInt(req.params.id));
  if (!d) return res.status(404).json({ success: false, message: 'Not found.' });
  res.json({ success: true, movie: d });
});

// ── TV DETAIL ──
router.get('/tv/:id', async (req, res) => {
  const d = await TMDB.tvDetail(parseInt(req.params.id));
  if (!d) return res.status(404).json({ success: false, message: 'Not found.' });
  res.json({ success: true, movie: d });
});

// ── PERSON ──
router.get('/person/:id', async (req, res) => {
  const d = await TMDB.personDetail(parseInt(req.params.id));
  if (!d) return res.status(404).json({ success: false, message: 'Not found.' });
  res.json({ success: true, person: d });
});

// ── WHERE TO WATCH ──
router.get('/where-to-watch/:type/:id', async (req, res) => {
  const { type, id } = req.params;
  if (!['movie','tv'].includes(type)) return res.status(400).json({ success: false, message: 'Type must be movie or tv.' });
  try {
    const data = await WTW.getWhereToWatch(parseInt(id), type);
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('[WTW]', err.message);
    res.json({ success: false, available: false, providers: {} });
  }
});

// ── GENRES ──
router.get('/genres', async (req, res) => {
  const [m, t] = await Promise.all([TMDB.genres('movie'), TMDB.genres('tv')]);
  res.json({ success: true, movieGenres: m?.genres || [], tvGenres: t?.genres || [] });
});

// ── DISCOVER ──
router.get('/discover', async (req, res) => {
  const { genre, lang, sort = 'popularity.desc', page = 1, year, rating_gte, type = 'movie' } = req.query;
  const params = { sort_by: sort, page, 'vote_count.gte': 50 };
  if (genre)      params.with_genres = genre;
  if (lang)       params.with_original_language = lang;
  if (year)       params.primary_release_year = year;
  if (rating_gte) params['vote_average.gte'] = rating_gte;
  const d = type === 'tv' ? await TMDB.discoverTV(params) : await TMDB.discover(params);
  res.json(d || { results: [] });
});

// ── SIMPLE ROWS ──
router.get('/now-playing', async (req, res) => res.json(await TMDB.nowPlaying(req.query.page) || { results: [] }));
router.get('/top-rated',   async (req, res) => res.json(await TMDB.topRated(req.query.page)   || { results: [] }));
router.get('/upcoming',    async (req, res) => res.json(await TMDB.upcoming()                  || { results: [] }));
router.get('/popular',     async (req, res) => res.json(await TMDB.popular(req.query.page)     || { results: [] }));
router.get('/popular-tv',  async (req, res) => res.json(await TMDB.popularTV(req.query.page)   || { results: [] }));
router.get('/top-rated-tv',async (req, res) => res.json(await TMDB.topRatedTV()                || { results: [] }));
router.get('/airing-today',async (req, res) => res.json(await TMDB.airingToday()               || { results: [] }));

// ── API STATUS ──
router.get('/status', (req, res) => {
  const keys  = TMDB.getKeys();
  const stats = cache.stats();
  res.json({
    success:    true,
    tmdbKeys:   keys.length,
    watchmode:  !!process.env.WATCHMODE_API_KEY && process.env.WATCHMODE_API_KEY !== 'YOUR_WATCHMODE_API_KEY',
    youtube:    !!process.env.YOUTUBE_API_KEY   && process.env.YOUTUBE_API_KEY   !== 'YOUR_YOUTUBE_API_KEY',
    cache:      stats
  });
});

module.exports = router;
