// ================================================================
// CINEVERSE v4 — Cron Jobs
// 1. Hourly:  Pre-warm trending/popular cache in DB
// 2. Monthly: Finalize leaderboard + send prize emails
// ================================================================
const cron        = require('node-cron');
const TMDB        = require('./tmdb');
const Leaderboard = require('../models/Leaderboard');
const User        = require('../models/User');
const { sendPrizeEmail } = require('./email');

const PRIZES = [500, 300, 100];

// ── PRE-WARM CACHE (reduces cold start load times) ──
async function prewarmCache() {
  console.log('[CRON] Pre-warming cache...');
  try {
    await Promise.all([
      TMDB.forceRefresh('/trending/movie/week',      {}, TMDB.TTL.trending),
      TMDB.forceRefresh('/trending/tv/week',         {}, TMDB.TTL.trending),
      TMDB.forceRefresh('/movie/now_playing',        {page:1}, TMDB.TTL.discover),
      TMDB.forceRefresh('/movie/popular',            {page:1}, TMDB.TTL.discover),
      TMDB.forceRefresh('/movie/top_rated',          {page:1}, TMDB.TTL.discover),
      TMDB.forceRefresh('/movie/upcoming',           {}, TMDB.TTL.discover),
      TMDB.forceRefresh('/tv/popular',               {page:1}, TMDB.TTL.discover),
      TMDB.forceRefresh('/tv/airing_today',          {}, TMDB.TTL.trending),
      TMDB.forceRefresh('/genre/movie/list',         {}, TMDB.TTL.genres),
      TMDB.forceRefresh('/genre/tv/list',            {}, TMDB.TTL.genres),
    ]);
    console.log('[CRON] Cache pre-warmed successfully');
  } catch(err) { console.error('[CRON] Cache pre-warm failed:', err.message); }
}

// ── FINALIZE MONTHLY LEADERBOARD ──
async function finalizeMonth(targetMonth) {
  console.log(`[CRON] Finalizing leaderboard for ${targetMonth}...`);
  try {
    const entries    = await Leaderboard.find({ month: targetMonth }).sort({ xp:-1 }).limit(100);
    const monthLabel = new Date(targetMonth+'-01').toLocaleDateString('en-US',{month:'long',year:'numeric'});
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const rank  = i + 1;
      const prize = rank <= 3 ? PRIZES[rank-1] : 0;
      entry.rank  = rank;
      entry.prize = prize;
      if (prize > 0) {
        entry.prizeStatus = 'pending';
        const user = await User.findById(entry.userId);
        if (user) {
          entry.upiId = user.upiId || '';
          user.rewards = user.rewards || [];
          user.rewards.push({ month: targetMonth, rank, prize, paid: false });
          await user.save({ validateBeforeSave: false });
          if (user.email && user.isVerified) {
            try { await sendPrizeEmail(user.email, user.name, rank, prize, monthLabel); } catch(e) { console.warn('[CRON] Prize email failed:', e.message); }
          }
        }
      }
      await entry.save();
    }
    console.log(`[CRON] Done. ${entries.length} entries processed for ${targetMonth}`);
  } catch(err) { console.error('[CRON] Error:', err); }
}

function startCronJobs() {
  // Pre-warm cache every 25 minutes (keeps trending fresh)
  cron.schedule('*/25 * * * *', prewarmCache);

  // Finalize leaderboard on 1st of every month at midnight
  cron.schedule('0 0 1 * *', async () => {
    const now  = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const month = `${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}`;
    await finalizeMonth(month);
  });

  // Initial pre-warm on startup
  setTimeout(prewarmCache, 5000);

  console.log('[CRON] Jobs scheduled: cache pre-warm (25min) + monthly leaderboard');
}

module.exports = { startCronJobs, finalizeMonth, prewarmCache };
