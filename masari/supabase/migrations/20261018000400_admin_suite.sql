-- أدوات مدير النظام: سد ثغرة ربط الحسابات، صحة النظام، الدعم الفني، الإعلانات، أدوات المستخدمين والنقل بين المدارس،
-- سجل تدقيق قابل للبحث، الإيرادات وحدود الباقات، تصدير بيانات المستخدم، وصلاحيات برج المراقبة والإدارة التنفيذية.
-- لا يحتوي أي حذف لبيانات قائمة: إضافات وتعديل دوال فقط.

-- ═════════ 1) ربط السجل بالحساب لا يتغير إلا من دوال الخادم ═════════
-- security invoker عمدًا: current_user = authenticated عند التعديل المباشر من التطبيق، وصاحب الدالة عند المرور بدوال الخادم.
create or replace function private.guard_account_link() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and not private.is_platform_admin() then
    if tg_op = 'INSERT' and new.user_id is not null and new.user_id <> (select auth.uid()) then
      raise exception 'FORBIDDEN_FIELD' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
      raise exception 'FORBIDDEN_FIELD' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create or replace trigger drivers_link_guard before insert or update of user_id on public.drivers
  for each row execute function private.guard_account_link();
create or replace trigger guardians_link_guard before insert or update of user_id on public.guardians
  for each row execute function private.guard_account_link();

-- ═════════ 2) برج المراقبة والإدارة التنفيذية ═════════
create or replace function public.resolve_trip_alert(p_alert uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.trip_alerts;
begin
  select * into a from public.trip_alerts where id = p_alert;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not (private.is_school_staff(a.school_id) or private.is_executive_for(a.school_id)
          or private.has_school_role(a.school_id, array['control_tower'])) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.trip_alerts set status = 'resolved', resolved_at = coalesce(resolved_at, now()), acknowledged_by = (select auth.uid()),
    note = nullif(btrim(p_note), '') where id = p_alert;
  perform private.audit(a.school_id, 'trip_alert_resolved', 'trip_alerts', p_alert::text, null, jsonb_build_object('note', p_note));
end $$;

-- الإدارة التنفيذية تستلم بلاغات مدارس منطقتها وتغلقها
create or replace function public.update_emergency(p_report uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.emergency_reports;
begin
  select * into r from public.emergency_reports where id = p_report for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not (private.is_executive_for(r.school_id) or exists (
      select 1 from public.school_members m where m.school_id = r.school_id and m.user_id = (select auth.uid()) and m.status = 'active')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_status = 'acknowledged' and r.status = 'open' then
    update public.emergency_reports set status = 'acknowledged', acknowledged_by = (select auth.uid()), acknowledged_at = now() where id = p_report;
  elsif p_status = 'resolved' and r.status in ('open','acknowledged') then
    if coalesce(btrim(p_note), '') = '' then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
    update public.emergency_reports set status = 'resolved', resolved_by = (select auth.uid()), resolved_at = now(),
      resolution_note = p_note where id = p_report;
  else
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  perform private.audit(r.school_id, 'emergency_' || p_status, 'emergency_reports', p_report::text, null, jsonb_build_object('note', p_note));
end $$;

-- إشعار الإدارة التنفيذية للمنطقة ومدير النظام بكل بلاغ طارئ جديد
create or replace function private.notify_platform_admins(p_type text, p_title text, p_body text, p_dedupe text, p_data jsonb default '{}'::jsonb, p_school uuid default null) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
  select r.user_id, p_school, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb), p_dedupe
  from public.user_roles r join public.profiles p on p.user_id = r.user_id and p.status = 'active'
  where r.role = 'super_admin'
  on conflict (user_id, dedupe_key) do nothing
$$;

create or replace function private.on_emergency_notify_region() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_region text; v_school text;
begin
  select region, name into v_region, v_school from public.schools where id = new.school_id;
  insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
  select distinct r.user_id, new.school_id, 'emergency', 'بلاغ طارئ: ' || coalesce(v_school, 'مدرسة'),
         coalesce(new.description, 'بلاغ من باص أثناء الرحلة'), jsonb_build_object('report_id', new.id, 'trip_id', new.trip_id),
         'emergency_region:' || new.id
  from public.user_roles r join public.profiles p on p.user_id = r.user_id and p.status = 'active'
  where (r.role = 'executive' and v_region is not null and r.region = v_region) or r.role = 'super_admin'
  on conflict (user_id, dedupe_key) do nothing;
  return new;
end $$;
create or replace trigger emergency_notify_region after insert on public.emergency_reports
  for each row execute function private.on_emergency_notify_region();

-- ═════════ 3) الاشتراكات: تعديل الاشتراك لا يعيد تاريخ بدايته لليوم ═════════
create or replace function public.admin_set_school_subscription(p_school uuid, p_plan uuid, p_status text, p_period text, p_starts_on date, p_ends_on date)
returns void language plpgsql security definer set search_path = '' as $$
declare v_price numeric;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select monthly_price into v_price from public.masari_plans where id = p_plan;
  if v_price is null then raise exception 'PLAN_NOT_FOUND' using errcode = 'P0002'; end if;
  insert into public.school_subscriptions (school_id, plan_id, status, billing_period, monthly_price, starts_on, ends_on, updated_at, updated_by)
    values (p_school, p_plan, p_status, p_period, v_price, coalesce(p_starts_on, current_date), p_ends_on, now(), (select auth.uid()))
  on conflict (school_id) do update set plan_id = excluded.plan_id, status = excluded.status, billing_period = excluded.billing_period,
    monthly_price = excluded.monthly_price,
    starts_on = coalesce(p_starts_on, public.school_subscriptions.starts_on),
    ends_on = excluded.ends_on, updated_at = now(), updated_by = excluded.updated_by;
  perform private.audit(p_school, 'subscription_set', 'school_subscriptions', p_school::text, null,
    jsonb_build_object('plan', p_plan, 'status', p_status, 'period', p_period, 'starts_on', p_starts_on, 'ends_on', p_ends_on));
end $$;

-- ═════════ 4) حدود الباقة يفرضها الخادم ═════════
create or replace function private.plan_limits(p_school uuid) returns table (max_buses int, max_students int)
language sql stable security definer set search_path = '' as $$
  select p.max_buses, p.max_students from public.school_subscriptions s join public.masari_plans p on p.id = s.plan_id
  where s.school_id = p_school and s.status in ('trial','active','past_due')
