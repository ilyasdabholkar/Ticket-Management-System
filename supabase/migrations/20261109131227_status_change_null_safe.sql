-- Fix: private.can_change_status returned NULL (not false) for unassigned tickets, because
-- `assigned_to = auth.uid()` is NULL when assigned_to is NULL, and `if not NULL` does not raise.
-- Make the check null-safe so it only ever returns true or false.
create or replace function private.can_change_status(p_ticket public.tickets)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(private.is_admin(), false)
      or coalesce(p_ticket.created_by = auth.uid(), false)
      or coalesce(p_ticket.assigned_to = auth.uid(), false);
$$;
