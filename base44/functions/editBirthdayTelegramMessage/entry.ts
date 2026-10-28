import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { buildBirthdayTelegramMessage, blockForMember, SIGNATURE } from '../../shared/birthdayMessage.ts';

// Edits an already-sent Telegram birthday message to the verbatim gender-aware
// wording, or re-sends a fresh corrected message when the edit window expired
// (Telegram only allows editing within 48h, and the bot must be the author).
//
// Body: { member_name, gender, message_id? }
//   - member_name: the celebrant's roster full name (substituted into {full_name})
//   - gender: "female" | "ሴት" | "male" | "ወንድ"
//   - message_id: optional Telegram message_id to edit. When omitted (or when the
//     edit fails), a fresh corrected message is sent to the group instead.
const TG_TIMEOUT_MS = 15000;

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me().catch(() => null);
    if (!caller) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (caller.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    let body = {};
    try { body = await req.json().catch(() => ({})) || {}; } catch { body = {}; }
    const memberName = String(body.member_name || '').trim();
    const gender = String(body.gender || '').trim();
    const messageId = body.message_id != null ? String(body.message_id) : '';

    if (!memberName) return Response.json({ error: 'member_name is required' }, { status: 400 });

    const tgToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
    const tgChatId = String(process.env.TELEGRAM_CHAT_ID || '').trim();
    if (!tgToken || !tgChatId) return Response.json({ error: 'Telegram credentials not configured' }, { status: 500 });

    const text = buildBirthdayTelegramMessage([{ full_name: memberName, gender }]);

    let edited = false;
    let editError = null;
    if (messageId) {
      try {
        const res = await fetchWithTimeout(
          `https://api.telegram.org/bot${tgToken}/editMessageText`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: tgChatId,
              message_id: Number(messageId),
              text,
              parse_mode: 'HTML',
              disable_web_page_preview: true,
            }),
          },
          TG_TIMEOUT_MS
        );
        edited = res.ok;
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          editError = err.description || `Telegram HTTP ${res.status}`;
        }
      } catch (err) {
        editError = err?.message || 'editMessageText request failed';
      }
    }

    // Re-send a fresh corrected message when there is no message_id to edit, or
    // when the edit failed (expired window, not-author, etc.).
    let sent = false;
    let sendError = null;
    let sentMessageId = null;
    if (!edited) {
      try {
        const res = await fetchWithTimeout(
          `https://api.telegram.org/bot${tgToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: tgChatId,
              text,
              parse_mode: 'HTML',
              disable_web_page_preview: true,
            }),
          },
          TG_TIMEOUT_MS
        );
        sent = res.ok;
        if (sent) {
          const data = await res.json().catch(() => ({}));
          sentMessageId = data?.result?.message_id ?? null;
        } else {
          const err = await res.json().catch(() => ({}));
          sendError = err.description || `Telegram HTTP ${res.status}`;
        }
      } catch (err) {
        sendError = err?.message || 'sendMessage request failed';
      }
    }

    return Response.json({
      ok: true,
      text,
      edited,
      editError,
      sent,
      sentMessageId,
      sendError,
    });
  } catch (error) {
    return Response.json({ error: error?.message || 'Failed to update birthday message.' }, { status: 500 });
  }
}