-- Run once in a new, empty Supabase project before the marketplace migration.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  city text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are publicly readable"
  on public.profiles for select to anon, authenticated
  using (true);

create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke all on public.profiles from public, anon, authenticated;
grant select (id, full_name, city, avatar_url) on public.profiles to anon, authenticated;
grant update (full_name, phone, city, avatar_url) on public.profiles to authenticated;

create or replace function public.get_my_phone()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select phone from public.profiles where id = (select auth.uid());
$$;

grant execute on function public.get_my_phone() to authenticated;
revoke all on function public.get_my_phone() from public, anon;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null,
  title text not null check (char_length(btrim(title)) >= 4),
  description text,
  listing_type text not null check (listing_type in ('SELL', 'RENT')),
  category text not null,
  price numeric(12, 2) not null check (price > 0),
  rent_period text,
  security_deposit numeric(12, 2) not null default 0 check (security_deposit >= 0),
  city text not null,
  locality text,
  latitude double precision,
  longitude double precision,
  images text[] not null default '{}',
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SOLD', 'RENTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seller_id foreign key (seller_id)
    references public.profiles(id) on delete cascade,
  constraint listings_rent_period_check check (
    (listing_type = 'SELL' and rent_period is null)
    or (
      listing_type = 'RENT'
      and rent_period is not null
      and rent_period in ('DAY', 'WEEK', 'MONTH')
    )
  )
);

create index listings_status_created_idx
  on public.listings (status, created_at desc);
create index listings_seller_created_idx
  on public.listings (seller_id, created_at desc);

alter table public.listings enable row level security;

create policy "Anyone can read listings"
  on public.listings for select to anon, authenticated
  using (true);

create policy "Sellers create their own listings"
  on public.listings for insert to authenticated
  with check (seller_id = (select auth.uid()));

create policy "Sellers update their own listings"
  on public.listings for update to authenticated
  using (seller_id = (select auth.uid()))
  with check (seller_id = (select auth.uid()));

create policy "Sellers delete their own listings"
  on public.listings for delete to authenticated
  using (seller_id = (select auth.uid()));

grant select on public.listings to anon, authenticated;
grant insert, update, delete on public.listings to authenticated;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null,
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 500),
  created_at timestamptz not null default now(),
  constraint listing_id foreign key (listing_id)
    references public.listings(id) on delete cascade,
  constraint messages_sender_receiver_check check (sender_id <> receiver_id)
);

create index messages_listing_created_idx
  on public.messages (listing_id, created_at desc);
create index messages_sender_created_idx
  on public.messages (sender_id, created_at desc);
create index messages_receiver_created_idx
  on public.messages (receiver_id, created_at desc);

alter table public.messages enable row level security;

create policy "Participants read their messages"
  on public.messages for select to authenticated
  using (sender_id = (select auth.uid()) or receiver_id = (select auth.uid()));

create policy "Users send messages about active listings"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1
      from public.listings l
      where l.id = listing_id
        and l.status = 'ACTIVE'
        and (
          (l.seller_id = sender_id and l.seller_id <> receiver_id)
          or (l.seller_id = receiver_id and l.seller_id <> sender_id)
        )
    )
  );

grant select, insert on public.messages to authenticated;

insert into storage.buckets (id, name, public)
values ('listing-images', 'listing-images', true);

create policy "Anyone can view listing images"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'listing-images');

create policy "Users upload images to their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users update images in their own folder"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users delete images in their own folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'The Supabase Realtime publication is missing';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
end;
$$;
