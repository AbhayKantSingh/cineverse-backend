const express     = require('express');
const Leaderboard = require('../models/Leaderboard');
const User        = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');
const router = express.Router();

const PRIZES = [500, 300, 100];
const monthLabel = m => { const [y,mo]=m.split('-'); return new Date(parseInt(y),parseInt(mo)-1,1).toLocaleDateString('en-US',{month:'long',year:'numeric'}); };
const currMonth  = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };

router.get('/monthly', async (req, res) => {
  try {
    const month   = req.query.month || currMonth();
    const entries = await Leaderboard.find({ month }).sort({ xp:-1 }).limit(100);
    const ranked  = entries.map((e,i) => ({ ...e.toObject(), rank:i+1, prize:i<3?PRIZES[i]:0, monthLabel: monthLabel(month) }));
    res.json({ success:true, month, monthLabel: monthLabel(month), leaderboard: ranked });
  } catch(err) { res.status(500).json({ success:false, message:'Server error.' }); }
});

router.get('/my-rank', protect, async (req, res) => {
  try {
    const month   = currMonth();
    const myEntry = await Leaderboard.findOne({ userId: req.user._id, month });
    if (!myEntry) return res.json({ success:true, rank:null, xp:0, month });
    const above = await Leaderboard.countDocuments({ month, xp:{ $gt: myEntry.xp } });
    const rank  = above + 1;
    res.json({ success:true, rank, xp: myEntry.xp, month, prize: rank<=3 ? PRIZES[rank-1] : 0 });
  } catch(err) { res.status(500).json({ success:false, message:'Server error.' }); }
});

router.get('/history', async (req, res) => {
  try {
    const months  = (await Leaderboard.distinct('month')).sort().reverse();
    const history = [];
    for (const m of months.slice(0,6)) {
      const top3 = await Leaderboard.find({ month:m }).sort({ xp:-1 }).limit(3);
      history.push({ month:m, monthLabel: monthLabel(m), winners: top3.map((e,i)=>({...e.toObject(),rank:i+1,prize:PRIZES[i]||0})) });
    }
    res.json({ success:true, history });
  } catch(err) { res.status(500).json({ success:false, message:'Server error.' }); }
});

router.post('/admin/mark-paid/:userId/:month', protect, adminOnly, async (req, res) => {
  const entry = await Leaderboard.findOneAndUpdate({ userId:req.params.userId, month:req.params.month }, { prizeStatus:'paid' }, { new:true });
  res.json({ success:true, entry });
});

module.exports = router;
