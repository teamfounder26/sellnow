import { log } from "@/lib/log";

/**
 * Email delivery adapter. No provider is configured yet, so messages are written to the server
 * log. Plug a transactional provider (e.g. Resend, SES, Postmark) in here; callers don't change.
 */
export function emailConfigured() {
  return false;
}

export async function sendEmail(msg: { to: string; subject: string; text: string }) {
  log("info", "email.console_delivery", { to: msg.to, subject: msg.subject, text: msg.text });
}
