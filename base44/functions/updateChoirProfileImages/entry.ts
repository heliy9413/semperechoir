import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// Strict Super Admin (ዋናው አድሚን) endpoint for updating the choir's Cover/Banner
// and Avatar images. Any caller who is not the Super Admin is rejected with 403
// — regular members and department leads can never trigger this update.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const isSuperAdmin = user.choir_role === "super_admin" || user.role === "admin";
    if (!isSuperAdmin) {
      return Response.json({ error: "Forbidden: Super Admin only" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const patch = {};
    if (typeof body?.profile_image === "string") patch.profile_image = body.profile_image;
    if (typeof body?.avatar_image === "string") patch.avatar_image = body.avatar_image;

    const existing = await base44.entities.ChoirProfile.list();
    const rec = existing[0];
    let saved;
    if (rec?.id) {
      saved = await base44.entities.ChoirProfile.update(rec.id, patch);
    } else {
      saved = await base44.entities.ChoirProfile.create({
        choir_name: "Sempere Choir",
        choir_name_am: "ሰምፔር ኳየር",
        ...patch,
      });
    }
    return Response.json({ profile: saved });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}