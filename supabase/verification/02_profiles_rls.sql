-- Verification: profiles RLS, grants and auth trigger (Phase 2).
-- Runs entirely inside a transaction that is rolled back. Returns one row per check.
begin;

create temp table _results (check_name text, passed boolean, detail text) on commit drop;
grant all on _results to authenticated, anon;

-- Fixture users (trigger creates profiles). Role comes from app_metadata only.
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'verify-admin@example.test', '{"role":"admin"}', '{"full_name":"Verify Admin"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'verify-emp@example.test', '{}', '{"full_name":"Verify Employee","role":"admin"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'verify-inactive@example.test', '{}', '{"full_name":"Verify Inactive"}', now(), now());
update public.profiles set is_active = false where id = '00000000-0000-4000-8000-0000000000e2';

insert into _results
select 'trigger: legacy app_metadata role=admin maps to {admin,employee}', roles = '{admin,employee}', roles::text
from public.profiles where id = '00000000-0000-4000-8000-0000000000a1';
insert into _results
select 'trigger: user_metadata role is ignored', roles = '{employee}', roles::text
from public.profiles where id = '00000000-0000-4000-8000-0000000000e1';

-- ---------------- As the employee ----------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);

insert into _results select 'employee: can read profiles', count(*) >= 3, count(*)::text from public.profiles;

do $$ begin
  update public.profiles set roles = '{admin}' where id = '00000000-0000-4000-8000-0000000000e1';
  insert into _results values ('employee: cannot change own role', false, 'update succeeded');
exception when insufficient_privilege then
  insert into _results values ('employee: cannot change own role', true, sqlerrm);
end $$;

do $$ begin
  update public.profiles set is_active = true where id = '00000000-0000-4000-8000-0000000000e2';
  insert into _results values ('employee: cannot change is_active', false, 'update succeeded');
exception when insufficient_privilege then
  insert into _results values ('employee: cannot change is_active', true, sqlerrm);
end $$;

do $$ declare n int; begin
  update public.profiles set full_name = 'Hacked' where id = '00000000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count;
  insert into _results values ('employee: cannot rename another user', n = 0, n || ' rows');
end $$;

do $$ declare n int; begin
  update public.profiles set full_name = 'Renamed Employee' where id = '00000000-0000-4000-8000-0000000000e1';
  get diagnostics n = row_count;
  insert into _results values ('employee: can rename self', n = 1, n || ' rows');
end $$;

do $$ begin
  delete from public.profiles where id = '00000000-0000-4000-8000-0000000000e1';
  insert into _results values ('employee: cannot delete profiles', false, 'delete succeeded');
exception when insufficient_privilege then
  insert into _results values ('employee: cannot delete profiles', true, sqlerrm);
end $$;

do $$ begin
  insert into public.profiles (id, full_name, email) values (gen_random_uuid(), 'x', 'x@example.test');
  insert into _results values ('employee: cannot insert profiles', false, 'insert succeeded');
exception when insufficient_privilege then
  insert into _results values ('employee: cannot insert profiles', true, sqlerrm);
end $$;

-- ---------------- As the inactive user ----------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
insert into _results select 'inactive: sees no profiles', count(*) = 0, count(*)::text from public.profiles;
do $$ declare n int; begin
  update public.profiles set full_name = 'Still here' where id = '00000000-0000-4000-8000-0000000000e2';
  get diagnostics n = row_count;
  insert into _results values ('inactive: cannot update self', n = 0, n || ' rows');
end $$;

-- ---------------- As the admin ----------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
do $$ begin
  update public.profiles set roles = '{employee}' where id = '00000000-0000-4000-8000-0000000000e1';
  insert into _results values ('admin: role changes only via Edge Function', false, 'update succeeded');
exception when insufficient_privilege then
  insert into _results values ('admin: role changes only via Edge Function', true, sqlerrm);
end $$;

-- ---------------- As anon ----------------
reset role;
set local role anon;
do $$ begin
  perform 1 from public.profiles;
  insert into _results values ('anon: cannot read profiles', false, 'select succeeded');
exception when insufficient_privilege then
  insert into _results values ('anon: cannot read profiles', true, sqlerrm);
end $$;

reset role;
select check_name, passed, detail from _results;
rollback;
