-- Verification: multi-role users (admin / employee / both).
-- Runs inside a transaction that is rolled back.
begin;

create temp table _results (check_name text, passed boolean, detail text) on commit drop;
create temp table _ids (k text primary key, v uuid) on commit drop;
grant all on _results, _ids to authenticated, anon;

-- a0 = admin-only, b0 = admin+employee, e0 = employee-only, n0 = invalid/none in metadata, u0 = user_metadata spoof
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a0', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm-adminonly@example.test', '{"roles":["admin"]}', '{"full_name":"Admin Only"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000b0', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm-both@example.test', '{"roles":["employee","admin","admin"]}', '{"full_name":"Both Roles"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000e0', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm-emp@example.test', '{"roles":["employee"]}', '{"full_name":"Emp Only"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000c0', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm-bogus@example.test', '{"roles":["superuser"]}', '{"full_name":"Bogus"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000d0', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm-spoof@example.test', '{}', '{"full_name":"Spoof","roles":["admin"]}', now(), now());

insert into _results select 'trigger: roles from app_metadata (admin only)', roles = '{admin}', roles::text from public.profiles where id = '00000000-0000-4000-8000-0000000000a0';
insert into _results select 'trigger: duplicates collapsed (admin+employee)', roles @> '{admin,employee}' and cardinality(roles) = 2, roles::text from public.profiles where id = '00000000-0000-4000-8000-0000000000b0';
insert into _results select 'trigger: unknown role ignored -> employee', roles = '{employee}', roles::text from public.profiles where id = '00000000-0000-4000-8000-0000000000c0';
insert into _results select 'trigger: user_metadata roles ignored', roles = '{employee}', roles::text from public.profiles where id = '00000000-0000-4000-8000-0000000000d0';

do $$ begin
  update public.profiles set roles = '{}' where id = '00000000-0000-4000-8000-0000000000e0';
  insert into _results values ('constraint: at least one role', false, 'updated');
exception when check_violation then insert into _results values ('constraint: at least one role', true, sqlerrm); end $$;
do $$ begin
  update public.profiles set roles = '{employee,employee}' where id = '00000000-0000-4000-8000-0000000000e0';
  insert into _results values ('constraint: no duplicate roles', false, 'updated');
exception when check_violation then insert into _results values ('constraint: no duplicate roles', true, sqlerrm); end $$;

-- Real account keeps both roles
insert into _results select 'data: ilyas.dabholkar@codewithz.in is admin + employee', roles @> '{admin,employee}', roles::text
from public.profiles where email = 'ilyas.dabholkar@codewithz.in';

-- ---------------- Admin-only user ----------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a0","role":"authenticated"}', true);
insert into _results select 'admin-only: is_admin()', private.is_admin(), private.is_admin()::text;
with t as (insert into public.tickets (category, title) values ('rnd', 'Multi-role test') returning id) insert into _ids select 't', id from t;

do $$ begin
  update public.tickets set assigned_to = '00000000-0000-4000-8000-0000000000a0' where id = (select v from _ids where k='t');
  insert into _results values ('assign: admin-only user cannot be assigned', false, 'assigned');
exception when check_violation then insert into _results values ('assign: admin-only user cannot be assigned', true, sqlerrm); end $$;
do $$ declare n int; begin
  update public.tickets set assigned_to = '00000000-0000-4000-8000-0000000000b0' where id = (select v from _ids where k='t');
  get diagnostics n = row_count;
  insert into _results values ('assign: admin+employee can be assigned', n = 1, n || ' rows');
end $$;
do $$ begin
  insert into public.effort_logs (ticket_id, effort_date, effort_value, effort_unit) values ((select v from _ids where k='t'), private.org_today(), 1, 'hours');
  insert into _results values ('effort: admin-only cannot log own effort', false, 'inserted');
exception when check_violation then insert into _results values ('effort: admin-only cannot log own effort', true, sqlerrm); end $$;
do $$ declare r public.effort_logs; begin
  insert into public.effort_logs (ticket_id, user_id, effort_date, effort_value, effort_unit)
  values ((select v from _ids where k='t'), '00000000-0000-4000-8000-0000000000e0', private.org_today(), 30, 'minutes') returning * into r;
  insert into _results values ('effort: admin-only can log for an employee', r.user_id = '00000000-0000-4000-8000-0000000000e0', r.effort_minutes::text);
end $$;
do $$ declare v_app uuid; begin
  insert into public.applications (name) values ('Admin-only created app') returning id into v_app;
  insert into _results values ('admin-only: keeps admin rights (creates application)', v_app is not null, v_app::text);
end $$;

-- ---------------- Admin + employee ----------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b0","role":"authenticated"}', true);
do $$ declare r public.effort_logs; begin
  insert into public.effort_logs (ticket_id, effort_date, effort_value, effort_unit) values ((select v from _ids where k='t'), private.org_today(), 2, 'hours') returning * into r;
  insert into _results values ('effort: admin+employee logs own effort', r.effort_minutes = 120, r.effort_minutes::text);
end $$;
insert into _results select 'admin+employee: is_admin()', private.is_admin(), private.is_admin()::text;

-- ---------------- Employee-only ----------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e0","role":"authenticated"}', true);
insert into _results select 'employee-only: not admin', not private.is_admin(), private.is_admin()::text;
do $$ begin
  insert into public.applications (name) values ('Employee should not create');
  insert into _results values ('employee-only: cannot create applications', false, 'inserted');
exception when insufficient_privilege then insert into _results values ('employee-only: cannot create applications', true, sqlerrm); end $$;
do $$ begin
  update public.profiles set roles = '{admin,employee}' where id = '00000000-0000-4000-8000-0000000000e0';
  insert into _results values ('employee-only: cannot grant self admin', false, 'updated');
exception when insufficient_privilege then insert into _results values ('employee-only: cannot grant self admin', true, sqlerrm); end $$;

reset role;
select check_name, passed, detail from _results;
rollback;
