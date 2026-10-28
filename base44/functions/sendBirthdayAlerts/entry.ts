import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { buildBirthdayTelegramMessage } from '../../shared/birthdayMessage.ts';

// Ethiopian calendar reference: Meskerem 1, 2018 EC = September 11, 2025 (Gregorian).
const REF_EPOCH = Date.UTC(2025, 8, 11);
const REF_YEAR = 2018;

// Mirrors src/lib/ethiopianCalendar.js nowEthiopian() — computes the current
// Ethiopian year/month/day from the Gregorian now.
function nowEthiopian() {
  const now = new Date();
  const ref = new Date(REF_EPOCH);
  const diffDays = Math.floor((now - ref) / 86400000);
  const year = REF_YEAR + Math.floor(diffDays / 365.25);
  const dayInYear = diffDays - Math.round((year - REF_YEAR) * 365.25);
  const month = Math.min(12, Math.max(0, Math.floor(dayInYear / 30)));
  const day = dayInYear - month * 30 + 1;
  return { year, month, day };
}

const TG_TIMEOUT_MS = 15000;

function fetchWithTimeout(url: RequestInfo, options: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// The gender-aware wording lives in the shared module so the scheduled
// dispatch and the ad-hoc edit/re-send tool always stay in sync.

// Posts today's birthday members to the choir Telegram group. Fires once per
// day at 12:00 ጠዋት (Ethiopian) = 06:00 EAT. Each celebrant gets a gender-aware
// spiritual greeting with their roster name substituted in.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me().catch(() => null);
    if (!caller) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (caller.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { month: todayMonth, day: todayDay } = nowEthiopian();
    const members = await base44.asServiceRole.entities.Member.list("-slot_number", 500);
    const birthdays = (members || []).filter(
      (m: any) =>
        m.birth_month != null &&
        m.birth_day != null &&
        m.birth_month === todayMonth &&
        m.birth_day === todayDay
    );

    if (!birthdays.length) {
      return Response.json({ ok: true, count: 0, telegramSent: false });
    }

    const tgText = buildBirthdayTelegramMessage(birthdays);

    let telegramSent = false;
    let telegramError: string | null = null;
    const tgToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
    const tgChatId = String(process.env.TELEGRAM_CHAT_ID || "").trim();
    if (tgToken && tgChatId) {
      try {
        const tgRes = await fetchWithTimeout(
          `https://api.telegram.org/bot${tgToken}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: tgChatId,
              text: tgText,
              parse_mode: "HTML",
              disable_web_page_preview: true,
            }),
          },
          TG_TIMEOUT_MS
        );
        telegramSent = tgRes.ok;
        if (!tgRes.ok) telegramError = `Telegram HTTP ${tgRes.status}`;
      } catch (err: any) {
        telegramError = err?.message || "Telegram request failed";
      }
    }

    return Response.json({
      ok: true,
      count: birthdays.length,
      telegramSent,
      telegramError,
    });
  } catch (error: any) {
    return Response.json(
      { error: error?.message || "Failed to send birthday alerts." },
      { status: 500 }
    );
  }
}