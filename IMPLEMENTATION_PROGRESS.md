# Implementation Progress

## Phases
| Phase | Status |
|---|---|
| 1. Project Foundation | Complete (approved) |
| 2. Authentication & User Management | Complete (approved) |
| 3. Application Management | Complete (approved) |
| 4. Ticket Management | Complete (approved) |
| 5. Kanban & Workflow | Complete (approved) |
| 6. Comments & Effort Tracking | Complete (approved) |
| 7. Knowledge Base | Complete (approved) |
| 8. PDF Reporting | Complete (approved) |
| 9. Dashboard & Analytics | Complete (approved) |
| 10. Testing & Finalisation | **Complete, awaiting review** |

## Phase 1: delivered
- Bun monorepo (`apps/web`, `packages/shared`). Git initialised. The npm install was replaced by `bun.lock`.
- Vite 8, React 19, TypeScript 7 (strict), Tailwind v4, ShadCN (radix-nova preset with a blue primary colour).
- React Router data router with lazy route modules, plus error and 404 pages.
- Supabase client with Zod-validated env, TanStack Query client, connectivity indicator.
- App shell: collapsible desktop sidebar, mobile drawer, top bar, light/dark theme, page transitions.
- Reusable empty, error and skeleton states.
- Branding from `logo.png`: wordmark in the expanded sidebar and on the login page, square "{C" mark in the collapsed sidebar and as the favicon.
- `supabase/` folder structure, IIS `web.config`, documentation set.

## Phase 2: delivered
- **Database** (`20261107080707_auth_profiles`):
  - `private` schema, `user_role` enum, `profiles` table.
  - `is_admin()` and `is_active_user()` helpers.
  - Auth triggers that create the profile (role from `app_metadata` only) and sync email changes.
  - Column grants (users can update `full_name` only) and RLS.
- **Edge Function `admin-users`** (deployed, v1): create, update (name, email, role), activate or deactivate (with an Auth ban), and reset password. Admin-only, checked in the DB, with self-demotion and last-admin guards.
- **`scripts/provision-admin.ts`** (Bun workspace `@tms/scripts`) and `scripts/.env.provision.example`. Run with `bun run provision-admin` from the repo root.
- **Generated DB types** in `@tms/shared`. The Supabase client is now typed.
- **Frontend:**
  - `AuthProvider` handles session and profile, and forces sign-out for deactivated accounts.
  - Login page built with RHF + Zod, with safe redirects.
  - `ProtectedRoute`, `AdminRoute` and `GuestRoute`.
  - User menu (profile, sign out) and admin-only sidebar items.
  - Profile page: edit name and change password.
  - Users page (admin):
    - Search and status filter, responsive table.
    - Create and edit dialog.
    - Reset password dialog.
    - Deactivate or reactivate confirmation.
    - Loading, empty and error states.
- **Verification:** `supabase/verification/02_profiles_rls.sql` passes 13/13. Security advisor is clean. End-to-end browser and API checks pass (see TESTING.md).
- **Fix during verification:** after sign-in, the login page sent users to `/` instead of `?redirect`. `GuestRoute` now uses `safeRedirect` (`lib/redirect.ts`).

## Phase 3: delivered
- **Database** (`20261107084502_applications`):
  - `applications` table with `icon_key` (bundled icons, no uploads).
  - Partial unique name index, so archived names can be reused.
  - Trigger trims the name and forces `created_by`.
  - Column grants and RLS: everyone can read, including archived rows; only admins can write, and only non-archived rows.
  - `archive_application` / `restore_application` RPCs. Restore refuses on a name clash.
- **Frontend:**
  - `AppIcon` and an icon map of 30 bundled Lucide icons (`APP_ICON_KEYS` in `@tms/shared`).
  - Applications grid with search and status filter (Archived is admin-only), motion entrance and skeletons.
  - Create/edit dialog with icon picker and active switch, validated with Zod.
  - Detail page: header with status badge; admin actions Edit, Activate/Deactivate, Archive/Restore; inactive and archived banners.
  - URL-routed tabs: Overview (description, created by/at, updated, archived by/at); Tickets, Knowledge Base and Reports are placeholders until Phases 4, 7 and 8.
