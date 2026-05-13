// ============================================
// CINEVERSE v3 - User Model
// ============================================
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const movieRefSchema = new mongoose.Schema({
  movieId:    { type: Number, required: true },
  title:      { type: String, required: true },
  posterPath: { type: String, default: '' },
  addedAt:    { type: Date, default: Date.now }
}, { _id: false });

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true, maxlength: 50 },
  username: { type: String, required: true, unique: true, trim: true, lowercase: true, minlength: 3, maxlength: 20 },
  email:    { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true, minlength: 6, select: false },

  // Email verification
  isVerified:        { type: Boolean, default: false },
  verifyCode:        { type: String, select: false },
  verifyCodeExpires: { type: Date, select: false },

  // Avatar
  avatarEmoji: { type: String, default: '🎬' },
  avatarColor: { type: Number, default: 0 },

  // Onboarding
  onboardingDone:     { type: Boolean, default: false },
  favoriteGenres:     [{ type: Number }],
  preferredLanguages: [{ type: String }],
  moodTags:           [{ type: String }],

  // Activity
  watchlist: [movieRefSchema],
  watched:   [movieRefSchema],
  favorites: [movieRefSchema],

  // Stats
  xp:        { type: Number, default: 0 },
  level:     { type: Number, default: 1 },
  streak:    { type: Number, default: 0 },
  lastActive:{ type: Date, default: Date.now },

  // Monthly leaderboard
  monthlyXP:    { type: Number, default: 0 },
  monthlyMonth: { type: String, default: '' },

  // Prizes
  rewards: [{
    month:     { type: String },
    rank:      { type: Number },
    prize:     { type: Number },
    paid:      { type: Boolean, default: false },
    claimedAt: { type: Date }
  }],

  upiId:   { type: String, default: '' },
  isAdmin: { type: Boolean, default: false },
  joined:  { type: Date, default: Date.now }
}, { timestamps: true });

// Hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function(pw) {
  return bcrypt.compare(pw, this.password);
};

userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.verifyCode;
  delete obj.verifyCodeExpires;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
