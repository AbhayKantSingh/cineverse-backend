// ================================================================
// CINEVERSE — Watch Party Routes + Socket.IO  (MongoDB-backed)
// ================================================================
const express    = require('express');
const router     = express.Router();
const { optionalAuth } = require('../middleware/auth');
const { v4: uuidv4 }   = require('uuid');
const WatchParty        = require('../models/WatchParty');

// ── REST: Create Room ──────────────────────────────────────────
router.post('/create', optionalAuth, async (req, res) => {
  try {
    const { movieId, movieTitle, posterPath, videoSrc, mediaType } = req.body;
    if (!videoSrc) return res.status(400).json({ success: false, message: 'videoSrc required' });

    const roomId = uuidv4().slice(0, 8).toUpperCase();

    await WatchParty.create({
      roomId,
      hostName:   req.user?.name || req.user?.username || 'Host',
      movieTitle: movieTitle || 'Unknown',
      posterPath: posterPath || '',
      mediaType:  mediaType  || 'movie',
      videoSrc,
      playing:     false,
      currentTime: 0,
      updatedAt:   Date.now(),
      members:     {},
      chat:        []
    });

    res.json({ success: true, roomId });
  } catch (err) {
    console.error('[WatchParty] create error:', err);
    res.status(500).json({ success: false, message: 'Failed to create room' });
  }
});