- **Verification:** `03_applications_rls.sql` 16/16. Browser flow verified (see TESTING.md).
- **Data created:** application "Customer Portal" (active), from the browser test. Keep it or archive it.
- Activity logging for application changes is deferred to Phase 4, when `activity_logs` is created.

## Phase 4: delivered
- **Database** (`20261107085410_tickets`):
  - Ticket enums, gapless per-category numbering, `tickets` table with validation trigger (forced creator/status/number, active application and assignee, rich-text validation, derived `description_text`).
  - **Production lock** enforced in the trigger and RLS (status changes come in Phase 5).
  - `ticket_number_aliases` and `change_ticket_category` (Q15).
  - `ticket_attachments` with registration and removal RPCs.
  - `activity_logs`: append-only, written by triggers, including application audit deferred from Phase 3.
  - Soft delete and restore RPCs; private `ticket-attachments` bucket with path-scoped policies; trigram search indexes.
- **Frontend:**
  - Tiptap editor (bold, italic, underline, H1–H3, lists, tables, links, code, inline code, quotes, images, undo/redo) and read-only viewer. Images are stored by path and resolved to signed URLs at render time.
  - Shared `Combobox`, application and assignee pickers, priority, category and status badges.
  - Upload service with progress and cancel (XHR to Storage using the user JWT).
  - Tickets page: URL-driven search and filters (category, application, assignee/me/unassigned, priority, status, sort, admin "Deleted" view with restore), responsive table, pagination.
  - Create-ticket sheet (Zod: application required for Development and Support; "Assign to me").
  - Ticket detail:
    - Inline title edit, description view/edit.
    - Attachments: drag and drop, progress, preview and download through signed URLs, remove.
    - Activity timeline.
    - Sidebar for application, assignee and priority; change category; delete (creator or admin).
    - Lock and deleted banners; old ticket numbers redirect.
  - Application detail **Tickets** tab now uses the real list, with create pre-filled for that application.
- **Verification:** `04_tickets_rls.sql` 32/32. Browser flow verified (see TESTING.md).
- **Data created:** ticket **SUP-0001** (originally DEV-0001) on Customer Portal, with `slow-query.sql` attached.

## Phase 5: delivered
- **Database** (`20261107090924_workflow`):
  - `ticket_status_history`: creation row by trigger, backfilled for existing tickets.
  - `transition_ticket_status` (Q2 rules, first-arrival lifecycle timestamps, history and activity).
  - `admin_correct_ticket` (Q5: details, status revert and timestamps; reason required; audited). The generic audit trigger skips corrected updates so there's exactly one audit entry.
- **Frontend:**
  - Kanban board (dnd-kit): four columns, pointer/touch/keyboard sensors, drag overlay, valid and invalid drop highlighting, optimistic moves with rollback, Prod confirmation.
  - Locked cards can't be dragged; cards are sorted by most recently updated.
  - Filters (search, application, category, assignee, priority) in the URL; horizontal scrolling on small screens; most recent 30 Prod Deployed tickets shown.
  - Ticket detail: status dropdown limited to allowed moves (with Prod confirmation), Status history card, Admin correction dialog (admin), activity text for status changes and corrections.
- **Not yet shown on cards:** total logged effort, because effort logs arrive in Phase 6. The card has room for it.
- **Verification:** `05_workflow.sql` 21/21. Browser drag, lock and correction flow verified (see TESTING.md).
- **Data state:** SUP-0001 went Development → In Progress → QA → Prod during the test, then was corrected back to **QA Deployed** (reason recorded).

## Phase 6: delivered
- **Database** (`20261107092117_comments_effort`):
  - `ticket_comments` (rich text, author-only edit, author or admin soft delete, admin restore).
  - `effort_logs` with generated `effort_minutes` and validation (positive, whole minutes, at most 24h per entry, no future dates).
  - Own-effort rules in RLS and trigger; admins can log for others (Q14).
  - Production lock for comments and effort; audit events for both.
  - Aggregate RPCs `get_ticket_effort_totals` and `get_effort_summary`.
  - Activity policy hides other people's effort events (Q3).
