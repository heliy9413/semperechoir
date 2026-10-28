import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { sendTelegramMessage } from '../../shared/telegram.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const choirRole = user.choir_role || (user.data && user.data.choir_role) || '';
    const isLeader = user.role === 'admin' || choirRole === 'super_admin' || choirRole === 'dept_admin';
    if (!isLeader) {
      return Response.json({ error: 'Forbidden: only choir leaders may send Telegram messages' }, { status: 403 });
    }

    const text = (body?.text || '').toString();
    if (!text) return Response.json({ error: 'text required' }, { status: 400 });

    // Only super admins may override the configured bot token / chat id.
    const isSuper = user.role === 'admin' || choirRole === 'super_admin';
    const result = await sendTelegramMessage(text, {
      allowOverride: isSuper,
      bot_token: body?.bot_token,
      chat_id: body?.chat_id,
    });

    if (!result.sent) {
      return Response.json({ error: result.error, telegram_code: result.telegram_code || null }, { status: 502 });
    }
    return Response.json({ ok: true, message_id: result.message_id });
  } catch (error) {
    return Response.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
}