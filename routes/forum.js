// ============================================
// CINEVERSE v3 - Forum Routes
// GET    /api/forum/movie/:movieId     - posts for a movie
// GET    /api/forum/recent             - global recent posts
// GET    /api/forum/:postId            - single post with replies
// POST   /api/forum/movie/:movieId     - create post
// POST   /api/forum/:postId/reply      - add reply
// POST   /api/forum/:postId/like       - like/unlike post
// DELETE /api/forum/:postId            - delete post
// ============================================
const express    = require('express');
const ForumPost  = require('../models/ForumPost');
const User       = require('../models/User');
const { protect, optionalAuth } = require('../middleware/auth');
const { awardXP, updateMonthlyXP } = require('../utils/xp');
const { sendReplyNotification }    = require('../utils/email');

const router = express.Router();

// ── GET POSTS FOR A MOVIE ──
router.get('/movie/:movieId', optionalAuth, async (req, res) => {
  try {
    const page  = parseInt(req.query.page) || 1;
    const posts = await ForumPost.find({ movieId: parseInt(req.params.movieId), isDeleted: false })
      .sort({ isPinned: -1, createdAt: -1 })
      .skip((page-1)*20).limit(20)
      .select('-replies'); // don't send replies in list view
    const total = await ForumPost.countDocuments({ movieId: parseInt(req.params.movieId), isDeleted: false });
    res.json({ success: true, posts, total, page });
  } catch(err) { res.status(500).json({ success:false, message:'Server error.' }); }
});

// ── GET RECENT GLOBAL POSTS ──
router.get('/recent', optionalAuth, async (req, res) => {
  try {
    const posts = await ForumPost.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('-replies');
    res.json({ success: true, posts });
  } catch(err) { res.status(500).json({ success:false, message:'Server error.' }); }
});

// ── GET SINGLE POST WITH REPLIES ──
router.get('/:postId', optionalAuth, async (req, res) => {
  try {
    const post = await ForumPost.findOne({ _id: req.params.postId, isDeleted: false });
    if (!post) return res.status(404).json({ success:false, message:'Post not found.' });
    post.views++;
    await post.save();
    res.json({ success: true, post });
  } catch(err) { res.status(500).json({ success:false, message:'Server error.' }); }
});

// ── CREATE POST ──
router.post('/movie/:movieId', protect, async (req, res) => {
  try {
    const { title, body, tags, movieTitle, posterPath } = req.body;
    if (!title?.trim() || !body?.trim()) return res.status(400).json({ success:false, message:'Title and body required.' });
    if (title.length > 200) return res.status(400).json({ success:false, message:'Title too long (max 200).' });
    if (body.length > 2000) return res.status(400).json({ success:false, message:'Body too long (max 2000).' });

    const post = await ForumPost.create({
      movieId:    parseInt(req.params.movieId),
      movieTitle: movieTitle || 'Unknown',
      posterPath: posterPath || '',
      userId:     req.user._id,
      username:   req.user.username,
      userName:   req.user.name,
      avatarEmoji:req.user.avatarEmoji || '🎬',
      avatarColor:req.user.avatarColor || 0,
      title:      title.trim(),
      body:       body.trim(),
      tags:       (tags || []).filter(t => ['spoiler','theory','recommendation','discussion','review','question','trivia'].includes(t))
    });

    // XP for creating a discussion post
    const user = await User.findById(req.user._id);
    await awardXP(user, 10); await user.save();
    await updateMonthlyXP(user._id, 10, 'forum_post', user);

    res.status(201).json({ success: true, post });
  } catch(err) { console.error(err); res.status(500).json({ success:false, message:'Server error.' }); }
});

// ── ADD REPLY ──
router.post('/:postId/reply', protect, async (req, res) => {
  try {
    const { body } = req.body;
    if (!body?.trim()) return res.status(400).json({ success:false, message:'Reply body required.' });
    if (body.length > 1000) return res.status(400).json({ success:false, message:'Reply too long (max 1000).' });

    const post = await ForumPost.findOne({ _id: req.params.postId, isDeleted: false });
    if (!post) return res.status(404).json({ success:false, message:'Post not found.' });

    const reply = {
      userId:     req.user._id,
      username:   req.user.username,
      userName:   req.user.name,
      avatarEmoji:req.user.avatarEmoji || '🎬',
      avatarColor:req.user.avatarColor || 0,
      body:       body.trim()
    };

    post.replies.push(reply);
    post.replyCount = post.replies.filter(r => !r.isDeleted).length;
    await post.save();

    // XP for replying
    const user = await User.findById(req.user._id);
    await awardXP(user, 5); await user.save();
    await updateMonthlyXP(user._id, 5, 'forum_reply', user);

    // Notify post author (if different user and has email)
    if (post.userId.toString() !== req.user._id.toString()) {
      const author = await User.findById(post.userId);
      if (author?.email && author.isVerified) {
        try { await sendReplyNotification(author.email, author.name, req.user.name, post.movieTitle); } catch {}
      }
    }

    res.json({ success: true, post });
  } catch(err) { console.error(err); res.status(500).json({ success:false, message:'Server error.' }); }
});

// ── LIKE / UNLIKE POST ──
router.post('/:postId/like', protect, async (req, res) => {
  try {
    const post = await ForumPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ success:false, message:'Not found.' });
    const uid  = req.user._id;
    const idx  = post.likes.findIndex(id => id.toString() === uid.toString());
    const liked = idx === -1;
    if (liked) post.likes.push(uid); else post.likes.splice(idx, 1);
    post.likeCount = post.likes.length;
    await post.save();
    res.json({ success:true, likeCount: post.likeCount, liked });
  } catch(err) { res.status(500).json({ success:false, message:'Server error.' }); }
});

// ── DELETE POST ──
router.delete('/:postId', protect, async (req, res) => {
  const post = await ForumPost.findById(req.params.postId);
  if (!post) return res.status(404).json({ success:false, message:'Not found.' });
  if (post.userId.toString() !== req.user._id.toString() && !req.user.isAdmin) return res.status(403).json({ success:false, message:'Not authorized.' });
  post.isDeleted = true; await post.save();
  res.json({ success:true });
});

module.exports = router;
