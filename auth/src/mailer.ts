import { Resend } from "resend";
import { env } from "./env.js";

/**
 * Minimal transport contract for outbound mail. Behind an interface only so
 * tests can inject a recording stub without any real HTTP going to Resend —
 * the ".sendEmail(...)" the auth code path calls is the same signature in
 * both cases.
 */
export interface Mailer {
  sendEmail(input: { to: string; subject: string; html: string; text: string }): Promise<void>;
}

/**
 * Real Resend transport. Throws when Resend reports an error so the caller
 * (magic-link sendMagicLink hook) can decide what to surface — we never
 * report an email as sent when delivery failed.
 */
export class ResendMailer implements Mailer {
  private readonly resend: Resend;
  private readonly from: string;

  constructor(opts?: { apiKey?: string; from?: string }) {
    const apiKey = opts?.apiKey ?? env.resend.apiKey;
    if (!apiKey) {
      throw new Error(
        "RESEND_API_KEY is required for production mail delivery. Set it in the environment or inject a test Mailer."
      );
    }
    this.resend = new Resend(apiKey);
    this.from = opts?.from ?? env.resend.fromEmail;
  }

  async sendEmail(input: { to: string; subject: string; html: string; text: string }): Promise<void> {
    const result = await this.resend.emails.send({
      from: this.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    if (result.error) {
      // Bubble up as a plain Error — the caller logs a redacted line and
      // returns a generic failure. Never surface Resend's raw message to
      // the client, since it can enumerate what's wrong per address.
      throw new Error(`Resend delivery failed: ${result.error.name ?? "unknown"}`);
    }
  }
}

const BLACK = "#111111";
const CREAM = "#F3F0EC";
const LIME = "#C5FF3D";

/**
 * Branded HTML for a magic-link sign-in email. Deliberately restrained —
 * no remote images, no tracking pixels, one embedded logo mark rendered as
 * a color-only block so it survives dark-mode clients and text-only
 * previews. Renders in mail clients using inline styles only; email
 * clients strip <style> blocks unpredictably.
 */
export function renderMagicLinkHtml(url: string): string {
  const safeUrl = escapeHtml(url);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>Sign in to Populr</title>
  </head>
  <body style="margin:0;padding:0;background-color:${CREAM};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BLACK};">
    <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
      Use the secure link inside to sign in to Populr. It expires in 5 minutes.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${CREAM};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:16px;padding:40px 32px;">
            <tr>
              <td style="padding-bottom:24px;">
                <div style="font-size:12px;font-weight:700;letter-spacing:0.2em;color:${BLACK};text-transform:uppercase;">Populr</div>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:16px;">
                <h1 style="margin:0;font-size:28px;line-height:1.2;font-weight:700;color:${BLACK};">Sign in to Populr</h1>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:24px;">
                <p style="margin:0;font-size:16px;line-height:1.5;color:${BLACK};">Use the secure link below to sign in to your Populr account.</p>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:24px;">
                <a href="${safeUrl}" style="display:inline-block;background-color:${LIME};color:${BLACK};font-weight:600;font-size:15px;padding:14px 24px;border-radius:12px;text-decoration:none;">Sign in to Populr</a>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:16px;">
                <p style="margin:0;font-size:14px;line-height:1.5;color:${BLACK};opacity:0.75;">This link expires in 5 minutes and can only be used once.</p>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:24px;">
                <p style="margin:0;font-size:13px;line-height:1.5;color:${BLACK};opacity:0.6;word-break:break-all;">
                  If the button doesn't work, paste this URL into your browser:<br />
                  <span style="color:${BLACK};">${safeUrl}</span>
                </p>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid rgba(17,17,17,0.1);padding-top:20px;">
                <p style="margin:0;font-size:13px;line-height:1.5;color:${BLACK};opacity:0.6;">If you did not request this email, you can safely ignore it.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Plain-text version delivered alongside the HTML — required for
 * text-only clients, screen readers, and spam filters that penalize
 * HTML-only mail.
 */
export function renderMagicLinkText(url: string): string {
  return [
    "Sign in to Populr",
    "",
    "Use the secure link below to sign in to your Populr account.",
    "",
    url,
    "",
    "This link expires in 5 minutes and can only be used once.",
    "",
    "If you did not request this email, you can safely ignore it.",
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
