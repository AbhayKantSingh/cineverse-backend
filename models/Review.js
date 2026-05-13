const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username:    { type: String, required: true },
  userName:    { type: String, required: true },
  avatarEmoji: { type: String, default: '🎬' },
  avatarColor: { type: Number, default: 0 },
  movieId:     { type: Number, required: true },
  movieTitle:  { type: String, required: true },
  posterPath:  { type: String, default: '' },
  rating:      { type: Number, required: true, min: 1, max: 5 },
  text:        { type: String, maxlength: 1000, default: '' },
  likes:       [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  likeCount:   { type: Number, default: 0 },
  isDeleted:   { type: Boolean, default: false }
}, { timestamps: true });

reviewSchema.index({ userId: 1, movieId: 1 }, { unique: true });
reviewSchema.index({ movieId: 1 });
reviewSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);
