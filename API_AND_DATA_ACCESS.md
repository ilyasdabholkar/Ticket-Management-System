# API & Data Access

- **Client:** a single typed Supabase client (`createClient<Database>`) in `apps/web/src/lib/supabase.ts`. Types come from `@tms/shared` (`packages/shared/src/database.types.ts`), which is regenerated through the Supabase MCP after every migration.
- **Reads:** PostgREST table queries, filtered by RLS.
- **Critical writes:** RPC functions or Edge Functions. The planned RPC list is in `TECHNICAL_ANALYSIS.md` §3.3.
- **Files:** private buckets, accessed only through signed URLs.
- **Server state:** TanStack Query, with query keys defined per feature (`authKeys`, `userKeys`).

## Implemented

### System
| Call | Where | Notes |
|---|---|---|
| `GET {SUPABASE_URL}/auth/v1/health` | `services/health.ts` | Drives the connectivity indicator in the top bar |

### Auth (`features/auth/api.ts`)
| Function | Supabase call | Notes |
|---|---|---|
| `signInWithPassword` | `auth.signInWithPassword` | Email and password only |
| `signOut` | `auth.signOut` | Clears the query cache on `SIGNED_OUT` |
| `fetchMyProfile` | `profiles.select().eq(id)` | Returns null when the account is deactivated (RLS hides it), which triggers a forced sign-out |
| `updateMyFullName` | `profiles.update({ full_name })` | Column grant plus RLS: own row only |
| `changeMyPassword` | `auth.updateUser({ password })` | |

### Users (`features/users/api.ts`)
| Function | Call | Notes |
|---|---|---|
| `listUsers` | `profiles.select()` | Ordered with active users first, then by name |
| `createUser` | Edge Function `admin-users` `{ action: 'create', roles }` | Creates the auth user with a confirmed email, `app_metadata.roles` and a temporary password |
| `updateUser` | `{ action: 'update' }` | Name, email and `roles` (array). Only changed fields are sent |
| `setUserActive` | `{ action: 'set_active' }` | Bans or unbans the auth user and sets `profiles.is_active` |
| `resetUserPassword` | `{ action: 'reset_password' }` | Sets a new temporary password |

### Applications (`features/applications/api.ts`)
| Function | Call | Notes |
|---|---|---|
| `listApplications` | `applications.select().order(name)` | Includes archived rows. Filtered in the UI (archived filter is admin-only) |
| `getApplication` | `applications.select().eq(id).maybeSingle()` | |
| `createApplication` | `applications.insert().select().single()` | 23505 is shown as "name already exists" |
| `updateApplication` | `applications.update().eq(id).select(id)` | Zero affected rows raises an error (archived app or no permission) |
| `archiveApplication` / `restoreApplication` | `rpc(archive_application / restore_application)` | Admin only |

### Tickets (`features/tickets/api.ts`)
| Function | Call | Notes |
|---|---|---|
| `listTickets(filters)` | `tickets.select(…, application, assignee)` with `count: exact`, `range` | Filters: category, application, assignee (id or unassigned), priority, status, deleted (admin), search (`ticket_number`/`title` ILIKE, sanitised); sort by updated, created or number; 25 per page. Filters live in the URL |
| `getTicketByNumber(n)` | `tickets` by number, falling back to `ticket_number_aliases` | Returns `{ ticket }`, `{ redirectTo }` or null |
| `createTicket` | `tickets.insert().select(id, ticket_number)` | The number comes from the trigger |
| `updateTicket(id, patch)` | `tickets.update().eq(id).select(id)` | Zero affected rows raises an error (locked or deleted) |
| `changeTicketCategory` | `rpc(change_ticket_category)` | Returns the new number. The UI navigates to it |
| `softDeleteTicket` / `restoreTicket` | RPCs | |
| `listAttachments` | `ticket_attachments`, not deleted | |
| `uploadAttachment` | XHR `POST /storage/v1/object/ticket-attachments/{ticket}/{uuid}.{ext}` with the user JWT (progress and cancel), then `rpc(register_ticket_attachment)` | Client checks extension and size first; the server checks again |
| `removeAttachment` | `rpc(remove_ticket_attachment)` | |
| `attachmentUrl` | `createSignedUrl(path, 300, { download })` | Preview or download |
| `listTicketActivity` | `activity_logs` by ticket, newest first, limit 200 | |

