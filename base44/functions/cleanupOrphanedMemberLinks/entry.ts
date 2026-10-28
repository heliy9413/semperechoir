import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// One-time database cleanup sweep. Clears the roster binding fields
// (linked_user_id, linked_email -> null) on every member whose bound auth
// user no longer exists in the App Users table (e.g. the account was deleted),
// so the member's phone is freed for a new Gmail/email link. Admin-only.
//
// Invoke once from the admin UI; safe to re-run (idempotent).

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const authUser = await base44.auth.me().catch(() => null);
    if (!authUser || !authUser.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const isAdmin = authUser.role === 'admin' || (authUser as any).choir_role === 'super_admin';
    if (!isAdmin) return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });

    const members = await base44.asServiceRole.entities.Member.list();
    const users = await base44.asServiceRole.entities.User.list().catch(() => []);
    const userIds = new Set((users || []).map((u: any) => u.id));

    const cleaned: any[] = [];
    for (const m of (members || [])) {
      const lid = m.linked_user_id;
      if (!lid) continue;            // not bound — nothing to clean
      if (userIds.has(lid)) continue; // bound user still exists — leave intact
      // Orphan: the bound user is gone. Clear the member's binding fields so
      // no lock remains on the phone or profile.
      await base44.asServiceRole.entities.Member.update(m.id, {
        linked_user_id: null,
        linked_email: null,
      });
      cleaned.push({ id: m.id, name: m.full_name, phone: m.phone, orphan_user_id: lid });
    }

    return Response.json({ ok: true, cleaned_count: cleaned.length, cleaned });
  } catch (error) {
    return Response.json({ error: error?.message || 'error' }, { status: 500 });
  }
}