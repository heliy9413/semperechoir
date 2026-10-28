import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// Shared "Sempere Choir" Google Calendar — the builder's connected account owns
// one public calendar; all members view/subscribe to it. This function finds (or
// creates) that calendar, publishes it, and (in "sync" mode) repopulates the
// weekly rehearsal programs + monthly fasting-prayer days as all-day events.

const CAL_API = "https://www.googleapis.com/calendar/v3";
const CAL_SUMMARY = "Sempere Choir";
const CAL_DESC = "የSempere Choir መደበኛ መርሃ ግብሮች እና የጾም ጸሎት ቀናት · Choir rehearsals & fasting-prayer schedule";
const TZ = "Africa/Addis_Ababa";

// Ethiopian → Gregorian (mirrors src/lib/ethiopianCalendar.js constants).
const REF_EPOCH = Date.UTC(2025, 8, 11); // Meskerem 1, 2018 EC = Sept 11 2025
const REF_YEAR = 2018;
function ethiopianToGregorian(ethYear, monthIndex, day) {
  const yearDays = Math.round((ethYear - REF_YEAR) * 365.25);
  const totalDays = yearDays + monthIndex * 30 + (day - 1);
  return new Date(REF_EPOCH + totalDays * 86400000);
}
function toISODate(d) {
  return d.toISOString().slice(0, 10);
}
function nextWeekdayDate(weekday) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const diff = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d;
}

// Weekly programs (all-day recurring events so we never fabricate times).
const WEEKLY_PROGRAMS = [
  { summary: "አዲስ ፕሮግራም · New Song Rehearsal", weekday: 2, byDay: "TU", kind: "weekly_tuesday" },
  { summary: "መደበኛ ፕሮግራም · Regular Practice", weekday: 3, byDay: "WE", kind: "weekly_wednesday" },
  { summary: "የእሁድ አገልግሎት · Sunday Service", weekday: 0, byDay: "SU", kind: "weekly_sunday" },
];

async function findOrCreateCalendar(auth, create) {
  const res = await fetch(`${CAL_API}/users/me/calendarList`, { headers: auth });
  if (!res.ok) throw new Error("Failed to list calendars");
  const list = await res.json();
  const existing = (list.items || []).find((c) => c.summary === CAL_SUMMARY);
  if (existing) return existing.id;
  if (!create) return null;
  const r = await fetch(`${CAL_API}/calendars`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ summary: CAL_SUMMARY, description: CAL_DESC, timeZone: TZ }),
  });
  if (!r.ok) throw new Error("Failed to create calendar");
  const cal = await r.json();
  // Add to the builder's calendar list explicitly.
  await fetch(`${CAL_API}/users/me/calendarList`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ id: cal.id, colorId: "5" }), // gold
  }).catch(() => {});
  return cal.id;
}

async function ensurePublic(auth, calId) {
  await fetch(`${CAL_API}/calendars/${encodeURIComponent(calId)}/acl`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ scope: { type: "default" }, role: "reader" }),
  }).catch(() => {}); // 409 if already public — ignore.
}

async function deleteManagedEvents(auth, calId) {
  let pageToken = null;
  do {
    let url = `${CAL_API}/calendars/${encodeURIComponent(calId)}/events?privateExtendedProperty=sempere_managed=true&maxResults=250`;
    if (pageToken) url += `&pageToken=${pageToken}`;
    const res = await fetch(url, { headers: auth });
    if (!res.ok) return;
    const data = await res.json();
    for (const ev of (data.items || [])) {
      await fetch(`${CAL_API}/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(ev.id)}`, {
        method: "DELETE", headers: auth,
      }).catch(() => {});
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
}

async function createWeekly(auth, calId, untilStr) {
  let count = 0;
  const errors = [];
  for (const p of WEEKLY_PROGRAMS) {
    const d0 = nextWeekdayDate(p.weekday);
    const start = toISODate(d0);
    const end = toISODate(new Date(d0.getTime() + 86400000));
    const body = {
      summary: p.summary,
      start: { date: start },
      end: { date: end },
      recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${p.byDay};UNTIL=${untilStr}`],
      extendedProperties: { private: { sempere_managed: "true", sempere_kind: p.kind } },
    };
    const r = await fetch(`${CAL_API}/calendars/${encodeURIComponent(calId)}/events`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      count += 1;
    } else {
      const t = await r.text().catch(() => "");
      errors.push(`${p.summary}: ${r.status} ${t.slice(0, 160)}`);
    }
  }
  return { count, errors };
}

async function createFasting(auth, calId, sessions) {
  const now = Date.now();
  const horizon = now + 400 * 86400000;
  let count = 0;
  for (const s of sessions) {
    if (s.status === "Cancelled" || s.status === "Rescheduled") continue;
    if (!s.eth_year || s.month_index == null || !s.day) continue;
    const g = ethiopianToGregorian(s.eth_year, s.month_index, s.day);
    if (g.getTime() < now - 86400000 || g.getTime() > horizon) continue;
    const start = toISODate(g);
    const end = toISODate(new Date(g.getTime() + 86400000));
    const desc = [s.prayer_shift, s.prayer_points].filter(Boolean).join("\n");
    const body = {
      summary: `የጾም ጸሎት · ${s.title || "Fasting & Prayer"}`,
      location: s.venue || "",
      description: desc,
      start: { date: start, timeZone: TZ },
      end: { date: end, timeZone: TZ },
      extendedProperties: { private: { sempere_managed: "true", sempere_kind: "fasting", sempere_session_id: s.id || "" } },
    };
    const r = await fetch(`${CAL_API}/calendars/${encodeURIComponent(calId)}/events`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) count += 1;
  }
  return count;
}

function links(calId) {
  return {
    calendarId: calId,
    addUrl: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(calId)}`,
    icalUrl: `https://calendar.google.com/calendar/ical/${encodeURIComponent(calId)}/public/basic.ics`,
    embedUrl: `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calId)}&ctz=Africa%2FAddis_Ababa`,
  };
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "status";

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("googlecalendar");
    const auth = { Authorization: `Bearer ${accessToken}` };

    // "status" — any authenticated member can view the shared calendar.
    if (mode === "status") {
      const calId = await findOrCreateCalendar(auth, false);
      if (!calId) return Response.json({ exists: false });
      return Response.json({ exists: true, ...links(calId) });
    }

    // "sync" — admin only (creates/refreshes events on the builder's calendar).
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const calId = await findOrCreateCalendar(auth, true);
    await ensurePublic(auth, calId);
    await deleteManagedEvents(auth, calId);

    // All-day (DATE-valued) events require a DATE (YYYYMMDD) UNTIL, not a datetime.
    const until = new Date(Date.now() + 365 * 86400000);
    const untilStr = until.toISOString().slice(0, 10).replace(/-/g, "");
    const weekly = await createWeekly(auth, calId, untilStr);

    const sessions = await base44.asServiceRole.entities.FastingSession.list("-eth_year", 200);
    const fastingCount = await createFasting(auth, calId, sessions || []);

    return Response.json({
      ok: true, syncedAt: new Date().toISOString(),
      weeklyCount: weekly.count, fastingCount, ...links(calId),
    });
  } catch (error) {
    return Response.json({ error: error?.message || "Calendar sync failed." }, { status: 500 });
  }
}