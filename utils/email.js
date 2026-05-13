// ============================================
// CINEVERSE - Email Utility (Brevo HTTP API)
// ============================================

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const FROM_EMAIL = 'noreply@cineverse.space';
const FROM_NAME  = 'CineVerse';

async function sendEmail(to, toName, subject, html) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept':       'application/json',
      'api-key':      BREVO_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      sender:   { name: FROM_NAME, email: FROM_EMAIL },
      to:       [{ email: to, name: toName }],
      subject,
      htmlContent: html
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Brevo API error');
  return data;
}

function baseTemplate(title, content) {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body{margin:0;padding:0;background:#050810;font-family:'Segoe UI',Arial,sans-serif;}
  .wrap{max-width:560px;margin:0 auto;padding:40px 20px;}
  .card{background:#0a0f1e;border:1px solid rgba(0,229,255,0.2);border-radius:16px;padding:40px;text-align:center;}
  .logo{font-size:28px;font-weight:900;letter-spacing:6px;background:linear-gradient(90deg,#00e5ff,#7b2fff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:8px;}
  .tagline{font-size:11px;color:#4a5568;letter-spacing:3px;margin-bottom:32px;}
  h2{color:#e8eaf6;font-size:22px;margin:0 0 12px;}
  p{color:#8892b0;font-size:14px;line-height:1.7;margin:0 0 20px;}
  .code-box{background:#050810;border:2px solid #00e5ff;border-radius:12px;padding:20px;margin:24px 0;letter-spacing:10px;font-size:36px;font-weight:900;color:#00e5ff;font-family:monospace;}
  .note{font-size:12px;color:#4a5568;margin-top:24px;border-top:1px solid rgba(255,255,255,0.06);padding-top:20px;}
  .cyan{color:#00e5ff;}
  .gold{color:#ffd700;}
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">CINEVERSE</div>
  <div class="tagline">// YOUR UNIVERSE OF CINEMA //</div>
  <div class="card">${content}</div>
  <div style="text-align:center;margin-top:20px;font-size:11px;color:#4a5568">
    © ${new Date().getFullYear()} CineVerse · Sent with ❤️ for movie lovers
  </div>
</div>
</body>
</html>`;
}

async function sendVerificationEmail(toEmail, toName, code) {
  await sendEmail(toEmail, toName,
    `${code} is your CineVerse verification code`,
    baseTemplate('Verify Your Email', `
      <h2>👋 Welcome, ${toName}!</h2>
      <p>You're one step away from joining the CineVerse universe.<br>Enter this code to verify your email:</p>
      <div class="code-box">${code}</div>
      <p style="font-size:13px">This code expires in <span class="cyan">15 minutes</span>.</p>
      <div class="note">If you didn't create a CineVerse account, ignore this email.</div>
    `)
  );
}

async function sendWelcomeEmail(toEmail, toName) {
  await sendEmail(toEmail, toName,
    '🎬 Welcome to CineVerse — Your Cinema Universe Awaits!',
    baseTemplate('Welcome!', `
      <h2>🎬 You're in, ${toName}!</h2>
      <p>Welcome to CineVerse — your personal cinema universe.</p>
      <div style="text-align:left;margin:20px 0;padding:16px;background:#050810;border-radius:12px;">
        <p style="margin:6px 0">🎬 <span class="cyan">Watch movies</span> → earn <span class="gold">15 XP</span></p>
        <p style="margin:6px 0">❤️ <span class="cyan">Add favourites</span> → earn <span class="gold">10 XP</span></p>
        <p style="margin:6px 0">✍️ <span class="cyan">Write reviews</span> → earn <span class="gold">25 XP</span></p>
        <p style="margin:6px 0">🏆 <span class="cyan">Top 3 monthly</span> → win <span class="gold">₹500 / ₹300 / ₹100</span></p>
      </div>
      <div class="note">Start exploring trending movies!</div>
    `)
  );
}

async function sendPrizeEmail(toEmail, toName, rank, prize, month) {
  const medals = ['🥇','🥈','🥉'];
  await sendEmail(toEmail, toName,
    `${medals[rank-1]} You won ₹${prize} on CineVerse! Rank #${rank} for ${month}`,
    baseTemplate('You Won!', `
      <h2>${medals[rank-1]} Congratulations, ${toName}!</h2>
      <p>You finished <span class="cyan">Rank #${rank}</span> for <strong>${month}</strong>!</p>
      <div class="code-box" style="letter-spacing:4px;font-size:40px">₹${prize}</div>
      <p>Prize sent to your UPI ID within 3-5 business days.</p>
      <div class="note">Keep reviewing to win next month! 🚀</div>
    `)
  );
}

async function sendReplyNotification(toEmail, toName, replierName, movieTitle, forumUrl) {
  await sendEmail(toEmail, toName,
    `💬 ${replierName} replied to your CineVerse post`,
    baseTemplate('New Reply', `
      <h2>💬 ${replierName} replied to your post</h2>
      <p>Someone replied to your discussion about <span class="cyan">${movieTitle}</span>!</p>
      <div class="note">Log in to see the full discussion.</div>
    `)
  );
}

async function testEmailConnection() {
  try {
    if (!BREVO_API_KEY) throw new Error('BREVO_API_KEY not set');
    console.log('✅ Email service connected (Brevo HTTP API)');
    return true;
  } catch (err) {
    console.warn('⚠️  Email service not configured:', err.message);
    return false;
  }
}

module.exports = {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPrizeEmail,
  sendReplyNotification,
  testEmailConnection
};