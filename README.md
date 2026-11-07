# Internal Ticket Management System

A JIRA-inspired internal tool for tickets, a Kanban workflow, effort logging, a knowledge base and PDF reports.

- Specification: `Internal-Ticket-Management-System-Specification.md`
- Plan and approved decisions: `TECHNICAL_ANALYSIS.md`

## Stack
React 19 + Vite + TypeScript · Bun workspaces · ShadCN UI + Tailwind v4 · Supabase (Postgres, Auth, Storage) · TanStack Query · React Hook Form + Zod · Tiptap · Motion · dnd-kit · @react-pdf/renderer · Lucide · Sonner

## Repository layout
```
apps/web          React SPA
packages/shared   Shared constants, enums and effort helpers (@tms/shared)
supabase/         migrations/, functions/ (Edge Functions), seed.sql, verification/
deploy/iis/       IIS web.config
```

## Getting started
```bash
bun install
cp .env.example .env   # one env file for the repo; only VITE_* values reach the browser
bun run dev                                    # http://localhost:5173
```
Other scripts, run from the repo root: `bun run build`, `bun run typecheck`, `bun run lint`.

Never put the Supabase service-role key in `apps/web` or in any `VITE_*` variable.

## First-time setup: initial admin
1. In Supabase, go to Authentication → Sign In / Providers. Keep **Email enabled** and turn **off** "Allow new users to sign up".
2. The initial admin already exists (the one-off provisioning script has been removed). Further users are created in the app under Users.
4. Sign in and create employees under Users.

## Deploying to IIS (local)
1. Install the [IIS URL Rewrite module](https://www.iis.net/downloads/microsoft/url-rewrite).
2. Set the values in the root `.env`. They are baked in at build time. If the site lives under a virtual directory, set `VITE_BASE_PATH=/your-dir/`.
3. Run `bun run build`. The output goes to `apps/web/dist` and includes `web.config`.
4. Point an IIS site or application at `apps/web/dist`, or copy the folder to the site root.
5. In Supabase, go to Authentication → URL Configuration and add the IIS URL to Site URL / Redirect URLs.

## Documentation
`ARCHITECTURE.md` · `DATABASE_SCHEMA.md` · `SECURITY.md` · `API_AND_DATA_ACCESS.md` · `TESTING.md` · `IMPLEMENTATION_PROGRESS.md`
