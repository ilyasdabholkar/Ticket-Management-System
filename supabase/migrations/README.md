# Migrations

Canonical schema history. File name: `YYYYMMDDHHMMSS_short_name.sql`.

- Every schema change is a new file here; never edit an applied migration.
- Applied to the development project (`zkwrrbldnpkmbrjceqlz`) via the Supabase MCP `apply_migration`.
  The remote assigns the version timestamp, so rename the local file to match `list_migrations` after applying.
- No credentials or passwords in migrations or `seed.sql`.
