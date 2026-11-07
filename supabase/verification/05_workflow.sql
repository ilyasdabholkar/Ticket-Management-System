-- Verification: status transitions, history, lifecycle timestamps, lock, admin correction (Phase 5).
-- Runs inside a transaction that is rolled back.
begin;

create temp table _results (check_name text, passed boolean, detail text) on commit drop;
create temp table _ids (k text primary key, v uuid) on commit drop;
grant all on _results, _ids to authenticated;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'w-admin@example.test', '{"role":"admin"}', '{"full_name":"W Admin"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'w-emp@example.test', '{}', '{"full_name":"W Emp"}', now(), now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);

with t as (insert into public.tickets (category, title) values ('rnd', 'Workflow test') returning id)
insert into _ids select 't', id from t;

insert into _results select 'history: initial row on create', count(*) = 1 and bool_and(from_status is null and to_status = 'development'), count(*)::text
from public.ticket_status_history where ticket_id = (select v from _ids where k='t');

do $$ begin
  update public.tickets set status = 'in_progress' where id = (select v from _ids where k='t');
  insert into _results values ('status: direct UPDATE not allowed', false, 'updated');
exception when insufficient_privilege then
  insert into _results values ('status: direct UPDATE not allowed', true, sqlerrm);
end $$;

do $$ begin
  perform public.transition_ticket_status((select v from _ids where k='t'), 'prod_deployed');
  insert into _results values ('transition: Development -> Prod rejected', false, 'moved');
exception when check_violation then
  insert into _results values ('transition: Development -> Prod rejected', true, sqlerrm);
end $$;

-- development -> in_progress -> development -> in_progress : started_on keeps the first value
do $$ declare r public.tickets; v_first timestamptz; begin
  r := public.transition_ticket_status((select v from _ids where k='t'), 'in_progress');
  v_first := r.started_on;
  perform pg_sleep(0.01);
  perform public.transition_ticket_status((select v from _ids where k='t'), 'development');
  r := public.transition_ticket_status((select v from _ids where k='t'), 'in_progress');
  insert into _results values
    ('lifecycle: started_on set on first In Progress', v_first is not null, coalesce(v_first::text, 'null')),
    ('lifecycle: started_on not overwritten on re-entry', r.started_on = v_first, r.started_on::text);
end $$;

-- backwards QA -> In Progress allowed; then QA -> Prod
do $$ declare r public.tickets; begin
  perform public.transition_ticket_status((select v from _ids where k='t'), 'qa_deployed');
  perform public.transition_ticket_status((select v from _ids where k='t'), 'in_progress');
  perform public.transition_ticket_status((select v from _ids where k='t'), 'qa_deployed');
  r := public.transition_ticket_status((select v from _ids where k='t'), 'prod_deployed');
  insert into _results values
    ('transition: QA -> In Progress -> QA -> Prod', r.status = 'prod_deployed', r.status::text),
    ('lifecycle: qa_deployed_on and prod_deployed_on set', r.qa_deployed_on is not null and r.prod_deployed_on is not null, 'ok');
end $$;

insert into _results select 'history: every transition recorded', count(*) = 8, count(*)::text
from public.ticket_status_history where ticket_id = (select v from _ids where k='t');
insert into _results select 'activity: status_changed logged', count(*) = 7, count(*)::text
from public.activity_logs where ticket_id = (select v from _ids where k='t') and action = 'status_changed';

do $$ begin
  perform public.transition_ticket_status((select v from _ids where k='t'), 'qa_deployed');
  insert into _results values ('lock: no transition out of Prod', false, 'moved');
exception when insufficient_privilege then
  insert into _results values ('lock: no transition out of Prod', true, sqlerrm);
end $$;

do $$ begin
  perform public.admin_correct_ticket((select v from _ids where k='t'), '{"title":"x"}', 'Employee tries to correct');
  insert into _results values ('correction: employee rejected', false, 'corrected');
exception when insufficient_privilege then
  insert into _results values ('correction: employee rejected', true, sqlerrm);
end $$;

do $$ begin
  insert into public.ticket_status_history (ticket_id, to_status) values ((select v from _ids where k='t'), 'development');
  insert into _results values ('history: users cannot insert', false, 'inserted');
exception when insufficient_privilege then
  insert into _results values ('history: users cannot insert', true, sqlerrm);
end $$;

-- ---------------- Admin correction ----------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

do $$ begin
  perform public.admin_correct_ticket((select v from _ids where k='t'), '{"title":"Fixed"}', 'short');
  insert into _results values ('correction: short reason rejected', false, 'corrected');
exception when invalid_parameter_value then
  insert into _results values ('correction: short reason rejected', true, sqlerrm);
end $$;

do $$ begin
  perform public.admin_correct_ticket((select v from _ids where k='t'), '{"ticket_number":"X-1"}', 'Trying a forbidden field');
  insert into _results values ('correction: forbidden field rejected', false, 'corrected');
exception when invalid_parameter_value then
  insert into _results values ('correction: forbidden field rejected', true, sqlerrm);
end $$;

do $$ declare r public.tickets; v_prod timestamptz; begin
  select prod_deployed_on into v_prod from public.tickets where id = (select v from _ids where k='t');
  r := public.admin_correct_ticket((select v from _ids where k='t'), '{"title":"Workflow test (corrected)","priority":"high"}', 'Typo fixed after deployment');
  insert into _results values
    ('correction: locked ticket fields corrected', r.title = 'Workflow test (corrected)' and r.priority = 'high', r.title),
    ('correction: still locked afterwards', r.status = 'prod_deployed' and r.prod_deployed_on = v_prod, r.status::text);
end $$;

insert into _results select 'correction: single audited activity entry with reason',
  count(*) = 1 and bool_and(metadata->>'reason' = 'Typo fixed after deployment' and metadata->'changes' ? 'title'), count(*)::text
from public.activity_logs where ticket_id = (select v from _ids where k='t') and action = 'admin_correction';
insert into _results select 'correction: no duplicate generic log entries', count(*) = 0, count(*)::text
from public.activity_logs where ticket_id = (select v from _ids where k='t') and action in ('title_changed','priority_changed');

do $$ declare r public.tickets; begin
  r := public.admin_correct_ticket((select v from _ids where k='t'), '{"status":"qa_deployed","prod_deployed_on":null}', 'Deployed by mistake, rolled back');
  insert into _results values ('correction: status reverted out of Prod', r.status = 'qa_deployed' and r.prod_deployed_on is null, r.status::text);
end $$;
insert into _results select 'correction: history row flagged with reason', count(*) = 1, count(*)::text
from public.ticket_status_history where ticket_id = (select v from _ids where k='t') and is_correction and correction_reason = 'Deployed by mistake, rolled back';

insert into _results select 'correction: bypass flag reset after the RPC', coalesce(current_setting('app.admin_correction', true), '') <> 'on', coalesce(current_setting('app.admin_correction', true), '(unset)');

reset role;
select check_name, passed, detail from _results;
rollback;
