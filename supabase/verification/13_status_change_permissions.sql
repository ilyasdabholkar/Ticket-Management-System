-- Verification: only an admin, the creator or the assignee can change a ticket's status (2026-11-09).
-- Rolled back. Returns one row per check.
begin;
create temp table _r (c text, ok boolean, d text) on commit drop;
create temp table _ids (k text primary key, v uuid) on commit drop;
grant all on _r, _ids to authenticated;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p-admin@example.test', '{"roles":["admin"]}', '{"full_name":"P Admin"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p-creator@example.test', '{"roles":["employee"]}', '{"full_name":"P Creator"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p-assignee@example.test', '{"roles":["employee"]}', '{"full_name":"P Assignee"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p-other@example.test', '{"roles":["employee"]}', '{"full_name":"P Other"}', now(), now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
with t as (insert into public.tickets (category, title, assigned_to) values ('rnd', 'Permission test', '00000000-0000-4000-8000-0000000000d1') returning id)
insert into _ids select 't', id from t;
with t as (insert into public.tickets (category, title) values ('rnd', 'Unassigned test') returning id) insert into _ids select 'u', id from t;

-- other employee: blocked, and editing details is still allowed (unchanged rule)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
do $$ begin
  perform public.transition_ticket_status((select v from _ids where k='t'), 'in_progress');
  insert into _r values ('other employee: cannot change status', false, 'moved');
exception when insufficient_privilege then insert into _r values ('other employee: cannot change status', true, sqlerrm); end $$;
-- regression: unassigned tickets (assigned_to NULL) must not slip through a NULL comparison
do $$ begin
  perform public.transition_ticket_status((select v from _ids where k='u'), 'in_progress');
  insert into _r values ('other employee: cannot move an unassigned ticket', false, 'moved');
exception when insufficient_privilege then insert into _r values ('other employee: cannot move an unassigned ticket', true, sqlerrm); end $$;
do $$ declare n int; begin
  update public.tickets set priority = 'high' where id = (select v from _ids where k='t');
  get diagnostics n = row_count;
  insert into _r values ('other employee: can still edit details', n = 1, n || ' rows');
end $$;

-- creator
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
do $$ declare r public.tickets; begin
  r := public.transition_ticket_status((select v from _ids where k='t'), 'in_progress');
  insert into _r values ('creator: can change status', r.status = 'in_progress', r.status::text);
end $$;
do $$ declare r public.tickets; begin
  r := public.transition_ticket_status((select v from _ids where k='u'), 'in_progress');
  insert into _r values ('creator: can move own unassigned ticket', r.status = 'in_progress', r.status::text);
end $$;

-- assignee
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
do $$ declare r public.tickets; begin
  r := public.transition_ticket_status((select v from _ids where k='t'), 'qa_deployed');
  insert into _r values ('assignee: can change status', r.status = 'qa_deployed', r.status::text);
end $$;

-- admin (neither creator nor assignee)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
do $$ declare r public.tickets; begin
  r := public.transition_ticket_status((select v from _ids where k='t'), 'in_progress');
  insert into _r values ('admin: can change any status', r.status = 'in_progress', r.status::text);
end $$;

-- reassigning away removes the old assignee's right
do $$ begin update public.tickets set assigned_to = null where id = (select v from _ids where k='t'); end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
do $$ begin
  perform public.transition_ticket_status((select v from _ids where k='t'), 'development');
  insert into _r values ('former assignee: blocked after unassign', false, 'moved');
exception when insufficient_privilege then insert into _r values ('former assignee: blocked after unassign', true, sqlerrm); end $$;

reset role;
select c as check_name, ok as passed, d as detail from _r;
rollback;
