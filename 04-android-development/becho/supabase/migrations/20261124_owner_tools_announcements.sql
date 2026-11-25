begin;

create policy "Platform owners manage all listings"
  on public.listings for all to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_owner')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_owner');

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  body text not null check (char_length(btrim(body)) between 3 and 1000),
  severity text not null default 'info'
    check (severity in ('info', 'success', 'warning', 'urgent')),
  is_active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create index announcements_active_start_idx
  on public.announcements (is_active, starts_at desc);

alter table public.announcements enable row level security;

create policy "Anyone reads current announcements"
  on public.announcements for select to anon, authenticated
  using (
    is_active
    and starts_at <= now()
    and (ends_at is null or ends_at > now())
  );

create policy "Only platform owners manage announcements"
  on public.announcements for all to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_owner')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_owner');

grant select on public.announcements to anon, authenticated;
grant insert, update, delete on public.announcements to authenticated;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'announcements'
  ) then
    alter publication supabase_realtime add table public.announcements;
  end if;
end;
$$;

commit;
