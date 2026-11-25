create table if not exists public.saved_listings (
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id),
  constraint listing_id foreign key (listing_id)
    references public.listings(id) on delete cascade
);

create table if not exists public.listing_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id),
  constraint listing_id foreign key (listing_id)
    references public.listings(id) on delete cascade
);

create table if not exists public.listing_views (
  viewer_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null,
  view_date date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (viewer_id, listing_id, view_date),
  constraint listing_id foreign key (listing_id)
    references public.listings(id) on delete cascade
);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  message text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (buyer_id <> seller_id),
  constraint listing_id foreign key (listing_id)
    references public.listings(id) on delete cascade
);

create index if not exists offers_listing_created_idx
  on public.offers (listing_id, created_at desc);
create index if not exists offers_buyer_created_idx
  on public.offers (buyer_id, created_at desc);
create index if not exists offers_seller_created_idx
  on public.offers (seller_id, created_at desc);

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null unique references public.offers(id) on delete cascade,
  listing_id uuid not null,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_id foreign key (listing_id)
    references public.listings(id) on delete cascade
);

create index if not exists deals_buyer_created_idx on public.deals (buyer_id, created_at desc);
create index if not exists deals_seller_created_idx on public.deals (seller_id, created_at desc);
create unique index if not exists deals_one_in_progress_per_listing_idx
  on public.deals (listing_id)
  where status = 'in_progress';

create table if not exists public.seller_reviews (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null unique references public.deals(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  check (reviewer_id <> seller_id)
);

create index if not exists seller_reviews_seller_created_idx
  on public.seller_reviews (seller_id, created_at desc);

create table if not exists public.verified_sellers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  notification_type text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);

create table if not exists public.platform_feature_flags (
  setting_key text primary key check (setting_key in (
    'maintenance_mode',
    'allow_listings',
    'chat_enabled',
    'offers_enabled',
    'rentals_enabled',
    'require_verified_sellers'
  )),
  value jsonb not null check (jsonb_typeof(value) = 'boolean'),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.seller_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  public_profile boolean not null default true,
  accept_offers boolean not null default true,
  show_phone boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  locale text not null default 'en',
  updated_at timestamptz not null default now()
);

alter table public.saved_listings enable row level security;
alter table public.listing_likes enable row level security;
alter table public.listing_views enable row level security;
alter table public.offers enable row level security;
alter table public.deals enable row level security;
alter table public.seller_reviews enable row level security;
alter table public.verified_sellers enable row level security;
alter table public.notifications enable row level security;
alter table public.platform_feature_flags enable row level security;
alter table public.seller_settings enable row level security;
alter table public.user_preferences enable row level security;

revoke all on public.profiles from public, anon, authenticated;
grant select (id, full_name, city, avatar_url) on public.profiles to anon, authenticated;
grant update (full_name, phone, city, avatar_url) on public.profiles to authenticated;

create policy "Users manage their saved listings"
  on public.saved_listings for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users manage their listing likes"
  on public.listing_likes for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users record their own listing views"
  on public.listing_views for insert to authenticated
  with check (viewer_id = (select auth.uid()));

create policy "Participants read offers"
  on public.offers for select to authenticated
  using (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()));

create policy "Buyers create offers for active listings"
  on public.offers for insert to authenticated
  with check (
    buyer_id = (select auth.uid())
    and status = 'pending'
    and exists (
      select 1
      from public.listings l
      where l.id = listing_id
        and l.seller_id = seller_id
        and l.status = 'ACTIVE'
    )
  );

create policy "Sellers respond to pending offers"
  on public.offers for update to authenticated
  using (seller_id = (select auth.uid()) and status = 'pending')
  with check (seller_id = (select auth.uid()) and status in ('accepted', 'declined'));

create policy "Buyers cancel pending offers"
  on public.offers for update to authenticated
  using (buyer_id = (select auth.uid()) and status = 'pending')
  with check (buyer_id = (select auth.uid()) and status = 'cancelled');

create policy "Participants read deals"
  on public.deals for select to authenticated
  using (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()));

create policy "Participants update deal progress"
  on public.deals for update to authenticated
  using (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()))
  with check (
    (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()))
    and status in ('in_progress', 'completed', 'cancelled')
  );

create policy "Anyone can read seller reviews"
  on public.seller_reviews for select to anon, authenticated
  using (true);

