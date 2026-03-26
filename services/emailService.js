const nodemailer = require('nodemailer');

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendSwimReminder(user, confirmUrl) {
  const transporter = createTransport();
  const firstName = esc(user.name.split(' ')[0]);
  const count = user.swim_count;
  const milestone = count >= 30 ? '🏆 Absolute legend!' : count >= 20 ? '🌟 Elite swimmer!' : count >= 10 ? '⭐ Great progress!' : count >= 5 ? '💪 Building momentum!' : 'Keep going! 🚀';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Did you swim today?</title>
</head>
<body style="margin:0;padding:0;background:#eef6fb;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table cellpadding="0" cellspacing="0" width="100%" style="background:#eef6fb;padding:40px 16px;">
    <tr>
      <td align="center">
        <table cellpadding="0" cellspacing="0" width="560" style="max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#03045e 0%,#0077b6 100%);border-radius:20px 20px 0 0;padding:40px 40px 32px;text-align:center;">
              <div style="font-size:52px;margin-bottom:10px;">🏊</div>
              <h1 style="color:white;font-size:30px;margin:0;font-weight:900;letter-spacing:-0.5px;">SwimLog</h1>
              <p style="color:rgba(255,255,255,0.65);margin:8px 0 0;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Daily Swim Tracker</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:white;padding:40px;text-align:center;">
              <h2 style="color:#03045e;font-size:26px;margin:0 0 14px;font-weight:800;">
                Good morning, ${firstName}! 🌅
              </h2>
              <p style="color:#555;font-size:16px;line-height:1.7;margin:0 0 32px;">
                Did you make a splash today? Let us know if you<br>attended your swimming class this morning!
              </p>

              <!-- CTA -->
              <a href="${confirmUrl}"
                 style="display:inline-block;background:linear-gradient(135deg,#0077b6,#00b4d8);color:white;text-decoration:none;padding:18px 52px;border-radius:14px;font-size:18px;font-weight:800;letter-spacing:0.3px;box-shadow:0 8px 28px rgba(0,119,182,0.4);">
                ✅ &nbsp; Yes, I swam today!
              </a>

              <p style="color:#aaa;font-size:12px;margin:24px 0 0;line-height:1.6;">
                Only click if you attended your class today.<br>
                One confirmation per day is allowed (9am–9am IST window).
              </p>
            </td>
          </tr>

          <!-- Stats row -->
          <tr>
            <td style="background:#f7fbff;border-top:1px solid #e8f0f8;border-bottom:1px solid #e8f0f8;padding:20px 40px;text-align:center;">
              <p style="color:#555;font-size:14px;margin:0;">
                You've completed
                <strong style="color:#0077b6;font-size:18px;"> ${count} </strong>
                swim class${count !== 1 ? 'es' : ''} so far. &nbsp; ${milestone}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#03045e;border-radius:0 0 20px 20px;padding:24px 40px;text-align:center;">
              <p style="color:rgba(255,255,255,0.4);font-size:11px;margin:0;line-height:1.6;">
                SwimLog · Track your swimming journey<br>
                You're receiving this because you're registered on SwimLog.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await transporter.sendMail({
    from: `"SwimLog 🏊" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to: user.email,
    subject: `🌊 Did you swim today, ${firstName}?`,
    html,
    text: `Good morning ${user.name}!\n\nDid you swim today? Click here to confirm:\n${confirmUrl}\n\nYou've completed ${count} swim class${count !== 1 ? 'es' : ''} so far.\n\n— SwimLog`,
  });
}

module.exports = { sendSwimReminder };
