import nodemailer from 'nodemailer';

function getMailConfig() {
  const mailUser = process.env.MAIL_USER;
  const mailPass = process.env.MAIL_PASS;

  console.log('MAIL_USER:', mailUser || 'MISSING');
  console.log('MAIL_PASS:', mailPass ? 'LOADED' : 'MISSING');

  if (!mailUser || !mailPass) {
    throw new Error('Missing MAIL_USER or MAIL_PASS in .env');
  }

  return {
    mailUser,
    mailPass,
  };
}

export async function sendMail({ to, subject, html }) {
  const { mailUser, mailPass } = getMailConfig();

  const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST || 'smtp.gmail.com',
    port: Number(process.env.MAIL_PORT || 465),
    secure: String(process.env.MAIL_SECURE || 'true') === 'true',
    auth: {
      user: mailUser,
      pass: mailPass,
    },
  });

  await transporter.verify();

  return transporter.sendMail({
    from: `"${process.env.MAIL_FROM_NAME || 'Plashcard'}" <${mailUser}>`,
    to,
    subject,
    html,
  });
}