create policy "Buyers review completed deals"
  on public.seller_reviews for insert to authenticated
  with check (
    reviewer_id = (select auth.uid())
    and exists (
      select 1
      from public.deals d
      where d.id = deal_id
        and d.buyer_id = (select auth.uid())
        and d.seller_id = seller_id
        and d.status = 'completed'
    )
  );

create policy "Anyone can see verified sellers"
  on public.verified_sellers for select to anon, authenticated
  using (status = 'verified');

create policy "Sellers view their verification status"
  on public.verified_sellers for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Sellers request verification"
  on public.verified_sellers for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');

create policy "Sellers resubmit rejected verification"
  on public.verified_sellers for update to authenticated
  using (user_id = (select auth.uid()) and status = 'rejected')
  with check (user_id = (select auth.uid()) and status = 'pending');

create policy "Verified sellers are controlled by platform owner"
  on public.verified_sellers for all to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_owner')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_owner');

create policy "Users read their notifications"
  on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));

create policy "Users mark their notifications read"
  on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

create policy "Anyone can read platform settings"
  on public.platform_feature_flags for select to anon, authenticated
  using (true);

create policy "Only platform owner changes platform settings"
  on public.platform_feature_flags for all to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_owner')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_owner');

create policy "Users manage their seller settings"
  on public.seller_settings for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Anyone can read public seller settings"
  on public.seller_settings for select to anon, authenticated
  using (public_profile = true);

create policy "Users manage their app preferences"
  on public.user_preferences for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

insert into public.platform_feature_flags (setting_key, value)
values
  ('maintenance_mode', 'false'::jsonb),
  ('allow_listings', 'true'::jsonb),
  ('chat_enabled', 'true'::jsonb),
  ('offers_enabled', 'true'::jsonb),
  ('rentals_enabled', 'true'::jsonb),
  ('require_verified_sellers', 'false'::jsonb)
on conflict (setting_key) do nothing;

create or replace function public.record_listing_view(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.platform_feature_flags
    where setting_key = 'maintenance_mode' and value = 'true'::jsonb
  ) then
    raise exception 'Marketplace is temporarily in maintenance mode';
  end if;

  if auth.uid() is null then
    return;
  end if;

  insert into public.listing_views (viewer_id, listing_id)
  values (auth.uid(), p_listing_id)
  on conflict do nothing;
end;
$$;

grant execute on function public.record_listing_view(uuid) to authenticated;
revoke all on function public.record_listing_view(uuid) from public, anon;

create or replace function public.enforce_listing_controls()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  is_owner boolean := coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_owner', false);
begin
  if not is_owner and auth.uid() is distinct from new.seller_id then
    raise exception 'You can only publish your own listings';
  end if;

  if is_owner then
    return new;
  end if;

  if exists (
    select 1 from public.platform_feature_flags
    where setting_key = 'maintenance_mode' and value = 'true'::jsonb
  ) then
    raise exception 'Marketplace is temporarily in maintenance mode';
  end if;

  if exists (
    select 1 from public.platform_feature_flags
    where setting_key = 'allow_listings' and value = 'false'::jsonb
  ) then
    raise exception 'New listings are currently paused';
  end if;

  if new.listing_type = 'RENT' and exists (
    select 1 from public.platform_feature_flags
    where setting_key = 'rentals_enabled' and value = 'false'::jsonb
  ) then
    raise exception 'Rental listings are currently paused';
  end if;

  if new.listing_type = 'RENT' and not exists (
    select 1 from public.platform_feature_flags
    where setting_key = 'rentals_enabled'
  ) then
    raise exception 'Marketplace feature controls are not initialized';
  end if;

  if exists (
    select 1 from public.platform_feature_flags
    where setting_key = 'require_verified_sellers' and value = 'true'::jsonb
  ) and not exists (
    select 1 from public.verified_sellers
    where user_id = new.seller_id and status = 'verified'
  ) then
    raise exception 'Verified seller status is required to publish listings';
  end if;

  return new;
end;
$$;

create trigger listings_enforce_platform_controls
  before insert on public.listings
  for each row execute function public.enforce_listing_controls();

create or replace function public.enforce_offer_controls()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  is_owner boolean := coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_owner', false);
  listing_kind text;
