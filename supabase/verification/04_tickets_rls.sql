-- Verification: tickets, numbering, aliases, attachments, activity log (Phase 4).
-- Runs inside a transaction that is rolled back. Returns one row per check.
begin;

create temp table _results (check_name text, passed boolean, detail text) on commit drop;
create temp table _ids (k text primary key, v uuid) on commit drop;
grant all on _results, _ids to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'v-admin@example.test', '{"role":"admin"}', '{"full_name":"V Admin"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'v-emp1@example.test', '{}', '{"full_name":"V Emp One"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'v-emp2@example.test', '{}', '{"full_name":"V Emp Two"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'v-gone@example.test', '{}', '{"full_name":"V Inactive"}', now(), now());
update public.profiles set is_active = false where id = '00000000-0000-4000-8000-0000000000e3';

-- Remember current sequence values so number checks are independent of existing data.
insert into _ids select 'seq_dev', null;
create temp table _seq on commit drop as select category, last_value from private.ticket_sequences;
grant all on _seq to authenticated;

-- Fixture applications (as admin)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
with a as (insert into public.applications (name) values ('V App Active') returning id) insert into _ids select 'app', id from a;
with a as (insert into public.applications (name, is_active) values ('V App Inactive', false) returning id) insert into _ids select 'app_off', id from a;

-- ---------------- Employee 1 creates tickets ----------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);

do $$ declare r public.tickets; begin
  insert into public.tickets (category, application_id, title, description, assigned_to)
  values ('development', (select v from _ids where k='app'), '  First ticket  ',
          '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello"},{"type":"text","text":"world"}]}]}',
          '00000000-0000-4000-8000-0000000000e2')
  returning * into r;
  insert into _ids values ('t1', r.id);
  insert into _results values
    ('create: number DEV-nnnn from sequence', r.ticket_number = 'DEV-' || lpad(((select last_value from _seq where category='development') + 1)::text, 4, '0'), r.ticket_number),
    ('create: created_by forced to caller', r.created_by = '00000000-0000-4000-8000-0000000000e1', r.created_by::text),
    ('create: status forced to development', r.status = 'development', r.status::text),
    ('create: title trimmed', r.title = 'First ticket', r.title),
    ('create: description_text derived from JSON', r.description_text = 'Hello world', coalesce(r.description_text, 'null'));
end $$;

do $$ declare r public.tickets; begin
  insert into public.tickets (category, title) values ('rnd', 'Research spike') returning * into r;
  insert into _ids values ('t_rnd', r.id);
  insert into _results values ('create: R&D without application allowed', r.ticket_number like 'RND-%', r.ticket_number);
end $$;

do $$ begin
  insert into public.tickets (category, title) values ('support', 'No app');
  insert into _results values ('create: Support without application rejected', false, 'insert succeeded');
exception when check_violation then
  insert into _results values ('create: Support without application rejected', true, sqlerrm);
end $$;

do $$ begin
  insert into public.tickets (category, application_id, title) values ('development', (select v from _ids where k='app_off'), 'Inactive app');
  insert into _results values ('create: inactive application rejected', false, 'insert succeeded');
exception when check_violation then
  insert into _results values ('create: inactive application rejected', true, sqlerrm);
end $$;

do $$ begin
  insert into public.tickets (category, title, assigned_to) values ('rnd', 'Bad assignee', '00000000-0000-4000-8000-0000000000e3');
  insert into _results values ('create: inactive assignee rejected', false, 'insert succeeded');
exception when check_violation then
  insert into _results values ('create: inactive assignee rejected', true, sqlerrm);
end $$;

do $$ begin
  insert into public.tickets (category, title, description) values ('rnd', 'Bad doc', '{"type":"paragraph"}');
  insert into _results values ('create: non-doc rich text rejected', false, 'insert succeeded');
exception when check_violation then
  insert into _results values ('create: non-doc rich text rejected', true, sqlerrm);
end $$;

do $$ begin
  insert into public.tickets (category, title, status) values ('rnd', 'Spoof status', 'prod_deployed');
  insert into _results values ('create: cannot set status column', false, 'insert succeeded');
exception when insufficient_privilege then
  insert into _results values ('create: cannot set status column', true, sqlerrm);
end $$;

do $$ begin
  update public.tickets set ticket_number = 'DEV-9999' where id = (select v from _ids where k='t1');
  insert into _results values ('update: cannot change ticket_number', false, 'update succeeded');
exception when insufficient_privilege then
  insert into _results values ('update: cannot change ticket_number', true, sqlerrm);
end $$;

do $$ begin
  update public.tickets set deleted_at = now() where id = (select v from _ids where k='t1');
  insert into _results values ('update: cannot set deleted_at directly', false, 'update succeeded');
exception when insufficient_privilege then
  insert into _results values ('update: cannot set deleted_at directly', true, sqlerrm);
end $$;

-- ---------------- Employee 2 edits (Q1: any active user may edit) ----------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
do $$ declare n int; begin
  update public.tickets set priority = 'high', title = 'First ticket (edited)' where id = (select v from _ids where k='t1');
  get diagnostics n = row_count;
  insert into _results values ('update: other employee can edit unlocked ticket', n = 1, n || ' rows');
end $$;

