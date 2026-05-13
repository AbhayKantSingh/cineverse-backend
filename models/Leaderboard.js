const mongoose = require('mongoose');

const leaderboardSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username:    { type: String, required: true },
  userName:    { type: String, required: true },
  avatarEmoji: { type: String, default: '🎬' },
  avatarColor: { type: Number, default: 0 },
  month:       { type: String, required: true },
  xp:          { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 },
  watchedCount:{ type: Number, default: 0 },
  likeCount:   { type: Number, default: 0 },
  rank:        { type: Number },
  prize:       { type: Number, default: 0 },
  prizeStatus: { type: String, enum: ['none','pending','paid'], default: 'none' },
  upiId:       { type: String, default: '' }
}, { timestamps: true });

leaderboardSchema.index({ month: 1, xp: -1 });
leaderboardSchema.index({ userId: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('Leaderboard', leaderboardSchema);
