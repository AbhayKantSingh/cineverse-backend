const express  = require('express');
const Review   = require('../models/Review');
const User     = require('../models/User');
const { protect, optionalAuth } = require('../middleware/auth');
const { awardXP, updateMonthlyXP } = require('../utils/xp');
const router   = express.Router();

router.get('/movie/:movieId', optionalAuth, async (req, res) => {
  const reviews = await Review.find({ movieId: parseInt(req.params.movieId), isDeleted: false }).sort({ createdAt: -1 }).limit(50);
  res.json({ success: true, reviews });
});

router.post('/movie/:movieId', protect, async (req, res) => {
  try {
    const movieId = parseInt(req.params.movieId);
    const { rating, text, movieTitle, posterPath } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ success:false, message:'Rating 1-5 required.' });
    const existing = await Review.findOne({ userId: req.user._id, movieId });
    const isNew    = !existing;
    const review   = await Review.findOneAndUpdate(
      { userId: req.user._id, movieId },
      { userId: req.user._id, username: req.user.username, userName: req.user.name, avatarEmoji: req.user.avatarEmoji||'🎬', avatarColor: req.user.avatarColor||0, movieId, movieTitle: movieTitle||'Unknown', posterPath: posterPath||'', rating: parseInt(rating), text: (text||'').slice(0,1000) },
      { upsert:true, new:true, setDefaultsOnInsert:true }
    );
    if (isNew) {
      const user = await User.findById(req.user._id);
      await awardXP(user, 25); await user.save();
      await updateMonthlyXP(user._id, 25, 'review', user);
    }
    res.json({ success:true, review });
  } catch(err) { console.error(err); res.status(500).json({ success:false, message:'Server error.' }); }
});

router.delete('/:reviewId', protect, async (req, res) => {
  const review = await Review.findById(req.params.reviewId);
  if (!review) return res.status(404).json({ success:false, message:'Not found.' });
  if (review.userId.toString() !== req.user._id.toString() && !req.user.isAdmin) return res.status(403).json({ success:false, message:'Not authorized.' });
  review.isDeleted = true; await review.save();
  res.json({ success:true });
});

router.post('/:reviewId/like', protect, async (req, res) => {
  const review  = await Review.findById(req.params.reviewId);
  if (!review) return res.status(404).json({ success:false, message:'Not found.' });
  const uid     = req.user._id;
  const idx     = review.likes.findIndex(id => id.toString() === uid.toString());
  const liked   = idx === -1;
  if (liked) {
    review.likes.push(uid);
    if (review.userId.toString() !== uid.toString()) {
      const author = await User.findById(review.userId);
      if (author) { await awardXP(author, 2); await author.save(); await updateMonthlyXP(author._id, 2, 'like_received', author); }
    }
  } else { review.likes.splice(idx, 1); }
  review.likeCount = review.likes.length; await review.save();
  res.json({ success:true, likeCount: review.likeCount, liked });
});

router.get('/feed/recent', async (req, res) => {
  const page    = parseInt(req.query.page) || 1;
  const reviews = await Review.find({ isDeleted:false }).sort({ createdAt:-1 }).skip((page-1)*20).limit(20);
  res.json({ success:true, reviews });
});

module.exports = router;