do $$ begin
  perform public.soft_delete_ticket((select v from _ids where k='t1'));
  insert into _results values ('delete: non-creator employee rejected', false, 'deleted');
exception when insufficient_privilege then
  insert into _results values ('delete: non-creator employee rejected', true, sqlerrm);
end $$;

-- Category change: DEV -> SUP keeps old number as alias
do $$ declare v_new text; v_old text; begin
  select ticket_number into v_old from public.tickets where id = (select v from _ids where k='t1');
  v_new := public.change_ticket_category((select v from _ids where k='t1'), 'support');
  insert into _results values
    ('category: renumbered in new category', v_new like 'SUP-%', v_old || ' -> ' || v_new),
    ('category: old number kept as alias', exists (select 1 from public.ticket_number_aliases where ticket_number = v_old and ticket_id = (select v from _ids where k='t1')), v_old);
end $$;

do $$ begin
  perform public.change_ticket_category((select v from _ids where k='t_rnd'), 'development');
  insert into _results values ('category: R&D -> Dev without application rejected', false, 'changed');
exception when check_violation then
  insert into _results values ('category: R&D -> Dev without application rejected', true, sqlerrm);
end $$;

-- Activity log written by triggers; not writable by users
insert into _results
select 'activity: created/priority/title/category logged',
       count(*) filter (where action in ('created','priority_changed','title_changed','category_changed')) >= 4,
       string_agg(action, ',' order by created_at)
from public.activity_logs where ticket_id = (select v from _ids where k='t1');

do $$ begin
  insert into public.activity_logs (entity_type, entity_id, action) values ('ticket', gen_random_uuid(), 'created');
  insert into _results values ('activity: users cannot insert', false, 'insert succeeded');
exception when insufficient_privilege then
  insert into _results values ('activity: users cannot insert', true, sqlerrm);
end $$;

do $$ begin
  delete from public.activity_logs;
  insert into _results values ('activity: users cannot delete', false, 'delete succeeded');
exception when insufficient_privilege then
  insert into _results values ('activity: users cannot delete', true, sqlerrm);
end $$;

-- Attachments: register requires an uploaded object owned by the caller
do $$ begin
  perform public.register_ticket_attachment((select v from _ids where k='t1'), (select v from _ids where k='t1')::text || '/missing.pdf', 'x.pdf');
  insert into _results values ('attachment: missing object rejected', false, 'registered');
exception when no_data_found then
  insert into _results values ('attachment: missing object rejected', true, sqlerrm);
end $$;

do $$ begin
  perform public.register_ticket_attachment((select v from _ids where k='t1'), (select v from _ids where k='t_rnd')::text || '/x.pdf', 'x.pdf');
  insert into _results values ('attachment: path for another ticket rejected', false, 'registered');
exception when invalid_parameter_value then
  insert into _results values ('attachment: path for another ticket rejected', true, sqlerrm);
end $$;

-- ---------------- Employee 1 (creator) soft deletes R&D ticket ----------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
do $$ begin
  perform public.soft_delete_ticket((select v from _ids where k='t_rnd'));
  insert into _results values ('delete: creator can soft delete', true, 'ok');
end $$;
insert into _results select 'delete: soft-deleted ticket hidden from employees', count(*) = 0, count(*)::text
from public.tickets where id = (select v from _ids where k='t_rnd');

-- ---------------- Production lock ----------------
reset role;
update public.tickets set status = 'prod_deployed' where id = (select v from _ids where k='t1');  -- simulates Phase 5 transition
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
do $$ declare n int; begin
  update public.tickets set title = 'Edit locked' where id = (select v from _ids where k='t1');
  get diagnostics n = row_count;
  insert into _results values ('lock: employee cannot edit Prod Deployed ticket', n = 0, n || ' rows');
end $$;
do $$ begin
  perform public.change_ticket_category((select v from _ids where k='t1'), 'development');
  insert into _results values ('lock: category change rejected', false, 'changed');
exception when insufficient_privilege then
  insert into _results values ('lock: category change rejected', true, sqlerrm);
end $$;

-- ---------------- Admin ----------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
do $$ declare n int; begin
  update public.tickets set title = 'Admin edit locked' where id = (select v from _ids where k='t1');
  get diagnostics n = row_count;
  insert into _results values ('lock: admin normal edit also blocked', n = 0, n || ' rows');
end $$;
do $$ begin
  perform public.soft_delete_ticket((select v from _ids where k='t1'));
  insert into _results values ('lock: admin cannot delete locked ticket', false, 'deleted');
exception when insufficient_privilege then
  insert into _results values ('lock: admin cannot delete locked ticket', true, sqlerrm);
end $$;
insert into _results select 'admin: sees soft-deleted ticket', count(*) = 1, count(*)::text
from public.tickets where id = (select v from _ids where k='t_rnd');
do $$ begin
  perform public.restore_ticket((select v from _ids where k='t_rnd'));
  insert into _results values ('admin: restore ticket', true, 'ok');
end $$;

-- ---------------- Anon ----------------
reset role;
set local role anon;
do $$ begin
  perform 1 from public.tickets;
  insert into _results values ('anon: cannot read tickets', false, 'select succeeded');
exception when insufficient_privilege then
  insert into _results values ('anon: cannot read tickets', true, sqlerrm);
end $$;

reset role;
select check_name, passed, detail from _results;
rollback;
