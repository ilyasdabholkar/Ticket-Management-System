-- Verification: dashboard statistics (Phase 9). Runs inside a rolled-back transaction.
begin;

create temp table _results (check_name text, passed boolean, detail text) on commit drop;
create temp table _ids (k text primary key, v uuid) on commit drop;
grant all on _results, _ids to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd-admin@example.test', '{"roles":["admin","employee"]}', '{"full_name":"D Admin"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd-emp1@example.test', '{"roles":["employee"]}', '{"full_name":"D Emp One"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd-emp2@example.test', '{"roles":["employee"]}', '{"full_name":"D Emp Two"}', now(), now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
with a as (insert into public.applications (name) values ('Dash App') returning id) insert into _ids select 'app', id from a;
-- In range (Oct 2025 window used below): 2 dev (1 assigned), 1 support, 1 rnd; plus one out of range and one deleted
with t as (insert into public.tickets (category, application_id, title, assigned_to) values ('development', (select v from _ids where k='app'), 'D1', '00000000-0000-4000-8000-0000000000e1') returning id) insert into _ids select 't1', id from t;
with t as (insert into public.tickets (category, application_id, title) values ('development', (select v from _ids where k='app'), 'D2') returning id) insert into _ids select 't2', id from t;
with t as (insert into public.tickets (category, application_id, title) values ('support', (select v from _ids where k='app'), 'S1') returning id) insert into _ids select 't3', id from t;
with t as (insert into public.tickets (category, title) values ('rnd', 'R1') returning id) insert into _ids select 't4', id from t;
with t as (insert into public.tickets (category, title) values ('rnd', 'Out of range') returning id) insert into _ids select 't5', id from t;
with t as (insert into public.tickets (category, title) values ('rnd', 'Deleted') returning id) insert into _ids select 't6', id from t;
select public.transition_ticket_status((select v from _ids where k='t1'), 'in_progress');
select public.transition_ticket_status((select v from _ids where k='t3'), 'in_progress');
select public.transition_ticket_status((select v from _ids where k='t3'), 'qa_deployed');
select public.soft_delete_ticket((select v from _ids where k='t6'));

reset role;
update public.tickets set created_at = '2025-10-10 12:00+05:30' where id in (select v from _ids where k in ('t1','t2','t3','t4','t6'));
update public.tickets set created_at = '2025-09-30 23:00+05:30' where id = (select v from _ids where k='t5');
-- Effort: E1 60m + 30m in range, E2 45m in range, E1 20m out of range, plus this-month entry for E1
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
insert into public.effort_logs (ticket_id, user_id, effort_date, effort_value, effort_unit) values
  ((select v from _ids where k='t1'), '00000000-0000-4000-8000-0000000000e1', '2025-10-12', 60, 'minutes'),
  ((select v from _ids where k='t2'), '00000000-0000-4000-8000-0000000000e1', '2025-10-13', 30, 'minutes'),
  ((select v from _ids where k='t3'), '00000000-0000-4000-8000-0000000000e2', '2025-10-14', 45, 'minutes'),
  ((select v from _ids where k='t1'), '00000000-0000-4000-8000-0000000000e1', '2025-11-02', 20, 'minutes'),
  ((select v from _ids where k='t1'), '00000000-0000-4000-8000-0000000000e1', private.org_today(), 15, 'minutes');

-- ---------------- Admin view ----------------
set local role authenticated;
create temp table _d on commit drop as select public.get_dashboard_stats('2025-10-01', '2025-10-31') as s;
insert into _results select 'tickets: created in range only (4; out-of-range and deleted excluded)', (s->'tickets'->>'total')::int = 4, s->'tickets'->>'total' from _d;
insert into _results select 'tickets: by category 2/1/1', (s->'tickets'->>'development')::int = 2 and (s->'tickets'->>'support')::int = 1 and (s->'tickets'->>'rnd')::int = 1, (s->'tickets')::text from _d;
insert into _results select 'tickets: by status 2 dev / 1 in progress / 1 QA / 0 prod',
  (s->'tickets'->'by_status'->>'development')::int = 2 and (s->'tickets'->'by_status'->>'in_progress')::int = 1
  and (s->'tickets'->'by_status'->>'qa_deployed')::int = 1 and (s->'tickets'->'by_status'->>'prod_deployed')::int = 0, (s->'tickets'->'by_status')::text from _d;
insert into _results select 'tickets: unassigned 3', (s->'tickets'->>'unassigned')::int = 3, s->'tickets'->>'unassigned' from _d;
insert into _results select 'by application: Dash App 3, none (R&D) 1', jsonb_array_length(s->'by_application') = 2
  and exists (select 1 from jsonb_array_elements(s->'by_application') x where x->>'application_id' is null and (x->>'count')::int = 1), (s->'by_application')::text from _d;
insert into _results select 'effort (admin): team in range = 135 min', (s->>'effort_in_range')::int = 135 and s->>'effort_scope' = 'team', s->>'effort_in_range' from _d;
insert into _results select 'effort (admin): employee-wise breakdown, E1 first (90) then E2 (45)',
  jsonb_array_length(s->'by_employee') = 2 and (s->'by_employee'->0->>'minutes')::int = 90 and (s->'by_employee'->1->>'minutes')::int = 45, (s->'by_employee')::text from _d;
insert into _results select 'effort this month: independent of the range (>= 15)', (s->>'effort_this_month')::int >= 15, s->>'effort_this_month' from _d;

-- ---------------- Employee 2 view (Q3) ----------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
create temp table _d2 on commit drop as select public.get_dashboard_stats('2025-10-01', '2025-10-31') as s;
insert into _results select 'employee: same ticket counts', (s->'tickets'->>'total')::int = 4, s->'tickets'->>'total' from _d2;
insert into _results select 'employee: effort scope own = 45 min', s->>'effort_scope' = 'own' and (s->>'effort_in_range')::int = 45, s->>'effort_in_range' from _d2;
insert into _results select 'employee: no other employees in breakdown', jsonb_array_length(s->'by_employee') <= 1
  and not exists (select 1 from jsonb_array_elements(s->'by_employee') x where x->>'user_id' <> '00000000-0000-4000-8000-0000000000e2'), (s->'by_employee')::text from _d2;

do $$ begin
  perform public.get_dashboard_stats('2025-10-31', '2025-10-01');
  insert into _results values ('validation: start after end rejected', false, 'allowed');
exception when invalid_parameter_value then insert into _results values ('validation: start after end rejected', true, sqlerrm); end $$;

reset role;
set local role anon;
do $$ begin
  perform public.get_dashboard_stats('2025-10-01', '2025-10-31');
  insert into _results values ('anon: denied', false, 'allowed');
exception when insufficient_privilege then insert into _results values ('anon: denied', true, sqlerrm); end $$;

reset role;
select check_name, passed, detail from _results;
rollback;
