# Testing & Verification

Policy: no automated test suites or test frameworks without explicit approval.

Each phase is verified with:
1. `bun run typecheck`, `bun run build` and `bun run lint`.
2. Focused SQL verification scripts in `supabase/verification/` (RLS, locking, business rules), run through the Supabase MCP inside rolled-back transactions.
3. Supabase security and performance advisors after every migration.
4. Manual and Playwright spot checks of key flows at desktop and mobile (390px) widths.

## Verification scripts
| Script | Covers |
|---|---|
| `10_dashboard.sql` | Counts limited to tickets created in range (out-of-range and deleted excluded), category and status split, unassigned, application distribution including R&D without an application, admin team effort and employee-wise order, effort this month independent of the range, employee sees the same ticket counts but only own effort and no other employees, date validation, anon denied |
| `09_reports.sql` | Criterion A (created by employee, zero effort; assigned to employee, created 23:30 IST on the last day), Criterion B (old ticket, effort in range = only own and in range; outside-range, other-employee and deleted logs excluded), exclusions (effort only outside range, created by others, soft-deleted ticket), union without duplicates and total, employee can't report on others, date validation, settings employee update has no effect, admin can report on any employee, no report for admin-only users, settings trim, blank footer and updater stamp, invalid header path rejected, anon denied |
| `08_multi_roles.sql` | Roles from app_metadata, duplicate collapse, unknown role ignored, user_metadata roles ignored, at least one role, no duplicates, ilyas = admin + employee, admin-only: admin rights kept, not assignable, can't log own effort, can log for employees; admin + employee logs own effort; employee-only not admin, can't create applications or grant self admin |
| `02_profiles_rls.sql` | Auth trigger role source; profile read and update rules for employee, inactive user, admin and anon; denial of insert, delete and protected columns |
| `07_knowledge_base.sql` | Admin create (trim, creator, derived text, search vector), archived application rejected, title outranks body, category filter, marker snippets without HTML, websearch phrase, attachment registration using storage size, extracted text becomes searchable, employee read and search but no create, update, delete, remove or extracted-text write, soft delete hides the record and excludes it from search, anon search denied |
| `06_comments_effort.sql` | Comment author, derived text, empty rejected, edit and delete permissions; minute normalisation (1.5h = 90, 0.5h = 30); zero, negative, fractional-minute, over-24h and future-date rejection; own-effort rule; others' entries invisible and immutable; aggregate totals visible to all; effort activity privacy; employee summary scope; admin sees all and logs for others; employee-wise summary; deleted excluded from totals; lock blocks comments, effort and comment deletion |
| `05_workflow.sql` | Initial history row, direct status update denied, Dev → Prod rejected, first-arrival lifecycle timestamps (not overwritten), backward moves, history and activity counts, no transition out of Prod, employee correction denied, history not writable, short reason and forbidden field rejected, correction on a locked ticket keeps the lock, single audit entry without duplicates, status revert with flagged history, bypass flag reset |
| `04_tickets_rls.sql` | Numbering, forced creator/status, title trim, derived text, R&D without app, Support without app rejected, inactive app and assignee rejected, rich-text validation, protected columns, cross-employee edit, delete permissions, category change with alias, activity logging and immutability, attachment registration checks, soft delete visibility, production lock for employee and admin, restore, anon denial |
| `03_applications_rls.sql` | Admin create/update, name trimming, forced `created_by`, case-insensitive uniqueness, icon-key validation, protected `deleted_at`, employee denial (create/update/archive/delete), archive, read-only archived rows, name reuse, restore name clash, archived rows still readable, anon denial |

