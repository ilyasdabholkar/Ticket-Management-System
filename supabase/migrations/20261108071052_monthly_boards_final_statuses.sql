-- Phase 11 (part 2): Completed / Dropped workflow + monthly boards.
--
-- Final statuses: prod_deployed, completed, dropped. All three lock the ticket for everyone (admins included);
-- the only bypass stays admin_correct_ticket() (audited, reason required), which can also reopen a ticket.
-- Transitions (transition_ticket_status):
--   development <-> in_progress <-> qa_deployed   (free among the open statuses)
--   prod_deployed : only from qa_deployed
--   completed     : from in_progress or qa_deployed
--   dropped       : from any open status; optional reason (<= 500 chars)
-- Monthly boards: tickets.board_month (first day of a month). New tickets default to the current IST month.
-- Unfinished tickets stay on their board until a user moves them (plain UPDATE of board_month, unlocked tickets only).

-- ---------------------------------------------------------------- columns
alter table public.tickets
  add column board_month  date,
  add column completed_on timestamptz,
  add column dropped_on   timestamptz,
  add column drop_reason  text;

update public.tickets
   set board_month = date_trunc('month', created_at at time zone 'Asia/Kolkata')::date;

alter table public.tickets
  alter column board_month set not null,
  add constraint tickets_board_month_first_day check (extract(day from board_month) = 1),
  add constraint tickets_board_month_range check (board_month between date '2000-01-01' and date '2100-12-01'),
  add constraint tickets_drop_reason_length check (drop_reason is null or char_length(drop_reason) <= 500);

create index tickets_board_month_idx on public.tickets (board_month) where deleted_at is null;

grant select (board_month, completed_on, dropped_on, drop_reason) on public.tickets to authenticated;
grant insert (board_month) on public.tickets to authenticated;
grant update (board_month) on public.tickets to authenticated;

-- ---------------------------------------------------------------- helpers
create or replace function private.is_final_status(p_status public.ticket_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status in ('prod_deployed', 'completed', 'dropped');
$$;

create or replace function private.status_label(p_status public.ticket_status)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'development' then 'Development' when 'in_progress' then 'In Progress'
    when 'qa_deployed' then 'QA Deployed' when 'prod_deployed' then 'Prod Deployed'
    when 'completed' then 'Completed' when 'dropped' then 'Dropped' end;
$$;

revoke all on function private.is_final_status(public.ticket_status), private.status_label(public.ticket_status) from public, anon;
grant execute on function private.is_final_status(public.ticket_status), private.status_label(public.ticket_status) to authenticated;

create or replace function private.ticket_is_locked(p_ticket_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select private.is_final_status(status) from public.tickets where id = p_ticket_id), false);
$$;

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
  if private.is_final_status(v.status) and coalesce(current_setting('app.admin_correction', true), '') <> 'on' then
    raise exception 'Ticket % is locked (%)', v.ticket_number, private.status_label(v.status) using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------- guard trigger
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
    new.completed_on := null;
    new.dropped_on := null;
    new.drop_reason := null;
    new.deleted_at := null;
    new.deleted_by := null;
    new.board_month := date_trunc('month', coalesce(new.board_month, private.org_today()))::date;
  else
    new.created_by := old.created_by;
    if private.is_final_status(old.status) and coalesce(current_setting('app.admin_correction', true), '') <> 'on' then
      raise exception 'Ticket % is locked (%)', old.ticket_number, private.status_label(old.status) using errcode = '42501';
    end if;
    new.board_month := date_trunc('month', new.board_month)::date;
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

-- Board moves are audited in the ticket timeline (skipped inside admin corrections, which log their own diff).
create or replace function private.tickets_board_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.board_month is distinct from old.board_month
     and coalesce(current_setting('app.admin_correction', true), '') <> 'on' then
    perform private.log_activity(new.id, 'ticket', new.id, 'board_changed',
      jsonb_build_object('from', old.board_month, 'to', new.board_month));
  end if;
  return null;
end;
$$;

create trigger tickets_board_audit
after update of board_month on public.tickets
for each row execute function private.tickets_board_audit();

-- ---------------------------------------------------------------- RLS policies
drop policy "tickets: active users edit unlocked" on public.tickets;
create policy "tickets: active users edit unlocked" on public.tickets
for update to authenticated
using ((select private.is_active_user()) and deleted_at is null and not private.is_final_status(status))
with check ((select private.is_active_user()) and deleted_at is null);

