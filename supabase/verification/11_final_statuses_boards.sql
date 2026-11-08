-- Verification: Completed / Dropped statuses and monthly boards (Phase 11).
-- Runs inside a transaction that is rolled back. Returns one row per check.
begin;

create temp table _results (check_name text, passed boolean, detail text) on commit drop;
create temp table _ids (k text primary key, v uuid) on commit drop;
grant all on _results, _ids to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b-admin@example.test', '{"roles":["admin","employee"]}', '{"full_name":"B Admin"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b-emp@example.test', '{"roles":["employee"]}', '{"full_name":"B Emp"}', now(), now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);

with t as (insert into public.tickets (category, title) values ('rnd', 'Doc task') returning id) insert into _ids select 'doc', id from t;
with t as (insert into public.tickets (category, title) values ('rnd', 'Cancelled task') returning id) insert into _ids select 'drop', id from t;
with t as (insert into public.tickets (category, title) values ('rnd', 'Dropped silently') returning id) insert into _ids select 'drop2', id from t;
with t as (insert into public.tickets (category, title, board_month) values ('rnd', 'Planned for later', '2027-01-17') returning id) insert into _ids select 'later', id from t;

-- ---------------- board defaults
insert into _results select 'board: new ticket defaults to current IST month',
  board_month = date_trunc('month', private.org_today())::date, board_month::text
from public.tickets where id = (select v from _ids where k='doc');
insert into _results select 'board: explicit board normalised to first of month', board_month = '2027-01-01', board_month::text
from public.tickets where id = (select v from _ids where k='later');

-- ---------------- Completed
do $$ begin
  perform public.transition_ticket_status((select v from _ids where k='doc'), 'completed');
  insert into _results values ('completed: rejected from Development', false, 'moved');
exception when check_violation then insert into _results values ('completed: rejected from Development', true, sqlerrm); end $$;

do $$ declare r public.tickets; begin
  perform public.transition_ticket_status((select v from _ids where k='doc'), 'in_progress');
  r := public.transition_ticket_status((select v from _ids where k='doc'), 'completed');
  insert into _results values ('completed: from In Progress sets completed_on', r.status = 'completed' and r.completed_on is not null, r.status::text);
end $$;

do $$ begin
  perform public.transition_ticket_status((select v from _ids where k='doc'), 'in_progress', 'not a drop');
  insert into _results values ('completed: locked (no transition out)', false, 'moved');
exception when insufficient_privilege then insert into _results values ('completed: locked (no transition out)', true, sqlerrm); end $$;

do $$ declare n int; begin
  update public.tickets set title = 'edit after complete' where id = (select v from _ids where k='doc');
  get diagnostics n = row_count;
  insert into _results values ('completed: details read-only', n = 0, n || ' rows');
end $$;

do $$ begin
  insert into public.ticket_comments (ticket_id, content) values ((select v from _ids where k='doc'), '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"late"}]}]}');
  insert into _results values ('completed: no comments', false, 'inserted');
exception when insufficient_privilege then insert into _results values ('completed: no comments', true, sqlerrm); end $$;

do $$ begin
  insert into public.effort_logs (ticket_id, effort_date, effort_value, effort_unit) values ((select v from _ids where k='doc'), private.org_today(), 1, 'hours');
  insert into _results values ('completed: no effort', false, 'inserted');
exception when insufficient_privilege then insert into _results values ('completed: no effort', true, sqlerrm); end $$;

-- ---------------- Dropped
do $$ begin
  perform public.transition_ticket_status((select v from _ids where k='drop'), 'in_progress', 'reason on a non-drop');
  insert into _results values ('dropped: reason only allowed when dropping', false, 'moved');
exception when invalid_parameter_value then insert into _results values ('dropped: reason only allowed when dropping', true, sqlerrm); end $$;

do $$ begin
  perform public.transition_ticket_status((select v from _ids where k='drop'), 'dropped', repeat('x', 501));
  insert into _results values ('dropped: reason over 500 chars rejected', false, 'moved');
exception when invalid_parameter_value then insert into _results values ('dropped: reason over 500 chars rejected', true, sqlerrm); end $$;

do $$ declare r public.tickets; begin
  r := public.transition_ticket_status((select v from _ids where k='drop'), 'dropped', '  Client withdrew the request  ');
  insert into _results values ('dropped: from Development with trimmed reason',
    r.status = 'dropped' and r.dropped_on is not null and r.drop_reason = 'Client withdrew the request', coalesce(r.drop_reason, 'null'));
end $$;

do $$ declare r public.tickets; begin
  r := public.transition_ticket_status((select v from _ids where k='drop2'), 'dropped', '   ');
  insert into _results values ('dropped: reason optional (blank -> null)', r.status = 'dropped' and r.drop_reason is null, coalesce(r.drop_reason, 'null'));
end $$;

insert into _results select 'dropped: reason recorded in activity', count(*) = 1, count(*)::text
from public.activity_logs where ticket_id = (select v from _ids where k='drop') and action = 'status_changed' and metadata->>'reason' = 'Client withdrew the request';

do $$ begin
  perform public.soft_delete_ticket((select v from _ids where k='drop'));
  insert into _results values ('dropped: cannot be soft-deleted (locked)', false, 'deleted');
exception when insufficient_privilege then insert into _results values ('dropped: cannot be soft-deleted (locked)', true, sqlerrm); end $$;

-- ---------------- Board moves
do $$ declare n int; begin
  update public.tickets set board_month = '2026-12-01' where id = (select v from _ids where k='later');
  get diagnostics n = row_count;
  insert into _results values ('board: employee can move an open ticket', n = 1, n || ' rows');
end $$;

insert into _results select 'board: move audited as board_changed', count(*) = 1, max(metadata::text)
from public.activity_logs where ticket_id = (select v from _ids where k='later') and action = 'board_changed'
  and metadata->>'from' = '2027-01-01' and metadata->>'to' = '2026-12-01';

do $$ begin
  update public.tickets set board_month = '2026-12-15' where id = (select v from _ids where k='later');
  insert into _results select 'board: mid-month value normalised on update', board_month = '2026-12-01', board_month::text
  from public.tickets where id = (select v from _ids where k='later');
end $$;

do $$ declare n int; begin
  update public.tickets set board_month = '2026-12-01' where id = (select v from _ids where k='doc');
  get diagnostics n = row_count;
  insert into _results values ('board: finished ticket cannot move', n = 0, n || ' rows');
end $$;

-- ---------------- Admin correction can reopen
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
do $$ declare r public.tickets; begin
  r := public.admin_correct_ticket((select v from _ids where k='drop'), '{"status":"development","board_month":"2027-02-01"}', 'Client re-opened the request');
  insert into _results values ('correction: admin reopens a dropped ticket and moves board',
    r.status = 'development' and r.board_month = '2027-02-01', r.status::text || ' / ' || r.board_month);
end $$;
insert into _results select 'correction: board change logged in the correction diff (no duplicate board_changed)',
  (select count(*) from public.activity_logs where ticket_id = (select v from _ids where k='drop') and action = 'board_changed') = 0
  and exists (select 1 from public.activity_logs where ticket_id = (select v from _ids where k='drop') and action = 'admin_correction' and metadata->'changes' ? 'board_month'),
  'ok';

-- ---------------- Dashboard
insert into _results select 'dashboard: completed and dropped counted',
  (s->'tickets'->'by_status'->>'completed')::int >= 1 and (s->'tickets'->'by_status'->>'dropped')::int >= 1, (s->'tickets'->'by_status')::text
from (select public.get_dashboard_stats(private.org_today(), private.org_today()) s) x;

reset role;
select check_name, passed, detail from _results;
rollback;
