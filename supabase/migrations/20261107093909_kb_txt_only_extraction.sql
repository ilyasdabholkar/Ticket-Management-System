-- Decision change (replaces Q10): only .txt documents have their text extracted for search.
-- Word, PDF, SQL, JSON, spreadsheets and images are searchable by record title/description/notes only.

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
          case when v_ext = 'txt' then 'pending'::public.extraction_status else 'not_supported'::public.extraction_status end)
  returning id into v_id;

  perform private.log_activity(null, 'knowledge_attachment', v_id, 'attachment_added', jsonb_build_object('knowledge_base_id', p_kb_id, 'file_name', p_original_name));
  return v_id;
end;
$$;

-- Defence in depth: extracted text is only ever stored for .txt documents.
alter table public.knowledge_attachments
  add constraint knowledge_attachments_text_only_for_txt
  check (file_ext = 'txt' or (extracted_text is null and extraction_status = 'not_supported'))
  not valid;

-- Bring existing documents in line (fires the refresh trigger, removing their text from search).
update public.knowledge_attachments
   set extraction_status = 'not_supported', extracted_text = null
 where file_ext <> 'txt'
   and (extraction_status <> 'not_supported' or extracted_text is not null);

alter table public.knowledge_attachments validate constraint knowledge_attachments_text_only_for_txt;