$$;

create or replace function private.enforce_plan_buses() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_max int;
begin
  if private.is_platform_admin() or new.status <> 'active' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'active' then return new; end if;
  select max_buses into v_max from private.plan_limits(new.school_id);
  if v_max is not null and (select count(*) from public.buses b where b.school_id = new.school_id and b.status = 'active' and b.id <> new.id) >= v_max then
    raise exception 'PLAN_LIMIT_BUSES' using errcode = 'P0001';
  end if;
  return new;
end $$;
create or replace trigger buses_plan_limit before insert or update of status on public.buses
  for each row execute function private.enforce_plan_buses();

create or replace function private.enforce_plan_students() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_max int;
begin
  if private.is_platform_admin() or new.service_status <> 'active' then return new; end if;
  if tg_op = 'UPDATE' and old.service_status = 'active' and old.school_id = new.school_id then return new; end if;
  select max_students into v_max from private.plan_limits(new.school_id);
  if v_max is not null and (select count(*) from public.students s where s.school_id = new.school_id and s.service_status = 'active' and s.id <> new.id) >= v_max then
    raise exception 'PLAN_LIMIT_STUDENTS' using errcode = 'P0001';
  end if;
  return new;
end $$;
create or replace trigger students_plan_limit before insert or update of service_status, school_id on public.students
  for each row execute function private.enforce_plan_students();

