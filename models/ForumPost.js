// ============================================
// CINEVERSE v3 - Forum Post Model
// ============================================
const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username:    { type: String, required: true },
  userName:    { type: String, required: true },
  avatarEmoji: { type: String, default: '🎬' },
  avatarColor: { type: Number, default: 0 },
  body:        { type: String, required: true, maxlength: 1000 },
  likes:       [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  likeCount:   { type: Number, default: 0 },
  isDeleted:   { type: Boolean, default: false }
}, { timestamps: true });

const forumPostSchema = new mongoose.Schema({
  // Movie context
  movieId:    { type: Number, required: true },
  movieTitle: { type: String, required: true },
  posterPath: { type: String, default: '' },

  // Author
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username:    { type: String, required: true },
  userName:    { type: String, required: true },
  avatarEmoji: { type: String, default: '🎬' },
  avatarColor: { type: Number, default: 0 },

  // Content
  title:   { type: String, required: true, maxlength: 200 },
  body:    { type: String, required: true, maxlength: 2000 },
  tags:    [{ type: String, enum: ['spoiler','theory','recommendation','discussion','review','question','trivia'] }],

  // Engagement
  replies:     [replySchema],
  replyCount:  { type: Number, default: 0 },
  likes:       [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  likeCount:   { type: Number, default: 0 },
  views:       { type: Number, default: 0 },
  isPinned:    { type: Boolean, default: false },
  isDeleted:   { type: Boolean, default: false }
}, { timestamps: true });

forumPostSchema.index({ movieId: 1, createdAt: -1 });
forumPostSchema.index({ createdAt: -1 });
forumPostSchema.index({ likeCount: -1 });

module.exports = mongoose.model('ForumPost', forumPostSchema);
