-- Phase 7: application knowledge base (notes + documents), full-text search, document storage.

create type public.kb_document_type as enum ('note', 'document');
create type public.kb_category as enum (
  'requirements', 'technical_documentation', 'database_queries', 'api_documentation',
  'release_notes', 'kt_documents', 'sample_io', 'troubleshooting', 'general_notes'
);
create type public.extraction_status as enum ('pending', 'completed', 'failed', 'not_supported');

-- Activity log may record knowledge base events (admin audit).
alter table public.activity_logs drop constraint activity_logs_entity_type_check;
alter table public.activity_logs add constraint activity_logs_entity_type_check
  check (entity_type in ('ticket','attachment','comment','effort_log','application','user','settings','knowledge_base','knowledge_attachment'));

-- ===========================================================================
-- knowledge_base
-- ===========================================================================
create table public.knowledge_base (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.applications (id),
  title           text not null check (char_length(btrim(title)) between 1 and 255),
  description     text check (description is null or char_length(description) <= 2000),
  content         jsonb check (private.is_valid_rich_text(content)),
  content_text    text,
  document_type   public.kb_document_type not null default 'note',
  category        public.kb_category not null default 'general_notes',
  search_content  tsvector,
  created_by      uuid not null default auth.uid() references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  deleted_by      uuid references public.profiles (id),
  constraint knowledge_base_deleted_consistency check ((deleted_at is null) = (deleted_by is null))
);
comment on table public.knowledge_base is 'Application knowledge base records. Admin-managed; readable by all active users. search_content is maintained by triggers.';

create index knowledge_base_application_idx on public.knowledge_base (application_id) where deleted_at is null;
create index knowledge_base_category_idx on public.knowledge_base (category) where deleted_at is null;
create index knowledge_base_type_idx on public.knowledge_base (document_type) where deleted_at is null;
create index knowledge_base_updated_idx on public.knowledge_base (updated_at desc);
create index knowledge_base_created_by_idx on public.knowledge_base (created_by);
create index knowledge_base_deleted_by_idx on public.knowledge_base (deleted_by);
create index knowledge_base_search_idx on public.knowledge_base using gin (search_content);

create trigger knowledge_base_set_updated_at
before update on public.knowledge_base
for each row execute function private.set_updated_at();

-- ===========================================================================
-- knowledge_attachments
-- ===========================================================================
create table public.knowledge_attachments (
  id                 uuid primary key default gen_random_uuid(),
  knowledge_base_id  uuid not null references public.knowledge_base (id),
  original_name      text not null check (char_length(original_name) between 1 and 255),
  storage_path       text not null unique,
  mime_type          text not null,
  file_ext           text not null,
  size_bytes         bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  extracted_text     text,
  extraction_status  public.extraction_status not null default 'pending',
  uploaded_by        uuid not null references public.profiles (id),
  created_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  deleted_by         uuid references public.profiles (id),
  constraint knowledge_attachments_deleted_consistency check ((deleted_at is null) = (deleted_by is null))
);
create index knowledge_attachments_kb_idx on public.knowledge_attachments (knowledge_base_id);
create index knowledge_attachments_uploaded_by_idx on public.knowledge_attachments (uploaded_by);
create index knowledge_attachments_deleted_by_idx on public.knowledge_attachments (deleted_by);