begin
  if not is_owner and auth.uid() is distinct from new.buyer_id then
    raise exception 'You can only submit offers for your own account';
  end if;

  if new.status <> 'pending' then
    raise exception 'Offers must be submitted as pending';
  end if;

  if not is_owner and exists (
    select 1 from public.platform_feature_flags
    where setting_key = 'maintenance_mode' and value = 'true'::jsonb
  ) then
    raise exception 'Marketplace is temporarily in maintenance mode';
  end if;

  if exists (
    select 1 from public.platform_feature_flags
    where setting_key = 'offers_enabled' and value = 'false'::jsonb
  ) then
    raise exception 'Offers are currently paused';
  end if;

  if exists (
    select 1 from public.seller_settings
    where user_id = new.seller_id and accept_offers = false
  ) then
    raise exception 'This seller is not accepting offers';
  end if;

  select listing_type into listing_kind
  from public.listings
  where id = new.listing_id
    and seller_id = new.seller_id
    and status = 'ACTIVE';

  if listing_kind is null then
    raise exception 'This listing is not available for offers';
  end if;

  if listing_kind = 'RENT' and exists (
    select 1 from public.platform_feature_flags
    where setting_key = 'rentals_enabled' and value = 'false'::jsonb
  ) then
    raise exception 'Rental offers are currently paused';
  end if;

  return new;
end;
$$;

create trigger offers_enforce_platform_controls
  before insert on public.offers
  for each row execute function public.enforce_offer_controls();

create or replace function public.enforce_chat_controls()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  is_owner boolean := coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_owner', false);
begin
  if not is_owner and auth.uid() is distinct from new.sender_id then
    raise exception 'You can only send messages from your own account';
  end if;

  if not is_owner and exists (
    select 1 from public.platform_feature_flags
    where setting_key = 'maintenance_mode' and value = 'true'::jsonb
  ) then
    raise exception 'Marketplace is temporarily in maintenance mode';
  end if;

  if not is_owner and exists (
    select 1 from public.platform_feature_flags
    where setting_key = 'chat_enabled' and value = 'false'::jsonb
  ) then
    raise exception 'Chat is currently paused';
  end if;

  return new;
end;
$$;

create trigger messages_enforce_platform_controls
  before insert on public.messages
  for each row execute function public.enforce_chat_controls();

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

