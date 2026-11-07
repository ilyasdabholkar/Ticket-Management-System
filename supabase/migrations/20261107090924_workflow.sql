-- Phase 5: workflow – status history, transitions, lifecycle timestamps, audited admin correction.

-- ===========================================================================
-- ticket_status_history (append-only)
-- ===========================================================================
create table public.ticket_status_history (
  id                 uuid primary key default gen_random_uuid(),
  ticket_id          uuid not null references public.tickets (id),
  from_status        public.ticket_status,
  to_status          public.ticket_status not null,
  changed_by         uuid references public.profiles (id),
  changed_at         timestamptz not null default now(),
  is_correction      boolean not null default false,
  correction_reason  text,
  constraint ticket_status_history_correction_reason check (is_correction = (correction_reason is not null))
);
comment on table public.ticket_status_history is 'Every status transition (UTC). Written only by triggers/RPCs. Corrections are flagged with a reason.';

create index ticket_status_history_ticket_idx on public.ticket_status_history (ticket_id, changed_at);
create index ticket_status_history_changed_by_idx on public.ticket_status_history (changed_by);
create index ticket_status_history_to_status_idx on public.ticket_status_history (to_status, changed_at);

alter table public.ticket_status_history enable row level security;
revoke all on table public.ticket_status_history from anon, authenticated;
grant select on table public.ticket_status_history to authenticated;

create policy "ticket_status_history: read with ticket"
on public.ticket_status_history for select to authenticated
using (
  (select private.is_active_user())
  and exists (select 1 from public.tickets t where t.id = ticket_id)
);

-- Initial history row when a ticket is created (null -> development).
create or replace function private.tickets_init_status_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ticket_status_history (ticket_id, from_status, to_status, changed_by, changed_at)
  values (new.id, null, new.status, new.created_by, new.created_at);
  return new;
end;
$$;

create trigger tickets_init_status_history
after insert on public.tickets
for each row execute function private.tickets_init_status_history();

-- Backfill existing tickets created before this migration.
insert into public.ticket_status_history (ticket_id, from_status, to_status, changed_by, changed_at)
select t.id, null, 'development', t.created_by, t.created_at
from public.tickets t
where not exists (select 1 from public.ticket_status_history h where h.ticket_id = t.id);

-- ===========================================================================
-- Status transitions (decision Q2)
--   * free movement among development / in_progress / qa_deployed
--   * prod_deployed only from qa_deployed
--   * prod_deployed is final (locked) – only admin_correct_ticket can change it
-- Lifecycle timestamps are set on the FIRST arrival only and never overwritten.
-- ===========================================================================
create or replace function public.transition_ticket_status(p_ticket_id uuid, p_status public.ticket_status)
returns public.tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets;
  v_result public.tickets;
begin
  if not private.is_active_user() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found or v_ticket.deleted_at is not null then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;
  if v_ticket.status = 'prod_deployed' then
    raise exception 'Ticket % is locked (Prod Deployed)', v_ticket.ticket_number using errcode = '42501';
  end if;
  if v_ticket.status = p_status then
    return v_ticket;
  end if;
  if p_status = 'prod_deployed' and v_ticket.status <> 'qa_deployed' then
    raise exception 'A ticket can only move to Prod Deployed from QA Deployed' using errcode = '23514';
  end if;

  update public.tickets
     set status = p_status,
         started_on       = case when p_status = 'in_progress'   then coalesce(started_on, now())       else started_on end,
         qa_deployed_on   = case when p_status = 'qa_deployed'   then coalesce(qa_deployed_on, now())   else qa_deployed_on end,
         prod_deployed_on = case when p_status = 'prod_deployed' then coalesce(prod_deployed_on, now()) else prod_deployed_on end
   where id = p_ticket_id
  returning * into v_result;

  insert into public.ticket_status_history (ticket_id, from_status, to_status, changed_by)
  values (p_ticket_id, v_ticket.status, p_status, auth.uid());

  perform private.log_activity(p_ticket_id, 'ticket', p_ticket_id, 'status_changed',
    jsonb_build_object('from', v_ticket.status, 'to', p_status));

  return v_result;
end;
$$;

-- ===========================================================================
-- Audited admin correction (spec §6.2, decision Q5)
-- p_changes may contain: title, description, priority, assigned_to, application_id,
--   status, started_on, qa_deployed_on, prod_deployed_on  (JSON null clears nullable fields)
-- Requires a reason (>= 10 chars). Bypasses the production lock only inside this function.
-- ===========================================================================
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
  v_allowed text[] := array['title','description','priority','assigned_to','application_id','status','started_on','qa_deployed_on','prod_deployed_on'];
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

  -- Apply supplied keys on top of the current row.
  v_new := jsonb_populate_record(v_old, p_changes);

  -- Derive lifecycle timestamps when the status is corrected and no explicit value was given.
  if v_new.status is distinct from v_old.status then
    if v_new.status = 'in_progress' and not p_changes ? 'started_on' then v_new.started_on := coalesce(v_new.started_on, now()); end if;
    if v_new.status = 'qa_deployed' and not p_changes ? 'qa_deployed_on' then v_new.qa_deployed_on := coalesce(v_new.qa_deployed_on, now()); end if;
    if v_new.status = 'prod_deployed' and not p_changes ? 'prod_deployed_on' then v_new.prod_deployed_on := coalesce(v_new.prod_deployed_on, now()); end if;
  end if;

  -- Record before/after for every field that actually changes.
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
         prod_deployed_on = v_new.prod_deployed_on
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

revoke all on function public.transition_ticket_status(uuid, public.ticket_status) from public, anon;
revoke all on function public.admin_correct_ticket(uuid, jsonb, text) from public, anon;
grant execute on function public.transition_ticket_status(uuid, public.ticket_status) to authenticated;
grant execute on function public.admin_correct_ticket(uuid, jsonb, text) to authenticated;

-- The generic audit trigger must not double-log fields changed by a correction.
create or replace function private.tickets_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_activity(new.id, 'ticket', new.id, 'created', jsonb_build_object(
      'ticket_number', new.ticket_number, 'category', new.category, 'title', new.title,
      'priority', new.priority, 'assigned_to', new.assigned_to, 'application_id', new.application_id));
    return new;
  end if;

  -- Corrections are logged once, with the reason, by admin_correct_ticket().
  if coalesce(current_setting('app.admin_correction', true), '') = 'on' then
    return new;
  end if;

  if new.title is distinct from old.title then
    perform private.log_activity(new.id, 'ticket', new.id, 'title_changed', jsonb_build_object('from', old.title, 'to', new.title));
  end if;
  if new.description is distinct from old.description then
    perform private.log_activity(new.id, 'ticket', new.id, 'description_updated', '{}'::jsonb);
  end if;
  if new.priority is distinct from old.priority then
    perform private.log_activity(new.id, 'ticket', new.id, 'priority_changed', jsonb_build_object('from', old.priority, 'to', new.priority));
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    perform private.log_activity(new.id, 'ticket', new.id, 'assigned', jsonb_build_object('from', old.assigned_to, 'to', new.assigned_to));
  end if;
  if new.application_id is distinct from old.application_id and new.category = old.category then
    perform private.log_activity(new.id, 'ticket', new.id, 'application_changed', jsonb_build_object('from', old.application_id, 'to', new.application_id));
  end if;
  return new;
end;
$$;
