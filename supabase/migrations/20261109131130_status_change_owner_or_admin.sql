-- Status changes restricted (user decision 2026-11-09): only an administrator, the ticket's creator or its
-- assignee can move a ticket between statuses. Editing details and moving between monthly boards are unchanged.
create or replace function private.can_change_status(p_ticket public.tickets)
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.is_admin() or p_ticket.created_by = auth.uid() or p_ticket.assigned_to = auth.uid();
$$;

revoke all on function private.can_change_status(public.tickets) from public, anon;
grant execute on function private.can_change_status(public.tickets) to authenticated;

create or replace function public.transition_ticket_status(p_ticket_id uuid, p_status public.ticket_status, p_reason text default null)
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
  if not private.can_change_status(v_ticket) then
    raise exception 'Only the creator, the assignee or an administrator can change the status of %', v_ticket.ticket_number using errcode = '42501';
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