create or replace function public.get_public_seller_phone(p_seller_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.phone
  from public.profiles p
  join public.seller_settings s on s.user_id = p.id
  where p.id = p_seller_id
    and s.public_profile = true
    and s.show_phone = true;
$$;

grant execute on function public.get_public_seller_phone(uuid) to anon, authenticated;

create or replace function public.get_listing_metrics(p_listing_ids uuid[])
returns table (
  listing_id uuid,
  view_count bigint,
  like_count bigint,
  average_rating numeric,
  review_count bigint,
  is_verified boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(cardinality(p_listing_ids), 0) > 200 then
    raise exception 'Request at most 200 listings per metrics call';
  end if;

  return query
    select
      l.id,
      (select count(*) from public.listing_views v where v.listing_id = l.id),
      (select count(*) from public.listing_likes k where k.listing_id = l.id),
      coalesce((select avg(r.rating)::numeric(3, 2) from public.seller_reviews r where r.seller_id = l.seller_id), 0),
      (select count(*) from public.seller_reviews r where r.seller_id = l.seller_id),
      exists (
        select 1 from public.verified_sellers s
        where s.user_id = l.seller_id and s.status = 'verified'
      )
    from public.listings l
    where l.id = any(p_listing_ids);
end;
$$;

grant execute on function public.get_listing_metrics(uuid[]) to anon, authenticated;

create or replace function public.notify_offer_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  listing_title text;
begin
  select title into listing_title from public.listings where id = new.listing_id;

  if tg_op = 'INSERT' then
    insert into public.notifications (recipient_id, actor_id, notification_type, title, body, data)
    values (
      new.seller_id,
      new.buyer_id,
      'offer_received',
      'New offer',
      'A buyer sent an offer for ' || coalesce(listing_title, 'your listing') || '.',
      jsonb_build_object('listing_id', new.listing_id, 'offer_id', new.id)
    );
    return new;
  end if;

  if old.status = 'pending' and new.status = 'accepted' then
    insert into public.deals (offer_id, listing_id, buyer_id, seller_id, amount)
    values (new.id, new.listing_id, new.buyer_id, new.seller_id, new.amount)
    on conflict (offer_id) do nothing;
    insert into public.notifications (recipient_id, actor_id, notification_type, title, body, data)
    values (
      new.buyer_id,
      new.seller_id,
      'offer_accepted',
      'Offer accepted',
      'Your offer for ' || coalesce(listing_title, 'a listing') || ' was accepted.',
      jsonb_build_object('listing_id', new.listing_id, 'offer_id', new.id)
    );
  elsif old.status = 'pending' and new.status = 'declined' then
    insert into public.notifications (recipient_id, actor_id, notification_type, title, body, data)
    values (
      new.buyer_id,
      new.seller_id,
      'offer_declined',
      'Offer declined',
      'Your offer for ' || coalesce(listing_title, 'a listing') || ' was declined.',
      jsonb_build_object('listing_id', new.listing_id, 'offer_id', new.id)
    );
  end if;

  return new;
end;
$$;

create or replace function public.protect_offer_updates()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.platform_feature_flags
    where setting_key = 'maintenance_mode' and value = 'true'::jsonb
  ) and coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_owner', false) = false then
    raise exception 'Marketplace is temporarily in maintenance mode';
  end if;

  if new.id is distinct from old.id
    or new.listing_id is distinct from old.listing_id
    or new.buyer_id is distinct from old.buyer_id
    or new.seller_id is distinct from old.seller_id
    or new.amount is distinct from old.amount
    or new.message is distinct from old.message
    or new.created_at is distinct from old.created_at then
    raise exception 'Offer details cannot be changed after submission';
  end if;

  if auth.uid() = old.seller_id
    and old.status = 'pending'
    and new.status in ('accepted', 'declined') then
    new.updated_at := now();
    return new;
  end if;

  if auth.uid() = old.buyer_id
    and old.status = 'pending'
    and new.status = 'cancelled' then
    new.updated_at := now();
    return new;
  end if;

  raise exception 'This offer status change is not allowed';
end;
$$;

create trigger offers_protect_updates
  before update on public.offers
  for each row execute function public.protect_offer_updates();

create trigger offers_notify_activity
  after insert or update of status on public.offers
  for each row execute function public.notify_offer_activity();

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notifications (recipient_id, actor_id, notification_type, title, body, data)
  values (
    new.receiver_id,
    new.sender_id,
    'message_received',
    'New message',
    left(new.content, 160),
    jsonb_build_object('listing_id', new.listing_id)
  );
  return new;
end;
$$;

create trigger messages_notify_recipient
  after insert on public.messages
  for each row execute function public.notify_new_message();

create or replace function public.update_deal_listing_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.platform_feature_flags
    where setting_key = 'maintenance_mode' and value = 'true'::jsonb
  ) and coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_owner', false) = false then
    raise exception 'Marketplace is temporarily in maintenance mode';
  end if;

  if new.id is distinct from old.id
    or new.offer_id is distinct from old.offer_id
    or new.listing_id is distinct from old.listing_id
    or new.buyer_id is distinct from old.buyer_id
    or new.seller_id is distinct from old.seller_id
    or new.amount is distinct from old.amount
    or new.created_at is distinct from old.created_at then
    raise exception 'Deal details cannot be changed';
  end if;

  if old.status <> 'in_progress'
    or new.status not in ('completed', 'cancelled')
    or auth.uid() not in (old.buyer_id, old.seller_id) then
    raise exception 'This deal status change is not allowed';
  end if;

  if old.status <> new.status and new.status = 'completed' then
    update public.listings
    set status = case
      when listing_type = 'RENT' then 'RENTED'
      else 'SOLD'
    end
    where id = new.listing_id and status = 'ACTIVE';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger deals_update_listing_status
  before update of status on public.deals
  for each row execute function public.update_deal_listing_status();

grant select, insert, delete on public.saved_listings, public.listing_likes to authenticated;
grant insert on public.listing_views to authenticated;
grant select, insert, update on public.offers, public.deals to authenticated;
grant select on public.seller_reviews to anon, authenticated;
grant insert on public.seller_reviews to authenticated;
grant select, insert, update on public.verified_sellers to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select on public.platform_feature_flags to anon, authenticated;
grant insert, update on public.platform_feature_flags to authenticated;
grant select on public.seller_settings to anon, authenticated;
grant insert, update on public.seller_settings, public.user_preferences to authenticated;
grant select on public.user_preferences to authenticated;
