# Database Schema

The approved full design is in `TECHNICAL_ANALYSIS.md` §3 and §11. This file documents what has actually been applied.

## Applied migrations
| Migration | Phase | Summary |
|---|---|---|
| `20261107080707_auth_profiles` | 2 | `private` schema, `user_role` enum, `profiles`, role helpers, auth triggers, RLS |
| `20261107084502_applications` | 3 | `applications`, archive/restore RPCs, RLS |
| `20261107122228_dashboard` | 9 | `get_dashboard_stats` |
| `20261107120514_reports` | 8 | `report_settings` (single row) with trim/stamp trigger and audit, `report-assets` bucket and policies, `get_effort_report` |
| `20261107094517_multi_roles` | — | Multi-role: `profiles.roles` replaces `profiles.role`; `private.valid_roles`, `private.is_active_employee`; `is_admin` and `handle_new_auth_user` updated; ticket assignee and effort owner must hold the Employee role; auth `app_metadata.roles` synced |
| `20261107093909_kb_txt_only_extraction` | 7 | Extraction limited to .txt: `register_kb_attachment` updated, check constraint `knowledge_attachments_text_only_for_txt`, existing non-txt documents reset to `not_supported` |
| `20261107093023_knowledge_base` | 7 | KB enums, `knowledge_base`, `knowledge_attachments`, weighted tsvector maintained by triggers, KB audit (activity entity types extended), admin RPCs, `search_knowledge_base`, `knowledge-base` bucket and policies |
| `20261107092117_comments_effort` | 6 | `ticket_comments`, `effort_unit` enum, `effort_logs` (generated minutes), lock and own-effort triggers, comment/effort audit, soft-delete/restore RPCs, aggregate RPCs, effort-aware `activity_logs` read policy |
| `20261107090924_workflow` | 5 | `ticket_status_history` (+ backfill), initial-history trigger, `transition_ticket_status`, `admin_correct_ticket`, audit trigger skips corrections |
| `20261107085410_tickets` | 4 | Ticket enums, `private.ticket_sequences`, `tickets`, `ticket_number_aliases`, `ticket_attachments`, `activity_logs`, audit triggers, ticket RPCs, `ticket-attachments` bucket + storage policies, `pg_trgm` |

## Schemas
- `public`: exposed through the Data API. RLS is on for every table.
- `private`: helper functions and internal tables. Not exposed. Only `usage` is granted to `authenticated`.

## Enums
| Enum | Values |
|---|---|
| `user_role` | `admin`, `employee` |
| `ticket_category` | `development`, `support`, `rnd` |
| `ticket_priority` | `low`, `medium`, `high`, `critical` |
| `ticket_status` | `development`, `in_progress`, `qa_deployed`, `prod_deployed` |
| `effort_unit` | `minutes`, `hours` |
| `kb_document_type` | `note`, `document` |
| `kb_category` | `requirements`, `technical_documentation`, `database_queries`, `api_documentation`, `release_notes`, `kt_documents`, `sample_io`, `troubleshooting`, `general_notes` |
| `extraction_status` | `pending`, `completed`, `failed`, `not_supported` |

## Tables

### `public.profiles`
One row per `auth.users` row.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | FK → `auth.users.id` (`on delete restrict`) |
| `full_name` | text | 1–120 characters after trimming |
| `email` | text | Lowercase, unique. Synced from `auth.users.email` by a trigger |
| `roles` | `user_role[]` | One or both of `admin`, `employee` (check `private.valid_roles`: at least one, no duplicates). Default `{employee}`. **Admin** = administration; **Employee** = assignable, logs own effort, appears in employee lists |
| `is_active` | boolean | Default true. False = deactivated (the auth user is also banned) |
| `created_at`, `updated_at` | timestamptz | `updated_at` is maintained by `private.set_updated_at` |

There's no profile-image column, because of decision Q16 (initials avatars).
Indexes: unique `email`, GIN `roles`, `is_active`.