-- ═════════ 5) صحة النظام اليومية ═════════
create or replace function public.admin_health() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_day date := private.riyadh_today(); v jsonb;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select jsonb_build_object(
    'date', v_day,
    -- مسارات تعمل اليوم بلا رحلة، مع السبب
    'routes_without_trips', coalesce((select jsonb_agg(x order by x->>'school') from (
        select jsonb_build_object('school', s.name, 'school_id', s.id, 'route', r.name, 'route_id', r.id,
                                  'reason', coalesce(private.route_not_ready(r.id, v_day), 'NOT_CREATED')) x
        from public.routes r join public.schools s on s.id = r.school_id and s.status = 'active'
        where r.is_active and r.archived_at is null
          and extract(dow from v_day)::smallint = any(coalesce(r.days, '{0,1,2,3,4}'::smallint[]))
          and not private.is_school_holiday(s.id, v_day)
          and not exists (select 1 from public.trips t where t.route_id = r.id and t.trip_date = v_day)
        limit 200) q), '[]'::jsonb),
    -- رحلات جارية انقطع موقعها أكثر من 5 دقائق
    'stale_trips', coalesce((select jsonb_agg(jsonb_build_object('trip_id', t.id, 'school', s.name, 'route', r.name, 'driver', d.full_name,
          'last_seen', (select max(v.recorded_at) from public.vehicle_locations v where v.trip_id = t.id)))
        from public.trips t join public.schools s on s.id = t.school_id join public.routes r on r.id = t.route_id
        left join public.drivers d on d.id = t.driver_id
        where t.status = 'in_progress' and coalesce((select max(v.recorded_at) from public.vehicle_locations v where v.trip_id = t.id), t.started_at, now()) < now() - interval '5 minutes'), '[]'::jsonb),
    'failed_messages_24h', (select count(*) from private.message_outbox m where m.status = 'failed' and m.created_at > now() - interval '24 hours'),
    'client_errors_24h', (select count(*) from public.client_errors e where e.created_at > now() - interval '24 hours'),
    'open_emergencies', (select count(*) from public.emergency_reports e where e.status <> 'resolved'),
    'open_alerts', (select count(*) from public.trip_alerts a where a.status <> 'resolved'),
    'open_tickets', (select count(*) from public.support_tickets k where k.status <> 'closed'),
    'pending_claims', (select count(*) from public.school_claim_requests c where c.status in ('new','contacting')),
    -- رخص ووثائق تنتهي خلال 30 يومًا (أو انتهت)
    'expiring', coalesce((select jsonb_agg(x order by x->>'date') from (
        select jsonb_build_object('kind', 'license', 'school', s.name, 'name', d.full_name, 'date', d.license_expiry) x
          from public.drivers d join public.schools s on s.id = d.school_id
          where d.status = 'active' and d.license_expiry is not null and d.license_expiry <= v_day + 30
        union all
        select jsonb_build_object('kind', k.kind, 'school', s.name, 'name', 'باص ' || b.bus_number, 'date', k.d)
          from public.buses b join public.schools s on s.id = b.school_id
          cross join lateral (values ('registration', b.registration_expiry), ('insurance', b.insurance_expiry), ('inspection', b.inspection_expiry)) k(kind, d)
          where b.status <> 'inactive' and k.d is not null and k.d <= v_day + 30
        limit 200) q), '[]'::jsonb)
  ) into v;
  return v;
end $$;
grant execute on function public.admin_health() to authenticated;