- **Frontend:**
  - Ticket detail **Effort** section: ticket total (everyone) and my total; entries (own, or all for admins); log/edit dialog with live minutes preview; admin can pick the employee; delete.
  - **Comments** section: rich text with images, edit marked "(edited)", delete, admin moderation, show-deleted toggle and restore for admins, read-only when locked.
  - Effort totals on **board cards** and in the **ticket list**.
  - New **Effort** page (`/effort`, in the sidebar): presets (this week, this month, last 30 days, custom), admin employee filter; total, daily average, daily, weekly, monthly, by application, by employee (admin), top tickets.
  - Activity timeline text for comment and effort events.
- **Fix:** removed the Link `protocols` option that caused repeated linkify console warnings.
- **Verification:** `06_comments_effort.sql` 33/33. Browser flow verified (see TESTING.md).
- **Data created:** on SUP-0001, 1h 30m of effort ("Profiled the order history query") and one edited comment.

## Phase 7: delivered
- **Database** (`20261107093023_knowledge_base`):
  - `knowledge_base` and `knowledge_attachments`, with a weighted full-text vector that includes extracted document text, maintained by triggers.
  - Admin-only writes (spec §3.2); everyone reads.
  - Admin audit events.
  - `search_knowledge_base` (websearch syntax, ranking, marker-highlighted snippets; runs with the caller's permissions).
  - Private `knowledge-base` bucket with admin upload.
- **Edge Function `extract-document-text`** (v2): **.txt only**, per the user's revision of Q10. Word, PDF, SQL, JSON, Excel and images are title-only (`not_supported`). Enforced by the register RPC, a check constraint (`knowledge_attachments_text_only_for_txt`) and the function. This is the "separate capability" from spec §10.4.
- **Frontend:**
  - Knowledge Base page: search with debounce; filters for application, category and type in the URL; result cards with highlighted snippets.
  - Record detail: content viewer and Documents panel (drag and drop, progress, indexing badges that poll while pending, retry on failure, preview and download, admin remove); edit and delete; restore when deleted.
  - Create/edit sheet: application (archived excluded, inactive allowed), category, title, description, type, rich-text content with images.
  - The application detail **Knowledge Base** tab now shows that application's records, with create pre-filled.
- **Verification:** `07_knowledge_base.sql` 19/19. TXT and PDF extraction and search verified in the browser.
- **Data created:** KB record "Payment gateway queue backlog" (Customer Portal, Troubleshooting) with `runbook.txt` (searchable) and `tiny.pdf` (reset to title-only by the txt-only migration).

## Phase 8: delivered
- **Database** (`20261107120514_reports`): `report_settings` (single row, admin-editable, audited), `report-assets` bucket (admin, PNG/JPEG, 2 MB), `get_effort_report` (Criterion A ∪ B per spec §9.2 and Q4, IST dates, own-in-range effort only, optional application filter).
- **Frontend:**
  - Reports page: employee (defaults to you; admins can choose any employee, employees are locked to themselves), start and end date (defaults to the current month), "Include production details", **Generate**.
  - On-screen table with an "Included because" column (created/assigned and/or effort logged) and the total.
  - **Preview PDF** (in an iframe) and **Download PDF** (`effort-report_{name}_{start}_{end}.pdf`). The PDF module is lazy-loaded.
  - Report Settings page (admin; also in the sidebar): company name, report title, footer text, header image upload, replace, remove, preview.
  - Application detail **Reports** tab: the same report narrowed to that application.
- **Verification:** `09_reports.sql` 15/15; real PDF downloaded and inspected; 7-page pagination test.
- **Data:** report settings set (CodeWithZ / Task & Effort Report / footer text), with `logo.png` as the header image.

## Phase 9: delivered
- **Database** (`20261107122228_dashboard`): `get_dashboard_stats`, following Q11 (created-in-range tickets, effort dated in range, fixed this-month effort) and Q3 (team and employee-wise effort for admins only).
- **Frontend** (dashboard at `/`):
  - Period filter: Today, This week, This month, Custom (IST; weeks start Monday).
  - Stat tiles: hero Total tickets; Development, Support, R&D; In Progress, QA Deployed, Prod Deployed; Unassigned; Effort this month and in the period ("My …" for non-admins).
  - **Effort by employee** (admin) and **Tickets by application**: ranked horizontal bars in one validated hue (dataviz skill), hover tooltips, value labels, and a chart/table toggle.
  - Recent activity (with ticket links), Recently created, Recently updated. Auto-refresh every 60 s.
  - Activity text moved to `features/tickets/activity-describe.ts`, shared with the ticket timeline.
- **Verification:** `10_dashboard.sql` 12/12; validator pass; browser check on desktop, dark mode and mobile.

## Architectural decisions
See `TECHNICAL_ANALYSIS.md` §11 for the main decisions. Implementation-level ones:
- ShadCN's Sonner uses a local theme context instead of `next-themes`.
- The `cn` utility comes from ShadCN's own `cn` package.
- Framer Motion is installed as `motion`.
- Admin changes to role, active status and email go **only** through the Edge Function (service role). No table grant lets even an admin change them directly, so there's no separate guard trigger.
- Supabase assigns migration versions when they are applied. Local files are renamed to match `list_migrations`.
- Deactivation uses an Auth ban (`876000h`) plus `profiles.is_active = false`.
- Avatars are initials with a colour derived from the name (decision Q16).
- **Tickets:** status, number, category and lifecycle columns are not client-writable. Locked tickets are blocked for everyone, admins included, until the Phase 5 audited correction (it uses the transaction-local `app.admin_correction` flag already checked by the trigger).
- **Attachments:** a two-step upload (storage, then register RPC). The RPC trusts only storage metadata. Objects are never deleted.
- **Inline editor images** go to `ticket-attachments/inline/{user_id}/` so they can be added before a ticket exists. Signed URLs last 1 hour; a very long-open page may need a refresh to show images again.
- **Search:** ILIKE with trigram indexes on number and title. Full-text search is used for the knowledge base in Phase 7.
- **DOMPurify:** not installed yet, because nothing renders stored HTML. Rendering goes through the Tiptap schema. It's still approved if an HTML path is introduced.
- **Board scope:** open tickets are shown in full; the Prod Deployed column shows the 30 most recent deployments to keep the board fast as history grows. Older ones are reachable through the Tickets list (status filter).
- **No within-column ordering:** the spec doesn't require manual ranking, so columns sort by last update ("recently updated").
- **Admin correction bypass:** `set_config('app.admin_correction','on', true)` is transaction-local and is only called inside the definer RPC. PostgREST doesn't expose `set_config`.
- **Effort limits (implementation defaults, not set by the spec):** one entry is 1 minute to 24 hours; dates can't be in the future (Asia/Kolkata); hours allow two decimals and minutes must be whole numbers. Easy to change in the constraint and trigger if needed.
- **Effort privacy (Q3):** employees never receive other people's entries. Ticket totals and summaries come only from definer RPCs that return sums. Effort activity events are filtered by RLS.
- **Comments with only an image** (no text) are rejected, because the "not empty" check uses the derived text. Users can add a caption.
- **Effort page** added to the sidebar to show the spec §8.4 summaries before the Phase 9 dashboard.
- **KB search** uses one weighted `tsvector` per record (title > description > note text > document text) with the `english` configuration (stemming). Extracted text is capped at 500k characters per document and 200k per document inside the vector.
- **Search highlighting** uses private-use Unicode markers from `ts_headline` instead of `<b>` tags, so the client never renders HTML (DOMPurify is still not needed).
- **KB permissions** follow spec §3.2 literally: employees view and search, admins manage. Employees can't create KB records.
- **Extraction** is triggered by the client after registration for .txt files (fire and forget, status polled). Failures are marked `failed` and can be retried.
- **Q10 revised by the user (2026-11-07):** only .txt contents are searchable. Spec §10.4 is still satisfied: extraction is a separate capability, and the UI doesn't claim PDF or Word full-text search.
- **Report application filter:** `get_effort_report` has an optional `p_application_id`, used only by the application Reports tab (spec §4 lists Reports as an application section). The main Reports page uses the spec's filters unchanged.
- **PDF generation is client-side** (`@react-pdf/renderer`, lazy-loaded) with the built-in Helvetica font. Text outside Latin-1 (for example Devanagari) wouldn't render correctly; a Unicode font can be registered later if needed.
- **Reports require the Employee role** for the target user, since admin-only users have no own effort or assignments.
- **Dashboard charts:** following the dataviz method, the headline numbers are stat tiles (not charts). The two distributions are ranked single-hue bars (no categorical palette needed), and each chart has a table view. Status tiles count tickets created in the period by their *current* status (Q11).
- **Activity timeline UI** was delivered in Phase 4 (earlier than planned), because the logs exist from ticket creation onward. Status entries arrive in Phase 5.

## Database migrations
| Version | Name | Phase |
|---|---|---|
| 20261107080707 | auth_profiles | 2 |
| 20261107084502 | applications | 3 |
| 20261107085410 | tickets | 4 |
| 20261107090924 | workflow | 5 |
| 20261107092117 | comments_effort | 6 |
| 20261107093023 | knowledge_base | 7 |
| 20261107093909 | kb_txt_only_extraction | 7 |
| 20261107094517 | multi_roles | — |
| 20261107120514 | reports | 8 |
| 20261107122228 | dashboard | 9 |
| 20261108070924 | ticket_statuses_completed_dropped | 11 |
| 20261108071052 | monthly_boards_final_statuses | 11 |

## Known issues
- Fixed in Phase 10: vendor chunking (entry 190 kB). Remaining large chunks are lazy (PDF renderer ~1.2 MB, editor 470 kB), so Vite still prints a size warning for them.
- A true concurrent ticket-number test has not been run (the MCP tool serialises sessions). Design-safe via row lock + UNIQUE.
- Leaked-password protection: enable in Supabase Dashboard → Auth (user action).
- Supabase's built-in SMTP isn't used. Users get temporary passwords from an admin, so no emails are needed.

## Outstanding clarifications
None.

## Test data
- `test.employee@example.test` ("Test Employee Edited"): created during Phase 2 verification and left **deactivated**. It can be reactivated and renamed for real use. Accounts are never hard-deleted.

## Change: multi-role users (2026-11-07)
- `profiles.role` replaced by `profiles.roles` (`user_role[]`, 1–2 distinct values). Migration `20261107094517_multi_roles`.
- **Admin** = administration rights. **Employee** = ticket work: assignable, logs own effort, appears in employee lists. Admin-only users can't be assigned or log their own effort, but can log effort for employees.
- ilyas.dabholkar@codewithz.in = **{admin, employee}**. Existing employees = {employee}.
- `admin-users` (v2) and `extract-document-text` (v3) redeployed; provision script updated; Users page role checkboxes; role badges everywhere.
- Verification: `08_multi_roles.sql` 18/18; `02_profiles_rls.sql` re-run 13/13; Users page role checkboxes verified in the browser.
- Docs updated (DATABASE_SCHEMA, SECURITY, API_AND_DATA_ACCESS, TESTING).

## Change: report letterhead from Template.docx (2026-11-07)
- The PDF page frame follows the first page of `Template.docx`, repeated on **every page**:
  - Header: logo top-right (the header-image setting), full-width amber bar `#F5B93C`.
  - Footer: beige rule `#E2DDC7`, company name centred (serif; Times stands in for the template's Cambria, which isn't a built-in PDF font), address and contact line centred, grey `#585858`. Generation time (IST) and "Page X of Y" sit just above the rule (spec §9.5).
- The values stay configurable: company name → footer company line, footer text → address/contact line, header image → logo. Settings were set to the template's values: "CODE WITH Z" and "1st Floor, Shop No. 126, Boulevard Mall, Lodha Paradise, Majiwada, Thane, Maharashtra, 400601 Contact: +91 9867336636".
- The table accents use the template's amber instead of blue. The report stays **A4 landscape**, because 10 columns don't fit portrait legibly; the template page is portrait.
- Verified: a 3-page PDF rendered with the real settings and logo; letterhead on every page; table header repeated; total on the last page.

## AI features (extension, 2026-11-07): delivered, awaiting review
- **Decisions (user):** use any OpenAI-compatible provider, starting with Groq (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`); switching to xAI Grok only changes those secrets. Nothing is stored (no cache table, no migration). Any active user can use both actions.
- **Edge Function `ai-assistant`** (v1, verify_jwt): actions `summary` and `email`.
  - Loads ticket, comments, status/assignment history and effort with the **caller's RLS-scoped client**, so non-admins only send their own effort entries.
  - Separate system prompts for email and summary. Ticket content is wrapped in `<ticket_data>` as untrusted data, with rules against inventing facts.
  - JSON output is checked with Zod. 45 s timeout. The provider's 429 errors are passed back as a clear message. In-memory limit of 10 requests per user per minute (per instance). Context is capped at 24k characters.
- **Frontend `features/ai`:** "Generate Summary" dialog (sections, Regenerate, Copy Summary) and "Generate Email Draft" sheet (purpose, tone, technicality, length, instructions; editable subject and body; Copy Email / Subject / Body). Regenerating asks before replacing a manually edited draft. Both are hidden on deleted tickets.
- **Pending (user action):** set the Edge Function secrets `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` in Supabase Dashboard → Edge Functions → Secrets. Until then the dialogs show "AI is not configured".
- **Env (2026-11-07):** one root `.env` + `.env.example`; `scripts/` (provision-admin) removed at the user's request; Vite `envDir` is the repo root.
- **AI prompt tuning (v3, model kept at gpt-oss-20b):**
  - Stricter shared rules: no unsupported "complete/deployed" claims, full dates (never a time on its own), priority only as recorded, next steps only if recorded, no filler.
  - A system-computed **KEY FACTS** block (status, QA/prod deployment state, whether priority changed, counts) and the sender's name for the sign-off.
  - Step-by-step method for each prompt plus a self-check line. Settings: temperature 0.2, `reasoning_effort: medium` for gpt-oss models, max_tokens 4000.

## Phase 10: delivered
- 180/180 checks across 9 verification scripts (one script fixed so it ignores real data). Advisors reviewed (no actionable findings). Phone-width pass on all routes. Vendor chunk splitting in `apps/web/vite.config.ts` (also moved to `import.meta.dirname` for Vite's native config loader). Details in TESTING.md.
- **Hosting (2026-11-07):** Cloudflare Pages supported alongside IIS: `apps/web/public/_redirects` (SPA fallback) and `_headers` (security headers, immutable `/assets/*`, no-cache `index.html`). Setup steps in README.

## Phase 11: Completed / Dropped statuses and monthly boards (2026-11-08): delivered, awaiting review
- **User decisions:**
  - Add Completed and Dropped.
  - Dropped takes an optional reason.
  - Every month has its own board; unfinished tickets stay on their board unless a user moves them.
  - A paginated, searchable table view is available.
  - Users can move tickets between boards.
- **Defaults chosen (stated to the user):**
  - Completed is reachable from In Progress or QA Deployed.
  - Dropped is reachable from any open status.
  - Both are final and lock the ticket like Prod Deployed; admin correction can reopen them.
  - New tickets go on the current IST month, or on the board being viewed when created from the Board page.
  - Existing tickets were put on the board of the month they were created in.
  - Finished tickets cannot change board.
- **UI:**
  - Board page: month picker (‹ Nov-2026 ›, "This month"), Board/Table toggle, 6 columns (Completed teal, Dropped slate with a strike-through badge). Dropping a card on a final column opens a confirmation; Dropped has a reason box.
  - The ticket page status menu groups the finish options.
  - Ticket page: Board row with a Move button, Completed/Dropped dates and drop reason, and a lock banner that names the actual final status.
  - Tickets list: Board filter ("All boards"), Board column, per-row Move action.
  - Dashboard: Completed and Dropped tiles.
  - The activity timeline shows board moves and drop reasons.
- **Verification:** see TESTING.md (Phase 11). A browser check is pending because the dev server was stopped for low memory.
- **Board column visibility (2026-11-08):** "Columns" menu on the Board with a checkbox per status (shows per-column counts; at least one stays visible; "Show all columns"). Saved per browser in localStorage (`tms.board.visibleColumns`) and applies to every month. Also: Board page uses the full width, the sidebar is 13.5rem, `SidebarInset` has `min-w-0`, so only the columns scroll sideways.
- **New categories (2026-11-08):** Analysis (ANL), Issue (ISS), Bug Fix (BUG), all requiring an application (user decision). Category icons: chart, alert circle, bug. The dashboard is regrouped: status row (hero total, In Progress, QA, Prod, Completed, Dropped, Unassigned), a "By category" row of 6, then effort.
- **Attachments page (2026-11-09):** Workspace → Attachments lists every file on live tickets: search by name, filters for file type and uploader, 25 per page, Open (new tab) / Download (original name) via 5-minute signed URLs, and a link to the ticket. No DB change (existing RLS and storage policies).
- **Board cards open on click (2026-11-09):** a click opens the ticket (Ctrl/Cmd+click opens a new tab); dragging still changes status (6px activation distance separates the two).