### `public.applications`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `name` | text | 1–100 characters, trimmed by a trigger. Unique case-insensitively among **non-archived** rows (partial unique index), so an archived name can be reused |
| `description` | text, nullable | Up to 2000 characters |
| `icon_key` | text | Bundled icon key (decision Q16), `^[a-z0-9-]{1,40}$`, default `app-window` |
| `is_active` | boolean | False = inactive (no new Development/Support tickets) |
| `created_by` | uuid → profiles | Always forced to `auth.uid()` by a trigger and immutable |
| `created_at`, `updated_at` | timestamptz | |
| `deleted_at`, `deleted_by` | timestamptz / uuid → profiles | Archive = soft delete. Both are null or both are set (check constraint) |

Indexes: partial unique `lower(btrim(name)) where deleted_at is null`, `is_active` (partial), `created_by`, `deleted_by`.

### `public.tickets`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `ticket_number` | text, unique | Assigned by trigger from `private.ticket_sequences` (`DEV-0001` …, no truncation above 9999). Not writable by clients |
| `category` | `ticket_category` | Changed only through `change_ticket_category()` |
| `application_id` | uuid → applications, nullable | Required unless `category = 'rnd'` (check constraint). Must be active and not archived when set or changed (trigger) |
| `title` | text | 1–255 characters, trimmed |
| `description` | jsonb | Tiptap document (`type = 'doc'`, at most 512 KB, checked by `private.is_valid_rich_text`) |
| `description_text` | text | Derived by trigger from the JSON text nodes (search and reports) |
| `priority` | `ticket_priority` | Default `medium` |
| `status` | `ticket_status` | Forced to `development` on insert. Transitions arrive in Phase 5 |
| `assigned_to` | uuid → profiles, nullable | Must be an **active employee** (Employee role) when set or changed |
| `created_by` | uuid → profiles | Forced to `auth.uid()`, immutable |
| `started_on`, `qa_deployed_on`, `prod_deployed_on` | timestamptz | Lifecycle timestamps (set in Phase 5) |
| `created_at`, `updated_at`, `deleted_at`, `deleted_by` | | Soft delete via `soft_delete_ticket()` |

Indexes: partial indexes on status, category and priority; application, assignee, creator, deleted_by, created_at and updated_at; trigram GIN on `title` and `ticket_number` (ILIKE search).

### `public.ticket_number_aliases`
Previous numbers after a category change (Q15): `ticket_id`, `ticket_number` (unique), `category`, `replaced_at`, `replaced_by`. Read-only for users.

### `public.ticket_attachments`
`ticket_id`, `original_name`, `storage_path` (unique, `{ticket_id}/{uuid}.{ext}`), `mime_type` and `size_bytes` (**read from storage.objects**, not trusted from the client), `file_ext`, `uploaded_by`, `created_at`, soft-delete columns. Size is at most 25 MB. Rows are inserted only by `register_ticket_attachment()`.

### `public.activity_logs`
Append-only audit trail: `ticket_id` (nullable), `entity_type`, `entity_id`, `action`, `actor_id`, `metadata` (jsonb), `created_at`. Written only by definer triggers and functions (`private.log_activity`). No insert, update or delete for API roles.
Current actions: ticket `created`, `title_changed`, `description_updated`, `priority_changed`, `assigned`, `application_changed`, `category_changed`, `soft_deleted`, `restored`; attachment `attachment_added`, `attachment_removed`; application `created`, `updated`, `archived`, `restored`.

### `public.ticket_status_history`
Append-only: `ticket_id`, `from_status` (null for the creation row), `to_status`, `changed_by`, `changed_at` (UTC), `is_correction`, `correction_reason` (required exactly when `is_correction`). A row is written on creation (trigger), on every transition and on corrected status changes. Read access follows the ticket; no writes for API roles.