drop policy "ticket-attachments: upload" on storage.objects;
create policy "ticket-attachments: upload" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'ticket-attachments'
  and (select private.is_active_user())
  and (
    ((storage.foldername(name))[1] = 'inline'
      and (storage.foldername(name))[2] = (select auth.uid())::text
      and lower(storage.extension(name)) = any (array['png','jpg','jpeg','gif','webp']))
    or (private.allowed_attachment_ext(storage.extension(name))
      and exists (select 1 from public.tickets t
                  where t.id::text = (storage.foldername(objects.name))[1]
                    and t.deleted_at is null
                    and not private.is_final_status(t.status)))
  )
);

-- ---------------------------------------------------------------- workflow RPC
drop function public.transition_ticket_status(uuid, public.ticket_status);

create function public.transition_ticket_status(p_ticket_id uuid, p_status public.ticket_status, p_reason text default null)
returns public.tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets;
  v_result public.tickets;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not private.is_active_user() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found or v_ticket.deleted_at is not null then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;
  if private.is_final_status(v_ticket.status) then
    raise exception 'Ticket % is locked (%)', v_ticket.ticket_number, private.status_label(v_ticket.status) using errcode = '42501';
  end if;
  if v_ticket.status = p_status then
    return v_ticket;
  end if;
  if p_status = 'prod_deployed' and v_ticket.status <> 'qa_deployed' then
    raise exception 'A ticket can only move to Prod Deployed from QA Deployed' using errcode = '23514';
  end if;
  if p_status = 'completed' and v_ticket.status not in ('in_progress', 'qa_deployed') then
    raise exception 'A ticket can only be completed from In Progress or QA Deployed' using errcode = '23514';
  end if;
  if v_reason is not null and p_status <> 'dropped' then
    raise exception 'A reason can only be given when dropping a ticket' using errcode = '22023';
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'The reason must be 500 characters or fewer' using errcode = '22023';
  end if;

  update public.tickets
     set status = p_status,
         started_on       = case when p_status = 'in_progress'   then coalesce(started_on, now())       else started_on end,
         qa_deployed_on   = case when p_status = 'qa_deployed'   then coalesce(qa_deployed_on, now())   else qa_deployed_on end,
         prod_deployed_on = case when p_status = 'prod_deployed' then coalesce(prod_deployed_on, now()) else prod_deployed_on end,
         completed_on     = case when p_status = 'completed'     then now() else completed_on end,
         dropped_on       = case when p_status = 'dropped'       then now() else dropped_on end,
         drop_reason      = case when p_status = 'dropped'       then v_reason else drop_reason end
   where id = p_ticket_id
  returning * into v_result;

  insert into public.ticket_status_history (ticket_id, from_status, to_status, changed_by)
  values (p_ticket_id, v_ticket.status, p_status, auth.uid());

  perform private.log_activity(p_ticket_id, 'ticket', p_ticket_id, 'status_changed',
    jsonb_strip_nulls(jsonb_build_object('from', v_ticket.status, 'to', p_status, 'reason', v_reason)));

  return v_result;
end;
$$;

revoke all on function public.transition_ticket_status(uuid, public.ticket_status, text) from public, anon;
grant execute on function public.transition_ticket_status(uuid, public.ticket_status, text) to authenticated;

