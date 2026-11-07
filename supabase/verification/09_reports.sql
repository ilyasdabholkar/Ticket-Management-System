-- Verification: report settings and employee effort report (Phase 8).
-- Runs inside a transaction that is rolled back.
begin;

create temp table _results (check_name text, passed boolean, detail text) on commit drop;
create temp table _ids (k text primary key, v uuid) on commit drop;
grant all on _results, _ids to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r-admin@example.test', '{"roles":["admin"]}', '{"full_name":"R Admin Only"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r-emp1@example.test', '{"roles":["employee"]}', '{"full_name":"R Emp One"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r-emp2@example.test', '{"roles":["employee"]}', '{"full_name":"R Emp Two"}', now(), now());

-- Fixtures (as employee 2 / admin), with created_at back-dated by the superuser afterwards.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
with t as (insert into public.tickets (category, title) values ('rnd', 'A: created by E1 in range') returning id) insert into _ids select 'tA', id from t;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
with t as (insert into public.tickets (category, title, assigned_to) values ('rnd', 'A2: assigned to E1, created in range', '00000000-0000-4000-8000-0000000000e1') returning id) insert into _ids select 'tA2', id from t;
with t as (insert into public.tickets (category, title) values ('rnd', 'B: old ticket, E1 effort in range') returning id) insert into _ids select 'tB', id from t;
with t as (insert into public.tickets (category, title) values ('rnd', 'X: old ticket, E1 effort out of range') returning id) insert into _ids select 'tX', id from t;
with t as (insert into public.tickets (category, title) values ('rnd', 'Y: created in range by someone else') returning id) insert into _ids select 'tY', id from t;
with t as (insert into public.tickets (category, title) values ('rnd', 'D: deleted ticket with E1 effort') returning id) insert into _ids select 'tD', id from t;

reset role;
-- tA created by E1 (change creator), dates: range = 2026-10-01..2026-10-31
update public.tickets set created_at = '2026-10-10 10:00+05:30' where id = (select v from _ids where k='tA');
update public.tickets set created_at = '2026-10-31 23:30+05:30' where id = (select v from _ids where k='tA2');  -- IST end-of-day boundary
update public.tickets set created_at = '2026-08-01 10:00+05:30' where id in ((select v from _ids where k='tB'), (select v from _ids where k='tX'), (select v from _ids where k='tD'));
update public.tickets set created_at = '2026-10-15 10:00+05:30' where id = (select v from _ids where k='tY');
-- Effort inserted as superuser with admin claims (the own-effort trigger allows admins to log for employees)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
insert into public.effort_logs (ticket_id, user_id, effort_date, effort_value, effort_unit) values
  ((select v from _ids where k='tB'), '00000000-0000-4000-8000-0000000000e1', '2026-10-05', 1.5, 'hours'),
  ((select v from _ids where k='tB'), '00000000-0000-4000-8000-0000000000e1', '2026-10-20', 30, 'minutes'),
  ((select v from _ids where k='tB'), '00000000-0000-4000-8000-0000000000e1', '2026-09-30', 2, 'hours'),      -- outside range
  ((select v from _ids where k='tB'), '00000000-0000-4000-8000-0000000000e2', '2026-10-06', 3, 'hours'),      -- other employee
  ((select v from _ids where k='tX'), '00000000-0000-4000-8000-0000000000e1', '2026-11-02', 1, 'hours'),      -- outside range
  ((select v from _ids where k='tD'), '00000000-0000-4000-8000-0000000000e1', '2026-10-07', 1, 'hours');
-- deleted effort in range must not count
with e as (insert into public.effort_logs (ticket_id, user_id, effort_date, effort_value, effort_unit)
  values ((select v from _ids where k='tB'), '00000000-0000-4000-8000-0000000000e1', '2026-10-21', 5, 'hours') returning id)
insert into _ids select 'eDel', id from e;
update public.effort_logs set deleted_at = now(), deleted_by = '00000000-0000-4000-8000-0000000000e1' where id = (select v from _ids where k='eDel');
update public.tickets set deleted_at = now(), deleted_by = '00000000-0000-4000-8000-0000000000e2' where id = (select v from _ids where k='tD');

-- ---------------- Employee 1: own report ----------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
create temp table _r on commit drop as select * from public.get_effort_report('00000000-0000-4000-8000-0000000000e1', '2026-10-01', '2026-10-31');

insert into _results select 'A: created by employee in range, zero effort', count(*) = 1 and bool_and(effort_minutes = 0 and created_in_range and not effort_in_range), count(*)::text from _r where ticket_id = (select v from _ids where k='tA');
insert into _results select 'A: assigned to employee, created 23:30 IST on last day', count(*) = 1, count(*)::text from _r where ticket_id = (select v from _ids where k='tA2');
insert into _results select 'B: old ticket with own effort in range = 90+30 min only', count(*) = 1 and bool_and(effort_minutes = 120 and effort_in_range and not created_in_range), max(effort_minutes)::text from _r where ticket_id = (select v from _ids where k='tB');
insert into _results select 'excluded: effort only outside range', count(*) = 0, count(*)::text from _r where ticket_id = (select v from _ids where k='tX');
insert into _results select 'excluded: created in range by others (not assigned)', count(*) = 0, count(*)::text from _r where ticket_id = (select v from _ids where k='tY');
insert into _results select 'excluded: soft-deleted ticket', count(*) = 0, count(*)::text from _r where ticket_id = (select v from _ids where k='tD');
insert into _results select 'union: no duplicates; total = 120 min', count(*) = count(distinct ticket_id) and sum(effort_minutes) = 120, count(*) || ' rows / ' || sum(effort_minutes) from _r;

do $$ begin
  perform * from public.get_effort_report('00000000-0000-4000-8000-0000000000e2', '2026-10-01', '2026-10-31');
  insert into _results values ('permission: employee cannot report on another employee', false, 'allowed');
exception when insufficient_privilege then insert into _results values ('permission: employee cannot report on another employee', true, sqlerrm); end $$;
do $$ begin
  perform * from public.get_effort_report('00000000-0000-4000-8000-0000000000e1', '2026-10-31', '2026-10-01');
  insert into _results values ('validation: start after end rejected', false, 'allowed');
exception when invalid_parameter_value then insert into _results values ('validation: start after end rejected', true, sqlerrm); end $$;
do $$ begin
  update public.report_settings set company_name = 'Hacked';
  insert into _results values ('settings: employee update has no effect', (select company_name from public.report_settings) <> 'Hacked', 'checked');
end $$;

-- ---------------- Admin-only: may report on employees; not on admin-only users ----------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
insert into _results select 'permission: admin can report on any employee', count(*) >= 1, count(*)::text
from public.get_effort_report('00000000-0000-4000-8000-0000000000e2', '2026-10-01', '2026-10-31');
do $$ begin
  perform * from public.get_effort_report('00000000-0000-4000-8000-0000000000a1', '2026-10-01', '2026-10-31');
  insert into _results values ('validation: no report for admin-only user', false, 'allowed');
exception when invalid_parameter_value then insert into _results values ('validation: no report for admin-only user', true, sqlerrm); end $$;
do $$ declare r public.report_settings; begin
  update public.report_settings set company_name = '  Verify Co  ', footer_text = '   ' returning * into r;
  insert into _results values ('settings: admin update trims, blanks footer, stamps updater',
    r.company_name = 'Verify Co' and r.footer_text is null and r.updated_by = '00000000-0000-4000-8000-0000000000a1', r.company_name);
end $$;
do $$ begin
  update public.report_settings set header_image_path = '../../etc/passwd';
  insert into _results values ('settings: invalid header path rejected', false, 'updated');
exception when check_violation then insert into _results values ('settings: invalid header path rejected', true, sqlerrm); end $$;

reset role;
set local role anon;
do $$ begin
  perform * from public.get_effort_report('00000000-0000-4000-8000-0000000000e1', '2026-10-01', '2026-10-31');
  insert into _results values ('anon: cannot run report', false, 'allowed');
exception when insufficient_privilege then insert into _results values ('anon: cannot run report', true, sqlerrm); end $$;

reset role;
select check_name, passed, detail from _results;
rollback;
