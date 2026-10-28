import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const audioUrl = body?.audio_url;
    const noteId = body?.note_id;
    if (!audioUrl) return Response.json({ error: 'audio_url required' }, { status: 400 });

    if (noteId) {
      // Ownership check: a client-supplied note_id must belong to the caller (or
      // the caller must be an admin/super_admin) before any asServiceRole update,
      // otherwise any signed-in user could overwrite another user's voice note.
      const note = await base44.asServiceRole.entities.VoiceNote.get(noteId).catch(() => null);
      if (!note) return Response.json({ error: 'Voice note not found' }, { status: 404 });
      const choirRole = user.choir_role || (user.data && user.data.choir_role) || '';
      const isPrivileged = user.role === 'admin' || choirRole === 'super_admin';
      if (note.created_by_id !== user.id && !isPrivileged) {
        return Response.json({ error: 'Forbidden: you can only transcribe your own voice notes' }, { status: 403 });
      }
      await base44.asServiceRole.entities.VoiceNote.update(noteId, { status: 'processing' });
    }

    const result = await base44.asServiceRole.integrations.Core.TranscribeAudio({ audio_url: audioUrl });
    const transcript = typeof result === 'string' ? result : (result?.text || result?.transcript || JSON.stringify(result || {}));

    if (noteId) {
      await base44.asServiceRole.entities.VoiceNote.update(noteId, { transcript, status: 'done' });
    }
    return Response.json({ transcript, status: 'done' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}