-- ---------------------------------------------------------------- admin correction (new fields)
create or replace function public.admin_correct_ticket(p_ticket_id uuid, p_changes jsonb, p_reason text)
returns public.tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.tickets;
  v_new public.tickets;
  v_result public.tickets;
  v_key text;
  v_allowed text[] := array['title','description','priority','assigned_to','application_id','status','started_on',
                            'qa_deployed_on','prod_deployed_on','completed_on','dropped_on','drop_reason','board_month'];
  v_diff jsonb := '{}'::jsonb;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 10 then
    raise exception 'A correction reason of at least 10 characters is required' using errcode = '22023';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb then
    raise exception 'No changes supplied' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_changes) loop
    if not v_key = any (v_allowed) then
      raise exception 'Field "%" cannot be corrected', v_key using errcode = '22023';
    end if;
  end loop;

  select * into v_old from public.tickets where id = p_ticket_id for update;
  if not found or v_old.deleted_at is not null then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;

  v_new := jsonb_populate_record(v_old, p_changes);
  v_new.board_month := date_trunc('month', v_new.board_month)::date;

  if v_new.status is distinct from v_old.status then
    if v_new.status = 'in_progress' and not p_changes ? 'started_on' then v_new.started_on := coalesce(v_new.started_on, now()); end if;
    if v_new.status = 'qa_deployed' and not p_changes ? 'qa_deployed_on' then v_new.qa_deployed_on := coalesce(v_new.qa_deployed_on, now()); end if;
    if v_new.status = 'prod_deployed' and not p_changes ? 'prod_deployed_on' then v_new.prod_deployed_on := coalesce(v_new.prod_deployed_on, now()); end if;
    if v_new.status = 'completed' and not p_changes ? 'completed_on' then v_new.completed_on := coalesce(v_new.completed_on, now()); end if;
    if v_new.status = 'dropped' and not p_changes ? 'dropped_on' then v_new.dropped_on := coalesce(v_new.dropped_on, now()); end if;
  end if;

  foreach v_key in array v_allowed loop
    if (to_jsonb(v_new) -> v_key) is distinct from (to_jsonb(v_old) -> v_key) then
      v_diff := v_diff || jsonb_build_object(v_key, jsonb_build_object(
        'from', case when v_key = 'description' then to_jsonb('(previous description)'::text) else to_jsonb(v_old) -> v_key end,
        'to',   case when v_key = 'description' then to_jsonb('(new description)'::text) else to_jsonb(v_new) -> v_key end));
    end if;
  end loop;
  if v_diff = '{}'::jsonb then
    raise exception 'The supplied values do not change the ticket' using errcode = '22023';
  end if;

  perform set_config('app.admin_correction', 'on', true);

  update public.tickets
     set title = v_new.title,
         description = v_new.description,
         priority = v_new.priority,
         assigned_to = v_new.assigned_to,
         application_id = v_new.application_id,
         status = v_new.status,
         started_on = v_new.started_on,
         qa_deployed_on = v_new.qa_deployed_on,
         prod_deployed_on = v_new.prod_deployed_on,
         completed_on = v_new.completed_on,
         dropped_on = v_new.dropped_on,
         drop_reason = v_new.drop_reason,
         board_month = v_new.board_month
   where id = p_ticket_id
  returning * into v_result;

  perform set_config('app.admin_correction', 'off', true);

  if v_new.status is distinct from v_old.status then
    insert into public.ticket_status_history (ticket_id, from_status, to_status, changed_by, is_correction, correction_reason)
    values (p_ticket_id, v_old.status, v_new.status, auth.uid(), true, btrim(p_reason));
  end if;

  perform private.log_activity(p_ticket_id, 'ticket', p_ticket_id, 'admin_correction',
    jsonb_build_object('reason', btrim(p_reason), 'changes', v_diff));

  return v_result;
end;
$$;

