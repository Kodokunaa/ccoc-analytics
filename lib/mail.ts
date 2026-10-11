import nodemailer from "nodemailer";
export function mailConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD &&
    process.env.MAIL_FROM,
  );
}
export async function sendPasswordReset(to: string, link: string) {
  if (!mailConfigured()) throw new Error("MAIL_NOT_CONFIGURED");
  const port = Number(process.env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid SMTP port");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  await transport.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject: "Reset your City Church of Christ staff password",
    text: `A password reset was requested for your staff account.\n\nOpen this link within 30 minutes:\n${link}\n\nIf you did not request this, ignore this email. Your password has not changed.`,
  });
}
