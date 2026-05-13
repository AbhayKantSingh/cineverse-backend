// ================================================================
// CINEVERSE v4 — User Activity Routes (Fixed)
// ================================================================
const express = require('express');
const User    = require('../models/User');
const TMDB    = require('../utils/tmdb');
const { protect }              = require('../middleware/auth');
const { awardXP, updateMonthlyXP } = require('../utils/xp');

const router = express.Router();

// ── WATCHLIST TOGGLE ──
router.post('/watchlist/:movieId', protect, async (req, res) => {
  try {
    const movieId = parseInt(req.params.movieId);
    const user    = await User.findById(req.user._id);
    const idx     = user.watchlist.findIndex(m => m.movieId === movieId);
    if (idx > -1) {
      user.watchlist.splice(idx, 1); await user.save();
      return res.json({ success:true, action:'removed', watchlist:user.watchlist });
    }
    const { title='Unknown', posterPath='' } = req.body;
    user.watchlist.unshift({ movieId, title, posterPath });
    await awardXP(user, 5); await user.save();
    await updateMonthlyXP(user._id, 5, 'watchlist', user);
    res.json({ success:true, action:'added', watchlist:user.watchlist });
  } catch(err) { console.error(err); res.status(500).json({ success:false, message:'Server error.' }); }
});

// ── MARK WATCHED ──
router.post('/watched/:movieId', protect, async (req, res) => {
  try {
    const movieId = parseInt(req.params.movieId);
    const user    = await User.findById(req.user._id);
    if (user.watched.some(m => m.movieId === movieId))
      return res.json({ success:true, action:'already_watched' });
    const { title='Unknown', posterPath='' } = req.body;
    user.watched.unshift({ movieId, title, posterPath });
    user.watchlist = user.watchlist.filter(m => m.movieId !== movieId);
    await awardXP(user, 15); await user.save();
    await updateMonthlyXP(user._id, 15, 'watched', user);
    res.json({ success:true, action:'watched', watched:user.watched });
  } catch(err) { res.status(500).json({ success:false, message:'Server error.' }); }
});

// ── FAVORITES TOGGLE ──
router.post('/favorites/:movieId', protect, async (req, res) => {
  try {
    const movieId = parseInt(req.params.movieId);
    const user    = await User.findById(req.user._id);
    const idx     = user.favorites.findIndex(m => m.movieId === movieId);
    if (idx > -1) {
      user.favorites.splice(idx, 1); await user.save();
      return res.json({ success:true, action:'unfavorited', favorites:user.favorites });
    }
    const { title='Unknown', posterPath='' } = req.body;
    user.favorites.unshift({ movieId, title, posterPath });
    await awardXP(user, 10); await user.save();
    await updateMonthlyXP(user._id, 10, 'favorite', user);
    res.json({ success:true, action:'favorited', favorites:user.favorites });
  } catch(err) { res.status(500).json({ success:false, message:'Server error.' }); }
});

// ── PERSONALISED RECOMMENDATIONS ──
router.get('/recommendations', protect, async (req, res) => {
  try {
    const user    = await User.findById(req.user._id);
    const seedIds = [
      ...user.favorites.slice(0,3).map(m=>m.movieId),
      ...user.watched.slice(0,3).map(m=>m.movieId)
    ].slice(0,6);
    const excludeIds = [
      ...user.watched.map(m=>m.movieId),
      ...user.favorites.map(m=>m.movieId)
    ];
    const genreIds = user.favoriteGenres || [];
    const lang     = user.preferredLanguages?.[0] || 'en';
    const results  = await TMDB.smartRecommendations(seedIds, genreIds, lang, excludeIds);
    res.json({ success:true, results });
  } catch(err) { console.error(err); res.status(500).json({ success:false, message:'Server error.' }); }
});

module.exports = router;