## Log
| Phase | Check | Result |
|---|---|---|
| 1 | Typecheck, build, lint | Pass. Lint warnings remain only in ShadCN-generated files |
| 1 | Shell on desktop and at 390px, mobile drawer, routing, Supabase health indicator | Pass |
| 2 | `02_profiles_rls.sql` (13 checks) | **13/13 pass.** Rollback confirmed: 0 users left behind |
| 2 | Security advisor | No findings |
| 2 | Performance advisor | Only "unused index" notices (expected on an empty table) |
| 2 | `admin-users` called without a user JWT | 401, as expected |
| 2 | Unauthenticated visit to `/settings/users` | Redirects to `/login?redirect=…` |
| 2 | Sign-in with bad credentials | "Incorrect email or password" shown in the form |
| 2 | Typecheck, build, lint | Pass |
| 2 | Dashboard settings | Email login enabled; public sign-up rejected (`signup_disabled`) |
| 2 | Admin sign-in and redirect to the requested page | Pass, after a fix: `GuestRoute` now honours `?redirect` |
| 2 | Users page: own row has no Deactivate | Pass |
| 2 | Add-user validation (empty form) | Pass: name, email and password errors shown |
| 2 | Create, edit name, reset password, deactivate, reactivate (via `admin-users`) | Pass. DB confirmed `is_active` and the Auth ban each time |
| 2 | Deactivated user signs in | Rejected (`user_banned`) |
| 2 | Reactivated user signs in with the reset password | Pass |
| 2 | Employee JWT: call `admin-users` / PATCH own role / read profiles | 403 / permission denied / allowed (names only) |
| 2 | Profile page: edit own name | Pass (changed and reverted) |
| 2 | Not covered in the browser | Employee view of admin routes (UI guard). The denial is proven at the API/DB level |
| 3 | `03_applications_rls.sql` (16 checks) | **16/16 pass.** Rolled back |
| 3 | Security advisor | Two warnings for the archive/restore `SECURITY DEFINER` RPCs, which are intentional (they check for admin inside). One suggestion: enable leaked-password protection (dashboard) |
| 3 | Browser: empty state, create (icon picker), detail page, deactivate, tab routing, archive (read-only + banner), restore, activate | Pass |
| 3 | Browser: duplicate name (case-insensitive) | "An application with this name already exists." Dialog stays open |
| 3 | Browser: list at 390px | Pass |
| 3 | Typecheck, lint | Pass |
| 4 | `04_tickets_rls.sql` (32 checks) | **32/32 pass.** Rolled back, including sequence values |
| 4 | Security advisor | Only the intended `SECURITY DEFINER` RPC warnings, plus leaked-password protection (dashboard) |
| 4 | Browser: create sheet validation, application picker, assign to me, bold text, create → DEV-0001 | Pass |
| 4 | Browser: upload .sql with progress (registered with MIME/size from storage), .exe rejected client-side | Pass |
| 4 | Browser: priority change, category change DEV-0001 → SUP-0001, Previous IDs, activity entries | Pass |
| 4 | Browser: /tickets/dev-0001 redirects to SUP-0001; search and filters through the URL; empty result | Pass |
| 4 | Browser: list and detail at 390px | Pass |
| 4–5 | Full-page spinner seen in some screenshots right after navigation | **Explained, not an app bug.** Once it was a Vite dependency re-optimisation reload (two page loads with different `?v=` hashes after adding Tiptap/dnd-kit). DOM sampling every 100 ms over several fresh loads, desktop and 390px, shows spinner (~120–350 ms) → content and never back. The remaining cases are the browser tool screenshotting the new page during startup |
| 4 | Not yet covered in the UI: inline image upload in the editor, attachment remove and preview, ticket delete and restore, employee session | Covered at DB level; UI spot check pending |
| 5 | `05_workflow.sql` (21 checks) | **21/21 pass.** Rolled back |
| 5 | Browser: board render, drag Development → In Progress → QA (pointer steps), invalid In Progress → Prod drop refused, QA → Prod confirmation, card locked in Prod column | Pass |
| 5 | Browser: locked detail page (no edit, upload, remove or delete), lifecycle dates, status history card, activity entries | Pass |
| 5 | Browser: admin correction Prod → QA with cleared Prod date and reason; DB confirms status, null date, one flagged history row, audit entry with before/after | Pass |
| 5 | Browser: board at 390px (horizontal scroll, snap) | Pass, after adding scroll padding |
| 5 | Not covered in the UI: keyboard and touch drag, detail-page status dropdown, employee session | Status dropdown uses the same RPC; DB rules are covered by `05_workflow.sql` |
| 6 | `06_comments_effort.sql` (33 checks) | **33/33 pass.** Rolled back |
| 6 | Security advisor | Only the intended `SECURITY DEFINER` RPC warnings, plus leaked-password protection |
| 6 | Browser: log effort (zero rejected, "= 90 minutes" preview, saved as 1h 30m), ticket and my totals | Pass |
| 6 | Browser: add comment, edit (shows "(edited)"), activity entries | Pass |
| 6 | Browser: effort total on board card and ticket list; Effort page (Monday week, by application, by employee, top tickets) | Pass |
| 6 | Console: linkify "already initialized" warnings from the Link extension `protocols` option | **Fixed** (option removed; 0 warnings after) |
| 6 | Not covered in the UI: comment delete and moderation, effort edit and delete, admin logging for another user, employee session | Covered by `06_comments_effort.sql` |
| 7 | `07_knowledge_base.sql` (19 checks) | **19/19 pass.** Rolled back. Two script fixes during the run (PL/pgSQL variable name clash; missing anon grant on the temporary results table), not app issues |
| 7 | Edge Function `extract-document-text` deployed; real run from the UI | TXT and PDF both reached `completed` within about 5 s |
| 7 | Browser: create note (application, category, title, description, rich content), upload TXT and PDF with progress, "Searchable" badges | Pass |
| 7 | Browser: search a word inside the TXT, a phrase inside the PDF, note text and the description (stemmed "payment" matches "payments"); highlighted snippets | Pass |
| 7 | Hand-made test PDF stream declared `/Length 66` for a 68-byte stream, so the last two characters were dropped | Test-file defect; extraction behaved correctly |
| 7 | Not covered: extraction failure and retry, KB edit and delete in the UI, employee session | Permissions covered by `07_knowledge_base.sql` |
| 7 | Change: KB extraction limited to .txt (migration `kb_txt_only_extraction`, Edge Function v2) | See next rows |
| 7 | Txt-only: existing `tiny.pdf` reset to `not_supported` with no text; `runbook.txt` still `completed` | Pass |
| 7 | Txt-only: check constraint blocks extracted text on a non-txt row, even for the service role (rolled back) | Pass |
| 7 | Txt-only browser: `wombatflux` (txt) and the title found; PDF phrase no longer found; new PDF upload shows "Title only" immediately; upload hint updated | Pass |
| 7 | Document remove in the UI (two duplicate test uploads removed) | Pass |
| Roles | `08_multi_roles.sql` (18 checks) | **18/18 pass.** Rolled back |
| Roles | `02_profiles_rls.sql` re-run after the `role` → `roles` change (13 checks) | **13/13 pass** |
| Roles | Browser Users page: Admin and Employee badges; own Admin checkbox locked with note; empty role set refused ("Select at least one role"); add Admin to test user, then revert; DB and auth `app_metadata.roles` stay in sync | Pass |
| 8 | `09_reports.sql` (15 checks) | **15/15 pass.** Rolled back. Script fixtures corrected during writing (creator is preserved by the tickets trigger; a CTE update can't see its own insert) |
| 8 | Browser: Report Settings (company, title, footer saved; `logo.png` uploaded as header with preview) | Pass |
| 8 | Browser: Reports page (default employee = you, production details on): SUP-0001, 1h 30m, lifecycle dates; downloaded PDF inspected: logo, company, title, employee and email, period, 10 columns, total, footer with IST time, footer text, "Page 1 of 1" | Pass |
| 8 | Pagination: 120 synthetic rows rendered through the same PDF module → 7 pages, header repeated, rows not split, page numbers, total on the last page | Pass. Category column widened afterwards (Development was hyphenating) |
| 8 | Application Reports tab (report narrowed to Customer Portal); Reports page at 390px (no horizontal page overflow) | Pass |
| 8 | Dev-only: the first lazy import of `@react-pdf/renderer` triggered a Vite dependency re-optimisation reload | Not an app issue; doesn't happen in the IIS build |
| 8 | Letterhead from Template.docx: 35-row PDF with real settings and logo → 3 pages, each with logo, amber bar, beige rule, "CODE WITH Z", address line, generation time and page X of 3 | Pass |
| 9 | `10_dashboard.sql` (12 checks) | **12/12 pass.** Rolled back |
| 9 | dataviz validator on the bar hue (#2a78d6 light / #3987e5 dark) | All checks pass (lightness band, chroma, contrast ≥ 3:1) |
| 9 | Browser: KPI tiles, presets (Today/This month), ranked bars with hover tooltip ("Ilyas Dabholkar · Effort: 1h 30m"), table view toggle, recent activity, recently created and updated, dark mode (bar token switches to the dark step), 390px (no horizontal overflow) | Pass after two fixes: Recharts entry animation removed (bars were captured at width 0); recent-ticket rows redesigned to two lines (titles were squeezed to zero width in narrow cards) |
| AI | Typecheck/lint; browser: Generate Summary on SUP-0001 reaches the function with the user's JWT and shows the "AI is not configured" error state (secrets not set yet) | Pass. Live generation still needs checking once the secrets are set |
| AI | Live run on SUP-0001 after prompt tuning (v3) | Summary: requirement kept separate from work, status says not yet in production, no invented pending items. Email: dates with day, correct sign-off, no invented next steps or completion claim. Small slips remain (one time without its date; priority described as 'set to high during ticket', although it never changed) |

## Phase 10: final regression (2026-11-07)
| Area (spec §19 Phase 10) | How | Result |
|---|---|---|
| Authentication, roles, RLS | `02`, `03`, `08` rerun against the current schema | 13/13, 16/16, 18/18 |
| Ticket creation, numbering, category change, soft delete, restore, attachments | `04_tickets_rls.sql` | 32/32 |
| Status transitions, production lock, admin correction | `05_workflow.sql` | 21/21 |
| Effort calculation, comments, effort privacy | `06_comments_effort.sql` | 33/33 after a script fix: the admin-breakdown check now counts only fixture users, because the dev DB has real effort in the window |
| Knowledge base search, extraction, upload registration | `07_knowledge_base.sql` | 19/19 |
| PDF report calculation (Criterion A ∪ B, IST boundaries) | `09_reports.sql` | 15/15 |
| Dashboard statistics | `10_dashboard.sql` | 13/13 |
| **Total** | 9 scripts, all rolled back | **180/180** |
| Concurrent ticket numbers | Three parallel MCP sessions | **Inconclusive:** the MCP tool ran the sessions one after another, so no overlap happened. Safety rests on the design: `private.next_ticket_number` updates one sequence row, whose row lock is held until commit, and `ticket_number` has a UNIQUE constraint as a backstop. A true concurrent test (parallel REST inserts with a user session) is offered as a follow-up because it creates real tickets |
| Supabase advisors | security + performance | Security: 21 × "definer function executable by authenticated", which is intentional (each RPC checks permissions; covered above); leaked-password protection is a dashboard toggle (user action). Performance: only "unused index" notices (expected with a tiny dataset; kept for real volumes) |
| Responsive | Playwright at phone width on all 16 routes | No horizontal page overflow anywhere |
| Performance (bundle) | `bun run build` | Vendor code split into react / supabase / query / ui / forms chunks; app entry chunk 190 kB (64 kB gzip). Large chunks are lazy only: PDF renderer about 1.2 MB (only when a report is previewed), rich-text editor 470 kB, dashboard charts 368 kB |
| Console | Playwright log | No app errors. One expected 503 from before the AI secrets were set; one dev-only "multiple GoTrueClient" warning after a hot reload |

## Phase 11: Completed / Dropped and monthly boards (2026-11-08)
| Check | Result |
|---|---|
| `11_final_statuses_boards.sql` (21): board default and normalisation; Completed only from In Progress/QA and then locked (no edits, comments, effort, board move); Dropped with trimmed optional reason, reason rejected on other transitions and over 500 chars, reason in activity, locked against delete; employee moves an open ticket between boards, which is audited; admin correction reopens a dropped ticket and moves its board without a duplicate log; dashboard counts | **21/21** |
| Regression after the lock-function rewrite: `04_tickets_rls.sql`, `05_workflow.sql` | 32/32, 21/21 |
| Advisors | No new findings (same intentional definer-function warnings) |
| typecheck / lint / build | Pass |
| Browser check (fresh test data: application Test Portal, DEV-0002, RND-0001..0003) | Pass:
  - Status menu offers Completed only from In Progress or QA.
  - Completed and Dropped confirmations; Dropped reason box with a 38/500 counter.
  - Lock banner names the status and shows the reason; Completed/Dropped dates and drop reason on the ticket page.
  - Activity shows reasons and board moves.
  - Move to Dec-2026 from the ticket page; month picker shows Nov 3 / Dec 1; moved back from a table row.
  - Table: columns, search "dark", Board filter, Move button only on open tickets, URL state.
  - Drag Development → In Progress works; a disallowed column is greyed out and ignores the drop.
  - Dashboard Completed 1 / Dropped 1 tiles.
  - 390 px: no page-level horizontal scroll.
  One fix made: the Board page now uses the full width (it was capped at max-w-7xl, which cut off the 6th column at 1600 px) and the column min-width is now 13 rem |

## New categories (2026-11-08)
| Check | Result |
|---|---|
| `12_new_categories.sql` (9): each new category is rejected without an application, numbered ANL/ISS/BUG; R&D still needs no application; changing R&D to Issue renumbers it; dashboard counts | 9/9 (rolled back, so no numbers were used) |
| Browser | Create-ticket category list shows all six with prefixes; table Category filter lists them; dashboard "By category" row with 6 tiles | Pass |
| Attachments page + board card click (2026-11-09) | Browser: 2 real PDFs on ANL-0001 listed with size, ticket, status and uploader; PDF filter; search "health" leaves 1; Open opens a signed URL in a new tab; Download saves under the original file name; clicking a board card opens DEV-0001 | Pass |
