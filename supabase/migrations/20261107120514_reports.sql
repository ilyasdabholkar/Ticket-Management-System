-- Phase 8: report settings, report-assets storage, employee effort report RPC.

-- ===========================================================================
-- report_settings (single row)
-- ===========================================================================
create table public.report_settings (
  id                 boolean primary key default true check (id),
  company_name       text not null default 'CodeWithZ' check (char_length(btrim(company_name)) between 1 and 120),
  report_title       text not null default 'Task & Effort Report' check (char_length(btrim(report_title)) between 1 and 160),
  footer_text        text check (footer_text is null or char_length(footer_text) <= 500),
  header_image_path  text check (header_image_path is null or header_image_path ~ '^header/[0-9a-f-]{36}\.(png|jpg|jpeg)$'),
  updated_by         uuid references public.profiles (id),
  updated_at         timestamptz not null default now()
);
comment on table public.report_settings is 'Configurable PDF report appearance (spec §9.6). Exactly one row (id = true).';
insert into public.report_settings (id) values (true);

create index report_settings_updated_by_idx on public.report_settings (updated_by);

create or replace function private.report_settings_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.id := true;
  new.company_name := btrim(new.company_name);
  new.report_title := btrim(new.report_title);
  new.footer_text := nullif(btrim(new.footer_text), '');
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create trigger report_settings_before_update
before update on public.report_settings
for each row execute function private.report_settings_before_update();

create or replace function private.report_settings_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.log_activity(null, 'settings', '00000000-0000-0000-0000-000000000001'::uuid, 'report_settings_updated',
    jsonb_build_object('company_name', new.company_name, 'report_title', new.report_title,
                       'header_image_changed', new.header_image_path is distinct from old.header_image_path));
  return new;
end;
$$;

create trigger report_settings_audit
after update on public.report_settings
for each row execute function private.report_settings_audit();

alter table public.report_settings enable row level security;
revoke all on table public.report_settings from anon, authenticated;
grant select on table public.report_settings to authenticated;
grant update (company_name, report_title, footer_text, header_image_path) on table public.report_settings to authenticated;

create policy "report_settings: active users read"
on public.report_settings for select to authenticated
using ((select private.is_active_user()));

create policy "report_settings: admins update"
on public.report_settings for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

-- ===========================================================================
-- Storage: report-assets (header images; PNG/JPEG only because @react-pdf supports those)
-- ===========================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-assets', 'report-assets', false, 2097152, array['image/png', 'image/jpeg']);

create policy "report-assets: active users read"
on storage.objects for select to authenticated
using (bucket_id = 'report-assets' and (select private.is_active_user()));

create policy "report-assets: admin upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'report-assets'
  and (select private.is_admin())
  and (storage.foldername(name))[1] = 'header'
  and lower(storage.extension(name)) = any (array['png', 'jpg', 'jpeg'])
);

-- ===========================================================================
-- Employee effort report (spec §9.2, decision Q4)
--   Criterion A: tickets created in the range that the employee created OR is assigned to.
--   Criterion B: tickets with at least one non-deleted effort log by the employee dated in the range.
--   Union without duplicates. Effort = that employee's non-deleted logs dated in the range only.
--   Dates are organisation dates (Asia/Kolkata). Soft-deleted tickets are excluded.
--   Optional p_application_id narrows the report (used by the application Reports tab).
-- ===========================================================================
create or replace function public.get_effort_report(
  p_user_id uuid,
  p_start date,
  p_end date,
  p_application_id uuid default null
)
returns table (
  ticket_id uuid,
  ticket_number text,
  title text,
  application_name text,
  category public.ticket_category,
  status public.ticket_status,
  effort_minutes bigint,
  started_on timestamptz,
  qa_deployed_on timestamptz,
  prod_deployed_on timestamptz,
  created_in_range boolean,
  effort_in_range boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_user() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'Employee is required' using errcode = '22023';
  end if;
  if p_user_id <> auth.uid() and not private.is_admin() then
    raise exception 'You can only generate reports for your own work' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or p_start > p_end then
    raise exception 'Invalid date range' using errcode = '22023';
  end if;
  if p_end - p_start > 366 then
    raise exception 'Date range cannot exceed one year' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and 'employee' = any (roles)) then
    raise exception 'Reports are available for users with the Employee role' using errcode = '22023';
  end if;

  return query
  with effort as (
    select e.ticket_id as tid, sum(e.effort_minutes)::bigint as minutes
    from public.effort_logs e
    where e.user_id = p_user_id
      and e.deleted_at is null
      and e.effort_date between p_start and p_end
    group by e.ticket_id
  ),
  created as (
    select t.id as tid
    from public.tickets t
    where (t.created_by = p_user_id or t.assigned_to = p_user_id)
      and (t.created_at at time zone 'Asia/Kolkata')::date between p_start and p_end
  ),
  ids as (
    select tid from created
    union
    select tid from effort
  )
  select t.id, t.ticket_number, t.title, a.name, t.category, t.status,
         coalesce(ef.minutes, 0),
         t.started_on, t.qa_deployed_on, t.prod_deployed_on,
         exists (select 1 from created c where c.tid = t.id),
         ef.tid is not null
  from ids
  join public.tickets t on t.id = ids.tid
  left join public.applications a on a.id = t.application_id
  left join effort ef on ef.tid = t.id
  where t.deleted_at is null
    and (p_application_id is null or t.application_id = p_application_id)
  order by t.ticket_number;
end;
$$;

revoke all on function public.get_effort_report(uuid, date, date, uuid) from public, anon;
grant execute on function public.get_effort_report(uuid, date, date, uuid) to authenticated;
