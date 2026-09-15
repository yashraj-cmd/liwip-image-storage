import MailComposer from "nodemailer/lib/mail-composer";
import nodemailer from "nodemailer";

const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
const refreshToken = process.env.GMAIL_OAUTH_REFRESH_TOKEN;

/** The mailbox the codes are sent from, and that the refresh token belongs to. */
const sender = process.env.GMAIL_SENDER_EMAIL ?? process.env.SMTP_USER;
const senderName = process.env.GMAIL_SENDER_NAME ?? "Liwip SKU Images";

const oauthConfigured = Boolean(clientId && clientSecret && refreshToken && sender);

// Plain SMTP with an app password, for setups without OAuth.
const passwordConfigured = Boolean(
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD,
);

export const mailConfigured = oauthConfigured || passwordConfigured;

export const mailMode = oauthConfigured
  ? "gmail-api"
  : passwordConfigured
    ? "smtp"
    : "none";

let token: { value: string; expiresAt: number } | null = null;

/**
 * Exchanges the refresh token for an access token, reused until it is nearly
 * expired. Sending goes through the Gmail API rather than SMTP because the
 * narrow gmail.send scope does not grant SMTP access; SMTP would need the far
 * broader https://mail.google.com/ scope.
 */
async function accessToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt) return token.value;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId as string,
      client_secret: clientSecret as string,
      refresh_token: refreshToken as string,
      grant_type: "refresh_token",
    }),
  });

  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(
      `Gmail token refresh failed: ${data.error ?? response.status} ${data.error_description ?? ""}`.trim(),
    );
  }

  token = {
    value: data.access_token,
    expiresAt: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000,
  };
  return token.value;
}

type Message = { to: string; subject: string; text: string; html: string };

async function buildRaw(message: Message): Promise<string> {
  const compiled = await new MailComposer({
    from: process.env.SMTP_FROM ?? `${senderName} <${sender}>`,
    ...message,
  })
    .compile()
    .build();

  return compiled.toString("base64url");
}

async function sendViaGmailApi(message: Message): Promise<void> {
  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: await buildRaw(message) }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gmail API send failed (${response.status}): ${detail.slice(0, 300)}`);
  }
}

async function sendViaSmtp(message: Message): Promise<void> {
  const port = Number(process.env.SMTP_PORT ?? 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 is implicit TLS; 587 upgrades with STARTTLS.
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER as string,
      pass: process.env.SMTP_PASSWORD as string,
    },
  });

  await transport.sendMail({
    from: process.env.SMTP_FROM ?? `${senderName} <${process.env.SMTP_USER}>`,
    ...message,
  });
}

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  if (!mailConfigured) {
    // Local development without mail credentials: print the code instead of
    // sending it. Production refuses rather than falling back.
    if (process.env.NODE_ENV === "production") {
      throw new Error("Email is not configured on this server.");
    }
    console.info(`\n[dev] Sign-in code for ${to}: ${code}\n`);
    return;
  }

  const message: Message = {
    to,
    subject: `${code} is your Liwip sign-in code`,
    text: [
      `Your sign-in code is ${code}`,
      "",
      "It expires in 10 minutes.",
      "If you did not request it, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#0a0a0a;padding:32px">
        <div style="max-width:420px;margin:0 auto;background:#141414;border-radius:20px;padding:28px;color:#f4f4f4">
          <p style="margin:0;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#9a9a9a">
            Liwip &middot; SKU Images
          </p>
          <p style="margin:18px 0 6px;font-size:15px;color:#cfcfcf">Your sign-in code</p>
          <p style="margin:0;font-size:34px;font-weight:700;letter-spacing:.22em;color:#ffffff">
            ${code}
          </p>
          <p style="margin:20px 0 0;font-size:13px;line-height:22px;color:#9a9a9a">
            It expires in 10 minutes. If you did not request it, you can ignore this email.
          </p>
        </div>
      </div>
    `,
  };

  if (oauthConfigured) {
    await sendViaGmailApi(message);
    return;
  }
  await sendViaSmtp(message);
}
