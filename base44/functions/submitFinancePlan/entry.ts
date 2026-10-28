import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sendTelegramMessage } from '../../shared/telegram.ts';

const FINANCE_DEPT = 'የገንዘብ ክፍል';

// Resolve the choir's main leader (Super Admin) auth-user id, so the finance
// department can route a plan submission notification directly to the leader.
function isLeaderLike(u) {
  if (!u) return false;
  if (u.role === 'admin') return true;
  const cr = u.choir_role || (u.data && u.data.choir_role) || '';
  if (cr === 'super_admin') return true;
  if (u.role === 'ዋና መሪ') return true;
  return false;
}

async function findLeaderUserId(base44) {
  try {
    const page = await base44.asServiceRole.entities.User.filter({}, { limit: 100 });
    const leader = (page.items || []).find(isLeaderLike);
    return leader?.id || '';
  } catch {
    return '';
  }
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const mode = (body.mode || '').toString();
    const planId = (body.plan_id || '').toString().trim();
    if (!planId) return Response.json({ error: 'plan_id required' }, { status: 400 });

    const choirRole = user.choir_role || (user.data && user.data.choir_role) || '';
    const userDept = user.department || (user.data && user.data.department) || '';
    const isSuper = user.role === 'admin' || choirRole === 'super_admin' || user.role === 'ዋና መሪ';
    const isFinance = isSuper || (choirRole === 'dept_admin' && userDept === FINANCE_DEPT);

    const plan = await base44.asServiceRole.entities.FinancePlan.get(planId).catch(() => null);
    if (!plan) return Response.json({ error: 'Plan not found' }, { status: 404 });

    const actorName = user.full_name || user.email || 'Finance';

    if (mode === 'submit') {
      if (!isFinance) {
        return Response.json({ error: 'Forbidden: only the Finance department may submit plans' }, { status: 403 });
      }
      const now = new Date().toISOString();
      await base44.asServiceRole.entities.FinancePlan.update(planId, {
        status: 'submitted_to_leader',
        target_role: 'main_leader',
        submitted_at: now,
        submitter_name: actorName,
        submitter_id: user.id || '',
        review_comment: '',
        reviewed_at: '',
        reviewed_by_name: '',
      });

      // Targeted in-app notification to the main leader (audience = participants,
      // scoped to the leader's user id) so the bell badge increments for them.
      const leaderId = await findLeaderUserId(base44);
      if (leaderId) {
        await base44.asServiceRole.entities.Notification.create({
          category: 'departments',
          title: '🔔 አዲስ የፋይናንስ ዕቅድ ቀርቧል',
          body: 'አዲስ የፋይናንስ ዕቅድ ከፋይናንስ ክፍል ቀርቧል፤ እባክዎ ገብተው ይመልከቱ።',
          link_path: '/treasury',
          link_anchor: planId,
          priority: 'normal',
          audience: 'participants',
          thread_id: 'finance-plan-submission',
          target_user_ids_json: JSON.stringify([leaderId]),
          read_by_json: '[]',
          group_count: 1,
          actor_name: actorName,
          actor_id: user.id || '',
          department: FINANCE_DEPT,
        });
      }

      // Telegram alert to the choir's configured chat if the bot is set up.
      const tgText = `🔔 <b>አዲስ የፋይናንስ ዕቅድ ቀርቧል</b>\nአዲስ የፋይናንስ ዕቅድ ከፋይናንስ ክፍል ቀርቧል፤ እባክዎ ገብተው ይመልከቱ።\nየላከው: ${actorName}`;
      const tg = await sendTelegramMessage(tgText);

      return Response.json({ ok: true, status: 'submitted_to_leader', leader_notified: !!leaderId, telegram: tg });
    }

    if (mode === 'approve' || mode === 'revise') {
      if (!isSuper) {
        return Response.json({ error: 'Forbidden: only the Main Leader may review submissions' }, { status: 403 });
      }
      const comment = ((body.comment || '').toString()).slice(0, 500);
      const nextStatus = mode === 'approve' ? 'approved' : 'revision_requested';
      await base44.asServiceRole.entities.FinancePlan.update(planId, {
        status: nextStatus,
        review_comment: comment,
        reviewed_at: new Date().toISOString(),
        reviewed_by_name: actorName,
      });
      return Response.json({ ok: true, status: nextStatus });
    }

    return Response.json({ error: 'unknown mode' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
}