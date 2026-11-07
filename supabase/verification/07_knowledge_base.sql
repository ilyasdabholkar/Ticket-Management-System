-- Verification: knowledge base permissions, search vector, search RPC, attachments (Phase 7).
-- Runs inside a transaction that is rolled back.
begin;

create temp table _results (check_name text, passed boolean, detail text) on commit drop;
create temp table _ids (k text primary key, v uuid) on commit drop;
grant all on _results, _ids to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'k-admin@example.test', '{"role":"admin"}', '{"full_name":"K Admin"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'k-emp@example.test', '{}', '{"full_name":"K Emp"}', now(), now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
with a as (insert into public.applications (name) values ('KB Verify App') returning id) insert into _ids select 'app', id from a;
with a as (insert into public.applications (name) values ('KB Archived App') returning id) insert into _ids select 'app_arch', id from a;
select public.archive_application((select v from _ids where k='app_arch'));

do $$ declare r public.knowledge_base; begin
  insert into public.knowledge_base (application_id, title, description, content, category)
  values ((select v from _ids where k='app'), '  Reset customer password  ', 'Steps for support staff',
          '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Run the reconciliation script nightly"}]}]}', 'troubleshooting')
  returning * into r;
  insert into _ids values ('kb1', r.id);
  insert into _results values
    ('kb: admin create; title trimmed; creator forced', r.title = 'Reset customer password' and r.created_by = '00000000-0000-4000-8000-0000000000a1', r.title),
    ('kb: note text derived', r.content_text = 'Run the reconciliation script nightly', coalesce(r.content_text, 'null')),
    ('kb: search vector populated', r.search_content is not null and r.search_content @@ websearch_to_tsquery('english', 'reconciliation'), 'ok');
end $$;

do $$ begin
  insert into public.knowledge_base (application_id, title) values ((select v from _ids where k='app_arch'), 'On archived app');
  insert into _results values ('kb: archived application rejected', false, 'inserted');
exception when check_violation then insert into _results values ('kb: archived application rejected', true, sqlerrm); end $$;

-- Search: title outranks body; filters; snippet uses markers (no HTML)
insert into public.knowledge_base (application_id, title, description, category, document_type)
values ((select v from _ids where k='app'), 'API rate limits', 'Mentions password once', 'api_documentation', 'note');

insert into _results select 'search: title match ranks first', (array_agg(title order by rank desc))[1] = 'Reset customer password', string_agg(title, ' > ' order by rank desc)
from public.search_knowledge_base('password');
insert into _results select 'search: category filter', count(*) = 1, count(*)::text
from public.search_knowledge_base('password', null, 'api_documentation');
insert into _results select 'search: snippet highlights with markers, no HTML', bool_and(position(chr(57344) in snippet) > 0 and position('<b>' in snippet) = 0), max(snippet)
from public.search_knowledge_base('reconciliation');
insert into _results select 'search: websearch syntax (quoted phrase)', count(*) = 1, count(*)::text
from public.search_knowledge_base('"reconciliation script"');

-- Search vector refresh when extracted text arrives (simulates the Edge Function)
reset role;
insert into storage.objects (bucket_id, name, owner_id, metadata)
values ('knowledge-base', (select v from _ids where k='app')::text || '/' || (select v from _ids where k='kb1')::text || '/doc.txt',
        '00000000-0000-4000-8000-0000000000a1', '{"size": 120, "mimetype": "text/plain"}');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
do $$ declare v_att uuid; begin
  v_att := public.register_kb_attachment((select v from _ids where k='kb1'),
         (select v from _ids where k='app')::text || '/' || (select v from _ids where k='kb1')::text || '/doc.txt', 'runbook.txt');
  insert into _ids values ('att', v_att);
  insert into _results select 'attachment: registered pending with storage size', extraction_status = 'pending' and size_bytes = 120, extraction_status::text
  from public.knowledge_attachments where id = v_att;
end $$;
reset role;
update public.knowledge_attachments set extraction_status = 'completed', extracted_text = 'Contains the word zebracorn for search'
where id = (select v from _ids where k='att');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
insert into _results select 'search: extracted document text is searchable', count(*) = 1, count(*)::text
from public.search_knowledge_base('zebracorn');

-- Employee: read and search yes; write no
insert into _results select 'employee: can read KB', count(*) >= 2, count(*)::text from public.knowledge_base;
do $$ begin
  insert into public.knowledge_base (application_id, title) values ((select v from _ids where k='app'), 'Employee note');
  insert into _results values ('employee: cannot create', false, 'inserted');
exception when insufficient_privilege then insert into _results values ('employee: cannot create', true, sqlerrm); end $$;
do $$ declare n int; begin
  update public.knowledge_base set title = 'Hijacked' where id = (select v from _ids where k='kb1');
  get diagnostics n = row_count;
  insert into _results values ('employee: cannot update', n = 0, n || ' rows');
end $$;
do $$ begin
  perform public.soft_delete_knowledge_base((select v from _ids where k='kb1'));
  insert into _results values ('employee: cannot delete', false, 'deleted');
exception when insufficient_privilege then insert into _results values ('employee: cannot delete', true, sqlerrm); end $$;
do $$ begin
  perform public.remove_kb_attachment((select v from _ids where k='att'));
  insert into _results values ('employee: cannot remove attachment', false, 'removed');
exception when insufficient_privilege then insert into _results values ('employee: cannot remove attachment', true, sqlerrm); end $$;
do $$ begin
  update public.knowledge_attachments set extracted_text = 'tampered' where id = (select v from _ids where k='att');
  insert into _results values ('employee: cannot write extracted text', false, 'updated');
exception when insufficient_privilege then insert into _results values ('employee: cannot write extracted text', true, sqlerrm); end $$;

-- Admin soft delete hides from employees and search
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select public.soft_delete_knowledge_base((select v from _ids where k='kb1'));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
insert into _results select 'delete: hidden from employees', count(*) = 0, count(*)::text from public.knowledge_base where id = (select v from _ids where k='kb1');
insert into _results select 'delete: excluded from search', count(*) = 0, count(*)::text from public.search_knowledge_base('zebracorn');

reset role;
set local role anon;
do $$ begin
  perform public.search_knowledge_base('password');
  insert into _results values ('anon: cannot search', false, 'searched');
exception when insufficient_privilege then insert into _results values ('anon: cannot search', true, sqlerrm); end $$;

reset role;
select check_name, passed, detail from _results;
rollback;
