# Technical Analysis & Proposed Plan
## Internal Ticket Management System

**Status:** Draft for review. No code has been written.
**Source of truth:** `Internal-Ticket-Management-System-Specification.md`
**Date:** 2026-11-07

---

## 0. Current Environment (inspected)

| Item | Finding |
|---|---|
| Project folder | Contains only the spec, `.mcp.json`, `.claude/`, and a `package.json` with `shadcn` as a devDependency. That package was installed with **npm** (`package-lock.json` and `node_modules/`). There is no application code. |
| Git | **Not a git repository.** |
| Tooling | Bun 1.3.14, Node 22.17, gh CLI (logged in). **Supabase CLI is not installed.** |
| Supabase project | `zkwrrbldnpkmbrjceqlz` (from `.mcp.json`). It is **empty**: no public tables, no migrations, no storage buckets. Installed extensions: `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, `supabase_vault`. |
| MCP servers available | Supabase (connected and working), ShadCN, Playwright, Context7. **GitHub MCP is not configured**; the `gh` CLI covers that need. |

---

## 1. Requirements Understanding

The app is an internal, JIRA-style tool. It is a single-page app (SPA) that talks directly to Supabase. There is no custom backend.

**Actors**
- **Admin**: full control, including user and application management, settings, restore, admin corrections, and reports for anyone.
- **Employee**: can view and create tickets, edit tickets they are permitted to edit, comment, log their own effort, read the knowledge base (KB), and generate their own reports.

**Core domain**
- **Applications.** Admins manage them. Each has a status: active, inactive, or archived. Inactive and archived applications are hidden from new Development and Support tickets, but their history stays readable.
- **Tickets.** There are three categories: Development and Support, which require an application, and R&D, where the application is optional. Ticket numbers (`DEV-0001` and so on) are generated in the database and are safe under concurrent creation. Descriptions use Tiptap and are stored as JSON. Tickets can have attachments in private storage.
- **Workflow.** There are four Kanban statuses: Development → In Progress → QA Deployed → Prod Deployed. Every status change is recorded in history. Lifecycle timestamps are set the first time a ticket reaches a status and are never overwritten. Reaching **Prod Deployed locks the ticket** in the database: no edits, status changes, comments, effort logs, attachment changes or deletes. The only exception is an admin "controlled correction" function that writes an audit record.
- **Comments.** Comments use rich text. Authors can edit and soft-delete their own comments, and admins can moderate. Comments become read-only once a ticket is locked.
- **Activity timeline.** An append-only audit trail that is written by triggers, not by the client.
- **Effort logs.** Users enter a value in minutes or hours. The database stores normalized `effort_minutes`. The database enforces that users can only manage their own logs; admins can manage all of them. Summaries are available per ticket, employee, day, week, month and application.
- **Reports.** The report includes the union of tickets created in the range (Criterion A) and tickets with effort by the employee in the range (Criterion B). Effort only counts that employee's logs within the range. The PDF uses `@react-pdf/renderer` with a configurable header, footer, company name and title.
- **Knowledge base.** Each application has its own KB of notes and uploaded documents, organised into 9 categories. Search uses PostgreSQL full-text search (FTS). Text extraction from documents is a separate capability, and we will not claim PDF/DOCX search until extraction exists.
- **Dashboard.** Counts, effort statistics, distributions and recent items, with date filters: Today, This Week, This Month and Custom.
- **Soft delete and restore.** Applies to all business records. Admins can view deleted records and restore them. Nothing is permanently deleted in normal use.

---

## 2. Proposed Architecture

```
┌──────────────────────── Browser (React SPA, Vite, TS) ────────────────────────┐
│ Routes (React Router, route guards by role)                                   │
│   └─ features/*  ── UI components ── hooks (TanStack Query) ── api/ services │
│                                                         │                     │
│                     lib/supabase.ts (single client, anon/publishable key)     │
└─────────────────────────────────────────────────────────┼─────────────────────┘
                                                          │ JWT (user session)
┌──────────────────────────── Supabase ───────────────────┼─────────────────────┐
│ Auth  ──►  auth.users ──(trigger)──► public.profiles     ▼                     │
│ PostgREST: tables (RLS on every table) + RPC functions for state transitions  │
│ Postgres: triggers (validation, locking, audit, ticket numbers, FTS)          │
│ Storage: private buckets + storage.objects RLS policies + signed URLs         │
│ Edge Functions (service role stays server-side only):                         │
│   • admin-users  – create, deactivate or reactivate users, reset passwords    │
│   • extract-document-text – KB text extraction (Phase 7)                       │
└───────────────────────────────────────────────────────────────────────────────┘
One-time local script: scripts/provision-admin.ts (Bun). It reads the service-role
key and the initial password from a git-ignored env file and creates the initial admin.
```

**Key architectural decisions**

1. **Reads go directly to tables with RLS. Every business-critical write goes through a `SECURITY DEFINER` RPC.** This covers status transitions, soft delete and restore, admin corrections, attachment registration, and report and dashboard aggregation. Simple field edits, such as ticket title or priority, comment content and effort values, use plain `UPDATE`. Those are restricted by RLS, by column-level `GRANT`s and by guard triggers.
2. **Column-level privileges.** The `authenticated` role cannot `UPDATE` columns such as `status`, the lifecycle timestamps, `ticket_number`, `created_by`, `user_id`, `deleted_at` or `role`. Those columns change only through definer functions or triggers. `DELETE` is revoked on all business tables, which makes hard delete impossible from the client.
3. **Production lock in the database.** `BEFORE UPDATE/INSERT` triggers on `tickets`, `ticket_comments`, `effort_logs` and `ticket_attachments`, plus the storage policies, reject changes to a ticket in `prod_deployed`. The lock applies to admins too. The only bypass is the `admin_correct_ticket()` function. It sets a transaction-local flag that triggers check, requires a reason, and writes `activity_logs` and status history entries.
4. **Helper functions live in a non-exposed `private` schema.** These are `private.is_admin()`, `private.is_active_user()` and `private.ticket_is_locked(id)`. Making them `SECURITY DEFINER` with an empty `search_path` avoids RLS recursion, and keeping them out of the exposed schema means the API can't call them. Policies call them as `(select private.is_admin())` so Postgres caches the result per statement.
5. **Roles are never trusted from the client.** A new profile's role comes from `auth.users.raw_app_meta_data`, which only the service role can set, never from `user_metadata`. A guard trigger blocks non-admins from changing `role`, `is_active` or `email`.
6. **Deactivated users.** The `admin-users` Edge Function bans the Supabase Auth user so they can't get a new session. Every RLS helper also checks `is_active`, so an existing JWT stops working right away.
7. **Rich text is stored as Tiptap JSON** plus a derived plain-text column for search and the PDF. It is rendered with a read-only Tiptap instance, so content is constrained by the editor schema and there is no `dangerouslySetInnerHTML`. Any HTML path, such as paste handling or exports, goes through DOMPurify. Link protocols are restricted to http, https and mailto. The database checks that the JSON root is `{type:"doc"}` and enforces a size cap.
8. **Images embedded in rich text store the storage path, not a URL.** The renderer resolves a short-lived signed URL when the content is displayed, because a stored signed URL would expire.
9. **Server state lives in TanStack Query** with a query-key factory per feature. Mutations invalidate the affected keys. Kanban moves use optimistic updates and roll back if the database rejects the move, for example because of the lock.

---

## 3. Database Schema

### 3.1 Enums
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

### 3.2 Tables
All tables use UUID primary keys (`gen_random_uuid()`), store `timestamptz` in UTC, and get `updated_at` from a trigger. Every foreign key column is indexed.

**profiles**: `id` (PK, FK to `auth.users`), `full_name`, `email` (unique on lower(email)), `role` (default `employee`), `avatar_path`, `is_active` (default true), `created_at`, `updated_at`.

**applications**: `id`, `name` (unique case-insensitive among non-deleted rows), `description`, `icon_path`, `is_active`, `created_by`, `created_at`, `updated_at`, `deleted_at`, `deleted_by`.
*"Archive" means soft delete (`deleted_at`). "Deactivate" means `is_active = false`.*

**tickets**: `id`, `ticket_number` (unique), `category`, `sequence_no` (int), `application_id` (nullable FK), `title` (1–255 characters), `description` (jsonb), `description_text` (text), `priority` (default `medium`), `status` (default `development`), `assigned_to` (nullable FK to profiles), `created_by`, `started_on`, `qa_deployed_on`, `prod_deployed_on`, `created_at`, `updated_at`, `deleted_at`, `deleted_by`.
- `CHECK (category = 'rnd' OR application_id IS NOT NULL)`
- `UNIQUE (category, sequence_no)`
- The insert trigger assigns the number, checks that the application is active and not deleted for Development and Support tickets, and checks that the assignee is an active profile.
- Indexes: `status`, `category`, `application_id`, `assigned_to`, `priority`, `created_at`, `updated_at`, a partial index on `deleted_at IS NULL`, and a `pg_trgm` GIN index on `title` and `ticket_number` for search.

**ticket_sequences** (internal, `private` schema): `category` (PK) and `last_value`. Each insert runs `UPDATE … SET last_value = last_value + 1 RETURNING` while holding a row lock. Numbers are concurrency-safe with no gaps. Format: `DEV-` + zero-padded to 4 digits, growing past 9999 without truncating.
*This is a small internal addition to the 11 tables in the spec. It is not exposed to the API.*

**ticket_attachments**: `id`, `ticket_id`, `original_name`, `storage_path` (unique), `mime_type`, `file_ext`, `size_bytes`, `uploaded_by`, `created_at`, `deleted_at`, `deleted_by`.

**ticket_status_history**: `id`, `ticket_id`, `from_status` (nullable on creation), `to_status`, `changed_by`, `changed_at`, `is_correction` (bool), `correction_reason`. Append-only.

**ticket_comments**: `id`, `ticket_id`, `user_id`, `content` (jsonb), `content_text`, `created_at`, `updated_at`, `deleted_at`, `deleted_by`.

**effort_logs**: `id`, `ticket_id`, `user_id`, `effort_date` (date), `effort_value` (numeric(7,2) > 0), `effort_unit`, `effort_minutes` (int), `description`, `created_at`, `updated_at`, `deleted_at`, `deleted_by`.
- `effort_minutes` is a generated stored column: `round(CASE unit WHEN 'hours' THEN value*60 ELSE value END)`. Constraints: `effort_minutes > 0`, minute values must be whole numbers, and there is an upper bound per entry (see clarifications).
- Triggers make `user_id` and `ticket_id` immutable and block writes to locked tickets.
- Indexes: `(user_id, effort_date)`, `(ticket_id)`.

**knowledge_base**: `id`, `application_id` (NOT NULL), `title`, `description`, `content` (jsonb, for notes), `content_text`, `document_type`, `category`, `search_content` (tsvector, kept up to date by a trigger from title (weight A), description (B), content_text (C) and extracted text of non-deleted attachments (D); GIN index), `created_by`, `created_at`, `updated_at`, `deleted_at`, `deleted_by`.

**knowledge_attachments**: `id`, `knowledge_base_id`, `original_name`, `storage_path`, `mime_type`, `file_ext`, `size_bytes`, `extracted_text`, `extraction_status`, `uploaded_by`, `created_at`, `deleted_at`, `deleted_by`.

**report_settings** (one row only, `id boolean PK DEFAULT true CHECK (id)`): `company_name`, `report_title`, `footer_text`, `header_image_path`, `updated_by`, `updated_at`.

**activity_logs**: `id`, `ticket_id` (nullable), `entity_type` (ticket, comment, effort_log, attachment, application, user, settings), `entity_id`, `action` (created, updated, status_changed, assigned, priority_changed, description_updated, attachment_added, attachment_removed, comment_added, comment_edited, comment_deleted, effort_added, effort_updated, effort_deleted, soft_deleted, restored, admin_correction, …), `actor_id`, `metadata` (jsonb: changed fields, before and after values), `created_at`. Only definer triggers and functions write to it. No `UPDATE` or `DELETE` is granted to anyone through the API.

### 3.3 Key database functions (RPC)
| Function | Purpose |
|---|---|
| `transition_ticket_status(ticket_id, new_status)` | Checks permission, the lock and allowed transitions. Writes history, sets the first-time lifecycle timestamp and logs activity. Locks the row with `FOR UPDATE`. |
| `admin_correct_ticket(ticket_id, changes jsonb, reason)` | Admin only. The only way to change a locked ticket. Requires a reason and writes a full before/after audit. |
| `soft_delete_*` / `restore_*` (ticket, comment, effort_log, attachment, application, kb) | Checks permissions and the lock, sets `deleted_at` and `deleted_by`, and logs activity. Restore is admin only. |
| `register_ticket_attachment(...)` / `register_kb_attachment(...)` | Called after an upload. Confirms the object exists in `storage.objects` under the expected path, checks extension, MIME type and size, then inserts the metadata. |
| `get_ticket_effort_totals(ticket_ids[])` | Returns aggregate totals only, for the board and ticket views. See the effort visibility question. |
| `get_effort_report(user_id, start, end, tz)` | Returns Criterion A ∪ Criterion B, with effort per ticket and lifecycle timestamps. Enforces "admin or self". |
| `get_dashboard_stats(from, to, tz)` | Returns all dashboard metrics as one JSON payload. |
| `search_knowledge_base(query, app_id?, category?, doc_type?)` | Runs `websearch_to_tsquery` with ranking and highlighted snippets. |

### 3.4 ER Diagram

```mermaid
erDiagram
    AUTH_USERS ||--|| PROFILES : "1:1"
    PROFILES ||--o{ TICKETS : "created_by"
    PROFILES |o--o{ TICKETS : "assigned_to (nullable)"
    APPLICATIONS |o--o{ TICKETS : "application_id (nullable for R&D)"
    APPLICATIONS ||--o{ KNOWLEDGE_BASE : has
    TICKETS ||--o{ TICKET_ATTACHMENTS : has
    TICKETS ||--o{ TICKET_STATUS_HISTORY : has
    TICKETS ||--o{ TICKET_COMMENTS : has
    TICKETS ||--o{ EFFORT_LOGS : has
    TICKETS |o--o{ ACTIVITY_LOGS : "ticket_id (nullable)"
    KNOWLEDGE_BASE ||--o{ KNOWLEDGE_ATTACHMENTS : has
    PROFILES ||--o{ EFFORT_LOGS : "user_id"
    PROFILES ||--o{ TICKET_COMMENTS : "user_id"
    PROFILES ||--o{ ACTIVITY_LOGS : "actor_id"
    PROFILES ||--o{ TICKET_STATUS_HISTORY : "changed_by"

    PROFILES { uuid id PK; text full_name; text email; user_role role; text avatar_path; bool is_active }
    APPLICATIONS { uuid id PK; text name; text icon_path; bool is_active; timestamptz deleted_at }
    TICKETS { uuid id PK; text ticket_number UK; ticket_category category; uuid application_id FK; uuid assigned_to FK; ticket_status status; ticket_priority priority; timestamptz started_on; timestamptz qa_deployed_on; timestamptz prod_deployed_on; timestamptz deleted_at }
    TICKET_STATUS_HISTORY { uuid id PK; uuid ticket_id FK; ticket_status from_status; ticket_status to_status; uuid changed_by FK; timestamptz changed_at }
    TICKET_COMMENTS { uuid id PK; uuid ticket_id FK; uuid user_id FK; jsonb content; timestamptz deleted_at }
    EFFORT_LOGS { uuid id PK; uuid ticket_id FK; uuid user_id FK; date effort_date; numeric effort_value; effort_unit effort_unit; int effort_minutes; timestamptz deleted_at }
    TICKET_ATTACHMENTS { uuid id PK; uuid ticket_id FK; text storage_path; text mime_type; bigint size_bytes }
    KNOWLEDGE_BASE { uuid id PK; uuid application_id FK; kb_document_type document_type; kb_category category; tsvector search_content }
    KNOWLEDGE_ATTACHMENTS { uuid id PK; uuid knowledge_base_id FK; text storage_path; text extracted_text }
    ACTIVITY_LOGS { uuid id PK; uuid ticket_id FK; text entity_type; text action; uuid actor_id FK; jsonb metadata }
    REPORT_SETTINGS { bool id PK; text company_name; text report_title; text footer_text; text header_image_path }
```

---

## 4. RLS & Permission Strategy

**Baseline:** RLS is enabled on every table, and there is no access for `anon`. Every policy requires `private.is_active_user()`. `DELETE` is revoked from `authenticated` on all tables. Soft-deleted rows are visible only to admins (`deleted_at IS NULL OR private.is_admin()`).

| Table | SELECT | INSERT | UPDATE | Soft-delete / Restore |
|---|---|---|---|---|
| profiles | All active users (names and avatars are needed everywhere) | Trigger only, from `auth.users` | Self: `full_name`, `avatar_path`. Admin: anything, guarded by trigger | Deactivate (no delete) through `admin-users` |
| applications | All users, **including archived rows, which stay readable for historical references** (proposed). Listings filter them out | Admin | Admin | Admin RPC |
| tickets | All active users, non-deleted rows (admins also see deleted) | Any active user, `created_by = auth.uid()` | Users with edit permission, unlocked, permitted columns only (Q1) | RPC: permitted user if unlocked; restore by admin |
| ticket_status_history | Same as the ticket | RPC only | Never | Never |
| ticket_attachments | Same as the ticket | `register_*` RPC | Never | RPC: uploader or admin, unlocked |
| ticket_comments | Same as the ticket, non-deleted | `user_id = auth.uid()`, ticket unlocked | Own row, `content` columns only, unlocked | RPC: own row or admin |
| effort_logs | **Own rows, or admin** (Q3) | `user_id = auth.uid()` (admin rule in Q14), unlocked | Own row or admin, unlocked, `user_id` immutable | RPC: own row or admin |
| knowledge_base / knowledge_attachments | All active users, non-deleted | Admin | Admin | Admin |
| report_settings | All active users | n/a (row is seeded) | Admin | n/a |
| activity_logs | Ticket events visible to anyone who can see the ticket. Effort event metadata is reduced for non-owners (Q3). Admins see everything | Triggers only | Never | Never |

**Storage policies** (all buckets are private and accessed through signed URLs):
| Bucket | Path convention | Read | Upload | Delete |
|---|---|---|---|---|
| `ticket-attachments` | `{ticket_id}/{uuid}.{ext}` | Active user who can see the ticket | Ticket exists, isn't deleted or locked, extension is on the allow-list | **None.** Objects are kept for audit; only the metadata is soft-deleted |
| `knowledge-base` | `{application_id}/{kb_id}/{uuid}.{ext}` | Active users | Admin | None |
| `report-assets` | `header/{uuid}.{png\|jpg}` | Active users | Admin | Admin (replace) |
| *(proposed)* `app-assets` | `avatars/{user_id}/…`, `app-icons/{app_id}/…` | Active users | Self (avatar), admin (icons) | Same |

Each bucket also has a size limit and an allowed MIME list set at bucket level. The `register_*` RPC checks extension and MIME type again on the server.

**Verification approach (not a test suite):** after each migration, I'll run focused SQL checks through the Supabase MCP that impersonate `authenticated` with JWT claims for an admin and an employee. They'll confirm denials, such as editing another user's effort, writing to a locked ticket, hard delete, or changing one's own role. I'll also run `get_advisors` (security and performance).

---

## 5. Folder Structure

```
/
├─ src/
│  ├─ assets/
│  ├─ components/
│  │  ├─ ui/            # ShadCN-generated
│  │  ├─ layout/        # AppShell, Sidebar, Topbar, MobileNav (Sheet), PageHeader
│  │  ├─ common/        # LoadingSkeletons, EmptyState, ErrorState, ConfirmDialog, Dropzone
│  │  └─ shared/        # StatusBadge, PriorityBadge, UserAvatar, EffortDisplay, RichTextEditor/Viewer
│  ├─ features/
│  │  └─ <feature>/     # auth, dashboard, users, applications, tickets, board,
│  │     ├─ api/        #   effort-logs, comments, reports, knowledge-base, settings
│  │     ├─ components/
│  │     ├─ hooks/      # TanStack Query hooks + query keys
│  │     ├─ schemas/    # Zod schemas
│  │     ├─ types.ts
│  │     └─ index.ts
│  ├─ hooks/            # useAuth, useDebounce, useMediaQuery…
│  ├─ lib/              # supabase.ts, queryClient.ts, utils.ts, storage.ts, effort.ts, dates.ts
│  ├─ services/         # cross-feature data access (storage signed URLs, activity)
│  ├─ types/            # database.types.ts (generated), domain types
│  ├─ routes/           # router.tsx, ProtectedRoute, AdminRoute, route modules (lazy)
│  ├─ stores/           # small React-context stores (sidebar/theme). No new state library
│  ├─ styles/
│  ├─ App.tsx
│  └─ main.tsx
├─ supabase/
│  ├─ migrations/       # timestamped SQL, the canonical schema history
│  ├─ functions/        # admin-users, extract-document-text
│  └─ seed.sql          # report_settings defaults, ticket sequence rows (no credentials)
├─ scripts/provision-admin.ts
├─ .env.example         # VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
└─ docs: README.md, ARCHITECTURE.md, DATABASE_SCHEMA.md, SECURITY.md,
         IMPLEMENTATION_PROGRESS.md, API_AND_DATA_ACCESS.md, TESTING.md
```

**Routes:** `/login`, `/` (dashboard), `/board`, `/tickets`, `/tickets/:ticketNumber`, `/applications`, `/applications/:id/{overview|tickets|knowledge-base|reports}`, `/knowledge-base`, `/reports`, `/settings/profile`, and the admin-only `/settings/{users|applications|report|trash}`.

---

## 6. Dependencies

**From the approved stack:** `react`, `react-dom`, `vite`, `typescript`, `tailwindcss` with `@tailwindcss/vite` (Tailwind v4, the current ShadCN default), ShadCN (CLI and Radix primitives), `@supabase/supabase-js`, `@tanstack/react-query`, `react-router`, `react-hook-form`, `zod`, Tiptap (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, plus the extensions underline, link, image, table set, and placeholder), `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@react-pdf/renderer`, `lucide-react`, `sonner`.

**Supporting packages that need your approval:**
| Package | Why |
|---|---|
| `@hookform/resolvers` | Connects Zod to React Hook Form. Required for the mandated pattern. |
| `date-fns`, `react-day-picker` | Pulled in by the ShadCN Calendar and Date Picker. Also used for week and month range calculations. |
| `dompurify` | Sanitizes rich-text HTML, as the spec requires. |
| `recharts` | The ShadCN Chart component is built on it. Needed for the employee-wise and application-wise dashboard charts. |
| `motion` (instead of `framer-motion`) | Framer Motion was renamed to Motion (`motion/react`). It's the same library with the current package name. |
| `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css` | Installed automatically by ShadCN. |

Dev tooling: ESLint (Vite template default), and Supabase type generation through the MCP (`generate_typescript_types`), so the Supabase CLI isn't required. I won't add a test framework.

---

## 7. MCP Servers & Intended Use

| MCP | Use |
|---|---|
| **Supabase** | Inspecting the schema, applying reviewed migrations (each one mirrored as a file in `supabase/migrations/`), focused RLS checks with `execute_sql`, security and performance advisors after every DDL change, TypeScript type generation, Edge Function deployment, logs. |
| **ShadCN** | Finding and installing components (Sidebar, Table, Dialog, Sheet, Command, Calendar, Chart, …) and blocks (sidebar and dashboard layouts) once `components.json` exists. |
| **Context7** | Checking current APIs before each phase: Tailwind v4 with ShadCN, React Router v7, Tiptap v3, Zod 4 with resolvers, dnd-kit, react-pdf, supabase-js and Storage. |
| **Playwright** | Spot checks of key flows and responsive layouts at the end of each phase (login, board drag, lock behaviour, PDF preview). Not a test suite. |
| **GitHub** | Not configured. I'll use git and the `gh` CLI if repository operations come up. |

---

## 8. Technical Risks & Challenges

1. **Effort privacy vs. totals.** Employees can only see their own logs, but the board, the ticket view and the dashboard need totals that include everyone's effort. *Mitigation:* aggregate-only `SECURITY DEFINER` RPCs (Q3).
2. **Archived applications vs. "soft-deleted rows are inaccessible".** If RLS hid archived applications, ticket and report joins would lose the application name. *Mitigation:* keep archived applications readable, filter them out of listings and pickers, and block edits (Q7).
3. **Soft delete with RLS.** An `UPDATE` that sets `deleted_at` can fail RLS checks on the new row. *Mitigation:* soft delete and restore through definer RPCs (this also centralises auditing).
4. **Rich-text images.** Signed URLs expire. *Mitigation:* store the path and resolve the URL at render time. This needs a custom Tiptap image node attribute.
5. **Orphaned storage objects** if metadata registration fails after an upload. *Mitigation:* the register RPC verifies the object exists. The UI retries or reports the failure. A cleanup job is optional later.
6. **Auth emails.** Supabase's built-in SMTP is heavily rate-limited, and invites and password resets depend on it (Q6). Custom SMTP may be needed.
7. **Revoking access for deactivated users.** An existing JWT stays valid until it expires. *Mitigation:* `is_active` checks in every policy plus an Auth ban.
8. **Document text extraction** in Edge Functions runs into CPU and memory limits for large PDFs, and XLSX extraction is low value (Q10).
9. **`@react-pdf/renderer`.** The bundle is large, so it will be lazy-loaded. Header images must be PNG or JPEG because SVG and WebP aren't supported. Fonts need registering, and long tables need correct pagination with repeated header rows.
10. **Kanban.** Optimistic moves must roll back cleanly when the database rejects them. Touch sensors and horizontal scrolling on mobile need care.
11. **Timezones.** Dashboard and report ranges depend on the timezone. Timestamps are stored in UTC; the timezone used for range boundaries needs a decision (Q8).
12. **Tooling.** The npm lockfile conflicts with Bun. There's no git repo yet. Without the Supabase CLI, migration files and the remote history must be kept identical by hand. I'll apply every migration through the MCP from the committed file.
13. **Spec vs. no-tests policy.** Phase 10 and the Definition of Done mention tests, but your instructions forbid test suites without approval (Q13).
14. **Environment.** I need confirmation that `zkwrrbldnpkmbrjceqlz` is the development project before applying any migration (Q12).

---

## 9. Phased Implementation Plan

This follows spec §19, with three small sequencing adjustments marked ⚙.

| Phase | Scope | Database work |
|---|---|---|
| **1. Foundation** | Initialize Vite + React + TS with Bun in place, keeping the existing files. Set up Tailwind v4, ShadCN, the router, the Supabase client, the query client, the app shell (collapsible sidebar, mobile Sheet nav, top bar), and common states. Create the documentation skeleton. | `supabase/migrations/` structure and a connectivity check |
| **2. Auth & users** | Login and logout, session handling, route guards, profile page, admin user management through the `admin-users` Edge Function, activate and deactivate, initial admin provisioning script. | Enums, `private` helpers, `profiles` with the auth trigger and guard trigger, RLS, `app-assets` bucket |
| **3. Applications** | CRUD, activate, deactivate, archive, icon upload, detail page with tabs. The KB and Reports tabs are placeholders until Phases 7 and 8 ⚙. | `applications`, RLS, archive/restore RPCs, icon storage policies |
| **4. Tickets** | Create and edit (Dialog/Sheet), Tiptap editor and viewer, optional assignment, attachments with progress, list table with filters and search, detail page. | `tickets`, sequences and numbering, validation triggers, `ticket_attachments`, `ticket-attachments` bucket, **`activity_logs` created here ⚙** so creation and edit events are captured from the start |
| **5. Kanban & workflow** | Four columns with dnd-kit, filters, optimistic moves, status history, lifecycle timestamps, production lock, admin correction dialog, activity timeline UI. | `ticket_status_history`, `transition_ticket_status`, lock triggers, `admin_correct_ticket` |
| **6. Comments & effort** | Comments (rich text, edit, soft delete, moderation), effort dialog (minutes/hours), totals per ticket and per employee, daily, weekly and monthly summaries. | `ticket_comments`, `effort_logs` with the generated minutes column, RLS, aggregate RPCs |
| **7. Knowledge base** | Notes and documents, categories, filters, FTS search, preview and download. Text extraction as a separate step at the end of the phase. | `knowledge_base`, `knowledge_attachments`, tsvector triggers, `knowledge-base` bucket, `search_knowledge_base`, `extract-document-text` function |
| **8. Reports** | Filters (employee, dates, production details), `get_effort_report`, report settings UI, header image, PDF preview and download (lazy-loaded). | `report_settings`, `report-assets` bucket, report RPC |
| **9. Dashboard** | Metric cards, charts, recent activity, recent tickets, date filters, unassigned count. | `get_dashboard_stats` |
| **10. Finalization** | Soft-delete Trash view for admins with restore. ⚙ The Trash UI may move earlier into each phase. RLS verification pass, concurrency check on ticket numbering, responsive pass, performance review (indexes, advisors), documentation completed. | Advisor fixes |

Each phase ends with a TypeScript build, a SQL policy check, a short Playwright spot check, and updates to the docs and `IMPLEMENTATION_PROGRESS.md`. I'll stop for your review after each phase.

---

## 10. Clarifications Required

Each question has a **proposed default**. You can answer "accept defaults" or override individual items.

| # | Question | Proposed default |
|---|---|---|
| Q1 | **Which tickets is an employee allowed to edit?** The spec says "permitted tickets". Who may change status, and who may soft-delete? | Any active employee can edit and move any non-locked ticket (collaborative, like JIRA). Only the creator or an admin can soft-delete. |
| Q2 | **Which status transitions are allowed?** Can tickets move backward before Prod, for example QA → In Progress? Can a ticket skip straight to Prod? Who may set Prod Deployed? | Free movement among the first three columns. Moving to **Prod Deployed only from QA Deployed**, by anyone allowed to edit, with a confirmation dialog because it locks the ticket. |
| Q3 | **Can employees see other people's effort?** This covers the per-person entries on a ticket and the "employee-wise effort" on the dashboard. | Employees see only their own entries, plus **aggregate totals** per ticket (everyone combined). The employee-wise dashboard breakdown is admin-only; employees see their own total. |
| Q4 | **Report Criterion A: tickets created in the range by whom?** The spec doesn't tie it to the employee, so as written it would include every ticket in the system. | Tickets in the range that were **created by or are assigned to** the selected employee. Soft-deleted tickets are excluded. |
| Q5 | **What can the admin correction change?** Can it move a ticket out of Prod Deployed? | It can change details (title, description, priority, assignee, application, lifecycle timestamps) and **can revert the status** as a last resort. A reason is required, and the change is recorded in status history and the audit log. |
| Q6 | **How do new employees get access?** | The admin creates the user with a temporary password through the Edge Function, so no email is needed. Optional "send reset email" once custom SMTP is configured. Public sign-up is disabled in the Auth settings, which you do in the Supabase dashboard. |
| Q7 | **Archived applications.** Is it acceptable that they remain readable (name and icon) for historical references, while being hidden from listings and pickers? | Yes. Archive = soft delete. Deactivate = `is_active=false`. Both block new Development and Support tickets. |
| Q8 | **Which timezone defines Today, This Week, This Month and report date ranges?** | A single organisation timezone, **Asia/Kolkata**, stored in settings. Weeks start on Monday. |
| Q9 | **File size limits?** | Attachments and KB documents: 25 MB. Images (avatar, icon, header): 2 MB. Header image must be PNG or JPEG. |
| Q10 | **How much text extraction belongs in v1?** | ~~TXT, SQL and JSON, plus PDF and DOCX through the Edge Function.~~ **Revised 2026-11-07: only .txt files are text-searchable. Word, PDF, SQL, JSON, spreadsheets and images are searchable by record title, description and notes only.** See §11. |
| Q11 | **What does the dashboard date filter apply to?** | Ticket counts and distributions cover tickets created in the range. Effort covers logs dated in the range. "Total effort this month" is a fixed metric. Recent lists ignore the filter. |
| Q12 | **Is Supabase project `zkwrrbldnpkmbrjceqlz` the development project?** | Yes its a developmeny project. |
| Q13 | **Testing.** The spec's Phase 10 and Definition of Done mention tests, which conflicts with your no-tests policy. | No automated test suites. Focused, repeatable SQL verification scripts for RLS and locking (kept in `supabase/verification/`), plus manual and Playwright spot checks. pgTAP only if you ask for it. |
| Q14 | **Can admins create effort logs on behalf of employees?** | Yes. "Manage all effort logs" includes create, and the action is logged. |
| Q15 | **Can a ticket's category change after creation?** It's tied to the number prefix. Can R&D tickets optionally have an application? | It can change |
| Q16 | **Storage for avatars and application icons.** The spec lists only three buckets. | use app assets locally |
| Q17 | **Approve the extra dependencies in §6** (`@hookform/resolvers`, `date-fns`/`react-day-picker`, `dompurify`, `recharts`, and `motion` as the current name of Framer Motion). | Approve. |
| Q18 | **Project setup.** Can I run `git init`, replace the npm `package-lock.json` and `node_modules` with Bun (`bun.lock`), and keep `shadcn` as a dev dependency? | Yes. |
| Q19 | **Assignees.** Can tickets be assigned to admins as well as employees? | Yes, to any active profile. |

---

## 11. Approved Decisions & Revisions (2026-11-07)

Q1–Q11, Q13, Q14, Q17–Q19: proposed defaults accepted. Q12: confirmed development project. Additional decisions:

**Q15 – Category can change.** The ticket gets the next number for the new category (e.g. DEV-0005 → SUP-0012). Previous numbers are kept in a new table, `ticket_number_aliases (ticket_id, ticket_number UNIQUE, category, replaced_at, replaced_by)`. Search and `/tickets/:ticketNumber` resolve old numbers to the ticket. The change goes through an RPC `change_ticket_category(ticket_id, new_category, application_id)` that enforces the application rule, the lock, and logs activity. *Schema addition to spec §13.*

**Q16 – App assets are bundled locally, no uploads.** Application icons are chosen from a preset icon set bundled with the frontend (stored as an icon key, `applications.icon_key`, instead of `icon_path`). Profile images show initials (`profiles.avatar_path` is not used in v1). No fourth bucket. *This replaces the spec's "Support icon uploads" (Phase 3) and profile-image upload.*

**Bun monorepo.** Bun workspaces replace the single-app layout in spec §16. The spec's `src/` structure lives unchanged inside `apps/web`:

```
/
├─ package.json            # private, "workspaces": ["apps/*", "packages/*"]
├─ bun.lock
├─ apps/
│  └─ web/                 # React + Vite SPA (spec §16 src/ structure)
├─ packages/
│  └─ shared/              # generated database types, enums/constants, shared Zod schemas, effort helpers
├─ supabase/               # migrations/, functions/ (Deno Edge Functions), seed.sql, verification/
├─ scripts/                # provision-admin.ts
├─ deploy/iis/             # web.config template, deployment notes
└─ docs (*.md)
```

Edge Functions run on Deno and cannot import workspace packages directly. They stay self-contained.

**Hosting on local IIS.** The frontend is a static build (`apps/web/dist`) served by IIS. Supabase stays the hosted backend.
- `web.config` with a URL Rewrite rule that sends all non-file routes to `index.html` (client-side routing) and MIME types for `.json`, `.woff2` and `.mjs`. **Requires the IIS URL Rewrite module.**
- Long cache headers for hashed `/assets/*` files, no cache for `index.html`.
- Supabase URL and publishable key are build-time `VITE_*` variables. Rebuild to change them.
- In Supabase Auth settings, add the IIS site URL (e.g. `http://localhost` or the machine's hostname) to Site URL / Redirect URLs.
- Serving over plain HTTP on the LAN works, but HTTPS is recommended for anything beyond the local machine.

**Q10 revised (2026-11-07): KB text extraction for .txt only.** Only the contents of `.txt` documents are extracted and added to knowledge base search. All other document types (Word, PDF, SQL, JSON, Excel, images) are marked `not_supported` and found by the record's title, description and note text. Enforced by `register_kb_attachment`, a check constraint on `knowledge_attachments`, and the `extract-document-text` Edge Function.
