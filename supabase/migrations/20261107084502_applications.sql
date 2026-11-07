-- Phase 3: applications.
-- Archive = soft delete (deleted_at). Inactive = is_active false.
-- Archived rows stay readable (historical references) but are read-only.
-- Icons come from a bundled preset set (decision Q16): icon_key, no uploads.

create table public.applications (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(btrim(name)) between 1 and 100),
  description  text check (description is null or char_length(description) <= 2000),
  icon_key     text not null default 'app-window' check (icon_key ~ '^[a-z0-9-]{1,40}$'),
  is_active    boolean not null default true,
  created_by   uuid not null default auth.uid() references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  deleted_by   uuid references public.profiles (id),
  constraint applications_deleted_consistency check ((deleted_at is null) = (deleted_by is null))
);

comment on table public.applications is 'Applications that tickets and knowledge base records belong to. Archive = soft delete via archive_application().';

-- Name unique (case-insensitive) among non-archived applications.
create unique index applications_name_active_key on public.applications (lower(btrim(name))) where deleted_at is null;
create index applications_is_active_idx on public.applications (is_active) where deleted_at is null;
create index applications_created_by_idx on public.applications (created_by);
create index applications_deleted_by_idx on public.applications (deleted_by);

create trigger applications_set_updated_at
before update on public.applications
for each row execute function private.set_updated_at();

-- created_by is always the caller (cannot be spoofed); name is trimmed.
create or replace function private.applications_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

create trigger applications_before_write
before insert or update on public.applications
for each row execute function private.applications_before_write();

-- ---------------------------------------------------------------------------
-- Privileges & RLS
-- ---------------------------------------------------------------------------
alter table public.applications enable row level security;

revoke all on table public.applications from anon, authenticated;
grant select on table public.applications to authenticated;
grant insert (name, description, icon_key, is_active) on table public.applications to authenticated;
grant update (name, description, icon_key, is_active) on table public.applications to authenticated;

create policy "applications: active users can read (including archived)"
on public.applications for select
to authenticated
using ((select private.is_active_user()));

create policy "applications: admins create"
on public.applications for insert
to authenticated
with check ((select private.is_admin()));

create policy "applications: admins update non-archived"
on public.applications for update
to authenticated
using ((select private.is_admin()) and deleted_at is null)
with check ((select private.is_admin()) and deleted_at is null);

-- ---------------------------------------------------------------------------
-- Archive / restore (admin only). Activity logging is added in Phase 4.
-- ---------------------------------------------------------------------------
create or replace function public.archive_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  update public.applications
     set deleted_at = now(), deleted_by = auth.uid()
   where id = p_application_id and deleted_at is null;

  if not found then
    raise exception 'Application not found or already archived' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.restore_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select name into v_name from public.applications
   where id = p_application_id and deleted_at is not null;
  if not found then
    raise exception 'Application not found or not archived' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.applications
     where deleted_at is null and lower(btrim(name)) = lower(btrim(v_name))
  ) then
    raise exception 'An active application named "%" already exists. Rename it before restoring.', v_name
      using errcode = '23505';
  end if;

  update public.applications
     set deleted_at = null, deleted_by = null
   where id = p_application_id;
end;
$$;

revoke all on function public.archive_application(uuid) from public, anon;
revoke all on function public.restore_application(uuid) from public, anon;
grant execute on function public.archive_application(uuid) to authenticated;
grant execute on function public.restore_application(uuid) to authenticated;
