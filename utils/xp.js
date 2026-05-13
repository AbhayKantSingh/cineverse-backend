const Leaderboard = require('../models/Leaderboard');

const LEVELS = [
  { level:1, name:'Rookie Viewer',       minXP:0,    maxXP:100  },
  { level:2, name:'Film Buff',           minXP:100,  maxXP:250  },
  { level:3, name:'Cine Enthusiast',     minXP:250,  maxXP:500  },
  { level:4, name:'Movie Critic',        minXP:500,  maxXP:1000 },
  { level:5, name:'Cinema Maestro',      minXP:1000, maxXP:2000 },
  { level:6, name:'Legendary Cinephile', minXP:2000, maxXP:Infinity }
];

function getLevelInfo(xp) {
  for (const l of LEVELS) if (xp >= l.minXP && xp < l.maxXP) return l;
  return LEVELS[LEVELS.length - 1];
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

async function awardXP(userDoc, amount) {
  userDoc.xp = (userDoc.xp || 0) + amount;
  userDoc.level = getLevelInfo(userDoc.xp).level;
  return userDoc;
}

async function updateMonthlyXP(userId, amount, action, user) {
  const month = currentMonthKey();
  const inc   = { xp: amount };
  if (action === 'review')        inc.reviewCount  = 1;
  if (action === 'watched')       inc.watchedCount = 1;
  if (action === 'like_received') inc.likeCount    = 1;

  const update = { $inc: inc, $setOnInsert: { month } };
  if (user) update.$set = { username: user.username, userName: user.name, avatarEmoji: user.avatarEmoji||'🎬', avatarColor: user.avatarColor||0 };

  try {
    await Leaderboard.findOneAndUpdate({ userId, month }, update, { upsert: true });
  } catch(e) { console.error('updateMonthlyXP:', e.message); }
}

module.exports = { awardXP, updateMonthlyXP, getLevelInfo, LEVELS };
