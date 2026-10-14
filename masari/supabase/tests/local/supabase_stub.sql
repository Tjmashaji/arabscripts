-- بديل محلي مصغّر لما توفّره Supabase، حتى تُطبّق الترحيلات وتُختبر على Postgres عادي.
-- لا يُستخدم في الإنتاج إطلاقًا.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema if not exists auth;
create schema if not exists extensions;
create schema if not exists storage;
create schema if not exists cron;
create schema if not exists net;
create extension if not exists pgcrypto with schema extensions;
alter database current_database_placeholder set search_path = public, extensions;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid, aud text default 'authenticated', role text default 'authenticated',
  email text unique, phone text, encrypted_password text,
  email_confirmed_at timestamptz, phone_confirmed_at timestamptz, confirmed_at timestamptz,
  last_sign_in_at timestamptz, raw_app_meta_data jsonb default '{}'::jsonb, raw_user_meta_data jsonb default '{}'::jsonb,
  is_anonymous boolean default false, banned_until timestamptz, deleted_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, provider text, identity_data jsonb, created_at timestamptz default now());
create table if not exists auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, created_at timestamptz default now(), not_after timestamptz);
create table if not exists auth.refresh_tokens (id bigserial primary key, user_id text, session_id uuid, revoked boolean default false, created_at timestamptz default now());

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt()->>'sub', '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(auth.jwt()->>'role', 'anon') $$;
create or replace function auth.email() returns text language sql stable as $$
  select auth.jwt()->>'email' $$;

create table if not exists storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[], owner uuid, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;

create table if not exists cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text);
create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint language plpgsql as $$
declare j bigint; begin
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid into j; return j; end $$;
create or replace function cron.unschedule(job_name text) returns boolean language sql as $$
  with d as (delete from cron.job where jobname = job_name returning 1) select exists(select 1 from d) $$;

create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000)
returns bigint language sql as $$ select 0::bigint $$;

grant usage on schema auth, extensions, storage to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
grant select on auth.users to service_role;
grant all on storage.objects, storage.buckets to authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
-- Supabase يمنح هذه الصلاحيات افتراضيًا على الجداول الجديدة في public؛ RLS هي الحاجز الفعلي.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

do $$ begin
  if not exists (select 1 from pg_publication where pubname='supabase_realtime') then create publication supabase_realtime; end if;
end $$;