// ── REST: Get Room Info ────────────────────────────────────────
router.get('/:roomId', async (req, res) => {
  try {
    const room = await WatchParty.findOne({ roomId: req.params.roomId.toUpperCase() });
    if (!room) return res.status(404).json({ success: false, message: 'Room not found or expired' });
    res.json({
      success: true,
      room: {
        id:          room.roomId,
        hostName:    room.hostName,
        movieTitle:  room.movieTitle,
        posterPath:  room.posterPath,
        mediaType:   room.mediaType,
        memberCount: Object.keys(room.members || {}).length,
        createdAt:   room.createdAt
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── Socket.IO handler ──────────────────────────────────────────
function initWatchParty(io) {
  const nsp = io.of('/watchparty');

  nsp.use((socket, next) => {
    const { roomId, displayName } = socket.handshake.query;
    if (!roomId || !displayName) return next(new Error('Missing roomId or displayName'));
    next();
  });

  nsp.on('connection', async socket => {
    const { roomId, displayName, avatarEmoji = '🎬', avatarColor = '#00e5ff' } =
      socket.handshake.query;
    const RID = roomId.toUpperCase();

    // ── Load room from MongoDB ─────────────────────────────────
    let room = await WatchParty.findOne({ roomId: RID });
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      socket.disconnect();
      return;
    }

    socket.join(RID);

    // ── Register member ────────────────────────────────────────
    const isFirstMember = Object.keys(room.members || {}).length === 0;
    const member = {
      id:       socket.id,
      name:     displayName,
      emoji:    avatarEmoji,
      color:    avatarColor,
      joinedAt: Date.now(),
      isHost:   isFirstMember
    };

    room.members = { ...(room.members || {}), [socket.id]: member };
    if (isFirstMember) {
      room.hostSocketId = socket.id;
      room.hostName     = displayName;
    }
    room.markModified('members');
    await room.save();

    // ── Compute live position for joiner ───────────────────────
    const liveTime = room.playing
      ? room.currentTime + (Date.now() - room.updatedAt) / 1000
      : room.currentTime;

    // ── Send init state to joiner ──────────────────────────────
    socket.emit('room:init', {
      state: {
        playing:     room.playing,
        currentTime: liveTime,
        serverNow:   Date.now()
      },
      members:    Object.values(room.members),
      chat:       (room.chat || []).slice(-50),
      movieTitle: room.movieTitle,
      posterPath: room.posterPath,
      videoSrc:   room.videoSrc
    });

    nsp.to(RID).emit('members:update', Object.values(room.members));
    nsp.to(RID).emit('system:message', { text: `${displayName} joined the party 🎉`, ts: Date.now() });

    // ──────────────────────────────────────────────────────────
    // VIDEO SYNC  (MongoDB as source of truth)
    //
    // On play/pause/seek:
    //   1. Write state to MongoDB atomically
    //   2. Broadcast { videoTime, serverNow } to ALL clients
    //   3. Each client computes delay = (serverNow + LOAD_MS) - localNow
    //      adjusted by their measured clock offset, then fires iframe reload
    //
    // On re-join:  liveTime = currentTime + (now - updatedAt)/1000
    // On heartbeat: host reports actual position → DB corrects drift > 3s
    // ──────────────────────────────────────────────────────────

    const SYNC_DELAY_MS = 1500; // ms for clients to prep before iframe reload

    socket.on('player:play', async ({ videoTime }) => {
      room = await WatchParty.findOne({ roomId: RID });
      if (!room || socket.id !== room.hostSocketId) return;

      const now = Date.now();
      room.playing     = true;
      room.currentTime = Number(videoTime) || 0;
      room.updatedAt   = now;
      await room.save();

      nsp.to(RID).emit('player:play', {
        videoTime:  room.currentTime,
        serverNow:  now,
        syncDelay:  SYNC_DELAY_MS,
        by:         displayName
      });
    });

    socket.on('player:pause', async ({ videoTime }) => {
      room = await WatchParty.findOne({ roomId: RID });
      if (!room || socket.id !== room.hostSocketId) return;

      const now = Date.now();
      room.playing     = false;
      room.currentTime = Number(videoTime) || 0;
      room.updatedAt   = now;
      await room.save();

      nsp.to(RID).emit('player:pause', {
        videoTime:  room.currentTime,
        serverNow:  now,
        by:         displayName
      });
    });

    socket.on('player:seek', async ({ videoTime }) => {
      room = await WatchParty.findOne({ roomId: RID });
      if (!room || socket.id !== room.hostSocketId) return;

      const now = Date.now();
      room.currentTime = Number(videoTime) || 0;
      room.updatedAt   = now;
      await room.save();

      nsp.to(RID).emit('player:seek', {
        videoTime:  room.currentTime,
        playing:    room.playing,
        serverNow:  now,
        syncDelay:  SYNC_DELAY_MS,
        by:         displayName
      });
    });

    // Re-join / reconnect — pull fresh state from DB
    socket.on('player:sync_request', async () => {
      room = await WatchParty.findOne({ roomId: RID });
      if (!room) return;

      const livePos = room.playing
        ? room.currentTime + (Date.now() - room.updatedAt) / 1000
        : room.currentTime;

      socket.emit('player:sync', {
        playing:     room.playing,
        currentTime: livePos,
        serverNow:   Date.now()
      });
    });

    // Host heartbeat — correct DB drift if > 3s off
    socket.on('player:heartbeat', async ({ videoTime }) => {
      room = await WatchParty.findOne({ roomId: RID });
      if (!room || socket.id !== room.hostSocketId || !room.playing) return;
      const dbLive = room.currentTime + (Date.now() - room.updatedAt) / 1000;
      if (Math.abs(dbLive - videoTime) > 3) {
        room.currentTime = Number(videoTime);
        room.updatedAt   = Date.now();
        await room.save();
      }
    });

    // Clock offset measurement
    socket.on('timesync', ({ clientNow }) => {
      socket.emit('timesync', { clientNow, serverNow: Date.now() });
    });

    // ── CHAT ──────────────────────────────────────────────────
    socket.on('chat:message', async ({ text }) => {
      if (!text || !text.trim() || text.length > 300) return;
      const msg = {
        id:    Date.now() + Math.random(),
        uid:   socket.id,
        name:  displayName,
        emoji: avatarEmoji,
        color: avatarColor,
        text:  text.trim().slice(0, 300),
        ts:    Date.now()
      };
      await WatchParty.updateOne(
        { roomId: RID },
        { $push: { chat: { $each: [msg], $slice: -200 } } }
      );
      nsp.to(RID).emit('chat:message', msg);
    });

    // ── REACTIONS ─────────────────────────────────────────────
    socket.on('reaction', ({ emoji }) => {
      const ALLOWED = ['❤️','😂','😮','🔥','👏','💀','🎬','⭐'];
      if (!ALLOWED.includes(emoji)) return;
      nsp.to(RID).emit('reaction', { emoji, name: displayName, id: socket.id, ts: Date.now() });
    });

    // ── ASK-TO-PAUSE ──────────────────────────────────────────
    socket.on('pause_request', async ({ fromName }) => {
      const r = await WatchParty.findOne({ roomId: RID });
      if (r?.hostSocketId && r.hostSocketId !== socket.id) {
        nsp.to(r.hostSocketId).emit('pause_request', { fromName: fromName || displayName });
      }
    });

    socket.on('pause_request_denied', async ({ fromName }) => {
      const r = await WatchParty.findOne({ roomId: RID });
      const target = Object.values(r?.members || {}).find(m => m.name === fromName);
      if (target) nsp.to(target.id).emit('pause_request_denied', { fromName });
    });

    // ── DISCONNECT ────────────────────────────────────────────
    socket.on('disconnect', async () => {
      try {
        const r = await WatchParty.findOne({ roomId: RID });
        if (!r) return;

        const wasHost = socket.id === r.hostSocketId;
        const members = { ...(r.members || {}) };
        delete members[socket.id];
        r.members = members;
        r.markModified('members');

        const remaining = Object.values(members);

        if (remaining.length === 0) {
          // Party over — wipe from DB
          await WatchParty.deleteOne({ roomId: RID });
          console.log(`[WatchParty] Room ${RID} deleted — party ended`);
          return;
        }

        // Reassign host if needed
        if (wasHost) {
          const newHost = remaining.reduce((a, b) => a.joinedAt < b.joinedAt ? a : b);
          newHost.isHost  = true;
          r.hostSocketId  = newHost.id;
          r.hostName      = newHost.name;
          members[newHost.id] = newHost;
          r.members = members;
          r.markModified('members');
          nsp.to(newHost.id).emit('host:promoted', { message: 'You are now the host!' });
          nsp.to(RID).emit('system:message', { text: `👑 ${newHost.name} is now the host`, ts: Date.now() });
        }

        await r.save();
        nsp.to(RID).emit('members:update', remaining);
        nsp.to(RID).emit('system:message', { text: `${displayName} left the party 👋`, ts: Date.now() });
      } catch (err) {
        console.error('[WatchParty] disconnect error:', err);
      }
    });
  });
}

module.exports = { router, initWatchParty };