### Workflow & board (Phase 5)
| Function | Call | Notes |
|---|---|---|
| `listBoardTickets(filters)` | Two queries: open tickets (status ≠ prod, up to 1000) and the 30 most recent Prod Deployed (by `prod_deployed_on`) | Filters: search, application, category, assignee, priority (in the URL) |
| `transitionTicketStatus(id, status)` | `rpc(transition_ticket_status)` | Board: optimistic cache update with rollback on error. Detail page: status dropdown. Both confirm before Prod |
| `adminCorrectTicket(id, changes, reason)` | `rpc(admin_correct_ticket)` | Only changed fields are sent |
| `listStatusHistory(id)` | `ticket_status_history` by ticket, ascending | Status history card |

The client rule `canTransition()` in `@tms/shared` mirrors the database rule, for instant feedback only.

### Comments (`features/comments/api.ts`)
| Function | Call | Notes |
|---|---|---|
| `listComments(ticketId, includeDeleted)` | `ticket_comments`, oldest first | Deleted comments are only returned to admins (RLS) |
| `addComment` / `editComment` | insert / update `content` | Author is forced by the DB |
| `deleteComment` / `restoreComment` | `rpc(soft_delete_comment / restore_comment)` | |

### Effort (`features/effort-logs/api.ts`)
| Function | Call | Notes |
|---|---|---|
| `listTicketEffort(ticketId)` | `effort_logs` | RLS: your own entries, or all for admins |
| `getEffortTotals(ids)` | `rpc(get_ticket_effort_totals)` | Ticket detail, board cards, ticket list |
| `createEffort` / `updateEffort` | insert / update | `user_id` is only sent when an admin logs for someone else |
| `deleteEffort` | `rpc(soft_delete_effort_log)` | |
| `getEffortSummary(from, to, userId?)` | `rpc(get_effort_summary)` | Effort page (`/effort`) |

### Knowledge base (`features/knowledge-base/api.ts`)
| Function | Call | Notes |
|---|---|---|
| `listKb(filters)` | With a query: `rpc(search_knowledge_base)`; otherwise `knowledge_base` by `updated_at` | Filters: application, category, type. Kept in the URL |
| `getKb` / `createKb` / `updateKb` | table | Admin writes (RLS) |
| `deleteKb` / `restoreKb` | RPCs | Admin |
| `listKbAttachments` | table | Polls every 3 s while any document is `pending` |
| `uploadKbAttachment` | XHR upload to `knowledge-base/{app}/{kb}/…`, then `rpc(register_kb_attachment)` | |
| `requestExtraction(id)` | Edge Function `extract-document-text` | Called after upload for **.txt** files only; retry available on failure |
| `removeKbAttachment` | `rpc(remove_kb_attachment)` | |
| `kbAttachmentUrl` | signed URL (300 s) | Preview or download |

### Reports (`features/reports/api.ts`)
| Function | Call | Notes |
|---|---|---|
| `getReportSettings` / `updateReportSettings` | `report_settings` (id = true) | Admin writes |
| `uploadHeaderImage(file)` | XHR upload to `report-assets/header/{uuid}.{ext}`, then update `header_image_path` | PNG/JPEG, 2 MB, checked client-side and by the bucket |
| `getHeaderImageDataUrl(path)` | signed URL → fetch → data URL | Embedded in the PDF; if it fails, the PDF is generated without the image |
| `getEffortReport(params)` | `rpc(get_effort_report)` | Fetched when **Generate** is clicked |
| `renderReportPdf(props)` | `@react-pdf/renderer` `pdf().toBlob()` in `features/reports/pdf/report-document.tsx` | **Lazy-loaded** chunk. A4 landscape; letterhead from Template.docx on every page (logo top-right, amber bar; footer rule, company name, address/contact); title, employee and period on page 1; 8 columns, or 10 with production details; table header repeated on every page (`fixed`); rows never split; footer with generation time (IST), footer text and "Page X of Y"; total effort |

