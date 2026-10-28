import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// Strict Super Admin–only member creation endpoint.
// Any authenticated non-super-admin attempting to create a member is rejected
// with 403 Forbidden. The roster list, roles, and existing member attributes
// are never touched here — this function only governs NEW member creation.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Strict Super Admin verification — mirrors src/lib/rbac.js isSuperAdmin().
    const isSuper =
      user.choir_role === 'super_admin' ||
      user.role === 'admin' ||
      user.role === 'ዋና መሪ';
    if (!isSuper) {
      return Response.json(
        { error: 'Forbidden — only the Super Admin may add new members.' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const member = body?.member;
    if (!member || !member.full_name || !String(member.full_name).trim()) {
      return Response.json({ error: 'Member full_name is required.' }, { status: 400 });
    }

    const created = await base44.entities.Member.create(member);
    return Response.json({ member: created });
  } catch (error) {
    return Response.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}