-- ═════════ 6) الدعم الفني ═════════
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  school_id uuid references public.schools(id) on delete set null,
  subject text not null check (char_length(btrim(subject)) between 3 and 120),
  category text not null default 'general' check (category in ('general','bug','account','billing','upgrade','data')),
  status text not null default 'open' check (status in ('open','answered','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_tickets_creator_idx on public.support_tickets(created_by, updated_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets(status, updated_at desc);
create index if not exists support_tickets_school_idx on public.support_tickets(school_id);
create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid default auth.uid() references auth.users(id) on delete set null,
  from_staff boolean not null default false,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists support_ticket_messages_ticket_idx on public.support_ticket_messages(ticket_id, created_at);
create index if not exists support_ticket_messages_author_idx on public.support_ticket_messages(author_id);
alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
create policy support_tickets_read on public.support_tickets for select to authenticated
  using (created_by = (select auth.uid()) or private.is_platform_admin());
create policy support_ticket_messages_read on public.support_ticket_messages for select to authenticated
  using (exists (select 1 from public.support_tickets t where t.id = ticket_id and (t.created_by = (select auth.uid()) or private.is_platform_admin())));
grant select on public.support_tickets, public.support_ticket_messages to authenticated;

create or replace function public.open_ticket(p_subject text, p_category text, p_body text, p_school uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_school uuid := p_school;
begin
  if (select auth.uid()) is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  if coalesce(btrim(p_body), '') = '' then raise exception 'BODY_REQUIRED' using errcode = 'P0001'; end if;
  if v_school is not null and not private.user_in_school(v_school) then v_school := null; end if;
  if (select count(*) from public.support_tickets where created_by = (select auth.uid()) and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
  insert into public.support_tickets (subject, category, school_id) values (btrim(p_subject), coalesce(p_category, 'general'), v_school) returning id into v_id;
  insert into public.support_ticket_messages (ticket_id, body) values (v_id, btrim(p_body));
  perform private.notify_platform_admins('support_ticket', 'تذكرة دعم جديدة', btrim(p_subject), 'ticket:' || v_id, jsonb_build_object('ticket_id', v_id), v_school);
  return v_id;
end $$;

create or replace function public.reply_ticket(p_ticket uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.support_tickets; v_staff boolean := private.is_platform_admin();
begin
  select * into t from public.support_tickets where id = p_ticket for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not (v_staff or t.created_by = (select auth.uid())) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if coalesce(btrim(p_body), '') = '' then raise exception 'BODY_REQUIRED' using errcode = 'P0001'; end if;
  insert into public.support_ticket_messages (ticket_id, body, from_staff) values (p_ticket, btrim(p_body), v_staff);
  update public.support_tickets set status = case when v_staff then 'answered' else 'open' end, updated_at = now() where id = p_ticket;
  if v_staff then
    insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
    values (t.created_by, t.school_id, 'support_reply', 'رد الدعم الفني: ' || t.subject, left(btrim(p_body), 200),
            jsonb_build_object('ticket_id', p_ticket), 'ticket_reply:' || p_ticket || ':' || now()::text)
    on conflict (user_id, dedupe_key) do nothing;
  else
    perform private.notify_platform_admins('support_ticket', 'رد على تذكرة: ' || t.subject, left(btrim(p_body), 200),
      'ticket_msg:' || p_ticket || ':' || now()::text, jsonb_build_object('ticket_id', p_ticket), t.school_id);
  end if;
end $$;

create or replace function public.set_ticket_status(p_ticket uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.support_tickets;
begin
  select * into t from public.support_tickets where id = p_ticket;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  -- صاحب التذكرة يغلقها فقط، ومدير النظام يغيّرها كما يشاء
  if not (private.is_platform_admin() or (t.created_by = (select auth.uid()) and p_status = 'closed')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_status not in ('open','answered','closed') then raise exception 'BAD_STATUS' using errcode = '22023'; end if;
  update public.support_tickets set status = p_status, updated_at = now() where id = p_ticket;
end $$;
grant execute on function public.open_ticket(text, text, text, uuid), public.reply_ticket(uuid, text), public.set_ticket_status(uuid, text) to authenticated;

-- ═════════ 7) الإعلانات ═════════
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  body text not null check (char_length(btrim(body)) between 3 and 1000),
  audience text not null default 'all' check (audience in ('all','school','driver','parent')),
  region text,
  tone text not null default 'info' check (tone in ('info','warning')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists announcements_active_idx on public.announcements(starts_at desc);
create index if not exists announcements_creator_idx on public.announcements(created_by);
alter table public.announcements enable row level security;
create policy announcements_admin_read on public.announcements for select to authenticated using (private.is_platform_admin());
grant select on public.announcements to authenticated;

-- من يستهدفهم الإعلان (حسابات مفعّلة)
create or replace function private.announcement_targets(p_audience text, p_region text) returns table (user_id uuid)
language sql stable security definer set search_path = '' as $$
  select distinct u from (
    select m.user_id u, s.region from public.school_members m join public.schools s on s.id = m.school_id
      where m.status = 'active' and p_audience in ('all','school')
    union all
    select d.user_id, s.region from public.drivers d join public.schools s on s.id = d.school_id
      where d.status = 'active' and d.user_id is not null and p_audience in ('all','driver')
    union all
    select g.user_id, s.region from public.guardians g join public.schools s on s.id = g.school_id
      where g.status = 'active' and g.user_id is not null and p_audience in ('all','parent')
  ) x
  join public.profiles p on p.user_id = x.u and p.status = 'active'
  where p_region is null or x.region = p_region
$$;

create or replace function public.admin_post_announcement(p_title text, p_body text, p_audience text, p_region text, p_tone text, p_ends_at timestamptz, p_notify boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_n int := 0;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  insert into public.announcements (title, body, audience, region, tone, ends_at)
    values (btrim(p_title), btrim(p_body), coalesce(p_audience, 'all'), nullif(btrim(p_region), ''), coalesce(p_tone, 'info'), p_ends_at)
    returning id into v_id;
  if coalesce(p_notify, true) then
    insert into public.notifications (user_id, type, title, body, data, dedupe_key)
    select t.user_id, 'announcement', btrim(p_title), left(btrim(p_body), 300), jsonb_build_object('announcement_id', v_id), 'announcement:' || v_id
    from private.announcement_targets(coalesce(p_audience, 'all'), nullif(btrim(p_region), '')) t
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics v_n = row_count;
  end if;
  perform private.audit(null, 'announcement', 'announcements', v_id::text, null,
    jsonb_build_object('title', p_title, 'audience', p_audience, 'region', p_region, 'notified', v_n));
  return jsonb_build_object('id', v_id, 'notified', v_n);
end $$;

create or replace function public.admin_end_announcement(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  update public.announcements set ends_at = now() where id = p_id;
end $$;

-- الإعلانات السارية لهذا المستخدم (شريط داخل التطبيق)
create or replace function public.my_announcements() returns table (id uuid, title text, body text, tone text, starts_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.id, a.title, a.body, a.tone, a.starts_at from public.announcements a
  where a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
    and ((select auth.uid()) in (select t.user_id from private.announcement_targets(a.audience, a.region) t) or private.is_platform_admin())
  order by a.starts_at desc limit 5
$$;
grant execute on function public.admin_post_announcement(text, text, text, text, text, timestamptz, boolean), public.admin_end_announcement(uuid), public.my_announcements() to authenticated;

-- ═════════ 8) سجل التدقيق: بحث وفلترة ═════════
create or replace function public.admin_audit_search(p_actor text default null, p_school uuid default null, p_action text default null,
  p_from date default null, p_to date default null, p_limit int default 300)
returns table (id uuid, created_at timestamptz, action text, table_name text, record_id text, actor_id uuid, actor_email text,
               school_id uuid, school_name text, old_values jsonb, new_values jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return query
  select l.id, l.created_at, l.action, l.table_name, l.record_id, l.actor_id, u.email::text, l.school_id, s.name, l.old_values, l.new_values
  from public.audit_logs l
  left join auth.users u on u.id = l.actor_id
  left join public.schools s on s.id = l.school_id
  where (p_actor is null or u.email ilike '%' || btrim(p_actor) || '%')
    and (p_school is null or l.school_id = p_school)
    and (p_action is null or l.action = p_action)
    and (p_from is null or l.created_at >= p_from::timestamptz)
    and (p_to is null or l.created_at < (p_to + 1)::timestamptz)
  order by l.created_at desc
  limit least(greatest(coalesce(p_limit, 300), 1), 2000);
end $$;
grant execute on function public.admin_audit_search(text, uuid, text, date, date, int) to authenticated;

-- ═════════ 9) أدوات المستخدمين ═════════
-- تسجيل خروج الحساب من كل الأجهزة (يُستخدم مع الإيقاف)
create or replace function public.admin_revoke_sessions(p_user uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_user = (select auth.uid()) then raise exception 'CANNOT_CHANGE_SELF' using errcode = 'P0001'; end if;
  update auth.refresh_tokens set revoked = true where user_id = p_user::text and revoked is not true;
  get diagnostics n = row_count;
  update auth.sessions set not_after = now() where user_id = p_user and (not_after is null or not_after > now());
  perform private.audit(null, 'sessions_revoked', 'auth.sessions', p_user::text, null, jsonb_build_object('tokens', n));
  return n;
end $$;

-- دمج حساب مكرر في حساب آخر: تنتقل ارتباطاته (مدرسة، سائق، ولي أمر، أدوار) ثم يُوقف الحساب المكرر
create or replace function public.admin_merge_accounts(p_from uuid, p_into uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n_m int := 0; n_d int := 0; n_g int := 0; n_r int := 0;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_from = p_into then raise exception 'SAME_ACCOUNT' using errcode = 'P0001'; end if;
  if p_from = (select auth.uid()) or p_into = (select auth.uid()) then raise exception 'CANNOT_CHANGE_SELF' using errcode = 'P0001'; end if;
  if not exists (select 1 from auth.users where id = p_from) or not exists (select 1 from auth.users where id = p_into) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform set_config('masari.trusted', 'on', true);
  update public.school_members m set user_id = p_into where m.user_id = p_from
    and not exists (select 1 from public.school_members x where x.school_id = m.school_id and x.user_id = p_into);
  get diagnostics n_m = row_count;
  update public.school_members set status = 'suspended' where user_id = p_from;
  if not exists (select 1 from public.drivers where user_id = p_into) then
    update public.drivers set user_id = p_into where user_id = p_from;
    get diagnostics n_d = row_count;
  end if;
  update public.guardians g set user_id = p_into where g.user_id = p_from
    and not exists (select 1 from public.guardians x where x.school_id = g.school_id and x.user_id = p_into);
  get diagnostics n_g = row_count;
  -- ولي أمر مكرر في نفس المدرسة: أبناؤه ينتقلون لسجل الحساب الأساسي
  update public.guardian_students gs set guardian_id = keep.id
    from public.guardians dup, public.guardians keep
    where gs.guardian_id = dup.id and dup.user_id = p_from and keep.user_id = p_into and keep.school_id = dup.school_id
      and not exists (select 1 from public.guardian_students y where y.guardian_id = keep.id and y.student_id = gs.student_id);
  update public.guardians set status = 'suspended' where user_id = p_from;
  insert into public.user_roles (user_id, role, region, created_by)
    select p_into, r.role, r.region, (select auth.uid()) from public.user_roles r where r.user_id = p_from
    on conflict (user_id, role) do nothing;
  get diagnostics n_r = row_count;
  update public.profiles set status = 'active' where user_id = p_into and status = 'pending';
  update public.profiles set status = 'suspended' where user_id = p_from;
  perform private.audit(null, 'accounts_merged', 'profiles', p_from::text, jsonb_build_object('from', p_from),
    jsonb_build_object('into', p_into, 'schools', n_m, 'drivers', n_d, 'guardians', n_g, 'roles', n_r));
  return jsonb_build_object('schools', n_m, 'drivers', n_d, 'guardians', n_g, 'roles', n_r);
end $$;

-- نقل سائق إلى مدرسة أخرى: يُفك من باصاته ومساراته في المدرسة القديمة
create or replace function public.admin_transfer_driver(p_driver uuid, p_school uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.drivers;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into d from public.drivers where id = p_driver for update;
  if not found or not exists (select 1 from public.schools where id = p_school and status = 'active') then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if d.school_id = p_school then return; end if;
  if exists (select 1 from public.trips t where t.driver_id = p_driver and t.trip_date >= private.riyadh_today()
             and t.status in ('scheduled','ready','in_progress','paused','emergency')) then
    raise exception 'DRIVER_HAS_TRIPS' using errcode = 'P0001';
  end if;
  update public.routes set driver_id = null where driver_id = p_driver;
  update public.buses set driver_id = null where driver_id = p_driver;
  update public.drivers set school_id = p_school, updated_at = now() where id = p_driver;
  perform private.audit(p_school, 'driver_transferred', 'drivers', p_driver::text, jsonb_build_object('school_id', d.school_id), jsonb_build_object('school_id', p_school));
end $$;

-- نقل طالب إلى مدرسة أخرى مع أولياء أمره (يُنشأ لهم سجل في المدرسة الجديدة بنفس الحساب أو البريد)
create or replace function public.admin_transfer_student(p_student uuid, p_school uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.students; l record; v_new uuid;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into s from public.students where id = p_student for update;
  if not found or not exists (select 1 from public.schools where id = p_school and status = 'active') then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if s.school_id = p_school then return; end if;
  update public.student_route_assignments set status = 'inactive' where student_id = p_student and status = 'active';
  begin
    update public.students set school_id = p_school, updated_at = now() where id = p_student;
  exception when unique_violation then raise exception 'DUPLICATE_STUDENT' using errcode = 'P0001';
  end;
  perform set_config('masari.trusted', 'on', true);
  for l in select gs.id link_id, g.* from public.guardian_students gs join public.guardians g on g.id = gs.guardian_id where gs.student_id = p_student loop
    v_new := null;
    if l.user_id is not null then select id into v_new from public.guardians where school_id = p_school and user_id = l.user_id; end if;
    if v_new is null and l.email is not null then select id into v_new from public.guardians where school_id = p_school and lower(email) = lower(l.email) limit 1; end if;
    if v_new is null then
      insert into public.guardians (school_id, user_id, full_name, phone, email, status)
        values (p_school, l.user_id, l.full_name, l.phone, l.email, 'active') returning id into v_new;
    end if;
    update public.guardian_students set guardian_id = v_new where id = l.link_id;
  end loop;
  perform private.audit(p_school, 'student_transferred', 'students', p_student::text, jsonb_build_object('school_id', s.school_id), jsonb_build_object('school_id', p_school));
end $$;
grant execute on function public.admin_revoke_sessions(uuid), public.admin_merge_accounts(uuid, uuid),
  public.admin_transfer_driver(uuid, uuid), public.admin_transfer_student(uuid, uuid) to authenticated;

-- ═════════ 10) الإيرادات والاشتراكات ═════════
create or replace function public.admin_revenue() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_day date := private.riyadh_today();
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return jsonb_build_object(
    'mrr', (select coalesce(sum(monthly_price), 0) from public.school_subscriptions where status = 'active'),
    'due_total', (select coalesce(sum(total), 0) from public.masari_invoices where status = 'issued'),
    'overdue_total', (select coalesce(sum(total), 0) from public.masari_invoices where status = 'issued' and due_date < v_day),
    'paid_this_month', (select coalesce(sum(total), 0) from public.masari_invoices where status = 'paid' and paid_at >= date_trunc('month', v_day::timestamptz)),
    'overdue', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'number', i.number, 'school', s.name, 'total', i.total, 'due_date', i.due_date) order by i.due_date)
        from public.masari_invoices i join public.schools s on s.id = i.school_id where i.status = 'issued' and i.due_date < v_day), '[]'::jsonb),
    'expiring', coalesce((select jsonb_agg(jsonb_build_object('school', s.name, 'school_id', s.id, 'ends_on', sub.ends_on, 'status', sub.status) order by sub.ends_on)
        from public.school_subscriptions sub join public.schools s on s.id = sub.school_id
        where sub.ends_on is not null and sub.ends_on <= v_day + 14 and sub.status in ('trial','active','past_due')), '[]'::jsonb),
    'near_limit', coalesce((select jsonb_agg(jsonb_build_object('school', s.name, 'students', st.n, 'max_students', p.max_students, 'buses', bs.n, 'max_buses', p.max_buses))
        from public.school_subscriptions sub join public.masari_plans p on p.id = sub.plan_id join public.schools s on s.id = sub.school_id
        cross join lateral (select count(*) n from public.students x where x.school_id = s.id and x.service_status = 'active') st
        cross join lateral (select count(*) n from public.buses x where x.school_id = s.id and x.status = 'active') bs
        where (p.max_students is not null and st.n >= p.max_students * 0.9) or (p.max_buses is not null and bs.n >= p.max_buses)), '[]'::jsonb)
  );
end $$;
grant execute on function public.admin_revenue() to authenticated;

-- يوميًا: تنبيه قبل انتهاء الاشتراك بأسبوعين، واعتبار الاشتراك متأخرًا إذا تأخرت فاتورته أسبوعًا
create or replace function private.subscription_reminders() returns void
language plpgsql security definer set search_path = '' as $$
declare r record; v_day date := private.riyadh_today();
begin
  for r in select sub.school_id, sub.ends_on, s.name from public.school_subscriptions sub join public.schools s on s.id = sub.school_id
           where sub.ends_on between v_day and v_day + 14 and sub.status in ('trial','active') loop
    insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
    select m.user_id, r.school_id, 'subscription_expiring', 'اشتراك مساري ينتهي قريبًا',
           'ينتهي اشتراك ' || r.name || ' في ' || r.ends_on || '. جدّده من «اشتراك مساري» حتى لا تتوقف الخدمة.',
           jsonb_build_object('ends_on', r.ends_on), 'sub_expiring:' || r.school_id || ':' || r.ends_on
    from public.school_members m where m.school_id = r.school_id and m.status = 'active' and m.role = 'school_admin'
    on conflict (user_id, dedupe_key) do nothing;
    perform private.notify_platform_admins('subscription_expiring', 'اشتراك ينتهي: ' || r.name, 'ينتهي في ' || r.ends_on,
      'sub_expiring_admin:' || r.school_id || ':' || r.ends_on, jsonb_build_object('school_id', r.school_id), r.school_id);
  end loop;
  update public.school_subscriptions sub set status = 'past_due', updated_at = now()
    where sub.status = 'active' and exists (select 1 from public.masari_invoices i where i.school_id = sub.school_id
      and i.status = 'issued' and i.due_date < v_day - 7);
end $$;
select cron.schedule('masari-subscription-reminders', '20 5 * * *', $$select private.subscription_reminders()$$);

-- ═════════ 11) تصدير بيانات المستخدم (نظام حماية البيانات الشخصية) ═════════
create or replace function public.export_my_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v jsonb;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  select jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('email', u.email, 'created_at', u.created_at) from auth.users u where u.id = v_uid),
    'profile', (select to_jsonb(p) - 'user_id' from public.profiles p where p.user_id = v_uid),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('role', r.role, 'region', r.region)) from public.user_roles r where r.user_id = v_uid), '[]'::jsonb),
    'school_memberships', coalesce((select jsonb_agg(jsonb_build_object('school', s.name, 'role', m.role, 'status', m.status))
        from public.school_members m join public.schools s on s.id = m.school_id where m.user_id = v_uid), '[]'::jsonb),
    'driver', (select jsonb_build_object('name', d.full_name, 'phone', d.phone, 'email', d.email, 'license_number', d.license_number, 'license_expiry', d.license_expiry, 'school', s.name)
        from public.drivers d join public.schools s on s.id = d.school_id where d.user_id = v_uid),
    'guardian_of', coalesce((select jsonb_agg(jsonb_build_object('student', st.full_name, 'grade', st.grade, 'school', s.name, 'home_address', st.home_address,
          'home_latitude', st.home_latitude, 'home_longitude', st.home_longitude, 'relation', gs.relation))
        from public.guardians g join public.guardian_students gs on gs.guardian_id = g.id join public.students st on st.id = gs.student_id
        join public.schools s on s.id = st.school_id where g.user_id = v_uid), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(jsonb_build_object('type', n.type, 'title', n.title, 'body', n.body, 'created_at', n.created_at) order by n.created_at desc)
        from (select * from public.notifications where user_id = v_uid order by created_at desc limit 500) n), '[]'::jsonb),
    'support_tickets', coalesce((select jsonb_agg(jsonb_build_object('subject', t.subject, 'status', t.status, 'created_at', t.created_at,
          'messages', (select jsonb_agg(jsonb_build_object('from_staff', m.from_staff, 'body', m.body, 'at', m.created_at) order by m.created_at) from public.support_ticket_messages m where m.ticket_id = t.id)))
        from public.support_tickets t where t.created_by = v_uid), '[]'::jsonb)
  ) into v;
  perform private.audit(null, 'data_export', 'auth.users', v_uid::text, null, null);
  return v;
end $$;
grant execute on function public.export_my_data() to authenticated;
