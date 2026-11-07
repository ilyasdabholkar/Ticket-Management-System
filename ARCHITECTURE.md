# Architecture

The full rationale is in `TECHNICAL_ANALYSIS.md` §2 and §11.

## Overview
- **SPA** (`apps/web`): talks directly to Supabase using the publishable key. There is no custom backend.
- **Authorization lives in the database:** RLS on every table, column-level grants, guard triggers, and `SECURITY DEFINER` RPCs for critical state transitions. The UI only hides what the database already denies.
- **Edge Functions** (Deno): handle anything that needs the service role, such as user administration and text extraction.
- **Hosting:** IIS serves the static build. Supabase is hosted.

## Monorepo
Bun workspaces: `apps/*` and `packages/*`. `@tms/shared` exports domain constants that mirror the Postgres enums, plus effort helpers. Edge Functions cannot import workspace packages, so they stay self-contained.

## Frontend structure (`apps/web/src`)
| Folder | Purpose |
|---|---|
| `components/ui` | ShadCN-generated primitives |
| `components/layout` | `AppShell`, `AppSidebar` (collapsible, mobile Sheet), `Topbar`, `PageHeader`, nav config |
| `components/common` | `EmptyState`, `ErrorState`, skeletons, `PhasePlaceholder` |
| `components/shared` | Domain-aware shared UI (badges, avatars, rich text) |
| `features/<name>` | `api/`, `components/`, `hooks/`, `schemas/`, `pages/` for each feature |
| `lib` | `env` (validated with Zod), `supabase` client, `query-client`, `errors`, `utils` |
| `services` | Data access shared across features (for example, the Supabase health check) |
| `routes` | `router.tsx` (data router with lazy route modules), error page, 404 page |
| `stores` | Small React-context stores (theme). No state-management library |

## Conventions
- Pages are lazy route modules that export `Component`.
- Server state goes only through TanStack Query hooks. Each feature defines its own query keys.
- Forms use React Hook Form with Zod schemas in `features/<name>/schemas`.
- Theme is light by default, with optional dark mode (`stores/theme.tsx`, toggled by the `.dark` class).
- `VITE_BASE_PATH` sets both the Vite `base` and the router `basename`, for IIS virtual directories.