-- ---------------------------------------------------------------- other lock checks
create or replace function public.change_ticket_category(p_ticket_id uuid, p_category public.ticket_category, p_application_id uuid default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets;
  v_new_number text;
  v_app_id uuid;
begin
  if not private.is_active_user() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found or v_ticket.deleted_at is not null then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;
  if private.is_final_status(v_ticket.status) then
    raise exception 'Ticket % is locked (%)', v_ticket.ticket_number, private.status_label(v_ticket.status) using errcode = '42501';
  end if;
  if v_ticket.category = p_category then
    return v_ticket.ticket_number;
  end if;

  v_app_id := coalesce(p_application_id, v_ticket.application_id);
  if p_category <> 'rnd' and v_app_id is null then
    raise exception 'Development and Support tickets require an application' using errcode = '23514';
  end if;

  insert into public.ticket_number_aliases (ticket_id, ticket_number, category, replaced_by)
  values (v_ticket.id, v_ticket.ticket_number, v_ticket.category, auth.uid());

  v_new_number := private.next_ticket_number(p_category);

  update public.tickets
     set category = p_category, ticket_number = v_new_number, application_id = v_app_id
   where id = p_ticket_id;

  perform private.log_activity(p_ticket_id, 'ticket', p_ticket_id, 'category_changed', jsonb_build_object(
    'from', v_ticket.category, 'to', p_category,
    'from_number', v_ticket.ticket_number, 'to_number', v_new_number,
    'application_id', v_app_id));

  return v_new_number;
end;
$$;

create or replace function public.register_ticket_attachment(p_ticket_id uuid, p_storage_path text, p_original_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets;
  v_obj record;
  v_ext text;
  v_id uuid;
begin
  if not private.is_active_user() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into v_ticket from public.tickets where id = p_ticket_id;
  if not found or v_ticket.deleted_at is not null then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;
  if private.is_final_status(v_ticket.status) then
    raise exception 'Ticket % is locked (%)', v_ticket.ticket_number, private.status_label(v_ticket.status) using errcode = '42501';
  end if;
  if split_part(p_storage_path, '/', 1) <> p_ticket_id::text then
    raise exception 'Storage path does not belong to this ticket' using errcode = '22023';
  end if;

  select o.owner_id, o.metadata into v_obj
    from storage.objects o
   where o.bucket_id = 'ticket-attachments' and o.name = p_storage_path;
  if not found then
    raise exception 'Uploaded file not found' using errcode = 'P0002';
  end if;
  if v_obj.owner_id is distinct from auth.uid()::text then
    raise exception 'File was not uploaded by you' using errcode = '42501';
  end if;

  v_ext := lower(substring(p_original_name from '\.([A-Za-z0-9]+)$'));
  if v_ext is null or not private.allowed_attachment_ext(v_ext) then
    raise exception 'File type is not allowed' using errcode = '22023';
  end if;

  insert into public.ticket_attachments (ticket_id, original_name, storage_path, mime_type, file_ext, size_bytes, uploaded_by)
  values (p_ticket_id, left(btrim(p_original_name), 255), p_storage_path,
          coalesce(v_obj.metadata ->> 'mimetype', 'application/octet-stream'), v_ext,
          (v_obj.metadata ->> 'size')::bigint, auth.uid())
  returning id into v_id;

  perform private.log_activity(p_ticket_id, 'attachment', v_id, 'attachment_added',
    jsonb_build_object('file_name', p_original_name, 'size_bytes', (v_obj.metadata ->> 'size')::bigint));
  return v_id;
end;
$$;

create or replace function public.remove_ticket_attachment(p_attachment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_att public.ticket_attachments;
begin
  if not private.is_active_user() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_att from public.ticket_attachments where id = p_attachment_id and deleted_at is null for update;
  if not found then
    raise exception 'Attachment not found' using errcode = 'P0002';
  end if;
  if v_att.uploaded_by <> auth.uid() and not private.is_admin() then
    raise exception 'Only the uploader or an administrator can remove this attachment' using errcode = '42501';
  end if;
  if private.ticket_is_locked(v_att.ticket_id) then
    raise exception 'Ticket is locked (finished)' using errcode = '42501';
  end if;
  update public.ticket_attachments set deleted_at = now(), deleted_by = auth.uid() where id = p_attachment_id;
  perform private.log_activity(v_att.ticket_id, 'attachment', v_att.id, 'attachment_removed', jsonb_build_object('file_name', v_att.original_name));
end;
$$;

create or replace function public.soft_delete_ticket(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets;
begin
  if not private.is_active_user() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found or v_ticket.deleted_at is not null then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;
  if v_ticket.created_by <> auth.uid() and not private.is_admin() then
    raise exception 'Only the creator or an administrator can delete this ticket' using errcode = '42501';
  end if;
  if private.is_final_status(v_ticket.status) then
    raise exception 'Ticket % is locked (%)', v_ticket.ticket_number, private.status_label(v_ticket.status) using errcode = '42501';
  end if;

  update public.tickets set deleted_at = now(), deleted_by = auth.uid() where id = p_ticket_id;
  perform private.log_activity(p_ticket_id, 'ticket', p_ticket_id, 'soft_deleted', jsonb_build_object('ticket_number', v_ticket.ticket_number));
end;
$$;

-- ---------------------------------------------------------------- dashboard: new status counts
create or replace function public.get_dashboard_stats(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin boolean := private.is_admin();
  v_uid uuid := auth.uid();
  v_month_start date := date_trunc('month', private.org_today())::date;
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

  with t as (
    select * from public.tickets
    where deleted_at is null
      and (created_at at time zone 'Asia/Kolkata')::date between p_from and p_to
  ),
  e as (
    select el.user_id, el.effort_minutes, el.effort_date
    from public.effort_logs el
    join public.tickets tk on tk.id = el.ticket_id and tk.deleted_at is null
    where el.deleted_at is null
      and (v_admin or el.user_id = v_uid)
  )
  select jsonb_build_object(
    'effort_scope', case when v_admin then 'team' else 'own' end,
    'tickets', jsonb_build_object(
      'total', (select count(*) from t),
      'development', (select count(*) from t where category = 'development'),
      'support', (select count(*) from t where category = 'support'),
      'rnd', (select count(*) from t where category = 'rnd'),
      'unassigned', (select count(*) from t where assigned_to is null),
      'by_status', jsonb_build_object(
        'development', (select count(*) from t where status = 'development'),
        'in_progress', (select count(*) from t where status = 'in_progress'),
        'qa_deployed', (select count(*) from t where status = 'qa_deployed'),
        'prod_deployed', (select count(*) from t where status = 'prod_deployed'),
        'completed', (select count(*) from t where status = 'completed'),
        'dropped', (select count(*) from t where status = 'dropped')
      )
    ),
    'effort_this_month', coalesce((select sum(effort_minutes) from e where effort_date between v_month_start and private.org_today()), 0),
    'effort_in_range', coalesce((select sum(effort_minutes) from e where effort_date between p_from and p_to), 0),
    'by_employee', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', u, 'minutes', m) order by m desc)
      from (select user_id as u, sum(effort_minutes) as m from e where effort_date between p_from and p_to group by 1) x
    ), '[]'::jsonb),
    'by_application', coalesce((
      select jsonb_agg(jsonb_build_object('application_id', a, 'count', c) order by c desc)
      from (select application_id as a, count(*) as c from t group by 1) x
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