### `public.ticket_comments`
`ticket_id`, `user_id` (forced to `auth.uid()`), `content` (Tiptap JSON, validated), `content_text` (derived; empty comments rejected), `created_at`, `updated_at` (edited when later than created), `deleted_at`, `deleted_by`.
- Grants: insert `(ticket_id, content)`, update `(content)`.
- RLS: read with the ticket (deleted comments for admins only); insert by active users on non-deleted tickets; update by the author only.
- Trigger: forced author, immutable ticket and author, derived text, **lock check** (`private.assert_ticket_writable`).

### `public.effort_logs`
| Column | Notes |
|---|---|
| `ticket_id`, `user_id` | `user_id` defaults to the caller. Only admins may set another user (Q14). The owner must be an **active employee** (an admin-only user can't log own effort). Both immutable on update |
| `effort_date` | Not in the future (organisation date, Asia/Kolkata) |
| `effort_value` numeric(7,2), `effort_unit` | Greater than 0. Minutes must be whole numbers |
| `effort_minutes` | **Generated:** `round(value*60)` for hours, otherwise the value. 1–1440 per entry |
| `description` | Optional, up to 2000 characters, trimmed |
| `created_at`, `updated_at`, `deleted_at`, `deleted_by` | Soft delete via RPC |

- RLS (Q3): read only your own entries, or all for admins (deleted for admins only); insert own or admin; update own or admin, not deleted.
- Trigger: own-effort rule, active target user, no future date, **lock check**.
- Indexes: `(ticket_id)`, `(user_id, effort_date)`, `(effort_date)`, all partial on `deleted_at is null`.

### `public.knowledge_base`
`application_id` (required; not an archived application, but inactive is allowed), `title`, `description`, `content` (Tiptap JSON), `content_text` (derived), `document_type`, `category`, `search_content` (tsvector), `created_by` (forced), timestamps, soft-delete columns.
- **search_content** = title (weight A) + description (B) + note text (C) + extracted text of non-deleted, completed attachments (D), `english` configuration, GIN index. Rebuilt by the BEFORE trigger, and refreshed whenever an attachment row changes (insert, removal, or extraction finishing).
- RLS (spec §3.2): all active users read (deleted rows for admins only); insert and update for admins only (non-deleted). Soft delete and restore through admin RPCs.

### `public.knowledge_attachments`
`knowledge_base_id`, `original_name`, `storage_path` (`{application_id}/{kb_id}/{uuid}.{ext}`), `mime_type` and `size_bytes` (from storage), `file_ext`, `extracted_text`, `extraction_status`, `uploaded_by`, `created_at`, soft-delete columns. Read with the parent record. Inserted only by `register_kb_attachment`; `extracted_text` and `extraction_status` are written only by the `extract-document-text` Edge Function (service role). Check constraint `knowledge_attachments_text_only_for_txt`: non-txt rows must have no extracted text and status `not_supported`.

### `public.report_settings`
Exactly one row (`id boolean primary key default true check (id)`): `company_name` (1–120), `report_title` (1–160), `footer_text` (≤ 500, blank → null), `header_image_path` (must match `header/{uuid}.png|jpg|jpeg`), `updated_by` and `updated_at` (stamped by trigger). Every active user can read; only admins can update (column grants plus RLS). Updates are audited (`settings` / `report_settings_updated`).

### `private.ticket_sequences`
One row per category (`prefix`, `last_value`). `private.next_ticket_number()` increments under a row lock, so numbers have no gaps and are safe under concurrent creation.

## Functions
| Function | Kind | Purpose |
|---|---|---|
| `private.set_updated_at()` | trigger | Sets `updated_at = now()` |
| `private.is_active_user()` | SQL, `SECURITY DEFINER`, stable | True if the caller has an active profile |
| `private.is_admin()` | SQL, `SECURITY DEFINER`, stable | True if the caller is active and `admin = any(roles)` |
| `private.handle_new_auth_user()` | trigger on `auth.users` insert | Creates the profile. Roles come **only** from `raw_app_meta_data.roles` (unknown values ignored, duplicates collapsed); legacy `raw_app_meta_data.role = admin` maps to `{admin, employee}`; default `{employee}`. `user_metadata` is ignored. The name comes from `raw_user_meta_data.full_name` or the email prefix |
| `private.valid_roles(roles)` | SQL, immutable | At least one role, no duplicates |
| `private.is_active_employee(user_id)` | definer, stable | Active profile holding the Employee role. Used for ticket assignment and effort ownership |
| `private.handle_auth_user_email_change()` | trigger on `auth.users` email update | Syncs `profiles.email` |
| `private.applications_before_write()` | trigger | Trims the name and forces/keeps `created_by` |
| `public.archive_application(id)` | RPC, `SECURITY DEFINER` | Admin only. Sets `deleted_at` and `deleted_by` |
| `public.restore_application(id)` | RPC, `SECURITY DEFINER` | Admin only. Refuses if an active app now has the same name |
| `private.next_ticket_number(category)` | definer | Locked increment and formatting |
| `private.tiptap_plain_text(jsonb)` / `private.is_valid_rich_text(jsonb)` | SQL, immutable | Derived text and validation |
| `private.ticket_is_locked(id)` | definer, stable | True when the ticket is `prod_deployed` |
| `private.tickets_before_write()` | trigger | Number, defaults, forced creator, **production lock**, application and assignee validation |
| `private.tickets_audit()` / `private.applications_audit()` | trigger | Activity logging |
| `private.allowed_attachment_ext(text)` | SQL | png jpg jpeg gif webp bmp pdf doc docx xls xlsx txt sql json zip |
| `public.change_ticket_category(id, category, application_id?)` | RPC | Any active user, unlocked. Renumbers, stores the alias, logs |
| `public.transition_ticket_status(id, status)` | RPC | Any active user. Q2 rules: free among Development, In Progress and QA; Prod only from QA; Prod is final. Sets `started_on`, `qa_deployed_on` and `prod_deployed_on` on **first** arrival only (coalesce). Writes history and a `status_changed` activity entry |
| `public.admin_correct_ticket(id, changes, reason)` | RPC | Admin only, reason of at least 10 characters. Allowed keys: title, description, priority, assigned_to, application_id, status, started_on, qa_deployed_on, prod_deployed_on. Sets the transaction-local `app.admin_correction` flag so the lock trigger allows the update, then resets it. Writes a flagged history row on status change and one `admin_correction` activity entry with the reason and before/after values |
| `private.tickets_init_status_history()` | trigger | Creation row in history |
| `private.org_today()` | SQL | Today in Asia/Kolkata |
| `private.assert_ticket_writable(ticket_id)` | definer | Raises if the ticket is deleted, or locked outside an admin correction |
| `public.soft_delete_comment(id)` / `public.restore_comment(id)` | RPC | Author or admin (moderation); restore is admin only; both need a writable ticket |
| `public.soft_delete_effort_log(id)` / `public.restore_effort_log(id)` | RPC | Owner or admin; restore is admin only; both need a writable ticket |
| `public.get_ticket_effort_totals(ids[])` | RPC, definer | Total non-deleted minutes per ticket across **all** users, for tickets the caller can see. Totals only |
| `private.kb_build_search(kb)` | SQL, definer | Weighted tsvector, including extracted document text |
| `public.soft_delete_knowledge_base(id)` / `public.restore_knowledge_base(id)` | RPC | Admin |
| `public.register_kb_attachment(kb_id, path, name)` | RPC | Admin. Verifies the object (owner, path prefix `{app}/{kb}/`) and the type (`private.allowed_kb_ext`). Status `pending` for **.txt only**, otherwise `not_supported` |
| `public.remove_kb_attachment(id)` | RPC | Admin, soft delete |
| `public.search_knowledge_base(query, app?, category?, type?, limit)` | SQL, **SECURITY INVOKER** (RLS applies) | `websearch_to_tsquery` (quoted phrases, -exclusion, or), ranked with `ts_rank_cd`. `ts_headline` snippet highlighted with U+E000/U+E001 markers (no HTML) |
| `public.get_effort_report(user_id, start, end, application_id?)` | RPC, definer | Spec §9.2 with Q4. **A:** tickets created in the range (Asia/Kolkata date) that the employee created or is assigned to. **B:** tickets with the employee's non-deleted effort dated in the range. Union without duplicates. Effort counts only that employee's non-deleted logs in the range. Soft-deleted tickets excluded. Caller must be the employee or an admin; the target must hold the Employee role; range at most one year. Returns lifecycle timestamps plus `created_in_range` and `effort_in_range` flags |
| `public.get_dashboard_stats(from, to)` | RPC, definer | Spec §11 with Q3, Q8 and Q11: ticket totals, category, status, unassigned and application distribution for non-deleted tickets **created** in the range (IST date); effort **dated** in the range; effort this month (calendar month to date). Admins get team effort and the employee-wise breakdown; everyone else gets only their own effort. Range at most one year |
| `public.get_effort_summary(from, to, user_id?)` | RPC, definer | JSON: total, daily, weekly (ISO weeks start Monday), monthly, by application, by employee, top 50 tickets. Employees are always limited to themselves; admins see all or one user. Maximum one year |
| `public.soft_delete_ticket(id)` | RPC | Creator or admin, unlocked |
| `public.restore_ticket(id)` | RPC | Admin only |
| `public.register_ticket_attachment(ticket_id, path, name)` | RPC | Verifies the object exists, is owned by the caller and has a matching path prefix, the type is allowed and the ticket is unlocked. Size and MIME are taken from storage |
| `public.remove_ticket_attachment(id)` | RPC | Uploader or admin, unlocked. Soft delete only; the object is kept |

## Privileges & RLS (tickets & related)
- `tickets`: `SELECT`; `INSERT (category, application_id, title, description, priority, assigned_to)`; `UPDATE (application_id, title, description, priority, assigned_to)`; no `DELETE`.
  - Read: active users see non-deleted tickets; admins also see deleted ones.
  - Insert: any active user.
  - Update: any active user (Q1), only non-deleted rows not in `prod_deployed`. The trigger also blocks updates to locked tickets for everyone, admins included, until the Phase 5 audited correction.
- `ticket_number_aliases`: read for active users.
- `ticket_attachments`: read if the parent ticket is visible (deleted attachments for admins only).
- `activity_logs`: read for admins; for others, application events plus events of visible tickets. **Effort events** are visible only to the entry owner, the actor and admins (Q3: per-person minutes stay private).

## Storage: `report-assets` (private, 2 MB, PNG/JPEG only)
- `header/{uuid}.{png|jpg|jpeg}`: admin upload; read by active users. No update or delete; replacing the image uploads a new object and repoints the settings.

## Storage: `knowledge-base` (private, 25 MB, MIME allow-list)
- `{application_id}/{kb_id}/{uuid}.{ext}`: admin upload to an existing, non-deleted record with a matching application; read by active users while the record is visible.
- `inline/{user_id}/…`: images in notes (admin upload to their own folder; read by active users).
- No update or delete policies.

## Storage: `ticket-attachments` (private, 25 MB, MIME allow-list)
- `{ticket_id}/{uuid}.{ext}`: upload requires an active user, an allowed extension, and an existing, non-deleted, unlocked ticket. Read requires the ticket to be visible.
- `inline/{user_id}/{uuid}.{png|jpg|jpeg|gif|webp}`: rich-text images. Users upload only to their own folder; any active user can read.
- No update or delete policies, so objects are retained for audit.

## Privileges & RLS (applications)
- `anon`: none.
- `authenticated`: `SELECT`; `INSERT`/`UPDATE` on `(name, description, icon_key, is_active)` only; no `DELETE`.
- Policies:
  - Read: active users see all rows, **archived ones included**, for historical references (Q7). The UI hides archived rows from listings.
  - Insert: admin only.
  - Update: admin only, and only rows that are not archived (archived apps are read-only).
- Archive and restore go only through the RPCs.

## Privileges & RLS (profiles)
- `anon`: no privileges.
- `authenticated`: `SELECT`, and `UPDATE` on `full_name` only. No `INSERT` or `DELETE`.
- Policies:
  - Read: any active user can read profiles. Names are needed across the app.
  - Update: only your own row, and only while active.
- `roles`, `is_active` and `email` change only through the service role, in the `admin-users` Edge Function.

## Phase 11: Completed / Dropped and monthly boards (2026-11-08)
Migrations `20261108070924_ticket_statuses_completed_dropped` (enum values only, so they are committed before use) and `20261108071052_monthly_boards_final_statuses`.

| Change | Detail |
|---|---|
| `ticket_status` enum | + `completed`, `dropped` |
| `tickets.board_month` | `date not null`, first day of a month (check), 2000–2100; backfilled from `created_at` (IST month). Insert defaults to the current IST month; any value is normalised to the 1st. Index `tickets_board_month_idx` (live rows). Granted SELECT/INSERT/UPDATE to `authenticated` |
| `tickets.completed_on`, `dropped_on` | timestamptz, set by `transition_ticket_status` (SELECT only) |
| `tickets.drop_reason` | optional text ≤ 500 chars, trimmed, blank → null (SELECT only) |
| `private.is_final_status(status)` | `prod_deployed`, `completed` or `dropped`. Used by every lock check: guard trigger, `assert_ticket_writable`, `ticket_is_locked`, the tickets UPDATE policy, the attachment upload policy, `change_ticket_category`, `register/remove_ticket_attachment`, `soft_delete_ticket` |
| `private.status_label(status)` | Human label for error messages ("Ticket X is locked (Completed)") |
| `public.transition_ticket_status(id, status, reason default null)` | Replaces the 2-argument version. Rules: open statuses move freely; Prod only from QA; Completed from In Progress or QA; Dropped from any open status; final statuses are locked. `reason` is allowed only for Dropped and is stored in `drop_reason` and in the `status_changed` activity metadata |
| `private.tickets_board_audit` trigger | Logs `board_changed` {from, to} on `board_month` updates (skipped inside admin corrections, which log their own diff) |
| `public.admin_correct_ticket` | Also corrects `completed_on`, `dropped_on`, `drop_reason`, `board_month`; can reopen a Completed/Dropped ticket |
| `public.get_dashboard_stats` | `by_status` also returns `completed` and `dropped` |

## New categories (2026-11-08)
Migrations `20261108074711_ticket_categories_analysis_issue_bugfix` (enum values only) and `20261108074724_ticket_categories_sequences_dashboard`.

| Category | Enum value | Prefix | Application |
|---|---|---|---|
| Analysis | `analysis` | ANL | Required |
| Issue | `issue` | ISS | Required |
| Bug Fix | `bug_fix` | BUG | Required |

Each has a `private.ticket_sequences` row. The existing check `tickets_application_required` (only `rnd` is exempt) and `change_ticket_category` already enforce the application rule, so neither needed changing. `get_dashboard_stats` returns `analysis`, `issue` and `bug_fix` counts.

## Status-change permission (2026-11-09)
Migrations `20261109131130_status_change_owner_or_admin` and `20261109131227_status_change_null_safe`.

- `private.can_change_status(ticket)`: true for an admin, the creator or the assignee. Every comparison is wrapped in `coalesce(…, false)`, because `assigned_to = auth.uid()` is NULL for unassigned tickets and `if not NULL` would not raise (this was a real bug in the first version, fixed by the second migration).
- `public.transition_ticket_status` raises 42501 "Only the creator, the assignee or an administrator can change the status of …" before any other rule.
- Unchanged: editing details (any active user, unlocked tickets), board moves, admin correction.
