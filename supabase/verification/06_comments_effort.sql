-- Verification: comments, effort logs, own-effort rules, aggregates, lock (Phase 6).
-- Runs inside a transaction that is rolled back.
begin;

create temp table _results (check_name text, passed boolean, detail text) on commit drop;
create temp table _ids (k text primary key, v uuid) on commit drop;
grant all on _results, _ids to authenticated;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c-admin@example.test', '{"role":"admin"}', '{"full_name":"C Admin"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c-emp1@example.test', '{}', '{"full_name":"C Emp One"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c-emp2@example.test', '{}', '{"full_name":"C Emp Two"}', now(), now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
with t as (insert into public.tickets (category, title) values ('rnd', 'Effort test') returning id) insert into _ids select 't', id from t;

-- ---------------- Comments ----------------
do $$ declare r public.ticket_comments; begin
  insert into public.ticket_comments (ticket_id, content)
  values ((select v from _ids where k='t'), '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"First comment"}]}]}')
  returning * into r;
  insert into _ids values ('c1', r.id);
  insert into _results values
    ('comment: author forced to caller', r.user_id = '00000000-0000-4000-8000-0000000000e1', r.user_id::text),
    ('comment: plain text derived', r.content_text = 'First comment', coalesce(r.content_text, 'null'));
end $$;

do $$ begin
  insert into public.ticket_comments (ticket_id, content) values ((select v from _ids where k='t'), '{"type":"doc","content":[{"type":"paragraph"}]}');
  insert into _results values ('comment: empty comment rejected', false, 'inserted');
exception when check_violation then
  insert into _results values ('comment: empty comment rejected', true, sqlerrm);
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
do $$ declare n int; begin
  update public.ticket_comments set content = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"hijack"}]}]}' where id = (select v from _ids where k='c1');
  get diagnostics n = row_count;
  insert into _results values ('comment: other user cannot edit', n = 0, n || ' rows');
end $$;
do $$ begin
  perform public.soft_delete_comment((select v from _ids where k='c1'));
  insert into _results values ('comment: other employee cannot delete', false, 'deleted');
exception when insufficient_privilege then
  insert into _results values ('comment: other employee cannot delete', true, sqlerrm);
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
do $$ declare n int; begin
  update public.ticket_comments set content = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Edited comment"}]}]}' where id = (select v from _ids where k='c1');
  get diagnostics n = row_count;
  insert into _results values ('comment: author can edit', n = 1, n || ' rows');
end $$;

-- ---------------- Effort ----------------
do $$ declare r public.effort_logs; begin
  insert into public.effort_logs (ticket_id, effort_date, effort_value, effort_unit)
  values ((select v from _ids where k='t'), private.org_today(), 1.5, 'hours') returning * into r;
  insert into _ids values ('e1', r.id);
  insert into _results values ('effort: 1.5 hours = 90 minutes', r.effort_minutes = 90, r.effort_minutes::text),
    ('effort: user defaults to caller', r.user_id = '00000000-0000-4000-8000-0000000000e1', r.user_id::text);
end $$;

do $$ declare r public.effort_logs; begin
  insert into public.effort_logs (ticket_id, effort_date, effort_value, effort_unit)
  values ((select v from _ids where k='t'), private.org_today() - 1, 0.5, 'hours') returning * into r;
  insert into _results values ('effort: 0.5 hours = 30 minutes', r.effort_minutes = 30, r.effort_minutes::text);
end $$;

do $$ begin
  insert into public.effort_logs (ticket_id, effort_date, effort_value, effort_unit) values ((select v from _ids where k='t'), private.org_today(), 0, 'hours');
  insert into _results values ('effort: zero rejected', false, 'inserted');
exception when check_violation then insert into _results values ('effort: zero rejected', true, sqlerrm); end $$;

do $$ begin
  insert into public.effort_logs (ticket_id, effort_date, effort_value, effort_unit) values ((select v from _ids where k='t'), private.org_today(), -1, 'minutes');
  insert into _results values ('effort: negative rejected', false, 'inserted');
exception when check_violation then insert into _results values ('effort: negative rejected', true, sqlerrm); end $$;

do $$ begin
  insert into public.effort_logs (ticket_id, effort_date, effort_value, effort_unit) values ((select v from _ids where k='t'), private.org_today(), 12.5, 'minutes');
  insert into _results values ('effort: fractional minutes rejected', false, 'inserted');
exception when check_violation then insert into _results values ('effort: fractional minutes rejected', true, sqlerrm); end $$;

do $$ begin
  insert into public.effort_logs (ticket_id, effort_date, effort_value, effort_unit) values ((select v from _ids where k='t'), private.org_today(), 25, 'hours');
  insert into _results values ('effort: more than 24h in one entry rejected', false, 'inserted');
exception when check_violation then insert into _results values ('effort: more than 24h in one entry rejected', true, sqlerrm); end $$;

do $$ begin
  insert into public.effort_logs (ticket_id, effort_date, effort_value, effort_unit) values ((select v from _ids where k='t'), private.org_today() + 1, 1, 'hours');
  insert into _results values ('effort: future date rejected', false, 'inserted');
exception when check_violation then insert into _results values ('effort: future date rejected', true, sqlerrm); end $$;

do $$ begin
  insert into public.effort_logs (ticket_id, user_id, effort_date, effort_value, effort_unit)
  values ((select v from _ids where k='t'), '00000000-0000-4000-8000-0000000000e2', private.org_today(), 1, 'hours');
  insert into _results values ('effort: employee cannot log for someone else', false, 'inserted');
exception when insufficient_privilege then insert into _results values ('effort: employee cannot log for someone else', true, sqlerrm); end $$;

