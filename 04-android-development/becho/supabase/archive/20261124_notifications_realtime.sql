begin;

create or replace function public.notify_deal_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  listing_title text;
  recipient uuid;
begin
  if new.status = old.status then
    return new;
  end if;

  select title into listing_title
  from public.listings
  where id = new.listing_id;

  recipient := case
    when auth.uid() = new.buyer_id then new.seller_id
    else new.buyer_id
  end;

  insert into public.notifications (
    recipient_id,
    actor_id,
    notification_type,
    title,
    body,
    data
  )
  values (
    recipient,
    auth.uid(),
    case when new.status = 'completed' then 'deal_completed' else 'deal_cancelled' end,
    case when new.status = 'completed' then 'Deal completed' else 'Deal cancelled' end,
    case
      when new.status = 'completed'
        then 'The deal for ' || coalesce(listing_title, 'a listing') || ' is complete.'
      else 'The deal for ' || coalesce(listing_title, 'a listing') || ' was cancelled.'
    end,
    jsonb_build_object('listing_id', new.listing_id, 'deal_id', new.id)
  );

  return new;
end;
$$;

drop trigger if exists deals_notify_activity on public.deals;
create trigger deals_notify_activity
  after update of status on public.deals
  for each row execute function public.notify_deal_activity();

create table if not exists public.listing_activity_counts (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  view_count bigint not null default 0 check (view_count >= 0),
  like_count bigint not null default 0 check (like_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.listing_activity_counts enable row level security;
drop policy if exists "Anyone can read listing activity counts"
  on public.listing_activity_counts;
create policy "Anyone can read listing activity counts"
  on public.listing_activity_counts for select to anon, authenticated
  using (true);
revoke all on public.listing_activity_counts from public, anon, authenticated;
grant select on public.listing_activity_counts to anon, authenticated;

insert into public.listing_activity_counts (listing_id, view_count, like_count)
select
  l.id,
  coalesce(views.view_count, 0),
  coalesce(likes.like_count, 0)
from public.listings l
left join (
  select listing_id, count(*) as view_count
  from public.listing_views
  group by listing_id
) views on views.listing_id = l.id
left join (
  select listing_id, count(*) as like_count
  from public.listing_likes
  group by listing_id
) likes on likes.listing_id = l.id
on conflict (listing_id) do update set
  view_count = excluded.view_count,
  like_count = excluded.like_count,
  updated_at = now();

create or replace function public.update_listing_activity_counts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_listing_id uuid;
begin
  if tg_op = 'INSERT' then
    target_listing_id := new.listing_id;
    if tg_table_name = 'listing_likes' then
      insert into public.listing_activity_counts (listing_id, like_count)
      values (target_listing_id, 1)
      on conflict (listing_id) do update
        set like_count = public.listing_activity_counts.like_count + 1,
            updated_at = now();
    else
      insert into public.listing_activity_counts (listing_id, view_count)
      values (target_listing_id, 1)
      on conflict (listing_id) do update
        set view_count = public.listing_activity_counts.view_count + 1,
            updated_at = now();
    end if;
    return new;
  end if;

  target_listing_id := old.listing_id;
  if tg_table_name = 'listing_likes' then
    update public.listing_activity_counts
    set like_count = greatest(like_count - 1, 0), updated_at = now()
    where listing_id = target_listing_id;
  else
    update public.listing_activity_counts
    set view_count = greatest(view_count - 1, 0), updated_at = now()
    where listing_id = target_listing_id;
  end if;
  return old;
end;
$$;

drop trigger if exists listing_likes_activity_counts on public.listing_likes;
create trigger listing_likes_activity_counts
  after insert or delete on public.listing_likes
  for each row execute function public.update_listing_activity_counts();

drop trigger if exists listing_views_activity_counts on public.listing_views;
create trigger listing_views_activity_counts
  after insert or delete on public.listing_views
  for each row execute function public.update_listing_activity_counts();

create table if not exists public.device_push_tokens (
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, expo_push_token)
);

alter table public.device_push_tokens enable row level security;
drop policy if exists "Users manage their own device push tokens"
  on public.device_push_tokens;
create policy "Users manage their own device push tokens"
  on public.device_push_tokens for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.device_push_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.device_push_tokens to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    raise exception 'Supabase Realtime publication supabase_realtime was not found';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'listing_activity_counts'
  ) then
    alter publication supabase_realtime add table public.listing_activity_counts;
  end if;
end;
$$;

commit;
