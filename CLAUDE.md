# CLAUDE.md – Internal Ticket Management System

## Sources of truth (read before working)
1. `Internal-Ticket-Management-System-Specification.md`: the authoritative requirements. Do not change, simplify or extend scope without approval.
2. `TECHNICAL_ANALYSIS.md`: the approved architecture, schema, RLS matrix and phase plan. **§10–§11 hold the user's answers and approved deviations from the spec.** Section 11 overrides the spec where they differ.
3. `IMPLEMENTATION_PROGRESS.md`: the current phase, decisions, migrations and known issues. Update it at the end of every phase.

## Working rules (from the user)
- Work one phase at a time, in the order of spec §19. **Stop for user review after each phase.**
- Get approval before you change business rules, change DB relationships, add dependencies, remove functionality, run destructive DB or git operations, or change the architecture. Small internal improvements are fine.
- **No automated test suites or test frameworks without explicit approval.** Allowed checks: typecheck, build, lint, SQL verification scripts in `supabase/verification/`, Supabase advisors, and Playwright or manual spot checks. If a test seems necessary, explain why and ask first.
- Do not mark a module complete without its DB structure, RLS/security, validation, loading/error/empty states, and docs (spec §21).
- Keep these docs current: README, ARCHITECTURE, DATABASE_SCHEMA, SECURITY, IMPLEMENTATION_PROGRESS, API_AND_DATA_ACCESS, TESTING.
- Commit only when the user asks.

## Approved decisions (summary; details in TECHNICAL_ANALYSIS.md §10–11)
- **Bun monorepo**: `apps/web` (React SPA), `packages/shared` (`@tms/shared`: enums/constants mirroring Postgres, effort helpers), `supabase/`, `deploy/iis/`.
- **Hosting**: static build on **local IIS** (`deploy/iis/web.config`, copied via `apps/web/public`; needs the URL Rewrite module). Supabase is hosted. `VITE_BASE_PATH` controls both the Vite base and the router basename.
- **Supabase project `zkwrrbldnpkmbrjceqlz` is the DEVELOPMENT project.** The Supabase CLI is not installed. Apply migrations through the Supabase MCP `apply_migration`, with the same name and SQL as the file in `supabase/migrations/`.
- **Ticket permissions**: any active employee can edit non-locked tickets. **Changing status (moving between columns) is limited to an admin, the ticket's creator or its assignee** (2026-11-09; `private.can_change_status` / `canChangeTicketStatus`; null-safe for unassigned tickets). Only the creator or an admin can soft-delete. Statuses move freely among the open ones (Development, In Progress, QA Deployed). Final statuses lock the ticket: **Prod Deployed** (only from QA), **Completed** (from In Progress or QA, for work without a release) and **Dropped** (from any open status, optional reason of up to 500 characters). Each needs a confirmation step. Use `private.is_final_status()` / `isFinalStatus()` for lock checks, never a hard-coded status.
- **Monthly boards (2026-11-08)**: `tickets.board_month` holds the first day of the month. New tickets default to the current IST month. Unfinished tickets stay on their board until a user moves them (unlocked tickets only, audited as `board_changed`). The Board page has Board and Table views.
- **Final-status lock** (Prod Deployed, Completed, Dropped) is enforced in the DB for everyone, admins included. The only bypass is `admin_correct_ticket()`, which needs a reason, is audited, and can revert the status.
- **Effort**: employees see only their own entries, plus aggregate ticket totals via RPC. The employee-wise breakdown is admin-only. Admins can create, edit and delete any user's logs. `effort_minutes` is a generated column.
- **Report Criterion A** = tickets created in the range that were created by OR assigned to the employee. Soft-deleted tickets are excluded.
- **Category can change**: the ticket is renumbered in the new category. Old numbers are kept in `ticket_number_aliases` and still resolve. The change goes through the `change_ticket_category` RPC.
- **App assets are bundled locally**: application icons come from a preset set (`applications.icon_key`), avatars show initials, and nothing is uploaded. Buckets: `ticket-attachments`, `knowledge-base`, `report-assets` only.
- **Archived applications** (soft-deleted) stay readable for historical references but are hidden from listings and pickers. "Inactive" means `is_active=false`. Both block new Development and Support tickets.
- **Timezone**: Asia/Kolkata. Weeks start on Monday. Limits: 25 MB for files, 2 MB for images. The report header image must be PNG or JPEG.
- **Roles (multi-role, 2026-11-07)**: `profiles.roles` = admin and/or employee. Admin = administration; Employee = assignable, logs own effort, appears in employee lists. ilyas = both.
- **Users**: the admin creates users with a temporary password through the `admin-users` Edge Function. Public sign-up is disabled. The initial admin (ilyas.dabholkar@codewithz.in) already exists; the one-off provisioning script was removed (2026-11-07). Never handle or store passwords.
- **Text extraction (KB)**: **.txt only** (revised by the user 2026-11-07). Word, PDF, SQL, JSON, Excel and images are title-only (`not_supported`), enforced by the register RPC, a DB check constraint and the Edge Function.
- **Approved extra deps**: `@hookform/resolvers`, `date-fns`/`react-day-picker`, `dompurify`, `recharts`, and `motion` (the current name of Framer Motion). `next-themes` is NOT used; the local `stores/theme.tsx` replaces it.

## Security non-negotiables
- The browser uses only the publishable key (single root `.env`, git-ignored; template `.env.example`; Vite `envDir` = repo root, only `VITE_*` reaches the browser). Never expose the service-role key or hardcode credentials.
- RLS on every table, `DELETE` revoked (soft delete only via RPC), column-level grants for protected fields, and helpers in the `private` schema.
- Roles come from the DB/`app_metadata`, never from client input.

## Commands (repo root)
- `bun install`, `bun run dev` (http://localhost:5173), `bun run build`, `bun run typecheck`, `bun run lint`
- After each migration: apply via MCP, rename the local file to the remote version, regenerate `packages/shared/src/database.types.ts`, run the matching `supabase/verification/*.sql`, then run the advisors.
- Add ShadCN components from `apps/web`: `bunx --bun shadcn@latest add <name> -y`. Note: generated files import `cn` from the `cn` package (ShadCN's own).

## Frontend conventions
- Feature folders `apps/web/src/features/<name>/{api,components,hooks,schemas,pages}`. Pages are lazy route modules exporting `Component`.
- Server state only via TanStack Query. Forms use RHF + Zod. Reuse `components/common/states.tsx` (EmptyState, ErrorState, skeletons) and `components/layout/PageHeader`.
- Branding: `components/shared/brand-logo.tsx` (`full` wordmark / `mark` square). Sources: `apps/web/src/assets/logo.png` (from root `logo.png`) and `logo-mark.png`. Favicon: `apps/web/public/favicon.png`.
- Toolchain: TypeScript 7 (strict), Vite 8, React 19, React Router 8 (data router, `RouterProvider` from `react-router/dom`), Tailwind v4, ShadCN radix-nova with a blue primary.
- Playwright MCP can only write inside the repo; use `.playwright-mcp/` (git-ignored).
