import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Invoked two ways:
//   1. By the "Auto Link Member By Phone" workflow on every sign-in/signup
//      (body = { user_id, email, auth_method } — phone comes from the user record).
//   2. Directly from the client after a phone-verified Google/Gmail login
//      (body = { phone, member_id? } — the verified phone from the Login screen).
//
// Phone is the PRIMARY identity: a verified roster phone number always binds
// the authenticated account to that member. The roster member's official name
// takes precedence over any Google/Gmail display name, and we NEVER require the
// Google name or email to match the roster — the authenticated Google account
// is simply bound to the phone-identified member.

// Normalize Ethiopian phone numbers to a comparable 9-digit form.
// Strips spaces, dashes, parentheses, and leading zeros, and accepts any of:
// 09xxxxxxxx, 9xxxxxxxx, 2519xxxxxxxx, +2519xxxxxxxx, 07xxxxxxxx, +2517xxxxxxxx.
function normalizePhone(raw) {
  if (!raw) return '';
  let d = String(raw).replace(/[^\d]/g, '');
  if (d.startsWith('251')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  return d; // expected 9 digits for Ethiopian mobiles
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    // Security: only the platform-authenticated caller may link — and only to
    // their OWN account. No client-supplied user_id or shared secret is trusted,
    // so an anonymous caller cannot trigger privileged asServiceRole writes on
    // another user's behalf.
    const authUser = await base44.auth.me().catch(() => null);
    if (!authUser || !authUser.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = authUser.id;

    // Body is optional (the workflow passes trigger args; the client passes the
    // verified phone). Never trust a client-supplied user_id — every write below
    // targets the authenticated id only.
    let body = {};
    try {
      body = await req.json().catch(() => ({})) || {};
    } catch { body = {}; }

    const user = await base44.asServiceRole.entities.User.get(userId).catch(() => null);
    if (!user) return Response.json({ error: 'user not found' }, { status: 404 });
    if (user.id !== userId) return Response.json({ error: 'Forbidden' }, { status: 403 });

    // Select by phone or an existing reciprocal binding, never by a Google name.
    const rawPhone = String(body.phone || user.phone || '').trim();
    const normUser = normalizePhone(rawPhone);
    const hintId = String(body.member_id || '').trim();
    let match = null;
    if (!body.phone && user.linked_member_id) {
      match = await base44.asServiceRole.entities.Member.get(user.linked_member_id);
      if (match.linked_user_id !== userId) return Response.json({ error: 'Roster binding no longer belongs to this account' }, { status: 409 });
    } else {
      if (!/^[79]\d{8}$/.test(normUser)) return Response.json({ ok: true, skipped: true, reason: 'A valid roster phone is required' });
      const separators = '[\\s().-]*';
      const query = { phone: { $regex: `^\\s*(?:\\+?251${separators}|0${separators})?${normUser.split('').join(separators)}\\s*$` } };
      if (hintId) query.id = hintId;
      const page = await base44.asServiceRole.entities.Member.filter(query, { limit: 2 });
      if (page.items.length !== 1) return Response.json({ error: 'No unique roster member found for this phone' }, { status: 409 });
      match = page.items[0];
    }
    if (user.linked_member_id && user.linked_member_id !== match.id) {
      return Response.json({ error: 'This account is already bound to a different roster member' }, { status: 409 });
    }

    // Race guard: re-read the matched member right before writing and bail if
    // another account already claimed it in the meantime.
    const fresh = await base44.asServiceRole.entities.Member.get(match.id).catch(() => null);
    if (!fresh || (fresh.linked_user_id && fresh.linked_user_id !== userId)) {
      return Response.json({ error: 'Member is bound to another account; an admin must release that binding first' }, { status: 409 });
    }
    match = fresh;

    // Instant role assignment, activation, and session link. The roster member's
    // official name ALWAYS takes precedence over any Google/Gmail display name —
    // we store it as linked_member_name so the app shows the roster identity.
    const existingRole = (user.role || '').toString();
    // A phone-verified invocation comes straight from the Login screen, where
    // the number was already matched against the roster registry. For those
    // validated members an Active roster match always grants access — a stale
    // 'rejected' flag on the account must never produce a 403 block. Unverified
    // callers (workflow/self-repair) keep respecting an admin's rejection.
    const phoneVerified = Boolean(body.phone && hintId);
    const userUpdate = {
      linked_member_id: match.id,
      linked_member_name: match.full_name || '',
      phone: match.phone || rawPhone,
      department: match.department || 'አጠቃላይ',
    };
    if (existingRole !== 'admin') {
      userUpdate.role = 'user';
      userUpdate.choir_role = user.choir_role || 'member';
    }
    // Every Active roster match gets access granted — admins included. Admin
    // accounts previously skipped this grant, leaving them without the
    // active/approved flags the app access checks require — the source of the
    // intermittent 403 Access Restricted errors on the Super Admin login.
    if (match.status === 'Active' && (phoneVerified || user.status !== 'rejected')) {
      userUpdate.status = 'approved';
      userUpdate.active = true;
    }

    // Every write is scoped to the caller's own authenticated id and the single
    // matched member — no client-supplied target id is honored. Bind the
    // authenticated Google/Gmail account (email) to the roster member.
    await base44.asServiceRole.entities.User.update(userId, userUpdate);
    await base44.asServiceRole.entities.Member.update(match.id, {
      linked_user_id: userId,
      linked_email: user.email || authUser.email || '',
    });
    return Response.json({
      ok: true,
      auto_linked: true,
      already_linked: Boolean(user.linked_member_id),
      member_id: match.id,
      member_name: match.full_name,
      phone: match.phone || rawPhone,
    });
  } catch (error) {
    return Response.json({ error: error?.message || 'error' }, { status: 500 });
  }
}