const mongoose = require('mongoose');

const watchPartySchema = new mongoose.Schema({
  roomId:     { type: String, required: true, unique: true, uppercase: true },
  hostName:   { type: String, default: 'Host' },
  movieTitle: { type: String, default: 'Watch Party' },
  posterPath: { type: String, default: '' },
  mediaType:  { type: String, default: 'movie' },
  videoSrc:   { type: String, required: true },

  // ── Playback state ────────────────────────────────────────────
  // playing     : is it currently playing?
  // currentTime : video seconds at the moment `updatedAt` was set
  // updatedAt   : server ms timestamp of last state change
  // So live position = currentTime + (Date.now() - updatedAt)/1000  (if playing)
  playing:     { type: Boolean, default: false },
  currentTime: { type: Number,  default: 0 },
  updatedAt:   { type: Number,  default: () => Date.now() },

  // ── Members (socket-id keyed, cleared on leave) ───────────────
  members: { type: mongoose.Schema.Types.Mixed, default: {} },

  // ── Chat history (capped at 200) ──────────────────────────────
  chat: [{
    id:    Number,
    uid:   String,
    name:  String,
    emoji: String,
    color: String,
    text:  String,
    ts:    Number
  }],

  // ── Host tracking ─────────────────────────────────────────────
  hostSocketId: { type: String, default: '' },

  createdAt: { type: Date, default: Date.now }
});

// Compute live video position right now
watchPartySchema.methods.livePosition = function () {
  if (!this.playing) return this.currentTime;
  return this.currentTime + (Date.now() - this.updatedAt) / 1000;
};

// Update playback state and persist
watchPartySchema.methods.setPlayback = function (playing, currentTime) {
  this.playing     = playing;
  this.currentTime = currentTime;
  this.updatedAt   = Date.now();
  return this.save();
};

module.exports = mongoose.model('WatchParty', watchPartySchema);
