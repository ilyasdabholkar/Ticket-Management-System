-- Multi-role users (user request 2026-11-07). A user holds one or both of {admin, employee}.
--   admin    = administration rights (users, applications, KB, settings, corrections, all effort)
--   employee = takes part in ticket work: can be assigned tickets, logs own effort, appears in employee lists
-- Existing admins become {admin, employee} so nobody loses abilities they had before.

create or replace function private.valid_roles(p_roles public.user_role[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_roles is not null
     and cardinality(p_roles) >= 1
     and cardinality(p_roles) = (select count(distinct r) from unnest(p_roles) r);
$$;

alter table public.profiles add column roles public.user_role[] not null default '{employee}';
update public.profiles
   set roles = case when role = 'admin' then '{admin,employee}'::public.user_role[] else '{employee}'::public.user_role[] end;
alter table public.profiles add constraint profiles_roles_valid check (private.valid_roles(roles));
create index profiles_roles_idx on public.profiles using gin (roles);

-- ---------------------------------------------------------------------------
-- Role helpers
-- ---------------------------------------------------------------------------
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active and 'admin' = any (p.roles)
  );
$$;

-- Is the given profile an active employee (assignable / may own effort)?
create or replace function private.is_active_employee(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.is_active and 'employee' = any (p.roles)
  );
$$;
revoke all on function private.is_active_employee(uuid) from public, anon;
grant execute on function private.is_active_employee(uuid) to authenticated;

-- New auth users: roles from app_metadata.roles (array); legacy app_metadata.role = 'admin' maps to
-- {admin, employee}; default {employee}. user_metadata is never trusted.
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_roles public.user_role[];
  v_name text;
begin
  if jsonb_typeof(new.raw_app_meta_data -> 'roles') = 'array' then
    select coalesce(array_agg(distinct r::public.user_role), '{}')
      into v_roles
      from jsonb_array_elements_text(new.raw_app_meta_data -> 'roles') r
     where r in ('admin', 'employee');
  elsif new.raw_app_meta_data ->> 'role' = 'admin' then
    v_roles := '{admin,employee}';
  end if;
  if v_roles is null or cardinality(v_roles) = 0 then
    v_roles := '{employee}';
  end if;

  v_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  if v_name is null then
    v_name := split_part(new.email, '@', 1);
  end if;

  insert into public.profiles (id, full_name, email, roles)
  values (new.id, left(v_name, 120), lower(new.email), v_roles);
  return new;
end;
$$;

-- Keep auth app_metadata consistent with profiles (informational; profiles is the source of truth).
update auth.users u
   set raw_app_meta_data = (coalesce(u.raw_app_meta_data, '{}'::jsonb) - 'role') || jsonb_build_object('roles', to_jsonb(p.roles))
  from public.profiles p
 where p.id = u.id;

drop index public.profiles_role_idx;
alter table public.profiles drop column role;

-- ---------------------------------------------------------------------------
-- Employee-only participation
-- ---------------------------------------------------------------------------
-- Tickets: assignee must be an active employee (was: any active profile).
create or replace function private.tickets_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app record;
begin
  new.title := btrim(new.title);
  new.description_text := private.tiptap_plain_text(new.description);

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.ticket_number := private.next_ticket_number(new.category);
    new.status := 'development';
    new.started_on := null;
    new.qa_deployed_on := null;
    new.prod_deployed_on := null;
    new.deleted_at := null;
    new.deleted_by := null;
  else
    new.created_by := old.created_by;
    if old.status = 'prod_deployed' and coalesce(current_setting('app.admin_correction', true), '') <> 'on' then
      raise exception 'Ticket % is locked (Prod Deployed)', old.ticket_number using errcode = '42501';
    end if;
  end if;

  if new.application_id is not null
     and (tg_op = 'INSERT' or new.application_id is distinct from old.application_id) then
    select is_active, deleted_at into v_app from public.applications where id = new.application_id;
    if not found then
      raise exception 'Application not found' using errcode = '23503';
    end if;
    if v_app.deleted_at is not null or not v_app.is_active then
      raise exception 'The selected application is inactive or archived' using errcode = '23514';
    end if;
  end if;

  if new.assigned_to is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    if not private.is_active_employee(new.assigned_to) then
      raise exception 'Tickets can only be assigned to active employees' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

-- Effort: the owner of an entry must be an active employee. Admins may still log FOR employees (Q14);
-- an admin-only user (no employee role) cannot log own effort.
create or replace function private.effort_logs_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.user_id := coalesce(new.user_id, auth.uid());
    if new.user_id <> auth.uid() and not private.is_admin() then
      raise exception 'You can only log your own effort' using errcode = '42501';
    end if;
    if not private.is_active_employee(new.user_id) then
      raise exception 'Effort can only be logged for active employees' using errcode = '23514';
    end if;
    new.deleted_at := null;
    new.deleted_by := null;
  else
    new.user_id := old.user_id;
    new.ticket_id := old.ticket_id;
  end if;
  if new.effort_date > private.org_today() then
    raise exception 'Effort date cannot be in the future' using errcode = '23514';
  end if;
  new.description := nullif(btrim(new.description), '');
  perform private.assert_ticket_writable(new.ticket_id);
  return new;
end;
$$;
