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
deploy/iis/       IIS web.config (Cloudflare Pages uses apps/web/public/_redirects + _headers)
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
3. Sign in and create employees under Users.

## Deploying to Cloudflare Pages (free hosting)
1. Cloudflare Dashboard → Workers & Pages → Create → Pages → **Connect to Git**, then pick this repository.
2. Build settings:

   | Setting | Value |
   |---|---|
   | Framework preset | None |
   | Build command | `bun install --frozen-lockfile && bun run build` |
   | Build output directory | `apps/web/dist` |
   | Root directory | *(leave empty: repo root)* |

3. Environment variables (set for Production **and** Preview):

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | the publishable key (safe for browsers) |
   | `VITE_BASE_PATH` | `/` |
   | `BUN_VERSION` | `1.3.14` (the Bun version used locally) |

   **Never** add `SUPABASE_SERVICE_ROLE_KEY`, `INITIAL_ADMIN_*` or `LLM_*` here. `VITE_*` values end up in public JavaScript; the LLM key lives only in Supabase Edge Function secrets.
4. `apps/web/public/_redirects` sends every route to `index.html`, so deep links and page refreshes work. `apps/web/public/_headers` adds security headers, long-term caching for hashed `/assets/*` and `no-cache` for `index.html`.
5. After the first deploy, go to Supabase → Authentication → URL Configuration. Set **Site URL** to `https://<name>.pages.dev` (or your custom domain) and add it to **Redirect URLs**.
6. Every push to `main` deploys to production; other branches get preview URLs.

## Deploying to IIS (local)
1. Install the [IIS URL Rewrite module](https://www.iis.net/downloads/microsoft/url-rewrite).
2. Set the values in the root `.env`. They are baked in at build time. If the site lives under a virtual directory, set `VITE_BASE_PATH=/your-dir/`.
3. Run `bun run build`. The output goes to `apps/web/dist` and includes `web.config`.
4. Point an IIS site or application at `apps/web/dist`, or copy the folder to the site root.
5. In Supabase, go to Authentication → URL Configuration and add the IIS URL to Site URL / Redirect URLs.

## Documentation
`ARCHITECTURE.md` · `DATABASE_SCHEMA.md` · `SECURITY.md` · `API_AND_DATA_ACCESS.md` · `TESTING.md` · `IMPLEMENTATION_PROGRESS.md`
