-- Phase 2: authentication, profiles, roles and RLS foundation.
-- No credentials in this file. The initial admin is provisioned by scripts/provision-admin.ts.

-- ---------------------------------------------------------------------------
-- Private schema: helper functions not exposed through the Data API
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'employee');

-- ---------------------------------------------------------------------------
-- Shared trigger: maintain updated_at
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- Profile images are not stored (decision Q16: initials avatars).
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete restrict,
  full_name   text not null check (char_length(btrim(full_name)) between 1 and 120),
  email       text not null check (email = lower(email) and position('@' in email) > 1),
  role        public.user_role not null default 'employee',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'Application user profile, 1:1 with auth.users. Role and status are changed only by the admin-users Edge Function (service role).';

create unique index profiles_email_key on public.profiles (email);
create index profiles_role_idx on public.profiles (role);
create index profiles_active_idx on public.profiles (is_active);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Role helpers (SECURITY DEFINER to avoid RLS recursion on profiles)
-- ---------------------------------------------------------------------------
create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active and p.role = 'admin'
  );
$$;

revoke all on function private.is_active_user() from public, anon;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_active_user() to authenticated;
grant execute on function private.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Create a profile automatically for every new auth user.
-- Role is read ONLY from app_metadata (settable by the service role), never user_metadata.
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := 'employee';
  v_name text;
begin
  if new.raw_app_meta_data ->> 'role' = 'admin' then
    v_role := 'admin';
  end if;

  v_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  if v_name is null then
    v_name := split_part(new.email, '@', 1);
  end if;

  insert into public.profiles (id, full_name, email, role)
  values (new.id, left(v_name, 120), lower(new.email), v_role);

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

-- Keep profiles.email in sync if the auth email changes (admin-users function).
create or replace function private.handle_auth_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = lower(new.email) where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function private.handle_auth_user_email_change();

-- ---------------------------------------------------------------------------
-- Privileges: users may only change their own full_name.
-- role / is_active / email change only via the service role (admin-users Edge Function).
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name) on table public.profiles to authenticated;

create policy "profiles: active users can read profiles"
on public.profiles for select
to authenticated
using ((select private.is_active_user()));

create policy "profiles: users update their own profile"
on public.profiles for update
to authenticated
using (id = (select auth.uid()) and (select private.is_active_user()))
with check (id = (select auth.uid()));
