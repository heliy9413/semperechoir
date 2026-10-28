import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Strict time windows (East Africa Time, UTC+3). Sunday morning and Tuesday
// evening only — self check-in outside the window is refused server-side.
const WINDOWS = {
  sunday: { weekday: 0, startMin: 8 * 60 + 30, lateMin: 8 * 60 + 45, endMin: 9 * 60 + 20 },
  tuesday: { weekday: 2, startMin: 20 * 60 + 30, lateMin: 20 * 60 + 45, endMin: 21 * 60 + 20 },
  wednesday: { weekday: 3, startMin: 17 * 60 + 20, lateMin: 17 * 60 + 35, endMin: 18 * 60 + 10 },
  // Monthly fasting prayer: on-time until 08:40 EAT, late 08:40-09:00.
  fasting: { weekday: 6, startMin: 8 * 60, lateMin: 8 * 60 + 40, endMin: 9 * 60 },
};

function eatNow() {
  const now = new Date();
  const eat = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 3 * 3600000);
  return {
    weekday: eat.getUTCDay(),
    totalMinutes: eat.getUTCHours() * 60 + eat.getUTCMinutes(),
  };
}

function windowStatus(sessionType) {
  const w = WINDOWS[sessionType];
  if (!w) return { open: false, status: 'closed', reason: 'No time window for this session.' };
  const { weekday, totalMinutes } = eatNow();
  const today = weekday === w.weekday;
  const inWindow = today && totalMinutes >= w.startMin && totalMinutes <= w.endMin;
  if (!inWindow) return { open: false, status: 'closed', reason: 'የመገኘት ሰዓት አልቋል / Attendance Closed' };
  const lateAt = w.lateMin !== undefined ? w.lateMin : w.startMin + 15;
  return { open: true, status: totalMinutes >= lateAt ? 'late' : 'present' };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const sessionType = (body.session_type || '').toString();
    const ethYear = Number(body.eth_year);
    const monthIndex = Number(body.month_index);
    const day = Number(body.day);
    const deviceToken = (body.device_token || '').toString();

    if (!sessionType || !deviceToken || Number.isNaN(ethYear) || Number.isNaN(monthIndex) || Number.isNaN(day))
      return Response.json({ error: 'Missing session or device info' }, { status: 400 });

    // Resolve the authenticated user's bound choir Member strictly via the
    // Super-Admin-linked linked_member_id. A full_name fallback would let any
    // user impersonate another member by matching their name, so it is removed;
    // unlinked users must request linking from a Super Admin instead.
    const linkedId = (user.linked_member_id || '').toString();
    let me = linkedId
      ? await base44.asServiceRole.entities.Member.get(linkedId).catch(() => null)
      : null;
    if (!me) return Response.json({ error: 'Your account is not linked to a choir member. Ask the Super Admin to link your email from Settings → App Users.' }, { status: 404 });

    // Pull this session's records once for both anti-proxy and idempotency checks.
    const sessionRecords = await base44.asServiceRole.entities.AttendanceRecord.filter({
      session_type: sessionType, eth_year: ethYear, month_index: monthIndex, day: day,
    });

    // Anti-proxy: the same device token already checked in a DIFFERENT member for this session.
    const proxy = (sessionRecords || []).find((r) => r.device_token === deviceToken && r.member_id !== me.id);
    if (proxy) {
      const other = await base44.asServiceRole.entities.Member.get(proxy.member_id).catch(() => null);
      return Response.json({ error: `Anti-proxy block: this device already checked in ${other?.full_name || 'another member'} for this session.` }, { status: 403 });
    }

    // Idempotent: this member already checked in (duplicate compound key guard).
    const existing = (sessionRecords || []).find((r) => r.member_id === me.id);
    if (existing) {
      // Report the ORIGINAL scan time: created_date is immutable, saved_at may
      // have been touched by later edits, so the earlier one is the truth.
      const created = existing.created_date ? new Date(existing.created_date.endsWith('Z') ? existing.created_date : existing.created_date + 'Z') : null;
      const saved = existing.saved_at ? new Date(existing.saved_at) : null;
      const original = created && saved && created < saved ? existing.created_date : existing.saved_at;
      return Response.json({ ok: true, already: true, member_name: me.full_name, status: existing.status, checked_in_at: original });
    }

    // Monthly Saturday fasting prayer: QR check-in only activates on a date
    // that has a scheduled fasting session (e.g. ጥቅምት 28 monthly ጾም ጸሎት).
    if (sessionType === 'fasting') {
      const scheduled = await base44.asServiceRole.entities.FastingSession.filter({
        eth_year: ethYear, month_index: monthIndex, day: day,
      });
      const hasActive = (scheduled || []).some((s) => s.status !== 'Cancelled');
      if (!hasActive)
        return Response.json({ error: 'በዚህ ቀን ጾም ጸሎት አልተቀጠለም / No fasting prayer is scheduled for this date.' }, { status: 403 });
    }

    // Enforce the strict time window on the server — the client gate is UI only.
    // The server recomputes on-time vs late from the live EAT clock, ignoring
    // any client-supplied status so members cannot self-award "present".
    const win = windowStatus(sessionType);
    if (!win.open) return Response.json({ error: win.reason }, { status: 403 });
    const status = win.status;
    if (!['present', 'late', 'permission', 'absent'].includes(status))
      return Response.json({ error: 'Invalid status' }, { status: 400 });

    const now = new Date().toISOString();
    const rec = await base44.asServiceRole.entities.AttendanceRecord.create({
      member_id: me.id, session_type: sessionType, eth_year: ethYear, month_index: monthIndex, day: day,
      status, notes: 'QR self check-in', saved_by_name: user.full_name || user.email, saved_at: now, device_token: deviceToken,
    });
    return Response.json({ ok: true, already: false, member_name: me.full_name, status, checked_in_at: now, record_id: rec.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}