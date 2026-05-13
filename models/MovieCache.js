// ================================================================
// CINEVERSE v4 — MovieCache Model
// Stores TMDB data in MongoDB so:
//  1. Pages load fast even if TMDB is slow/rate-limited
//  2. Reduces API calls dramatically
//  3. Auto-refreshes on TTL expiry
// ================================================================
const mongoose = require('mongoose');

const movieCacheSchema = new mongoose.Schema({
  key:       { type: String, required: true, unique: true, index: true },
  data:      { type: mongoose.Schema.Types.Mixed, required: true },
  fetchedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, index: true }
}, { timestamps: false });

// Auto-delete expired docs (MongoDB TTL index)
movieCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('MovieCache', movieCacheSchema);
