// ================================================================
// CINEVERSE v4 — Admin Routes
// All routes require: protect + adminOnly middleware
// GET  /api/admin/stats          - site statistics
// GET  /api/admin/users          - paginated user list
// GET  /api/admin/pending-prizes - list winners with pending prizes
// POST /api/admin/pay-prize      - mark a prize as paid
// POST /api/admin/finalize-month - manually finalize a month
// DELETE /api/admin/review/:id   - delete any review
// DELETE /api/admin/post/:id     - delete any forum post
// ================================================================
const express     = require('express');
const User        = require('../models/User');
const Review      = require('../models/Review');
const ForumPost   = require('../models/ForumPost');
const Leaderboard = require('../models/Leaderboard');
const { protect, adminOnly } = require('../middleware/auth');
const { finalizeMonth }      = require('../utils/cron');

const router = express.Router();
router.use(protect, adminOnly);

// ── SITE STATS ──
router.get('/stats', async (req, res) => {
  try {
    const [users, reviews, posts, lbEntries] = await Promise.all([
      User.countDocuments(),
      Review.countDocuments({ isDeleted: false }),
      ForumPost.countDocuments({ isDeleted: false }),
      Leaderboard.countDocuments()
    ]);

    const cache = require('../utils/cache');
    const recentUsers = await User.find().sort({ createdAt: -1 }).limit(5).select('name username email createdAt xp');

    res.json({
      success: true,
      stats: { users, reviews, posts, lbEntries },
      cache:  cache.stats(),
      recentUsers
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── USER LIST ──
router.get('/users', async (req, res) => {
  try {
    const page  = parseInt(req.query.page) || 1;
    const limit = 50;
    const users = await User.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-password -verifyCode -verifyCodeExpires');
    const total = await User.countDocuments();
    res.json({ success: true, users, total, page });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PENDING PRIZES ──
router.get('/pending-prizes', async (req, res) => {
  try {
    const pending = await Leaderboard.find({ prize: { $gt: 0 }, prizeStatus: 'pending' })
      .sort({ month: -1, rank: 1 })
      .populate('userId', 'name email upiId');
    res.json({ success: true, prizes: pending });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── MARK PRIZE PAID ──
router.post('/pay-prize', async (req, res) => {
  try {
    const { userId, month } = req.body;
    if (!userId || !month) return res.status(400).json({ success: false, message: 'userId and month required.' });

    const entry = await Leaderboard.findOneAndUpdate(
      { userId, month },
      { prizeStatus: 'paid' },
      { new: true }
    );

    await User.findByIdAndUpdate(userId, {
      $set: { 'rewards.$[r].paid': true, 'rewards.$[r].claimedAt': new Date() }
    }, { arrayFilters: [{ 'r.month': month }] });

    res.json({ success: true, entry });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── MANUALLY FINALIZE A MONTH ──
router.post('/finalize-month', async (req, res) => {
  try {
    const { month } = req.body;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, message: 'Valid month required (YYYY-MM).' });
    }
    await finalizeMonth(month);
    res.json({ success: true, message: `Month ${month} finalized successfully.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE REVIEW (admin) ──
router.delete('/review/:id', async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
    if (!review) return res.status(404).json({ success: false, message: 'Review not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE FORUM POST (admin) ──
router.delete('/post/:id', async (req, res) => {
  try {
    const post = await ForumPost.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── CACHE FLUSH (emergency) ──
router.post('/flush-cache', async (req, res) => {
  try {
    const cache = require('../utils/cache');
    await cache.flush();
    res.json({ success: true, message: 'Cache flushed.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
