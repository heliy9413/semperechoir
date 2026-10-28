import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

const GROUP_WINDOW_MS = 30 * 60 * 1000; // 30-minute grouping window for comment spam-control

function parseArr(s) {
  try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}

// Tier 1 broadcasters: Super Admin, platform admin, or Department Head (የክፍል መሪ).
function isAuthorizedBroadcaster(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const cr = user.choir_role;
  if (cr === 'super_admin' || cr === 'dept_admin') return true;
  if (user.role === 'ዋና መሪ') return true;
  return false;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const type = body.type === 'comment' ? 'comment' : 'broadcast';
    const category = ['announcements', 'prayer', 'departments', 'comments', 'scripture'].includes(body.category) ? body.category : 'announcements';
    const title = (body.title || '').toString().slice(0, 200);
    const summary = (body.body || '').toString().slice(0, 500);
    const link_path = (body.link_path || '/').toString();
    const link_anchor = (body.link_anchor || '').toString();
    const priority = body.priority === 'urgent' ? 'urgent' : 'normal';
    const department = (body.department || '').toString();
    const actor_name = user.full_name || user.email || 'System';
    const actor_id = user.id || '';

    if (!title) return Response.json({ error: 'title required' }, { status: 400 });

    // Tier 1 — Urgent/Official Broadcast (all active members).
    if (type === 'broadcast') {
      if (!isAuthorizedBroadcaster(user)) {
        return Response.json({ error: 'Forbidden: only admins & department heads may broadcast' }, { status: 403 });
      }
      const notif = await base44.entities.Notification.create({
        category, title, body: summary, link_path, link_anchor,
        priority, audience: 'all', thread_id: '',
        target_user_ids_json: '[]', read_by_json: '[]', group_count: 1,
        actor_name, actor_id, department
      });
      return Response.json({ ok: true, id: notif.id });
    }

    // Tier 2 — Comment / discussion thread (only creator + direct participants).
    const thread_id = (body.thread_id || '').toString();
    if (!thread_id) return Response.json({ error: 'thread_id required' }, { status: 400 });
    const targetIds = Array.isArray(body.target_user_ids) ? body.target_user_ids.filter(Boolean) : [];
    const recipients = [...new Set(targetIds.filter(id => id && id !== actor_id))];

    // Smart rate-limiting: group rapid comments on the same thread into one alert.
    const since = new Date(Date.now() - GROUP_WINDOW_MS).toISOString();
    const existing = await base44.entities.Notification.filter(
      { category: 'comments', thread_id, audience: 'participants' }, '-created_date', 20
    );
    const grouped = (existing || []).find(n => (n.created_date || '') >= since && n.actor_id !== actor_id);
    if (grouped) {
      const count = (Number(grouped.group_count) || 1) + 1;
      const prevTargets = parseArr(grouped.target_user_ids_json);
      const mergedTargets = [...new Set([...recipients, ...prevTargets])];
      const readBy = parseArr(grouped.read_by_json).filter(id => !mergedTargets.includes(id));
      await base44.entities.Notification.update(grouped.id, {
        body: `${count} new comments · ${summary}`.slice(0, 500),
        group_count: count,
        target_user_ids_json: JSON.stringify(mergedTargets),
        read_by_json: JSON.stringify(readBy)
      });
      return Response.json({ ok: true, id: grouped.id, grouped: true, count });
    }

    const notif = await base44.entities.Notification.create({
      category: 'comments', title, body: summary, link_path, link_anchor,
      priority: 'normal', audience: 'participants', thread_id,
      target_user_ids_json: JSON.stringify(recipients), read_by_json: '[]', group_count: 1,
      actor_name, actor_id, department
    });
    return Response.json({ ok: true, id: notif.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}