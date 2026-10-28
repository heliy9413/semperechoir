import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// Registers (or refreshes) a member's Web Push subscription so the daily 7 AM
// EAT Scripture sender can deliver to their device lock screen.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const sub = body?.subscription || {};
    const endpoint = String(sub.endpoint || "").trim();
    const p256dh = String(sub.keys?.p256dh || "").trim();
    const auth = String(sub.keys?.auth || "").trim();
    if (!endpoint || !p256dh || !auth) {
      return Response.json({ error: "Invalid subscription payload." }, { status: 400 });
    }

    // Upsert by endpoint (de-dup across re-subscribes). Service role bypasses RLS.
    const existing = await base44.asServiceRole.entities.PushSubscription.filter(
      { endpoint }, undefined, 1
    );
    const data = {
      endpoint, p256dh, auth,
      user_id: user.id,
      user_name: user.full_name || user.email || "",
    };
    if (existing && existing[0]) {
      await base44.asServiceRole.entities.PushSubscription.update(existing[0].id, data);
      return Response.json({ ok: true, id: existing[0].id, updated: true });
    }
    const rec = await base44.asServiceRole.entities.PushSubscription.create(data);
    return Response.json({ ok: true, id: rec.id });
  } catch (error) {
    return Response.json({ error: error?.message || "Failed to register subscription." }, { status: 500 });
  }
}