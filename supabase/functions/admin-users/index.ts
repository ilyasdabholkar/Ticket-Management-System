// admin-users: privileged user administration (service role stays server-side).
// Caller must be an active admin. Actions: create, update, set_active, reset_password.
// Multi-role: a user holds one or both of {admin, employee} (profiles.roles).
import { withSupabase } from 'npm:@supabase/server@^1'
import { z } from 'npm:zod@^4'

const password = z.string().min(8, 'Password must be at least 8 characters').max(72)
const fullName = z.string().trim().min(1).max(120)
const email = z.email().transform((v) => v.trim().toLowerCase())
const roles = z
  .array(z.enum(['admin', 'employee']))
  .min(1, 'Select at least one role')
  .transform((r) => [...new Set(r)].sort())
const userId = z.uuid()

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), email, full_name: fullName, roles, password }),
  z.object({
    action: z.literal('update'),
    user_id: userId,
    full_name: fullName.optional(),
    email: email.optional(),
    roles: roles.optional(),
  }),
  z.object({ action: z.literal('set_active'), user_id: userId, is_active: z.boolean() }),
  z.object({ action: z.literal('reset_password'), user_id: userId, password }),
])

// Long ban = deactivated. 'none' lifts it.
const BAN_DEACTIVATED = '876000h'

function fail(status: number, message: string) {
  return Response.json({ error: message }, { status })
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return fail(405, 'Method not allowed')

    const admin = ctx.supabaseAdmin
    const callerId = ctx.userClaims?.id
    if (!callerId) return fail(401, 'Not authenticated')

    // Authorization: caller must be an active admin (checked from the DB, not the JWT).
    const { data: caller, error: callerErr } = await admin
      .from('profiles')
      .select('id, roles, is_active')
      .eq('id', callerId)
      .maybeSingle()
    if (callerErr) return fail(500, 'Could not verify caller')
    if (!caller || !caller.is_active || !caller.roles?.includes('admin')) return fail(403, 'Administrator access required')

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return fail(400, 'Invalid JSON body')
    }
    const parsed = actionSchema.safeParse(body)
    if (!parsed.success) return fail(400, parsed.error.issues.map((i) => i.message).join('; '))
    const input = parsed.data

    /** Prevents removing the last active admin. */
    async function assertNotLastAdmin(targetId: string) {
      const { count, error } = await admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .contains('roles', ['admin'])
        .eq('is_active', true)
        .neq('id', targetId)
      if (error) throw new Error('Could not verify administrators')
      if ((count ?? 0) === 0) throw new Error('At least one active administrator is required')
    }

    try {
      switch (input.action) {
        case 'create': {
          const { data, error } = await admin.auth.admin.createUser({
            email: input.email,
            password: input.password,
            email_confirm: true,
            user_metadata: { full_name: input.full_name },
            app_metadata: { roles: input.roles },
          })
          if (error) return fail(400, error.message)
          // Profile row (with roles) is created by the on_auth_user_created trigger.
          return Response.json({ user_id: data.user.id }, { status: 201 })
        }

        case 'update': {
          const removingAdmin = input.roles !== undefined && !input.roles.includes('admin')
          if (input.user_id === callerId && removingAdmin) {
            return fail(400, 'You cannot remove your own administrator role')
          }
          if (removingAdmin) {
            const { data: target } = await admin.from('profiles').select('roles').eq('id', input.user_id).maybeSingle()
            if (target?.roles?.includes('admin')) await assertNotLastAdmin(input.user_id)
          }

          if (input.email || input.roles) {
            const { error } = await admin.auth.admin.updateUserById(input.user_id, {
              ...(input.email ? { email: input.email, email_confirm: true } : {}),
              ...(input.roles ? { app_metadata: { roles: input.roles } } : {}),
            })
            if (error) return fail(400, error.message)
            // profiles.email is synced by the on_auth_user_email_changed trigger.
          }

          const patch: Record<string, unknown> = {}
          if (input.full_name) patch.full_name = input.full_name
          if (input.roles) patch.roles = input.roles
          if (Object.keys(patch).length > 0) {
            const { error } = await admin.from('profiles').update(patch).eq('id', input.user_id)
            if (error) return fail(400, error.message)
          }
          return Response.json({ ok: true })
        }

        case 'set_active': {
          if (input.user_id === callerId && !input.is_active) {
            return fail(400, 'You cannot deactivate your own account')
          }
          if (!input.is_active) {
            const { data: target } = await admin.from('profiles').select('roles').eq('id', input.user_id).maybeSingle()
            if (target?.roles?.includes('admin')) await assertNotLastAdmin(input.user_id)
          }

          const { error: authErr } = await admin.auth.admin.updateUserById(input.user_id, {
            ban_duration: input.is_active ? 'none' : BAN_DEACTIVATED,
          })
          if (authErr) return fail(400, authErr.message)

          const { error } = await admin.from('profiles').update({ is_active: input.is_active }).eq('id', input.user_id)
          if (error) return fail(400, error.message)
          return Response.json({ ok: true })
        }

        case 'reset_password': {
          const { error } = await admin.auth.admin.updateUserById(input.user_id, { password: input.password })
          if (error) return fail(400, error.message)
          return Response.json({ ok: true })
        }
      }
    } catch (e) {
      return fail(400, e instanceof Error ? e.message : 'Request failed')
    }
  }),
}
