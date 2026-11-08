-- Numbering for the new categories (Analysis ANL, Issue ISS, Bug Fix BUG). All three require an application:
-- the existing check tickets_application_required exempts only 'rnd', and change_ticket_category uses the same rule.
insert into private.ticket_sequences (category, prefix, last_value) values
  ('analysis', 'ANL', 0),
  ('issue', 'ISS', 0),
  ('bug_fix', 'BUG', 0)
on conflict (category) do nothing;

-- Dashboard: category counts for the new categories.
create or replace function public.get_dashboard_stats(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = ''
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
      'analysis', (select count(*) from t where category = 'analysis'),
      'issue', (select count(*) from t where category = 'issue'),
      'bug_fix', (select count(*) from t where category = 'bug_fix'),
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
