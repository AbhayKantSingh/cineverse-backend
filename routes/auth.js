// ============================================
// CINEVERSE v3 - Auth Routes
// ============================================
const express  = require('express');
const crypto   = require('crypto');
const jwt      = require('jsonwebtoken');
const mongoose = require('mongoose');
const User     = require('../models/User');
const { protect } = require('../middleware/auth');
const { sendVerificationEmail, sendWelcomeEmail } = require('../utils/email');

const router = express.Router();

const pendingRegSchema = new mongoose.Schema({
  email:     { type: String, required: true, unique: true, lowercase: true },
  name:      { type: String, required: true },
  username:  { type: String, required: true, lowercase: true },
  password:  { type: String, required: true },
  code:      { type: String, required: true },
  expiresAt: { type: Date,   required: true, index: { expires: 0 } }
});
const PendingReg = mongoose.models.PendingReg || mongoose.model('PendingReg', pendingRegSchema);

const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '30d' });
const sendToken = (user, code, res) => {
  res.status(code).json({ success: true, token: signToken(user._id), user: user.toJSON() });
};

router.post('/register', async (req, res) => {
  try {
    const { name, username, email, password } = req.body;
    if (!name || !username || !email || !password)
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    if (password.length < 6)
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    if (username.length < 3)
      return res.status(400).json({ success: false, message: 'Username must be at least 3 characters.' });

    const emailLower    = email.toLowerCase();
    const usernameLower = username.toLowerCase();

    const existU = await User.findOne({ username: usernameLower });
    if (existU) return res.status(400).json({ success: false, message: 'Username already taken.' });
    const existE = await User.findOne({ email: emailLower });
    if (existE) return res.status(400).json({ success: false, message: 'Email already registered.' });

    const code      = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await PendingReg.findOneAndUpdate(
      { email: emailLower },
      { name, username: usernameLower, email: emailLower, password, code, expiresAt },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    try {
      await sendVerificationEmail(email, name, code);
      console.log(`📧 Verification code sent to ${email}`);
    } catch (e) {
      console.error(`❌ EMAIL ERROR for ${email}:`, e.message, JSON.stringify(e));
      console.log(`📋 Fallback code for ${email}: ${code}`);
    }

    res.json({ success: true, message: `Verification code sent to ${email}. Check your inbox (and spam folder).` });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
});

router.post('/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code)
      return res.status(400).json({ success: false, message: 'Email and code required.' });

    const emailLower = email.toLowerCase();
    const pending    = await PendingReg.findOne({ email: emailLower });

    if (!pending)
      return res.status(400).json({ success: false, message: 'No pending registration for this email. Please register again.' });
    if (new Date() > pending.expiresAt) {
      await PendingReg.deleteOne({ email: emailLower });
      return res.status(400).json({ success: false, message: 'Code expired. Please register again.' });
    }
    if (pending.code !== code.toString().trim())
      return res.status(400).json({ success: false, message: 'Incorrect code. Please try again.' });

    const existE = await User.findOne({ email: emailLower });
    if (existE) {
      await PendingReg.deleteOne({ email: emailLower });
      return res.status(400).json({ success: false, message: 'Email already registered. Please login.' });
    }

    const user = await User.create({
      name:       pending.name,
      username:   pending.username,
      email:      pending.email,
      password:   pending.password,
      isVerified: true
    });

    await PendingReg.deleteOne({ email: emailLower });
    try { await sendWelcomeEmail(user.email, user.name); } catch (e) {
      console.error('Welcome email error:', e.message);
    }

    sendToken(user, 201, res);
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ success: false, message: 'Server error during verification.' });
  }
});

router.post('/resend-code', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email required.' });

    const emailLower = email.toLowerCase();
    const pending    = await PendingReg.findOne({ email: emailLower });
    if (!pending)
      return res.status(400).json({ success: false, message: 'No pending registration found. Please register again.' });

    const code      = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    pending.code      = code;
    pending.expiresAt = expiresAt;
    await pending.save();

    try {
      await sendVerificationEmail(email, pending.name, code);
      console.log(`📧 Resent code to ${email}`);
    } catch (e) {
      console.error(`❌ RESEND EMAIL ERROR for ${email}:`, e.message, JSON.stringify(e));
      console.log(`📋 Fallback resent code for ${email}: ${code}`);
    }

    res.json({ success: true, message: 'New code sent.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { login, password } = req.body;
    if (!login || !password)
      return res.status(400).json({ success: false, message: 'Credentials required.' });

    const user = await User.findOne({
      $or: [{ email: login.toLowerCase() }, { username: login.toLowerCase() }]
    }).select('+password');

    if (!user) return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    const match = await user.comparePassword(password);
    if (!match)  return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    if (!user.isVerified)
      return res.status(403).json({ success: false, message: 'Please verify your email first.', needsVerification: true, email: user.email });

    user.lastActive = new Date();
    await user.save({ validateBeforeSave: false });
    sendToken(user, 200, res);
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

router.get('/me', protect, async (req, res) => {
  const user = await User.findById(req.user._id);
  res.json({ success: true, user });
});

router.put('/onboarding', protect, async (req, res) => {
  const { favoriteGenres, preferredLanguages, moodTags } = req.body;
  const user = await User.findByIdAndUpdate(req.user._id,
    { favoriteGenres: favoriteGenres || [], preferredLanguages: preferredLanguages || ['en'], moodTags: moodTags || [], onboardingDone: true },
    { new: true }
  );
  res.json({ success: true, user });
});

router.put('/avatar', protect, async (req, res) => {
  const { avatarEmoji, avatarColor } = req.body;
  const user = await User.findByIdAndUpdate(req.user._id, { avatarEmoji, avatarColor }, { new: true });
  res.json({ success: true, user });
});

router.put('/upi', protect, async (req, res) => {
  const user = await User.findByIdAndUpdate(req.user._id, { upiId: req.body.upiId }, { new: true });
  res.json({ success: true, user });
});

module.exports = router;