-- Employee 2: cannot see/modify Employee 1 entries; sees aggregate total
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
insert into _results select 'effort: others'' entries invisible', count(*) = 0, count(*)::text from public.effort_logs where ticket_id = (select v from _ids where k='t');
do $$ declare n int; begin
  update public.effort_logs set effort_value = 10 where id = (select v from _ids where k='e1');
  get diagnostics n = row_count;
  insert into _results values ('effort: cannot edit others'' entry', n = 0, n || ' rows');
end $$;
do $$ begin
  perform public.soft_delete_effort_log((select v from _ids where k='e1'));
  insert into _results values ('effort: cannot delete others'' entry', false, 'deleted');
exception when others then insert into _results values ('effort: cannot delete others'' entry', true, sqlerrm); end $$;
insert into _results select 'aggregate: ticket total visible to everyone (120 min)', total_minutes = 120, total_minutes::text
from public.get_ticket_effort_totals(array[(select v from _ids where k='t')]);
insert into _results select 'activity: others'' effort events hidden', count(*) = 0, count(*)::text
from public.activity_logs where ticket_id = (select v from _ids where k='t') and entity_type = 'effort_log';
insert into _results select 'summary: employee scope is self only', (s->>'scope') = 'user' and (s->>'total_minutes')::int = 0, s->>'total_minutes'
from (select public.get_effort_summary(private.org_today() - 7, private.org_today(), '00000000-0000-4000-8000-0000000000e1') s) x;

-- Employee 1: summary, edit own, update user_id blocked
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
insert into _results select 'summary: own total 120 min across 2 days', (s->>'total_minutes')::int = 120 and jsonb_array_length(s->'daily') = 2, s->>'total_minutes'
from (select public.get_effort_summary(private.org_today() - 7, private.org_today()) s) x;
do $$ declare n int; begin
  update public.effort_logs set effort_value = 2 where id = (select v from _ids where k='e1');
  get diagnostics n = row_count;
  insert into _results values ('effort: owner can edit (2h)', n = 1 and (select effort_minutes from public.effort_logs where id = (select v from _ids where k='e1')) = 120, n || ' rows');
end $$;
do $$ begin
  update public.effort_logs set user_id = '00000000-0000-4000-8000-0000000000e2' where id = (select v from _ids where k='e1');
  insert into _results values ('effort: user_id not updatable', false, 'updated');
exception when insufficient_privilege then insert into _results values ('effort: user_id not updatable', true, sqlerrm); end $$;
insert into _results select 'activity: own effort events visible', count(*) >= 2, count(*)::text
from public.activity_logs where ticket_id = (select v from _ids where k='t') and entity_type = 'effort_log';

-- Admin: sees all, logs for others, sees employee-wise summary
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
insert into _results select 'admin: sees all entries', count(*) = 2, count(*)::text from public.effort_logs where ticket_id = (select v from _ids where k='t');
do $$ declare r public.effort_logs; begin
  insert into public.effort_logs (ticket_id, user_id, effort_date, effort_value, effort_unit)
  values ((select v from _ids where k='t'), '00000000-0000-4000-8000-0000000000e2', private.org_today(), 45, 'minutes') returning * into r;
  insert into _results values ('admin: can log for an employee (Q14)', r.user_id = '00000000-0000-4000-8000-0000000000e2' and r.effort_minutes = 45, r.effort_minutes::text);
end $$;
insert into _results select 'summary: admin sees employee-wise breakdown', (s->>'scope') = 'all' and (select count(*) from jsonb_array_elements(s->'by_employee') e where e->>'user_id' in ('00000000-0000-4000-8000-0000000000e1','00000000-0000-4000-8000-0000000000e2')) = 2, jsonb_array_length(s->'by_employee')::text || ' rows (fixtures counted only; real data may exist)'
from (select public.get_effort_summary(private.org_today() - 7, private.org_today()) s) x;
do $$ begin
  perform public.soft_delete_effort_log((select v from _ids where k='e1'));
  insert into _results values ('admin: can delete any entry', true, 'ok');
end $$;
insert into _results select 'aggregate: deleted entries excluded (30+45=75)', total_minutes = 75, total_minutes::text
from public.get_ticket_effort_totals(array[(select v from _ids where k='t')]);

-- Production lock blocks comments and effort
do $$ begin
  perform public.transition_ticket_status((select v from _ids where k='t'), 'qa_deployed');
  perform public.transition_ticket_status((select v from _ids where k='t'), 'prod_deployed');
end $$;
do $$ begin
  insert into public.ticket_comments (ticket_id, content) values ((select v from _ids where k='t'), '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"late"}]}]}');
  insert into _results values ('lock: no comments on locked ticket', false, 'inserted');
exception when insufficient_privilege then insert into _results values ('lock: no comments on locked ticket', true, sqlerrm); end $$;
do $$ begin
  insert into public.effort_logs (ticket_id, effort_date, effort_value, effort_unit) values ((select v from _ids where k='t'), private.org_today(), 1, 'hours');
  insert into _results values ('lock: no effort on locked ticket (even admin)', false, 'inserted');
exception when insufficient_privilege then insert into _results values ('lock: no effort on locked ticket (even admin)', true, sqlerrm); end $$;
do $$ begin
  perform public.soft_delete_comment((select v from _ids where k='c1'));
  insert into _results values ('lock: comments cannot be deleted when locked', false, 'deleted');
exception when insufficient_privilege then insert into _results values ('lock: comments cannot be deleted when locked', true, sqlerrm); end $$;

reset role;
select check_name, passed, detail from _results;
rollback;
