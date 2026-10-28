import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// Returns the public VAPID key (safe to expose) so the client can subscribe
// the browser PushManager. The private key stays server-side only.
// Keys are sanitized to tolerate paste artifacts (surrounding quotes, colons,
// trailing commas) so a slightly-mis-pasted secret still works.
function cleanKey(raw) {
  if (!raw) return "";
  const m = String(raw).match(/[A-Za-z0-9_-]{40,}/);
  return m ? m[0] : String(raw).trim().replace(/^[\s:"]+|[\s",]+$/g, "");
}

export default async function(req: Request): Promise<Response> {
  try {
    // Authentication guard: the push setup flow runs on members-only pages, so
    // anonymous callers must not be able to probe this endpoint. Reject any
    // unauthenticated invocation with 401.
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const vapidPublicKey = cleanKey(process.env.VAPID_PUBLIC_KEY);
    return Response.json({
      vapidPublicKey,
      configured: !!vapidPublicKey,
    });
  } catch (error) {
    return Response.json({ error: error?.message || "Failed to read push config." }, { status: 500 });
  }
}