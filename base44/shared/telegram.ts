// Shared Telegram send helper used by backend functions that post to the
// choir's configured Telegram chat (bot token + chat id from app secrets).
// Keep this module plain (no Deno.serve) so any function can import it.

import { secrets } from "base44:runtime";

export const TG_TIMEOUT_MS = 15000;

export function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// Resolve credentials. Only a Super Admin caller may override the server-side
// secrets (pass overrides in opts); everyone else uses the configured bot.
export function resolveTelegramCredentials(opts = {}) {
  const isSuperOverride = !!opts.allowOverride;
  const token = ((isSuperOverride && opts.bot_token) ? opts.bot_token : (secrets.get("TELEGRAM_BOT_TOKEN") || "")).toString().trim();
  const chatId = ((isSuperOverride && opts.chat_id) ? opts.chat_id : (secrets.get("TELEGRAM_CHAT_ID") || "")).toString().trim();
  return { token, chatId };
}

// Send a single message to the choir chat. Returns { sent, error }.
export async function sendTelegramMessage(text, opts = {}) {
  const { token, chatId } = resolveTelegramCredentials(opts);
  if (!token) return { sent: false, error: "Telegram bot token not configured" };
  if (!chatId) return { sent: false, error: "Telegram chat id not configured" };
  try {
    const res = await fetchWithTimeout(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: opts.parse_mode || "HTML",
          disable_web_page_preview: opts.disable_web_page_preview !== false,
        }),
      },
      TG_TIMEOUT_MS
    );
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { const d = await res.json(); if (d && d.description) detail = d.description; } catch { /* ignore */ }
      return { sent: false, error: detail };
    }
    let data;
    try { data = await res.json(); } catch { return { sent: true, message_id: null }; }
    if (!data.ok) return { sent: false, error: data.description || "Telegram API error" };
    return { sent: true, message_id: data.result?.message_id || null };
  } catch (err) {
    const aborted = err?.name === "AbortError";
    return { sent: false, error: aborted ? `Telegram request timed out after ${TG_TIMEOUT_MS / 1000}s` : (err?.message || "Telegram request failed") };
  }
}