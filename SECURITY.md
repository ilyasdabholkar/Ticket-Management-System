# Security

## Principles
- Security is enforced in Postgres (RLS, grants, triggers, definer functions) and in Storage policies, never only in the UI.
- The browser only has the **publishable key**. The service-role key exists only in Edge Function secrets (provided automatically by Supabase) and nowhere else: it is not kept in the repo or in the local `.env` (removed 2026-11-07; the root `.env` holds only `VITE_*` values and a local record of the `LLM_*` secrets).
- No credentials in code, migrations, `seed.sql` or git. `.env*` files are git-ignored, except `.env.example`. The repo has one env file: root `.env`.
- Roles come from the database (`profiles.roles`: admin and/or employee), never from client input.

## Authentication & roles (Phase 2)
- **Sign-in:** Supabase Auth with email and password. Public sign-up must be disabled in the dashboard. Only admins create accounts.
- **Role source:** `profiles.roles` (one or both of `admin`, `employee`). New profiles take their roles from `auth.users.raw_app_meta_data.roles`, which only the service role can set. Unknown values are ignored, and roles in `user_metadata`, which users can control, are ignored. Verified in `02_profiles_rls.sql` and `08_multi_roles.sql`.
- **Role meaning:** Admin grants administration (`private.is_admin()`). Employee is required to be assigned tickets and to own effort entries (`private.is_active_employee()`, enforced in triggers). An admin-only user keeps all admin rights and can log effort for employees.
- **Protected columns:**
  - `authenticated` may only `UPDATE (full_name)` on its own row.
  - `roles`, `is_active` and `email` can only be changed through the `admin-users` Edge Function, using the service role. It refuses an empty role set, removing your own Admin role, and removing or deactivating the last active admin.
  - Admins can't change these with direct SQL either. This was verified.
- **Admin operations:** the `admin-users` Edge Function requires a valid user JWT and re-checks in the database that the caller is an active admin. It also stops admins from demoting or deactivating themselves, and blocks removing the last active admin.
- **Deactivation:** the auth user is banned, so no new sessions can start. Every RLS policy requires `private.is_active_user()`, so an existing JWT immediately sees nothing (verified). The frontend detects the missing profile and signs the user out.
- **Initial admin:** created once by a provisioning script, since removed (2026-11-07). New users are created by an admin through the `admin-users` Edge Function.
- **Route guards** (`ProtectedRoute`, `AdminRoute`, `GuestRoute`) are UI conveniences only.
- **Login redirect:** only same-app relative paths are accepted, which prevents open redirects.

## Status
| Control | Status |
|---|---|
| Env validation, no secrets in the frontend | Done (Phase 1) |
| IIS security headers (nosniff, frame deny, referrer policy) | Done (Phase 1) |
| Supabase Auth, profiles, role helpers, RLS, admin Edge Function | Done (Phase 2) |
| Multi-role (admin and/or employee); Employee role required for assignment and effort ownership | Done (change, 2026-11-07) |
| Applications RLS, admin-only writes, archive/restore RPCs, read-only archived rows | Done (Phase 3) |
| Tickets: column grants, forced creator and number, application/assignee validation, soft delete via RPC (creator/admin), append-only activity log | Done (Phase 4) |
| Production lock in DB (trigger + RLS + RPC checks), admins included | Done (Phase 4) |
| Status changes only through `transition_ticket_status` (status column not grantable); Prod only from QA; no normal reopen | Done (Phase 5) |
| Audited admin correction: admin-only RPC, mandatory reason, transaction-local bypass flag (not settable through the API), flagged history row plus before/after audit entry | Done (Phase 5) |
| Own-effort rules: RLS plus trigger (only admins log for others), immutable owner, employees see only their own entries, totals through definer RPCs only, effort activity hidden from others | Done (Phase 6) |
| Comments: author forced, author-only edit, author or admin delete, read-only when locked | Done (Phase 6) |
| Lock covers comments and effort (insert, update, delete, restore) | Done (Phase 6) |
| Storage: private ticket-attachments bucket, MIME/size limits, path-scoped upload/read policies, server-side registration using storage metadata, no deletes | Done (Phase 4) |
| Knowledge base: admin-only writes (RLS + RPCs), employees read and search; private bucket with admin-only upload and path checks; extraction results writable only by the service role; search snippets use non-HTML markers | Done (Phase 7) |
| Reports: report RPC limited to self or admin (target must hold the Employee role); report settings admin-only; private report-assets bucket (admin upload, PNG/JPEG, 2 MB); header path format enforced by a check constraint | Done (Phase 8) |
| Rich-text safety: JSON storage validated in DB; rendering only through the Tiptap schema (no dangerouslySetInnerHTML); link protocol allow-list; images by storage path | Done (Phase 4). DOMPurify not needed yet because no HTML is rendered; it will be added if an HTML path appears |

## Manual Supabase settings (dashboard)
- Recommended: enable **leaked password protection** (Authentication → Passwords). Flagged by the security advisor.
- **Keep the Email provider enabled**, but turn off "Allow new users to sign up" (Authentication → Sign In / Providers).
- Add the IIS site URL under Authentication → URL Configuration.

The full RLS matrix is in `TECHNICAL_ANALYSIS.md` §4.

## AI assistant (`ai-assistant` Edge Function)
- The LLM API key exists only as an Edge Function secret (`LLM_API_KEY`). It is never sent to the browser or logged.
- Ticket context is read with the caller's JWT (RLS applies), never taken from the browser. Deleted tickets are refused, and inactive users are refused.
- Prompt-injection defence: ticket text is delimited as untrusted data, and the system prompts forbid following embedded instructions or revealing secrets. Output is validated against a schema before it is returned.
- Data sent to the provider: ticket fields, comment text, status/assignment history and effort descriptions, with people named by full name only (no emails or IDs). Outputs are not stored.
