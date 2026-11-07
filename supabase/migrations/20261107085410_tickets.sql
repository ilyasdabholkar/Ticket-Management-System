-- Phase 4: tickets, ticket numbering, number aliases, attachments (+ storage), activity log.
-- Status transitions, status history and admin corrections arrive in Phase 5.

-- ===========================================================================
-- Enums
-- ===========================================================================
create type public.ticket_category as enum ('development', 'support', 'rnd');
create type public.ticket_priority as enum ('low', 'medium', 'high', 'critical');
create type public.ticket_status as enum ('development', 'in_progress', 'qa_deployed', 'prod_deployed');

-- ===========================================================================
-- Ticket number sequences (internal, gapless, concurrency-safe via row lock)
-- ===========================================================================
create table private.ticket_sequences (
  category   public.ticket_category primary key,
  prefix     text not null unique,
  last_value integer not null default 0 check (last_value >= 0)
);
insert into private.ticket_sequences (category, prefix) values
  ('development', 'DEV'), ('support', 'SUP'), ('rnd', 'RND');

-- Returns the next number for a category, e.g. DEV-0001. Locks the sequence row until commit.
create or replace function private.next_ticket_number(p_category public.ticket_category)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix text;
  v_value integer;
begin
  update private.ticket_sequences
     set last_value = last_value + 1
   where category = p_category
  returning prefix, last_value into v_prefix, v_value;

  if v_value is null then
    raise exception 'No ticket sequence for category %', p_category;
  end if;

  -- lpad would truncate numbers above 9999, so only pad below that.
  return v_prefix || '-' || case when v_value < 10000 then lpad(v_value::text, 4, '0') else v_value::text end;
end;
$$;
revoke all on function private.next_ticket_number(public.ticket_category) from public, anon, authenticated;

