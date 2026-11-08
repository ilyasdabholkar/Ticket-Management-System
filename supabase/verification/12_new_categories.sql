-- Verification: Analysis / Issue / Bug Fix categories (2026-11-08).
-- Rolled back. Requires an active application named 'CTS' (any active application works: change the name below).
begin;
create temp table _r (c text, ok boolean, d text) on commit drop;
grant all on _r to authenticated;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000000e9', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cat@example.test', '{"roles":["employee"]}', '{"full_name":"Cat"}', now(), now());
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e9","role":"authenticated"}', true);

do $$ declare app uuid := (select id from public.applications where name = 'CTS'); r text; c text; begin
  foreach c in array array['analysis','issue','bug_fix'] loop
    begin
      insert into public.tickets (category, title) values (c::public.ticket_category, 'no app');
      insert into _r values (c || ': rejected without application', false, 'inserted');
    exception when check_violation then insert into _r values (c || ': rejected without application', true, sqlerrm); end;
    insert into public.tickets (category, application_id, title) values (c::public.ticket_category, app, 'with app') returning ticket_number into r;
    insert into _r values (c || ': numbered with its prefix', r ~ '^(ANL|ISS|BUG)-\d{4}$', r);
  end loop;
  insert into public.tickets (category, title) values ('rnd', 'rnd still optional') returning ticket_number into r;
  insert into _r values ('rnd: still no application needed', r like 'RND-%', r);
  r := public.change_ticket_category((select id from public.tickets where ticket_number = r), 'issue', app);
  insert into _r values ('change category rnd -> issue renumbers', r like 'ISS-%', r);
end $$;

insert into _r select 'dashboard: new category counts present',
  (s->'tickets') ?& array['analysis','issue','bug_fix'], (s->'tickets')::text
from (select public.get_dashboard_stats(private.org_today(), private.org_today()) s) x;

reset role;
select c as check_name, ok as passed, d as detail from _r;
rollback;
