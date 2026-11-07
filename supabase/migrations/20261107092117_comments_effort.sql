-- Phase 6: ticket comments and effort logs (+ aggregates, audit, production lock).

-- ===========================================================================
-- Shared helpers
-- ===========================================================================
-- Organisation "today" (decision Q8: Asia/Kolkata).
create or replace function private.org_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Kolkata')::date;
$$;

-- Child rows (comments, effort) may not change while the ticket is locked or deleted,
-- except inside an audited admin correction.
create or replace function private.assert_ticket_writable(p_ticket_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.tickets;
begin
  select * into v from public.tickets where id = p_ticket_id;
  if not found or v.deleted_at is not null then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;
  if v.status = 'prod_deployed' and coalesce(current_setting('app.admin_correction', true), '') <> 'on' then
    raise exception 'Ticket % is locked (Prod Deployed)', v.ticket_number using errcode = '42501';
  end if;
end;
$$;

-- ===========================================================================
-- ticket_comments
-- ===========================================================================
create table public.ticket_comments (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null references public.tickets (id),
  user_id       uuid not null default auth.uid() references public.profiles (id),
  content       jsonb not null check (private.is_valid_rich_text(content)),
  content_text  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  deleted_by    uuid references public.profiles (id),
  constraint ticket_comments_deleted_consistency check ((deleted_at is null) = (deleted_by is null))
);
create index ticket_comments_ticket_idx on public.ticket_comments (ticket_id, created_at);
create index ticket_comments_user_idx on public.ticket_comments (user_id);
create index ticket_comments_deleted_by_idx on public.ticket_comments (deleted_by);

create trigger ticket_comments_set_updated_at
before update on public.ticket_comments
for each row execute function private.set_updated_at();

create or replace function private.ticket_comments_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    new.deleted_at := null;
    new.deleted_by := null;
  else
    new.user_id := old.user_id;
    new.ticket_id := old.ticket_id;
  end if;
  new.content_text := private.tiptap_plain_text(new.content);
  if new.content_text is null and new.deleted_at is null then
    raise exception 'Comment cannot be empty' using errcode = '23514';
  end if;
  perform private.assert_ticket_writable(new.ticket_id);
  return new;
end;
$$;

create trigger ticket_comments_before_write
before insert or update on public.ticket_comments
for each row execute function private.ticket_comments_before_write();

create or replace function private.ticket_comments_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_activity(new.ticket_id, 'comment', new.id, 'comment_added', '{}'::jsonb);
  elsif new.deleted_at is null and old.deleted_at is null and new.content is distinct from old.content then
    perform private.log_activity(new.ticket_id, 'comment', new.id, 'comment_edited', '{}'::jsonb);
  end if;
  return new;
end;
$$;

create trigger ticket_comments_audit
after insert or update on public.ticket_comments
for each row execute function private.ticket_comments_audit();

alter table public.ticket_comments enable row level security;
revoke all on table public.ticket_comments from anon, authenticated;
grant select on table public.ticket_comments to authenticated;
grant insert (ticket_id, content) on table public.ticket_comments to authenticated;
grant update (content) on table public.ticket_comments to authenticated;

create policy "ticket_comments: read with ticket"
on public.ticket_comments for select to authenticated
using (
  (select private.is_active_user())
  and (deleted_at is null or (select private.is_admin()))
  and exists (select 1 from public.tickets t where t.id = ticket_id)
);

create policy "ticket_comments: active users comment on visible tickets"
on public.ticket_comments for insert to authenticated
with check (
  (select private.is_active_user())
  and exists (select 1 from public.tickets t where t.id = ticket_id and t.deleted_at is null)
);

create policy "ticket_comments: authors edit own"
on public.ticket_comments for update to authenticated
using ((select private.is_active_user()) and user_id = (select auth.uid()) and deleted_at is null)
with check (user_id = (select auth.uid()) and deleted_at is null);

-- Soft delete: author or admin (moderation); ticket must be writable.
create or replace function public.soft_delete_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.ticket_comments;
begin
  if not private.is_active_user() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v from public.ticket_comments where id = p_comment_id and deleted_at is null for update;
  if not found then
    raise exception 'Comment not found' using errcode = 'P0002';
  end if;
  if v.user_id <> auth.uid() and not private.is_admin() then
    raise exception 'Only the author or an administrator can delete this comment' using errcode = '42501';
  end if;
  perform private.assert_ticket_writable(v.ticket_id);
  update public.ticket_comments set deleted_at = now(), deleted_by = auth.uid() where id = p_comment_id;
  perform private.log_activity(v.ticket_id, 'comment', v.id, 'comment_deleted',
    jsonb_build_object('moderated', v.user_id <> auth.uid()));
end;
$$;

create or replace function public.restore_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.ticket_comments;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  select * into v from public.ticket_comments where id = p_comment_id and deleted_at is not null for update;
  if not found then
    raise exception 'Comment not found or not deleted' using errcode = 'P0002';
  end if;
  perform private.assert_ticket_writable(v.ticket_id);
  update public.ticket_comments set deleted_at = null, deleted_by = null where id = p_comment_id;
  perform private.log_activity(v.ticket_id, 'comment', v.id, 'comment_restored', '{}'::jsonb);
end;
$$;

-- ===========================================================================
-- effort_logs
-- ===========================================================================
create type public.effort_unit as enum ('minutes', 'hours');

create table public.effort_logs (
  id              uuid primary key default gen_random_uuid(),
  ticket_id       uuid not null references public.tickets (id),
  user_id         uuid not null default auth.uid() references public.profiles (id),
  effort_date     date not null,
  effort_value    numeric(7,2) not null check (effort_value > 0),
  effort_unit     public.effort_unit not null,
  -- Normalised minutes (spec §8.2). All calculations use this column.
  effort_minutes  integer generated always as (
                    round(case when effort_unit = 'hours' then effort_value * 60 else effort_value end)::integer
                  ) stored,
  description     text check (description is null or char_length(description) <= 2000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  deleted_by      uuid references public.profiles (id),
  constraint effort_logs_minutes_whole check (effort_unit <> 'minutes' or effort_value = trunc(effort_value)),
  constraint effort_logs_minutes_range check (effort_minutes between 1 and 1440),
  constraint effort_logs_deleted_consistency check ((deleted_at is null) = (deleted_by is null))
);
comment on table public.effort_logs is 'Effort entries. Users manage only their own (admins: all). Normalised minutes are generated.';

create index effort_logs_ticket_idx on public.effort_logs (ticket_id) where deleted_at is null;
create index effort_logs_user_date_idx on public.effort_logs (user_id, effort_date) where deleted_at is null;
create index effort_logs_date_idx on public.effort_logs (effort_date) where deleted_at is null;
create index effort_logs_deleted_by_idx on public.effort_logs (deleted_by);

create trigger effort_logs_set_updated_at
before update on public.effort_logs
for each row execute function private.set_updated_at();

create or replace function private.effort_logs_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.user_id := coalesce(new.user_id, auth.uid());
    -- Own-effort rule: only admins may log for someone else (decision Q14).
    if new.user_id <> auth.uid() and not private.is_admin() then
      raise exception 'You can only log your own effort' using errcode = '42501';
    end if;
    if not exists (select 1 from public.profiles where id = new.user_id and is_active) then
      raise exception 'Effort can only be logged for active users' using errcode = '23514';
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

create trigger effort_logs_before_write
before insert or update on public.effort_logs
for each row execute function private.effort_logs_before_write();

create or replace function private.effort_logs_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_activity(new.ticket_id, 'effort_log', new.id, 'effort_added', jsonb_build_object(
      'user_id', new.user_id, 'effort_date', new.effort_date, 'minutes', new.effort_minutes));
  elsif old.deleted_at is null and new.deleted_at is null
        and (new.effort_minutes, new.effort_date, new.description) is distinct from (old.effort_minutes, old.effort_date, old.description) then
    perform private.log_activity(new.ticket_id, 'effort_log', new.id, 'effort_updated', jsonb_build_object(
      'user_id', new.user_id,
      'from', jsonb_build_object('effort_date', old.effort_date, 'minutes', old.effort_minutes),
      'to', jsonb_build_object('effort_date', new.effort_date, 'minutes', new.effort_minutes)));
  end if;
  return new;
end;
$$;

create trigger effort_logs_audit
after insert or update on public.effort_logs
for each row execute function private.effort_logs_audit();

alter table public.effort_logs enable row level security;
revoke all on table public.effort_logs from anon, authenticated;
grant select on table public.effort_logs to authenticated;
grant insert (ticket_id, user_id, effort_date, effort_value, effort_unit, description) on table public.effort_logs to authenticated;
grant update (effort_date, effort_value, effort_unit, description) on table public.effort_logs to authenticated;

-- Decision Q3: employees see only their own entries; admins see all.
create policy "effort_logs: read own or admin"
on public.effort_logs for select to authenticated
using (
  (select private.is_active_user())
  and (user_id = (select auth.uid()) or (select private.is_admin()))
  and (deleted_at is null or (select private.is_admin()))
);

create policy "effort_logs: insert own or admin"
on public.effort_logs for insert to authenticated
with check (
  (select private.is_active_user())
  and (user_id = (select auth.uid()) or (select private.is_admin()))
);

create policy "effort_logs: update own or admin"
on public.effort_logs for update to authenticated
using ((select private.is_active_user()) and deleted_at is null and (user_id = (select auth.uid()) or (select private.is_admin())))
with check (deleted_at is null and (user_id = (select auth.uid()) or (select private.is_admin())));

create or replace function public.soft_delete_effort_log(p_effort_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.effort_logs;
begin
  if not private.is_active_user() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v from public.effort_logs where id = p_effort_id and deleted_at is null for update;
  if not found then
    raise exception 'Effort entry not found' using errcode = 'P0002';
  end if;
  if v.user_id <> auth.uid() and not private.is_admin() then
    raise exception 'You can only delete your own effort' using errcode = '42501';
  end if;
  perform private.assert_ticket_writable(v.ticket_id);
  update public.effort_logs set deleted_at = now(), deleted_by = auth.uid() where id = p_effort_id;
  perform private.log_activity(v.ticket_id, 'effort_log', v.id, 'effort_deleted', jsonb_build_object(
    'user_id', v.user_id, 'effort_date', v.effort_date, 'minutes', v.effort_minutes));
end;
$$;

create or replace function public.restore_effort_log(p_effort_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.effort_logs;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  select * into v from public.effort_logs where id = p_effort_id and deleted_at is not null for update;
  if not found then
    raise exception 'Effort entry not found or not deleted' using errcode = 'P0002';
  end if;
  perform private.assert_ticket_writable(v.ticket_id);
  update public.effort_logs set deleted_at = null, deleted_by = null where id = p_effort_id;
  perform private.log_activity(v.ticket_id, 'effort_log', v.id, 'effort_restored', jsonb_build_object(
    'user_id', v.user_id, 'effort_date', v.effort_date, 'minutes', v.effort_minutes));
end;
$$;

-- ===========================================================================
-- Activity visibility: effort entries reveal per-person minutes, so (Q3) only the
-- owner of the entry, the actor and admins can see effort events.
-- ===========================================================================
drop policy "activity_logs: read" on public.activity_logs;
create policy "activity_logs: read"
on public.activity_logs for select to authenticated
using (
  (select private.is_active_user())
  and (
    (select private.is_admin())
    or entity_type = 'application'
    or (
      ticket_id is not null
      and exists (select 1 from public.tickets t where t.id = ticket_id)
      and (
        entity_type <> 'effort_log'
        or actor_id = (select auth.uid())
        or metadata ->> 'user_id' = (select auth.uid())::text
      )
    )
  )
);

-- ===========================================================================
-- Aggregates (definer: totals only, never individual entries)
-- ===========================================================================

-- Total logged effort per ticket (all users, non-deleted logs) for tickets the caller can see.
create or replace function public.get_ticket_effort_totals(p_ticket_ids uuid[])
returns table (ticket_id uuid, total_minutes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select e.ticket_id, sum(e.effort_minutes)::bigint
  from public.effort_logs e
  join public.tickets t on t.id = e.ticket_id
  where private.is_active_user()
    and e.ticket_id = any (p_ticket_ids)
    and e.deleted_at is null
    and (t.deleted_at is null or private.is_admin())
  group by e.ticket_id;
$$;

-- Effort summary for a date range (spec §8.4).
-- Admins: everyone, or one user via p_user_id. Employees: always themselves (p_user_id ignored).
create or replace function public.get_effort_summary(p_from date, p_to date, p_user_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin boolean := private.is_admin();
  v_user uuid;
  v_result jsonb;
begin
  if not private.is_active_user() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Invalid date range' using errcode = '22023';
  end if;
  if p_to - p_from > 366 then
    raise exception 'Date range cannot exceed one year' using errcode = '22023';
  end if;
  v_user := case when v_admin then p_user_id else auth.uid() end;

  with logs as (
    select e.*, t.application_id, t.ticket_number, t.title
    from public.effort_logs e
    join public.tickets t on t.id = e.ticket_id
    where e.deleted_at is null
      and t.deleted_at is null
      and e.effort_date between p_from and p_to
      and (v_user is null or e.user_id = v_user)
  )
  select jsonb_build_object(
    'scope', case when v_user is null then 'all' else 'user' end,
    'user_id', v_user,
    'total_minutes', coalesce((select sum(effort_minutes) from logs), 0),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('date', d, 'minutes', m) order by d)
                       from (select effort_date as d, sum(effort_minutes) as m from logs group by 1) x), '[]'::jsonb),
    'weekly', coalesce((select jsonb_agg(jsonb_build_object('week_start', w, 'minutes', m) order by w)
                        from (select date_trunc('week', effort_date)::date as w, sum(effort_minutes) as m from logs group by 1) x), '[]'::jsonb),
    'monthly', coalesce((select jsonb_agg(jsonb_build_object('month', mo, 'minutes', m) order by mo)
                         from (select date_trunc('month', effort_date)::date as mo, sum(effort_minutes) as m from logs group by 1) x), '[]'::jsonb),
    'by_application', coalesce((select jsonb_agg(jsonb_build_object('application_id', a, 'minutes', m) order by m desc)
                                from (select application_id as a, sum(effort_minutes) as m from logs group by 1) x), '[]'::jsonb),
    -- Employee-wise breakdown: admins only (Q3); employees get only their own row.
    'by_employee', coalesce((select jsonb_agg(jsonb_build_object('user_id', u, 'minutes', m) order by m desc)
                             from (select user_id as u, sum(effort_minutes) as m from logs group by 1) x), '[]'::jsonb),
    'by_ticket', coalesce((select jsonb_agg(jsonb_build_object('ticket_id', tid, 'ticket_number', tn, 'title', tt, 'minutes', m) order by m desc)
                           from (select ticket_id as tid, ticket_number as tn, title as tt, sum(effort_minutes) as m
                                 from logs group by 1, 2, 3 order by 4 desc limit 50) x), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.soft_delete_comment(uuid) from public, anon;
revoke all on function public.restore_comment(uuid) from public, anon;
revoke all on function public.soft_delete_effort_log(uuid) from public, anon;
revoke all on function public.restore_effort_log(uuid) from public, anon;
revoke all on function public.get_ticket_effort_totals(uuid[]) from public, anon;
revoke all on function public.get_effort_summary(date, date, uuid) from public, anon;
grant execute on function public.soft_delete_comment(uuid) to authenticated;
grant execute on function public.restore_comment(uuid) to authenticated;
grant execute on function public.soft_delete_effort_log(uuid) to authenticated;
grant execute on function public.restore_effort_log(uuid) to authenticated;
grant execute on function public.get_ticket_effort_totals(uuid[]) to authenticated;
grant execute on function public.get_effort_summary(date, date, uuid) to authenticated;
revoke all on function private.assert_ticket_writable(uuid) from public, anon;
grant execute on function private.assert_ticket_writable(uuid) to authenticated;

-- activity_logs entity/action constraints already allow 'comment' and 'effort_log'.