### Dashboard (`features/dashboard/api.ts`)
| Function | Call | Notes |
|---|---|---|
| `getDashboardStats(from, to)` | `rpc(get_dashboard_stats)` | Today, This week (Mon), This month, Custom (`lib/date-range.ts`, IST). Refreshes every 60 s and on window focus |
| `listRecentActivity(8)` | `activity_logs` with embedded `ticket(ticket_number, title)`, ticket events only | RLS hides others' effort events from employees. Text from `features/tickets/activity-describe.ts` (shared with the ticket timeline) |
| `listRecentTickets(order, 6)` | `tickets` by `created_at` / `updated_at` | Ignores the date filter (Q11) |

### Rich text
- Stored as Tiptap JSON. Images keep `storagePath`; `src` (a signed URL) is stripped before saving and resolved on render (`components/shared/rich-text/images.ts`).
- Rendering goes through a read-only Tiptap instance (schema-constrained, no raw HTML). Links are limited to http, https and mailto.

### Edge Function `admin-users`
- `verify_jwt = true`, using `withSupabase({ auth: 'user' })`. Calls without a user JWT get a 401.
- The caller must be an **active admin according to `profiles`** (checked in the database, not from the JWT). Otherwise it returns 403.
- Input is validated with Zod (discriminated union on `action`).
- Guards:
  - Roles must be a non-empty subset of `admin`, `employee` (deduplicated).
  - Admins cannot remove their own Admin role or deactivate themselves.
  - The last active admin cannot lose the Admin role or be deactivated.
- Errors come back as `{ error: string }` with a 4xx status. The frontend shows them in a toast.

### Edge Function `extract-document-text`
- `verify_jwt = true`, `withSupabase({ auth: 'user' })`. The caller must be an **active admin** (checked in `profiles`).
- Input `{ attachment_id }` (Zod). **Only .txt** files are processed (UTF-8 decode of the object downloaded with the service role). Any other type returns `not_supported` without changes; v2 no longer bundles PDF or Word libraries.
- Strips NUL characters, collapses spaces, caps the text at 500,000 characters, then writes `extracted_text` and `extraction_status`, which refreshes the parent's search vector through the trigger.
- Extraction errors set `failed` (logged), and the UI offers a retry.

### AI (`features/ai/api.ts` → Edge Function `ai-assistant`)
| Function | Body | Returns |
|---|---|---|
| `generateSummary(ticketId)` | `{action:'summary', ticket_id}` | `{overview, completed_work[], technical_details[], current_status, pending_activities[], important_notes[]}` |
| `generateEmail(ticketId, options)` | `{action:'email', ticket_id, options:{purpose, tone, technicality, length, instructions}}` | `{subject, body, used_context[]}` |
Errors return `{error}` with 400/403/404/429/502/503/504 and are shown in the dialog's ErrorState.

### Monthly boards and final statuses (Phase 11)
| Function | Call | Notes |
|---|---|---|
| `listBoardTickets({ boardMonth, … })` | `tickets` where `board_month = X` (live, ≤ 1000) | One board per month; the old "30 latest Prod" cap is gone because each board is bounded by its month |
| `listTickets({ boardMonth?, … })` | as before, plus an optional `board_month` filter | Table view (Board page → Table) and the Tickets page share `TicketList`: search, status/assignee/board filters, 25 per page |
| `moveTicketBoard(id, month)` | `update tickets set board_month` | RLS allows only unlocked tickets; audited as `board_changed` |
| `transitionTicketStatus(id, status, reason?)` | `rpc(transition_ticket_status)` | `reason` only for Dropped |
| `createTicket({ …, board_month? })` | insert | The Board page passes the month being viewed |
URL state: `/board?month=2026-12-01&view=table&q=…&status=…&page=2`.