-- Plain text of a Tiptap JSON document (all "text" leaves), for search and reports.
create or replace function private.tiptap_plain_text(p_doc jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(string_agg(t #>> '{}', ' ')), '')
  from jsonb_path_query(coalesce(p_doc, '{}'::jsonb), 'strict $.**.text') as t
  where jsonb_typeof(t) = 'string';
$$;

-- Valid Tiptap document: object with type "doc", at most ~512 KB.
create or replace function private.is_valid_rich_text(p_doc jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_doc is null
      or (jsonb_typeof(p_doc) = 'object' and p_doc ->> 'type' = 'doc' and octet_length(p_doc::text) <= 524288);
$$;

-- ===========================================================================
-- tickets
-- ===========================================================================
create table public.tickets (
  id                uuid primary key default gen_random_uuid(),
  ticket_number     text not null unique,
  category          public.ticket_category not null,
  application_id    uuid references public.applications (id),
  title             text not null check (char_length(btrim(title)) between 1 and 255),
  description       jsonb check (private.is_valid_rich_text(description)),
  description_text  text,
  priority          public.ticket_priority not null default 'medium',
  status            public.ticket_status not null default 'development',
  assigned_to       uuid references public.profiles (id),
  created_by        uuid not null default auth.uid() references public.profiles (id),
  started_on        timestamptz,
  qa_deployed_on    timestamptz,
  prod_deployed_on  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  deleted_by        uuid references public.profiles (id),
  constraint tickets_application_required check (category = 'rnd' or application_id is not null),
  constraint tickets_deleted_consistency check ((deleted_at is null) = (deleted_by is null))
);

comment on table public.tickets is 'Tickets. Numbers are assigned by trigger; category changes via change_ticket_category(); soft delete via soft_delete_ticket().';

create extension if not exists pg_trgm with schema extensions;

create index tickets_status_idx on public.tickets (status) where deleted_at is null;
create index tickets_category_idx on public.tickets (category) where deleted_at is null;
create index tickets_application_idx on public.tickets (application_id);
create index tickets_assigned_to_idx on public.tickets (assigned_to);
create index tickets_created_by_idx on public.tickets (created_by);
create index tickets_deleted_by_idx on public.tickets (deleted_by);
create index tickets_priority_idx on public.tickets (priority) where deleted_at is null;
create index tickets_created_at_idx on public.tickets (created_at desc);
create index tickets_updated_at_idx on public.tickets (updated_at desc);
create index tickets_title_trgm_idx on public.tickets using gin (title extensions.gin_trgm_ops);
create index tickets_number_trgm_idx on public.tickets using gin (ticket_number extensions.gin_trgm_ops);

create trigger tickets_set_updated_at
before update on public.tickets
for each row execute function private.set_updated_at();

-- Is the ticket locked (Prod Deployed)? Used by policies and triggers.
create or replace function private.ticket_is_locked(p_ticket_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select status = 'prod_deployed' from public.tickets where id = p_ticket_id), false);
$$;
revoke all on function private.ticket_is_locked(uuid) from public, anon;
grant execute on function private.ticket_is_locked(uuid) to authenticated;

-- Validation + derived fields. Runs for every insert/update.
create or replace function private.tickets_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app record;
begin
  new.title := btrim(new.title);
  new.description_text := private.tiptap_plain_text(new.description);

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.ticket_number := private.next_ticket_number(new.category);
    new.status := 'development';
    new.started_on := null;
    new.qa_deployed_on := null;
    new.prod_deployed_on := null;
    new.deleted_at := null;
    new.deleted_by := null;
  else
    new.created_by := old.created_by;
    -- Production lock (Phase 5 adds the audited admin-correction bypass).
    if old.status = 'prod_deployed' and coalesce(current_setting('app.admin_correction', true), '') <> 'on' then
      raise exception 'Ticket % is locked (Prod Deployed)', old.ticket_number using errcode = '42501';
    end if;
  end if;

  -- Application must exist, not be archived and be active when set or changed.
  if new.application_id is not null
     and (tg_op = 'INSERT' or new.application_id is distinct from old.application_id) then
    select is_active, deleted_at into v_app from public.applications where id = new.application_id;
    if not found then
      raise exception 'Application not found' using errcode = '23503';
    end if;
    if v_app.deleted_at is not null or not v_app.is_active then
      raise exception 'The selected application is inactive or archived' using errcode = '23514';
    end if;
  end if;

  -- Assignee must be an active profile when set or changed.
  if new.assigned_to is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    if not exists (select 1 from public.profiles where id = new.assigned_to and is_active) then
      raise exception 'Tickets can only be assigned to active users' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger tickets_before_write
before insert or update on public.tickets
for each row execute function private.tickets_before_write();

-- ===========================================================================
-- ticket_number_aliases: previous numbers after a category change (decision Q15)
-- ===========================================================================
create table public.ticket_number_aliases (
  id             uuid primary key default gen_random_uuid(),
  ticket_id      uuid not null references public.tickets (id),
  ticket_number  text not null unique,
  category       public.ticket_category not null,
  replaced_at    timestamptz not null default now(),
  replaced_by    uuid references public.profiles (id)
);
create index ticket_number_aliases_ticket_idx on public.ticket_number_aliases (ticket_id);
create index ticket_number_aliases_replaced_by_idx on public.ticket_number_aliases (replaced_by);

-- ===========================================================================
-- ticket_attachments
-- ===========================================================================
create table public.ticket_attachments (
  id             uuid primary key default gen_random_uuid(),
  ticket_id      uuid not null references public.tickets (id),
  original_name  text not null check (char_length(original_name) between 1 and 255),
  storage_path   text not null unique,
  mime_type      text not null,
  file_ext       text not null,
  size_bytes     bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  uploaded_by    uuid not null references public.profiles (id),
  created_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  deleted_by     uuid references public.profiles (id),
  constraint ticket_attachments_deleted_consistency check ((deleted_at is null) = (deleted_by is null))
);
create index ticket_attachments_ticket_idx on public.ticket_attachments (ticket_id);
create index ticket_attachments_uploaded_by_idx on public.ticket_attachments (uploaded_by);
create index ticket_attachments_deleted_by_idx on public.ticket_attachments (deleted_by);

-- Allowed attachment extensions (spec §5.6).
create or replace function private.allowed_attachment_ext(p_ext text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(p_ext) = any (array['png','jpg','jpeg','gif','webp','bmp','pdf','doc','docx','xls','xlsx','txt','sql','json','zip']);
$$;

-- ===========================================================================
-- activity_logs (append-only; written only by definer triggers/functions)
-- ===========================================================================
create table public.activity_logs (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid references public.tickets (id),
  entity_type  text not null check (entity_type in ('ticket','attachment','comment','effort_log','application','user','settings')),
  entity_id    uuid not null,
  action       text not null check (action ~ '^[a-z_]{1,40}$'),
  actor_id     uuid references public.profiles (id),
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
comment on table public.activity_logs is 'Append-only audit trail. No UPDATE/DELETE privileges for API roles.';
create index activity_logs_ticket_idx on public.activity_logs (ticket_id, created_at desc);
create index activity_logs_entity_idx on public.activity_logs (entity_type, entity_id, created_at desc);
create index activity_logs_actor_idx on public.activity_logs (actor_id);
create index activity_logs_created_at_idx on public.activity_logs (created_at desc);

create or replace function private.log_activity(
  p_ticket_id uuid, p_entity_type text, p_entity_id uuid, p_action text, p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity_logs (ticket_id, entity_type, entity_id, action, actor_id, metadata)
  values (p_ticket_id, p_entity_type, p_entity_id, p_action, auth.uid(), coalesce(p_metadata, '{}'::jsonb));
$$;
revoke all on function private.log_activity(uuid, text, uuid, text, jsonb) from public, anon, authenticated;

-- Ticket audit trigger: one log row per meaningful change.
create or replace function private.tickets_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_activity(new.id, 'ticket', new.id, 'created', jsonb_build_object(
      'ticket_number', new.ticket_number, 'category', new.category, 'title', new.title,
      'priority', new.priority, 'assigned_to', new.assigned_to, 'application_id', new.application_id));
    return new;
  end if;

  if new.title is distinct from old.title then
    perform private.log_activity(new.id, 'ticket', new.id, 'title_changed', jsonb_build_object('from', old.title, 'to', new.title));
  end if;
  if new.description is distinct from old.description then
    perform private.log_activity(new.id, 'ticket', new.id, 'description_updated', '{}'::jsonb);
  end if;
  if new.priority is distinct from old.priority then
    perform private.log_activity(new.id, 'ticket', new.id, 'priority_changed', jsonb_build_object('from', old.priority, 'to', new.priority));
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    perform private.log_activity(new.id, 'ticket', new.id, 'assigned', jsonb_build_object('from', old.assigned_to, 'to', new.assigned_to));
  end if;
  if new.application_id is distinct from old.application_id and new.category = old.category then
    perform private.log_activity(new.id, 'ticket', new.id, 'application_changed', jsonb_build_object('from', old.application_id, 'to', new.application_id));
  end if;
  return new;
end;
$$;

create trigger tickets_audit
after insert or update on public.tickets
for each row execute function private.tickets_audit();

-- Application audit (deferred from Phase 3).
create or replace function private.applications_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
  v_changes jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    perform private.log_activity(null, 'application', new.id, 'created', jsonb_build_object('name', new.name));
    return new;
  end if;
  if old.deleted_at is null and new.deleted_at is not null then
    v_action := 'archived';
  elsif old.deleted_at is not null and new.deleted_at is null then
    v_action := 'restored';
  else
    v_action := 'updated';
    if new.name is distinct from old.name then v_changes := v_changes || jsonb_build_object('name', jsonb_build_object('from', old.name, 'to', new.name)); end if;
    if new.description is distinct from old.description then v_changes := v_changes || jsonb_build_object('description', true); end if;
    if new.icon_key is distinct from old.icon_key then v_changes := v_changes || jsonb_build_object('icon_key', jsonb_build_object('from', old.icon_key, 'to', new.icon_key)); end if;
    if new.is_active is distinct from old.is_active then v_changes := v_changes || jsonb_build_object('is_active', jsonb_build_object('from', old.is_active, 'to', new.is_active)); end if;
    if v_changes = '{}'::jsonb then return new; end if;
  end if;
  perform private.log_activity(null, 'application', new.id, v_action, jsonb_build_object('name', new.name) || v_changes);
  return new;
end;
$$;

create trigger applications_audit
after insert or update on public.applications
for each row execute function private.applications_audit();

-- ===========================================================================
-- Privileges & RLS
-- ===========================================================================
alter table public.tickets enable row level security;
alter table public.ticket_number_aliases enable row level security;
alter table public.ticket_attachments enable row level security;
alter table public.activity_logs enable row level security;

revoke all on table public.tickets, public.ticket_number_aliases, public.ticket_attachments, public.activity_logs
  from anon, authenticated;

grant select on table public.tickets to authenticated;
grant insert (category, application_id, title, description, priority, assigned_to) on table public.tickets to authenticated;
grant update (application_id, title, description, priority, assigned_to) on table public.tickets to authenticated;
grant select on table public.ticket_number_aliases to authenticated;
grant select on table public.ticket_attachments to authenticated;
grant select on table public.activity_logs to authenticated;

-- tickets: all active users see non-deleted tickets; admins also see deleted ones.
create policy "tickets: read"
on public.tickets for select to authenticated
using ((select private.is_active_user()) and (deleted_at is null or (select private.is_admin())));

create policy "tickets: active users create"
on public.tickets for insert to authenticated
with check ((select private.is_active_user()));

-- Decision Q1: any active user may edit non-deleted, non-locked tickets.
create policy "tickets: active users edit unlocked"
on public.tickets for update to authenticated
using ((select private.is_active_user()) and deleted_at is null and status <> 'prod_deployed')
with check ((select private.is_active_user()) and deleted_at is null);

create policy "ticket_number_aliases: read"
on public.ticket_number_aliases for select to authenticated
using ((select private.is_active_user()));

create policy "ticket_attachments: read with ticket"
on public.ticket_attachments for select to authenticated
using (
  (select private.is_active_user())
  and (deleted_at is null or (select private.is_admin()))
  and exists (select 1 from public.tickets t where t.id = ticket_id)
);

create policy "activity_logs: read"
on public.activity_logs for select to authenticated
using (
  (select private.is_active_user())
  and (
    (select private.is_admin())
    or entity_type = 'application'
    or (ticket_id is not null and exists (select 1 from public.tickets t where t.id = ticket_id))
  )
);

-- ===========================================================================
-- RPCs
-- ===========================================================================

-- Change category: renumber in the new category, keep the old number as an alias (Q15).
create or replace function public.change_ticket_category(
  p_ticket_id uuid, p_category public.ticket_category, p_application_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets;
  v_new_number text;
  v_app_id uuid;
begin
  if not private.is_active_user() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found or v_ticket.deleted_at is not null then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;
  if v_ticket.status = 'prod_deployed' then
    raise exception 'Ticket % is locked (Prod Deployed)', v_ticket.ticket_number using errcode = '42501';
  end if;
  if v_ticket.category = p_category then
    return v_ticket.ticket_number;
  end if;

  v_app_id := coalesce(p_application_id, v_ticket.application_id);
  if p_category <> 'rnd' and v_app_id is null then
    raise exception 'Development and Support tickets require an application' using errcode = '23514';
  end if;

  insert into public.ticket_number_aliases (ticket_id, ticket_number, category, replaced_by)
  values (v_ticket.id, v_ticket.ticket_number, v_ticket.category, auth.uid());

  v_new_number := private.next_ticket_number(p_category);

  update public.tickets
     set category = p_category, ticket_number = v_new_number, application_id = v_app_id
   where id = p_ticket_id;

  perform private.log_activity(p_ticket_id, 'ticket', p_ticket_id, 'category_changed', jsonb_build_object(
    'from', v_ticket.category, 'to', p_category,
    'from_number', v_ticket.ticket_number, 'to_number', v_new_number,
    'application_id', v_app_id));

  return v_new_number;
end;
$$;

-- Soft delete: creator or admin, not locked.
create or replace function public.soft_delete_ticket(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets;
begin
  if not private.is_active_user() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found or v_ticket.deleted_at is not null then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;
  if v_ticket.created_by <> auth.uid() and not private.is_admin() then
    raise exception 'Only the creator or an administrator can delete this ticket' using errcode = '42501';
  end if;
  if v_ticket.status = 'prod_deployed' then
    raise exception 'Ticket % is locked (Prod Deployed)', v_ticket.ticket_number using errcode = '42501';
  end if;

  update public.tickets set deleted_at = now(), deleted_by = auth.uid() where id = p_ticket_id;
  perform private.log_activity(p_ticket_id, 'ticket', p_ticket_id, 'soft_deleted', jsonb_build_object('ticket_number', v_ticket.ticket_number));
end;
$$;

create or replace function public.restore_ticket(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number text;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  update public.tickets set deleted_at = null, deleted_by = null
   where id = p_ticket_id and deleted_at is not null
  returning ticket_number into v_number;
  if v_number is null then
    raise exception 'Ticket not found or not deleted' using errcode = 'P0002';
  end if;
  perform private.log_activity(p_ticket_id, 'ticket', p_ticket_id, 'restored', jsonb_build_object('ticket_number', v_number));
end;
$$;

-- Register an uploaded attachment. Size and MIME are read from storage, not trusted from the client.
create or replace function public.register_ticket_attachment(
  p_ticket_id uuid, p_storage_path text, p_original_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets;
  v_obj record;
  v_ext text;
  v_id uuid;
begin
  if not private.is_active_user() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into v_ticket from public.tickets where id = p_ticket_id;
  if not found or v_ticket.deleted_at is not null then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;
  if v_ticket.status = 'prod_deployed' then
    raise exception 'Ticket % is locked (Prod Deployed)', v_ticket.ticket_number using errcode = '42501';
  end if;
  if split_part(p_storage_path, '/', 1) <> p_ticket_id::text then
    raise exception 'Storage path does not belong to this ticket' using errcode = '22023';
  end if;

  select o.owner_id, o.metadata into v_obj
    from storage.objects o
   where o.bucket_id = 'ticket-attachments' and o.name = p_storage_path;
  if not found then
    raise exception 'Uploaded file not found' using errcode = 'P0002';
  end if;
  if v_obj.owner_id is distinct from auth.uid()::text then
    raise exception 'File was not uploaded by you' using errcode = '42501';
  end if;

  v_ext := lower(substring(p_original_name from '\.([A-Za-z0-9]+)$'));
  if v_ext is null or not private.allowed_attachment_ext(v_ext) then
    raise exception 'File type is not allowed' using errcode = '22023';
  end if;

  insert into public.ticket_attachments (ticket_id, original_name, storage_path, mime_type, file_ext, size_bytes, uploaded_by)
  values (p_ticket_id, left(btrim(p_original_name), 255), p_storage_path,
          coalesce(v_obj.metadata ->> 'mimetype', 'application/octet-stream'), v_ext,
          (v_obj.metadata ->> 'size')::bigint, auth.uid())
  returning id into v_id;

  perform private.log_activity(p_ticket_id, 'attachment', v_id, 'attachment_added',
    jsonb_build_object('file_name', p_original_name, 'size_bytes', (v_obj.metadata ->> 'size')::bigint));
  return v_id;
end;
$$;

-- Remove (soft delete) an attachment: uploader or admin, ticket not locked. The object is kept.
create or replace function public.remove_ticket_attachment(p_attachment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_att public.ticket_attachments;
begin
  if not private.is_active_user() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_att from public.ticket_attachments where id = p_attachment_id and deleted_at is null for update;
  if not found then
    raise exception 'Attachment not found' using errcode = 'P0002';
  end if;
  if v_att.uploaded_by <> auth.uid() and not private.is_admin() then
    raise exception 'Only the uploader or an administrator can remove this attachment' using errcode = '42501';
  end if;
  if private.ticket_is_locked(v_att.ticket_id) then
    raise exception 'Ticket is locked (Prod Deployed)' using errcode = '42501';
  end if;
  update public.ticket_attachments set deleted_at = now(), deleted_by = auth.uid() where id = p_attachment_id;
  perform private.log_activity(v_att.ticket_id, 'attachment', v_att.id, 'attachment_removed', jsonb_build_object('file_name', v_att.original_name));
end;
$$;

revoke all on function public.change_ticket_category(uuid, public.ticket_category, uuid) from public, anon;
revoke all on function public.soft_delete_ticket(uuid) from public, anon;
revoke all on function public.restore_ticket(uuid) from public, anon;
revoke all on function public.register_ticket_attachment(uuid, text, text) from public, anon;
revoke all on function public.remove_ticket_attachment(uuid) from public, anon;
grant execute on function public.change_ticket_category(uuid, public.ticket_category, uuid) to authenticated;
grant execute on function public.soft_delete_ticket(uuid) to authenticated;
grant execute on function public.restore_ticket(uuid) to authenticated;
grant execute on function public.register_ticket_attachment(uuid, text, text) to authenticated;
grant execute on function public.remove_ticket_attachment(uuid) to authenticated;

-- ===========================================================================
-- Storage: private ticket-attachments bucket
-- Paths: {ticket_id}/{uuid}.{ext}         ticket attachments
--        inline/{user_id}/{uuid}.{ext}    images embedded in rich text
-- Objects are never deleted through the API (audit retention).
-- ===========================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ticket-attachments', 'ticket-attachments', false, 26214400, array[
  'image/png','image/jpeg','image/gif','image/webp','image/bmp',
  'application/pdf',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain','application/sql','application/json','application/zip'
]);

create policy "ticket-attachments: read"
on storage.objects for select to authenticated
using (
  bucket_id = 'ticket-attachments'
  and (select private.is_active_user())
  and (
    (storage.foldername(name))[1] = 'inline'
    or exists (select 1 from public.tickets t where t.id::text = (storage.foldername(name))[1])
  )
);

create policy "ticket-attachments: upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'ticket-attachments'
  and (select private.is_active_user())
  and (
    (
      (storage.foldername(name))[1] = 'inline'
      and (storage.foldername(name))[2] = (select auth.uid())::text
      and lower(storage.extension(name)) = any (array['png','jpg','jpeg','gif','webp'])
    )
    or (
      private.allowed_attachment_ext(storage.extension(name))
      and exists (
        select 1 from public.tickets t
         where t.id::text = (storage.foldername(name))[1]
           and t.deleted_at is null
           and t.status <> 'prod_deployed'
      )
    )
  )
);
