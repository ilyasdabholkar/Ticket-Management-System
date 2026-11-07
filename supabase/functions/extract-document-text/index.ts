// extract-document-text: extracts searchable text from a knowledge base document.
// Decision (replaces Q10): only .txt files are extracted. Word, PDF, SQL, JSON, spreadsheets and
// images are searchable by record title/description/notes only ('not_supported').
// Caller must be an active admin (only admins upload KB documents). Runs with the service role.
import { withSupabase } from 'npm:@supabase/server@^1'
import { z } from 'npm:zod@^4'

const MAX_TEXT_CHARS = 500_000
const MAX_FILE_BYTES = 26_214_400
const bodySchema = z.object({ attachment_id: z.uuid() })

function fail(status: number, message: string) {
  return Response.json({ error: message }, { status })
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return fail(405, 'Method not allowed')
    const admin = ctx.supabaseAdmin
    const callerId = ctx.userClaims?.id
    if (!callerId) return fail(401, 'Not authenticated')

    const { data: caller } = await admin.from('profiles').select('roles, is_active').eq('id', callerId).maybeSingle()
    if (!caller || !caller.is_active || !caller.roles?.includes('admin')) return fail(403, 'Administrator access required')

    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return fail(400, 'attachment_id (uuid) is required')

    const { data: att, error: attErr } = await admin
      .from('knowledge_attachments')
      .select('id, storage_path, file_ext, size_bytes, deleted_at')
      .eq('id', parsed.data.attachment_id)
      .maybeSingle()
    if (attErr) return fail(500, 'Could not load attachment')
    if (!att || att.deleted_at) return fail(404, 'Attachment not found')
    if (att.size_bytes > MAX_FILE_BYTES) return fail(400, 'File too large')

    // Anything other than .txt is title-only (also enforced by a DB check constraint).
    if (att.file_ext !== 'txt') return Response.json({ status: 'not_supported' })

    const setResult = (status: 'completed' | 'failed', text: string | null) =>
      admin.from('knowledge_attachments').update({ extraction_status: status, extracted_text: text }).eq('id', att.id)

    try {
      const { data: file, error: dlErr } = await admin.storage.from('knowledge-base').download(att.storage_path)
      if (dlErr || !file) throw new Error('Download failed')
      const raw = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(await file.arrayBuffer()))
      // Strip NUL bytes (not allowed in Postgres text), collapse spaces, cap the size.
      const text = raw.replace(/\u0000/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, MAX_TEXT_CHARS)
      const { error: upErr } = await setResult('completed', text || null)
      if (upErr) throw upErr
      return Response.json({ status: 'completed', characters: text.length })
    } catch (e) {
      console.error('extraction failed', att.id, e instanceof Error ? e.message : e)
      await setResult('failed', null)
      return Response.json({ status: 'failed' }, { status: 200 })
    }
  }),
}