create or replace function private.allowed_kb_ext(p_ext text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(p_ext) = any (array['pdf','doc','docx','xls','xlsx','txt','sql','json','png','jpg','jpeg','gif','webp']);
$$;

-- ===========================================================================
-- Search vector: title (A), description (B), note text (C), extracted document text (D)
-- ===========================================================================
create or replace function private.kb_build_search(p_kb public.knowledge_base)
returns tsvector
language sql
stable
security definer
set search_path = ''
as $$
  select setweight(to_tsvector('english', coalesce(p_kb.title, '')), 'A')
      || setweight(to_tsvector('english', coalesce(p_kb.description, '')), 'B')
      || setweight(to_tsvector('english', coalesce(p_kb.content_text, '')), 'C')
      || setweight(to_tsvector('english', coalesce((
           select string_agg(left(a.extracted_text, 200000), ' ')
           from public.knowledge_attachments a
           where a.knowledge_base_id = p_kb.id and a.deleted_at is null and a.extraction_status = 'completed'
         ), '')), 'D');
$$;

create or replace function private.knowledge_base_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app record;
begin
  new.title := btrim(new.title);
  new.description := nullif(btrim(new.description), '');
  new.content_text := private.tiptap_plain_text(new.content);
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.deleted_at := null;
    new.deleted_by := null;
  else
    new.created_by := old.created_by;
  end if;
  if tg_op = 'INSERT' or new.application_id is distinct from old.application_id then
    select deleted_at into v_app from public.applications where id = new.application_id;
    if not found then
      raise exception 'Application not found' using errcode = '23503';
    end if;
    if v_app.deleted_at is not null then
      raise exception 'Knowledge base records cannot be added to an archived application' using errcode = '23514';
    end if;
  end if;
  new.search_content := private.kb_build_search(new);
  return new;
end;
$$;

create trigger knowledge_base_before_write
before insert or update on public.knowledge_base
for each row execute function private.knowledge_base_before_write();

-- Attachment changes (new, removed, extraction finished) refresh the parent's search vector.
create or replace function private.knowledge_attachments_refresh_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.knowledge_base set search_content = search_content where id = new.knowledge_base_id;
  return new;
end;
$$;

create trigger knowledge_attachments_refresh_parent
after insert or update on public.knowledge_attachments
for each row execute function private.knowledge_attachments_refresh_parent();

-- Audit (admin actions).
create or replace function private.knowledge_base_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_activity(null, 'knowledge_base', new.id, 'created', jsonb_build_object('title', new.title, 'application_id', new.application_id));
  elsif old.deleted_at is null and new.deleted_at is not null then
    perform private.log_activity(null, 'knowledge_base', new.id, 'soft_deleted', jsonb_build_object('title', new.title));
  elsif old.deleted_at is not null and new.deleted_at is null then
    perform private.log_activity(null, 'knowledge_base', new.id, 'restored', jsonb_build_object('title', new.title));
  elsif (new.title, new.description, new.content, new.category, new.document_type, new.application_id)
        is distinct from (old.title, old.description, old.content, old.category, old.document_type, old.application_id) then
    perform private.log_activity(null, 'knowledge_base', new.id, 'updated', jsonb_build_object('title', new.title));
  end if;
  return new;
end;
$$;

create trigger knowledge_base_audit
after insert or update on public.knowledge_base
for each row execute function private.knowledge_base_audit();

-- ===========================================================================
-- Privileges & RLS (spec §3.2: admins manage the KB; employees view and search)
-- ===========================================================================
alter table public.knowledge_base enable row level security;
alter table public.knowledge_attachments enable row level security;
revoke all on table public.knowledge_base, public.knowledge_attachments from anon, authenticated;

grant select on table public.knowledge_base to authenticated;
grant insert (application_id, title, description, content, document_type, category) on table public.knowledge_base to authenticated;
grant update (application_id, title, description, content, document_type, category) on table public.knowledge_base to authenticated;
grant select on table public.knowledge_attachments to authenticated;

create policy "knowledge_base: read"
on public.knowledge_base for select to authenticated
using ((select private.is_active_user()) and (deleted_at is null or (select private.is_admin())));

create policy "knowledge_base: admins create"
on public.knowledge_base for insert to authenticated
with check ((select private.is_admin()));

create policy "knowledge_base: admins update"
on public.knowledge_base for update to authenticated
using ((select private.is_admin()) and deleted_at is null)
with check ((select private.is_admin()) and deleted_at is null);

create policy "knowledge_attachments: read with record"
on public.knowledge_attachments for select to authenticated
using (
  (select private.is_active_user())
  and (deleted_at is null or (select private.is_admin()))
  and exists (select 1 from public.knowledge_base k where k.id = knowledge_base_id)
);

-- ===========================================================================
-- RPCs (admin)
-- ===========================================================================
create or replace function public.soft_delete_knowledge_base(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  update public.knowledge_base set deleted_at = now(), deleted_by = auth.uid() where id = p_id and deleted_at is null;
  if not found then
    raise exception 'Record not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.restore_knowledge_base(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  update public.knowledge_base set deleted_at = null, deleted_by = null where id = p_id and deleted_at is not null;
  if not found then
    raise exception 'Record not found or not deleted' using errcode = 'P0002';
  end if;
end;
$$;

-- Register an uploaded document. Size/MIME come from storage, not the client.
create or replace function public.register_kb_attachment(p_kb_id uuid, p_storage_path text, p_original_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kb public.knowledge_base;
  v_obj record;
  v_ext text;
  v_id uuid;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  select * into v_kb from public.knowledge_base where id = p_kb_id and deleted_at is null;
  if not found then
    raise exception 'Record not found' using errcode = 'P0002';
  end if;
  if split_part(p_storage_path, '/', 1) <> v_kb.application_id::text or split_part(p_storage_path, '/', 2) <> p_kb_id::text then
    raise exception 'Storage path does not belong to this record' using errcode = '22023';
  end if;
  select o.owner_id, o.metadata into v_obj from storage.objects o
   where o.bucket_id = 'knowledge-base' and o.name = p_storage_path;
  if not found then
    raise exception 'Uploaded file not found' using errcode = 'P0002';
  end if;
  if v_obj.owner_id is distinct from auth.uid()::text then
    raise exception 'File was not uploaded by you' using errcode = '42501';
  end if;
  v_ext := lower(substring(p_original_name from '\.([A-Za-z0-9]+)$'));
  if v_ext is null or not private.allowed_kb_ext(v_ext) then
    raise exception 'File type is not allowed' using errcode = '22023';
  end if;

  insert into public.knowledge_attachments (knowledge_base_id, original_name, storage_path, mime_type, file_ext, size_bytes, uploaded_by, extraction_status)
  values (p_kb_id, left(btrim(p_original_name), 255), p_storage_path,
          coalesce(v_obj.metadata ->> 'mimetype', 'application/octet-stream'), v_ext,
          (v_obj.metadata ->> 'size')::bigint, auth.uid(),
          case when v_ext in ('txt','sql','json','pdf','docx') then 'pending'::public.extraction_status else 'not_supported'::public.extraction_status end)
  returning id into v_id;

  perform private.log_activity(null, 'knowledge_attachment', v_id, 'attachment_added', jsonb_build_object('knowledge_base_id', p_kb_id, 'file_name', p_original_name));
  return v_id;
end;
$$;

create or replace function public.remove_kb_attachment(p_attachment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.knowledge_attachments;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  update public.knowledge_attachments set deleted_at = now(), deleted_by = auth.uid()
   where id = p_attachment_id and deleted_at is null
  returning * into v;
  if v.id is null then
    raise exception 'Attachment not found' using errcode = 'P0002';
  end if;
  perform private.log_activity(null, 'knowledge_attachment', v.id, 'attachment_removed', jsonb_build_object('knowledge_base_id', v.knowledge_base_id, 'file_name', v.original_name));
end;
$$;

-- Full-text search (SECURITY INVOKER: RLS applies). Snippet highlights use the markers
-- U+E000 / U+E001 instead of HTML so the client never renders HTML.
create or replace function public.search_knowledge_base(
  p_query text,
  p_application_id uuid default null,
  p_category public.kb_category default null,
  p_document_type public.kb_document_type default null,
  p_limit integer default 50
)
returns table (
  id uuid, application_id uuid, title text, description text, document_type public.kb_document_type,
  category public.kb_category, updated_at timestamptz, rank real, snippet text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (select websearch_to_tsquery('english', coalesce(p_query, '')) as tsq)
  select k.id, k.application_id, k.title, k.description, k.document_type, k.category, k.updated_at,
         ts_rank_cd(k.search_content, q.tsq) as rank,
         ts_headline('english',
           left(concat_ws(' … ', k.description, k.content_text, (
             select string_agg(left(a.extracted_text, 20000), ' … ')
             from public.knowledge_attachments a
             where a.knowledge_base_id = k.id and a.deleted_at is null and a.extraction_status = 'completed'
           )), 60000),
           q.tsq,
           'StartSel=' || chr(57344) || ', StopSel=' || chr(57345) || ', MaxWords=30, MinWords=12, MaxFragments=2, FragmentDelimiter=" … "') as snippet
  from public.knowledge_base k, q
  where k.deleted_at is null
    and k.search_content @@ q.tsq
    and (p_application_id is null or k.application_id = p_application_id)
    and (p_category is null or k.category = p_category)
    and (p_document_type is null or k.document_type = p_document_type)
  order by rank desc, k.updated_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

revoke all on function public.soft_delete_knowledge_base(uuid) from public, anon;
revoke all on function public.restore_knowledge_base(uuid) from public, anon;
revoke all on function public.register_kb_attachment(uuid, text, text) from public, anon;
revoke all on function public.remove_kb_attachment(uuid) from public, anon;
revoke all on function public.search_knowledge_base(text, uuid, public.kb_category, public.kb_document_type, integer) from public, anon;
grant execute on function public.soft_delete_knowledge_base(uuid) to authenticated;
grant execute on function public.restore_knowledge_base(uuid) to authenticated;
grant execute on function public.register_kb_attachment(uuid, text, text) to authenticated;
grant execute on function public.remove_kb_attachment(uuid) to authenticated;
grant execute on function public.search_knowledge_base(text, uuid, public.kb_category, public.kb_document_type, integer) to authenticated;

-- ===========================================================================
-- Storage: private knowledge-base bucket
--   {application_id}/{knowledge_base_id}/{uuid}.{ext}   documents (admin upload)
--   inline/{user_id}/{uuid}.{ext}                        images in notes (admin upload)
-- ===========================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('knowledge-base', 'knowledge-base', false, 26214400, array[
  'application/pdf',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain','application/sql','application/json',
  'image/png','image/jpeg','image/gif','image/webp'
]);

create policy "knowledge-base: read"
on storage.objects for select to authenticated
using (
  bucket_id = 'knowledge-base'
  and (select private.is_active_user())
  and (
    (storage.foldername(name))[1] = 'inline'
    or exists (select 1 from public.knowledge_base k where k.id::text = (storage.foldername(name))[2])
  )
);

create policy "knowledge-base: admin upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'knowledge-base'
  and (select private.is_admin())
  and (
    (
      (storage.foldername(name))[1] = 'inline'
      and (storage.foldername(name))[2] = (select auth.uid())::text
      and lower(storage.extension(name)) = any (array['png','jpg','jpeg','gif','webp'])
    )
    or (
      private.allowed_kb_ext(storage.extension(name))
      and exists (
        select 1 from public.knowledge_base k
         where k.id::text = (storage.foldername(name))[2]
           and k.application_id::text = (storage.foldername(name))[1]
           and k.deleted_at is null
      )
    )
  )
);
