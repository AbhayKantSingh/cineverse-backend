// ================================================================
// CINEVERSE v4 — Production Server (with Watch Party / Socket.IO)
// ================================================================
require('dotenv').config();
const express       = require('express');
const http          = require('http');
const { Server }    = require('socket.io');
const mongoose      = require('mongoose');
const cors          = require('cors');
const helmet        = require('helmet');
const compression   = require('compression');
const morgan        = require('morgan');
const rateLimit     = require('express-rate-limit');
const slowDown      = require('express-slow-down');
const mongoSanitize = require('express-mongo-sanitize');
const { startCronJobs }       = require('./utils/cron');
const { testEmailConnection } = require('./utils/email');
const { router: watchPartyRouter, initWatchParty } = require('./routes/watchparty');

const app    = express();
const server = http.createServer(app);

// ── SOCKET.IO ──
const io = new Server(server, {
  cors: { origin: true, credentials: true },
  transports: ['websocket', 'polling'],
  pingTimeout:  60000,   // 60s — handles Render free tier wake latency
  pingInterval: 25000
});
initWatchParty(io);

// ── TRUST PROXY ──
app.set('trust proxy', 1);

// ── SECURITY ──
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false,
  frameguard: false,
}));
app.use(compression());
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ── CORS ──
const allowed = [
  'http://localhost:5500','http://127.0.0.1:5500',
  'http://localhost:5501','http://127.0.0.1:5501',
  'http://localhost:5502','http://127.0.0.1:5502',
  'http://localhost:3000','http://127.0.0.1:3000',
  'https://cineverse.space','https://www.cineverse.space','null'
];
if (process.env.FRONTEND_URL) allowed.push(process.env.FRONTEND_URL);
app.use(cors({ origin: true, credentials: true }));

// ── BODY + SANITIZE ──
app.use(express.json({ limit: '10kb' }));
app.use(mongoSanitize());

// ── RATE LIMITING ──
app.use('/api/', rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15*60*1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX) || 500,
  standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down.' }
}));
app.use('/api/', slowDown({ windowMs: 60000, delayAfter: 80, delayMs: () => 100 }));

// ── ROUTES ──
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/user',        require('./routes/user'));
app.use('/api/reviews',     require('./routes/reviews'));
app.use('/api/forum',       require('./routes/forum'));
app.use('/api/leaderboard', require('./routes/leaderboard'));
app.use('/api/tmdb',        require('./routes/tmdb'));
app.use('/api/admin',       require('./routes/admin'));
app.use('/api/proxy',       require('./routes/proxy'));
app.use('/api/watchparty',  watchPartyRouter);

// ── HEALTH ──
app.get('/api/health', (req, res) => {
  const TMDB = require('./utils/tmdb');
  const keys = TMDB.getKeys();
  res.json({
    success:'true', version:'4.1.0', message:'🎬 CineVerse API is live!',
    time: new Date().toISOString(), env: process.env.NODE_ENV,
    mongo: mongoose.connection.readyState===1?'✅ connected':'❌ disconnected',
    tmdbKeys: keys.length>0?`✅ ${keys.length} key(s)`:'❌ NO KEYS',
    watchParty:'✅ Socket.IO active',
    uptime: Math.floor(process.uptime())+'s'
  });
});

// ── ERROR HANDLERS ──
app.use((err,req,res,next)=>{
  if(err.message?.startsWith('CORS')) return res.status(403).json({success:false,message:err.message});
  console.error('[ERROR]',err.stack);
  res.status(500).json({success:false,message:process.env.NODE_ENV==='production'?'Server error.':err.message});
});
app.use((req,res)=>res.status(404).json({success:false,message:`Route ${req.method} ${req.path} not found.`}));

// ── START ──
const PORT = parseInt(process.env.PORT) || 10000;

function startServer(port) {
  server.listen(port, '0.0.0.0')
    .on('listening', () => {
      console.log(`\n✅ CineVerse v4.1 API  → http://0.0.0.0:${port}`);
      console.log(`🎬 Watch Party WS      → ws://0.0.0.0:${port}/watchparty`);
      console.log(`📋 Health              → http://0.0.0.0:${port}/api/health\n`);
    })
    .on('error', (err) => { throw err; });
}
mongoose.connect(process.env.MONGODB_URI)
  .then(async()=>{
    console.log('✅ MongoDB Connected');
    await testEmailConnection();
    if(process.env.ADMIN_USERNAME){
      const User=require('./models/User');
      const u=await User.updateOne({username:process.env.ADMIN_USERNAME.toLowerCase()},{isAdmin:true});
      if(u.modifiedCount) console.log(`✅ Admin set: ${process.env.ADMIN_USERNAME}`);
    }
    startServer(PORT);
    startCronJobs();
  })
  .catch(err=>{
    console.error('\n❌ MongoDB failed:',err.message);
    process.exit(1);
  });
process.on('SIGTERM',()=>mongoose.connection.close().then(()=>process.exit(0)));
module.exports = app;
