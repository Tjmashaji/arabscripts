-- ملف المدرسة الكامل عند التسجيل: الاسم بالإنجليزية والوصف والتواصل والشعار والمنطقة الزمنية والمواعيد الافتراضية.
alter table public.schools add column if not exists name_en text;
alter table public.schools add column if not exists description text;
alter table public.schools add column if not exists email text;
alter table public.schools add column if not exists website text;
alter table public.schools add column if not exists logo_url text;
alter table public.schools add column if not exists timezone text not null default 'Asia/Riyadh';
alter table public.schools add column if not exists default_pickup_time time not null default '07:00';
alter table public.schools add column if not exists default_dropoff_time time not null default '14:00';

-- شعارات المدارس: قراءة عامة، والرفع لكل مستخدم داخل مجلده فقط (uid/…).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-logos', 'school-logos', true, 2097152, array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do nothing;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'masari_school_logos_insert') then
    create policy masari_school_logos_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'school-logos' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'masari_school_logos_update') then
    create policy masari_school_logos_update on storage.objects for update to authenticated
      using (bucket_id = 'school-logos' and (storage.foldername(name))[1] = (select auth.uid())::text)
      with check (bucket_id = 'school-logos' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
end $$;
