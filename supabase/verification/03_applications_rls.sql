-- Verification: applications RLS, grants and archive/restore RPCs (Phase 3).
-- Runs inside a transaction that is rolled back. Returns one row per check.
begin;

create temp table _results (check_name text, passed boolean, detail text) on commit drop;
grant all on _results to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'verify-admin@example.test', '{"role":"admin"}', '{"full_name":"Verify Admin"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'verify-emp@example.test', '{}', '{"full_name":"Verify Employee"}', now(), now());

-- ---------------- Admin ----------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

do $$ declare v uuid; begin
  insert into public.applications (name, description, icon_key) values ('  Verify App  ', 'desc', 'database') returning id into v;
  insert into _results select 'admin: create (name trimmed, created_by = caller)',
    name = 'Verify App' and created_by = '00000000-0000-4000-8000-0000000000a1', name || ' / ' || created_by
  from public.applications where id = v;
end $$;

do $$ begin
  insert into public.applications (name) values ('verify app');
  insert into _results values ('admin: duplicate name (case-insensitive) rejected', false, 'insert succeeded');
exception when unique_violation then
  insert into _results values ('admin: duplicate name (case-insensitive) rejected', true, sqlerrm);
end $$;

do $$ begin
  insert into public.applications (name, icon_key) values ('Bad Icon', '<script>');
  insert into _results values ('admin: invalid icon_key rejected', false, 'insert succeeded');
exception when check_violation then
  insert into _results values ('admin: invalid icon_key rejected', true, sqlerrm);
end $$;

do $$ begin
  update public.applications set deleted_at = now() where name = 'Verify App';
  insert into _results values ('admin: cannot set deleted_at directly', false, 'update succeeded');
exception when insufficient_privilege then
  insert into _results values ('admin: cannot set deleted_at directly', true, sqlerrm);
end $$;

do $$ declare n int; begin
  update public.applications set is_active = false where name = 'Verify App';
  get diagnostics n = row_count;
  insert into _results values ('admin: deactivate', n = 1, n || ' rows');
end $$;

-- ---------------- Employee ----------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);

insert into _results select 'employee: can read applications', count(*) >= 1, count(*)::text from public.applications;

do $$ begin
  insert into public.applications (name) values ('Employee App');
  insert into _results values ('employee: cannot create', false, 'insert succeeded');
exception when insufficient_privilege then
  insert into _results values ('employee: cannot create', true, sqlerrm);
end $$;

do $$ declare n int; begin
  update public.applications set name = 'Hijacked' where name = 'Verify App';
  get diagnostics n = row_count;
  insert into _results values ('employee: cannot update', n = 0, n || ' rows');
end $$;

do $$ begin
  perform public.archive_application((select id from public.applications where name = 'Verify App'));
  insert into _results values ('employee: cannot archive', false, 'archive succeeded');
exception when insufficient_privilege then
  insert into _results values ('employee: cannot archive', true, sqlerrm);
end $$;

do $$ begin
  delete from public.applications where name = 'Verify App';
  insert into _results values ('employee: cannot delete', false, 'delete succeeded');
exception when insufficient_privilege then
  insert into _results values ('employee: cannot delete', true, sqlerrm);
end $$;

-- ---------------- Admin: archive / restore ----------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

do $$ declare v uuid; begin
  select id into v from public.applications where name = 'Verify App';
  perform public.archive_application(v);
  insert into _results select 'admin: archive sets deleted_at/deleted_by',
    deleted_at is not null and deleted_by = '00000000-0000-4000-8000-0000000000a1', coalesce(deleted_at::text, 'null')
  from public.applications where id = v;
end $$;

do $$ declare n int; begin
  update public.applications set description = 'edit archived' where name = 'Verify App';
  get diagnostics n = row_count;
  insert into _results values ('admin: archived app is read-only', n = 0, n || ' rows');
end $$;

do $$ declare v uuid; begin
  insert into public.applications (name) values ('Verify App') returning id into v;
  insert into _results values ('admin: archived name can be reused', true, v::text);
end $$;

do $$ begin
  perform public.restore_application((select id from public.applications where name = 'Verify App' and deleted_at is not null));
  insert into _results values ('admin: restore blocked by name clash', false, 'restore succeeded');
exception when unique_violation then
  insert into _results values ('admin: restore blocked by name clash', true, sqlerrm);
end $$;

-- Employee still sees archived app (historical references)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
insert into _results select 'employee: archived app still readable', count(*) = 1, count(*)::text
from public.applications where name = 'Verify App' and deleted_at is not null;

-- ---------------- Anon ----------------
reset role;
set local role anon;
do $$ begin
  perform 1 from public.applications;
  insert into _results values ('anon: cannot read', false, 'select succeeded');
exception when insufficient_privilege then
  insert into _results values ('anon: cannot read', true, sqlerrm);
end $$;

reset role;
select check_name, passed, detail from _results;
rollback;
