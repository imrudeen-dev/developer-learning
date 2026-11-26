


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."enforce_chat_controls"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."enforce_chat_controls"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_listing_controls"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."enforce_listing_controls"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_offer_controls"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."enforce_offer_controls"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_listing_metrics"("p_listing_ids" "uuid"[]) RETURNS TABLE("listing_id" "uuid", "view_count" bigint, "like_count" bigint, "average_rating" numeric, "review_count" bigint, "is_verified" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."get_listing_metrics"("p_listing_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_phone"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select phone from public.profiles where id = (select auth.uid());
$$;


ALTER FUNCTION "public"."get_my_phone"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_seller_phone"("p_seller_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select p.phone
  from public.profiles p
  join public.seller_settings s on s.user_id = p.id
  where p.id = p_seller_id
    and s.public_profile = true
    and s.show_phone = true;
$$;


ALTER FUNCTION "public"."get_public_seller_phone"("p_seller_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_deal_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."notify_deal_activity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_new_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."notify_new_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_offer_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."notify_offer_activity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_offer_updates"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."protect_offer_updates"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_listing_view"("p_listing_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."record_listing_view"("p_listing_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_deal_listing_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."update_deal_listing_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_listing_activity_counts"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."update_listing_activity_counts"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "severity" "text" DEFAULT 'info'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ends_at" timestamp with time zone,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "announcements_body_check" CHECK ((("char_length"("btrim"("body")) >= 3) AND ("char_length"("btrim"("body")) <= 1000))),
    CONSTRAINT "announcements_check" CHECK ((("ends_at" IS NULL) OR ("ends_at" > "starts_at"))),
    CONSTRAINT "announcements_severity_check" CHECK (("severity" = ANY (ARRAY['info'::"text", 'success'::"text", 'warning'::"text", 'urgent'::"text"]))),
    CONSTRAINT "announcements_title_check" CHECK ((("char_length"("btrim"("title")) >= 3) AND ("char_length"("btrim"("title")) <= 120)))
);


ALTER TABLE "public"."announcements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "offer_id" "uuid" NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "status" "text" DEFAULT 'in_progress'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "deals_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "deals_status_check" CHECK (("status" = ANY (ARRAY['in_progress'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."deals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."device_push_tokens" (
    "user_id" "uuid" NOT NULL,
    "expo_push_token" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "device_push_tokens_platform_check" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text"])))
);


ALTER TABLE "public"."device_push_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listing_activity_counts" (
    "listing_id" "uuid" NOT NULL,
    "view_count" bigint DEFAULT 0 NOT NULL,
    "like_count" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "listing_activity_counts_like_count_check" CHECK (("like_count" >= 0)),
    CONSTRAINT "listing_activity_counts_view_count_check" CHECK (("view_count" >= 0))
);


ALTER TABLE "public"."listing_activity_counts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listing_likes" (
    "user_id" "uuid" NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."listing_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listing_views" (
    "viewer_id" "uuid" NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "view_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."listing_views" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "listing_type" "text" NOT NULL,
    "category" "text" NOT NULL,
    "price" numeric(12,2) NOT NULL,
    "rent_period" "text",
    "security_deposit" numeric(12,2) DEFAULT 0 NOT NULL,
    "city" "text" NOT NULL,
    "locality" "text",
    "latitude" double precision,
    "longitude" double precision,
    "images" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "listings_listing_type_check" CHECK (("listing_type" = ANY (ARRAY['SELL'::"text", 'RENT'::"text"]))),
    CONSTRAINT "listings_price_check" CHECK (("price" > (0)::numeric)),
    CONSTRAINT "listings_rent_period_check" CHECK (((("listing_type" = 'SELL'::"text") AND ("rent_period" IS NULL)) OR (("listing_type" = 'RENT'::"text") AND ("rent_period" IS NOT NULL) AND ("rent_period" = ANY (ARRAY['DAY'::"text", 'WEEK'::"text", 'MONTH'::"text"]))))),
    CONSTRAINT "listings_security_deposit_check" CHECK (("security_deposit" >= (0)::numeric)),
    CONSTRAINT "listings_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'SOLD'::"text", 'RENTED'::"text"]))),
    CONSTRAINT "listings_title_check" CHECK (("char_length"("btrim"("title")) >= 4))
);


ALTER TABLE "public"."listings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "receiver_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "messages_content_check" CHECK ((("char_length"("btrim"("content")) >= 1) AND ("char_length"("btrim"("content")) <= 500))),
    CONSTRAINT "messages_sender_receiver_check" CHECK (("sender_id" <> "receiver_id"))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "actor_id" "uuid",
    "notification_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."offers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "message" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "offers_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "offers_check" CHECK (("buyer_id" <> "seller_id")),
    CONSTRAINT "offers_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."offers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_feature_flags" (
    "setting_key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "platform_feature_flags_setting_key_check" CHECK (("setting_key" = ANY (ARRAY['maintenance_mode'::"text", 'allow_listings'::"text", 'chat_enabled'::"text", 'offers_enabled'::"text", 'rentals_enabled'::"text", 'require_verified_sellers'::"text"]))),
    CONSTRAINT "platform_feature_flags_value_check" CHECK (("jsonb_typeof"("value") = 'boolean'::"text"))
);


ALTER TABLE "public"."platform_feature_flags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "phone" "text",
    "city" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_listings" (
    "user_id" "uuid" NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."saved_listings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seller_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deal_id" "uuid" NOT NULL,
    "reviewer_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "rating" smallint NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "seller_reviews_check" CHECK (("reviewer_id" <> "seller_id")),
    CONSTRAINT "seller_reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."seller_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seller_settings" (
    "user_id" "uuid" NOT NULL,
    "public_profile" boolean DEFAULT true NOT NULL,
    "accept_offers" boolean DEFAULT true NOT NULL,
    "show_phone" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."seller_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_preferences" (
    "user_id" "uuid" NOT NULL,
    "theme" "text" DEFAULT 'system'::"text" NOT NULL,
    "locale" "text" DEFAULT 'en'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_preferences_theme_check" CHECK (("theme" = ANY (ARRAY['system'::"text", 'light'::"text", 'dark'::"text"])))
);


ALTER TABLE "public"."user_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."verified_sellers" (
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "verified_sellers_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'verified'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."verified_sellers" OWNER TO "postgres";


ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_offer_id_key" UNIQUE ("offer_id");



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."device_push_tokens"
    ADD CONSTRAINT "device_push_tokens_pkey" PRIMARY KEY ("user_id", "expo_push_token");



ALTER TABLE ONLY "public"."listing_activity_counts"
    ADD CONSTRAINT "listing_activity_counts_pkey" PRIMARY KEY ("listing_id");



ALTER TABLE ONLY "public"."listing_likes"
    ADD CONSTRAINT "listing_likes_pkey" PRIMARY KEY ("user_id", "listing_id");



ALTER TABLE ONLY "public"."listing_views"
    ADD CONSTRAINT "listing_views_pkey" PRIMARY KEY ("viewer_id", "listing_id", "view_date");



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_feature_flags"
    ADD CONSTRAINT "platform_feature_flags_pkey" PRIMARY KEY ("setting_key");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_listings"
    ADD CONSTRAINT "saved_listings_pkey" PRIMARY KEY ("user_id", "listing_id");



ALTER TABLE ONLY "public"."seller_reviews"
    ADD CONSTRAINT "seller_reviews_deal_id_key" UNIQUE ("deal_id");



ALTER TABLE ONLY "public"."seller_reviews"
    ADD CONSTRAINT "seller_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seller_settings"
    ADD CONSTRAINT "seller_settings_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."verified_sellers"
    ADD CONSTRAINT "verified_sellers_pkey" PRIMARY KEY ("user_id");



CREATE INDEX "announcements_active_start_idx" ON "public"."announcements" USING "btree" ("is_active", "starts_at" DESC);



CREATE INDEX "deals_buyer_created_idx" ON "public"."deals" USING "btree" ("buyer_id", "created_at" DESC);



CREATE UNIQUE INDEX "deals_one_in_progress_per_listing_idx" ON "public"."deals" USING "btree" ("listing_id") WHERE ("status" = 'in_progress'::"text");



CREATE INDEX "deals_seller_created_idx" ON "public"."deals" USING "btree" ("seller_id", "created_at" DESC);



CREATE INDEX "listings_seller_created_idx" ON "public"."listings" USING "btree" ("seller_id", "created_at" DESC);



CREATE INDEX "listings_status_created_idx" ON "public"."listings" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "messages_listing_created_idx" ON "public"."messages" USING "btree" ("listing_id", "created_at" DESC);



CREATE INDEX "messages_receiver_created_idx" ON "public"."messages" USING "btree" ("receiver_id", "created_at" DESC);



CREATE INDEX "messages_sender_created_idx" ON "public"."messages" USING "btree" ("sender_id", "created_at" DESC);



CREATE INDEX "notifications_recipient_created_idx" ON "public"."notifications" USING "btree" ("recipient_id", "created_at" DESC);



CREATE INDEX "offers_buyer_created_idx" ON "public"."offers" USING "btree" ("buyer_id", "created_at" DESC);



CREATE INDEX "offers_listing_created_idx" ON "public"."offers" USING "btree" ("listing_id", "created_at" DESC);



CREATE INDEX "offers_seller_created_idx" ON "public"."offers" USING "btree" ("seller_id", "created_at" DESC);



CREATE INDEX "seller_reviews_seller_created_idx" ON "public"."seller_reviews" USING "btree" ("seller_id", "created_at" DESC);



CREATE OR REPLACE TRIGGER "deals_notify_activity" AFTER UPDATE OF "status" ON "public"."deals" FOR EACH ROW EXECUTE FUNCTION "public"."notify_deal_activity"();



CREATE OR REPLACE TRIGGER "deals_update_listing_status" BEFORE UPDATE OF "status" ON "public"."deals" FOR EACH ROW EXECUTE FUNCTION "public"."update_deal_listing_status"();



CREATE OR REPLACE TRIGGER "listing_likes_activity_counts" AFTER INSERT OR DELETE ON "public"."listing_likes" FOR EACH ROW EXECUTE FUNCTION "public"."update_listing_activity_counts"();



CREATE OR REPLACE TRIGGER "listing_views_activity_counts" AFTER INSERT OR DELETE ON "public"."listing_views" FOR EACH ROW EXECUTE FUNCTION "public"."update_listing_activity_counts"();



CREATE OR REPLACE TRIGGER "listings_enforce_platform_controls" BEFORE INSERT ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_listing_controls"();



CREATE OR REPLACE TRIGGER "messages_enforce_platform_controls" BEFORE INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_chat_controls"();



CREATE OR REPLACE TRIGGER "messages_notify_recipient" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."notify_new_message"();



CREATE OR REPLACE TRIGGER "offers_enforce_platform_controls" BEFORE INSERT ON "public"."offers" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_offer_controls"();



CREATE OR REPLACE TRIGGER "offers_notify_activity" AFTER INSERT OR UPDATE OF "status" ON "public"."offers" FOR EACH ROW EXECUTE FUNCTION "public"."notify_offer_activity"();



CREATE OR REPLACE TRIGGER "offers_protect_updates" BEFORE UPDATE ON "public"."offers" FOR EACH ROW EXECUTE FUNCTION "public"."protect_offer_updates"();



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."device_push_tokens"
    ADD CONSTRAINT "device_push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_activity_counts"
    ADD CONSTRAINT "listing_activity_counts_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "listing_id" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_likes"
    ADD CONSTRAINT "listing_id" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_views"
    ADD CONSTRAINT "listing_id" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "listing_id" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "listing_id" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_listings"
    ADD CONSTRAINT "listing_id" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_likes"
    ADD CONSTRAINT "listing_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_views"
    ADD CONSTRAINT "listing_views_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."platform_feature_flags"
    ADD CONSTRAINT "platform_feature_flags_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_listings"
    ADD CONSTRAINT "saved_listings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "seller_id" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seller_reviews"
    ADD CONSTRAINT "seller_reviews_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seller_reviews"
    ADD CONSTRAINT "seller_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seller_reviews"
    ADD CONSTRAINT "seller_reviews_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seller_settings"
    ADD CONSTRAINT "seller_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."verified_sellers"
    ADD CONSTRAINT "verified_sellers_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."verified_sellers"
    ADD CONSTRAINT "verified_sellers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Anyone can read listing activity counts" ON "public"."listing_activity_counts" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can read listings" ON "public"."listings" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can read platform settings" ON "public"."platform_feature_flags" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can read public seller settings" ON "public"."seller_settings" FOR SELECT TO "authenticated", "anon" USING (("public_profile" = true));



CREATE POLICY "Anyone can read seller reviews" ON "public"."seller_reviews" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can see verified sellers" ON "public"."verified_sellers" FOR SELECT TO "authenticated", "anon" USING (("status" = 'verified'::"text"));



CREATE POLICY "Anyone reads current announcements" ON "public"."announcements" FOR SELECT TO "authenticated", "anon" USING (("is_active" AND ("starts_at" <= "now"()) AND (("ends_at" IS NULL) OR ("ends_at" > "now"()))));



CREATE POLICY "Buyers cancel pending offers" ON "public"."offers" FOR UPDATE TO "authenticated" USING ((("buyer_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'pending'::"text"))) WITH CHECK ((("buyer_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'cancelled'::"text")));



CREATE POLICY "Buyers create offers for active listings" ON "public"."offers" FOR INSERT TO "authenticated" WITH CHECK ((("buyer_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'pending'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."listings" "l"
  WHERE (("l"."id" = "offers"."listing_id") AND ("l"."seller_id" = "l"."seller_id") AND ("l"."status" = 'ACTIVE'::"text"))))));



CREATE POLICY "Buyers review completed deals" ON "public"."seller_reviews" FOR INSERT TO "authenticated" WITH CHECK ((("reviewer_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."deals" "d"
  WHERE (("d"."id" = "seller_reviews"."deal_id") AND ("d"."buyer_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("d"."seller_id" = "d"."seller_id") AND ("d"."status" = 'completed'::"text"))))));



CREATE POLICY "Only platform owner changes platform settings" ON "public"."platform_feature_flags" TO "authenticated" USING ((( SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text")) = 'platform_owner'::"text")) WITH CHECK ((( SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text")) = 'platform_owner'::"text"));



CREATE POLICY "Only platform owners manage announcements" ON "public"."announcements" TO "authenticated" USING ((( SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text")) = 'platform_owner'::"text")) WITH CHECK ((( SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text")) = 'platform_owner'::"text"));



CREATE POLICY "Participants read deals" ON "public"."deals" FOR SELECT TO "authenticated" USING ((("buyer_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("seller_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Participants read offers" ON "public"."offers" FOR SELECT TO "authenticated" USING ((("buyer_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("seller_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Participants read their messages" ON "public"."messages" FOR SELECT TO "authenticated" USING ((("sender_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("receiver_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Participants update deal progress" ON "public"."deals" FOR UPDATE TO "authenticated" USING ((("buyer_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("seller_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK (((("buyer_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("seller_id" = ( SELECT "auth"."uid"() AS "uid"))) AND ("status" = ANY (ARRAY['in_progress'::"text", 'completed'::"text", 'cancelled'::"text"]))));



CREATE POLICY "Platform owners manage all listings" ON "public"."listings" TO "authenticated" USING ((( SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text")) = 'platform_owner'::"text")) WITH CHECK ((( SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text")) = 'platform_owner'::"text"));



CREATE POLICY "Profiles are publicly readable" ON "public"."profiles" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Sellers create their own listings" ON "public"."listings" FOR INSERT TO "authenticated" WITH CHECK (("seller_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Sellers delete their own listings" ON "public"."listings" FOR DELETE TO "authenticated" USING (("seller_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Sellers request verification" ON "public"."verified_sellers" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'pending'::"text")));



CREATE POLICY "Sellers respond to pending offers" ON "public"."offers" FOR UPDATE TO "authenticated" USING ((("seller_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'pending'::"text"))) WITH CHECK ((("seller_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = ANY (ARRAY['accepted'::"text", 'declined'::"text"]))));



CREATE POLICY "Sellers resubmit rejected verification" ON "public"."verified_sellers" FOR UPDATE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'rejected'::"text"))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'pending'::"text")));



CREATE POLICY "Sellers update their own listings" ON "public"."listings" FOR UPDATE TO "authenticated" USING (("seller_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("seller_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Sellers view their verification status" ON "public"."verified_sellers" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users manage their app preferences" ON "public"."user_preferences" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users manage their listing likes" ON "public"."listing_likes" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users manage their own device push tokens" ON "public"."device_push_tokens" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users manage their saved listings" ON "public"."saved_listings" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users manage their seller settings" ON "public"."seller_settings" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users mark their notifications read" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("recipient_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("recipient_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users read their notifications" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("recipient_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users record their own listing views" ON "public"."listing_views" FOR INSERT TO "authenticated" WITH CHECK (("viewer_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users send messages about active listings" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."listings" "l"
  WHERE (("l"."id" = "messages"."listing_id") AND ("l"."status" = 'ACTIVE'::"text") AND ((("l"."seller_id" = "messages"."sender_id") AND ("l"."seller_id" <> "messages"."receiver_id")) OR (("l"."seller_id" = "messages"."receiver_id") AND ("l"."seller_id" <> "messages"."sender_id"))))))));



CREATE POLICY "Users update their own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Verified sellers are controlled by platform owner" ON "public"."verified_sellers" TO "authenticated" USING ((( SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text")) = 'platform_owner'::"text")) WITH CHECK ((( SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text")) = 'platform_owner'::"text"));



ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."device_push_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listing_activity_counts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listing_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listing_views" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."offers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_feature_flags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saved_listings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seller_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seller_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."verified_sellers" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."announcements";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."listing_activity_counts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."enforce_chat_controls"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_chat_controls"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_chat_controls"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_listing_controls"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_listing_controls"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_listing_controls"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_offer_controls"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_offer_controls"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_offer_controls"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_listing_metrics"("p_listing_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_listing_metrics"("p_listing_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_listing_metrics"("p_listing_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_phone"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_phone"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_phone"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_seller_phone"("p_seller_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_seller_phone"("p_seller_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_seller_phone"("p_seller_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_deal_activity"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_deal_activity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_deal_activity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_new_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_new_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_new_message"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_offer_activity"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_offer_activity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_offer_activity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_offer_updates"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_offer_updates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_offer_updates"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_listing_view"("p_listing_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_listing_view"("p_listing_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_listing_view"("p_listing_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_deal_listing_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_deal_listing_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_deal_listing_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_listing_activity_counts"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_listing_activity_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_listing_activity_counts"() TO "service_role";


















GRANT ALL ON TABLE "public"."announcements" TO "anon";
GRANT ALL ON TABLE "public"."announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."announcements" TO "service_role";



GRANT ALL ON TABLE "public"."deals" TO "anon";
GRANT ALL ON TABLE "public"."deals" TO "authenticated";
GRANT ALL ON TABLE "public"."deals" TO "service_role";



GRANT ALL ON TABLE "public"."device_push_tokens" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."device_push_tokens" TO "authenticated";



GRANT ALL ON TABLE "public"."listing_activity_counts" TO "service_role";
GRANT SELECT ON TABLE "public"."listing_activity_counts" TO "anon";
GRANT SELECT ON TABLE "public"."listing_activity_counts" TO "authenticated";



GRANT ALL ON TABLE "public"."listing_likes" TO "anon";
GRANT ALL ON TABLE "public"."listing_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."listing_likes" TO "service_role";



GRANT ALL ON TABLE "public"."listing_views" TO "anon";
GRANT ALL ON TABLE "public"."listing_views" TO "authenticated";
GRANT ALL ON TABLE "public"."listing_views" TO "service_role";



GRANT ALL ON TABLE "public"."listings" TO "anon";
GRANT ALL ON TABLE "public"."listings" TO "authenticated";
GRANT ALL ON TABLE "public"."listings" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT UPDATE("read_at") ON TABLE "public"."notifications" TO "authenticated";



GRANT ALL ON TABLE "public"."offers" TO "anon";
GRANT ALL ON TABLE "public"."offers" TO "authenticated";
GRANT ALL ON TABLE "public"."offers" TO "service_role";



GRANT ALL ON TABLE "public"."platform_feature_flags" TO "anon";
GRANT ALL ON TABLE "public"."platform_feature_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_feature_flags" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("id") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("full_name") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("full_name"),UPDATE("full_name") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("phone") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("city") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("city"),UPDATE("city") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("avatar_url") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("avatar_url"),UPDATE("avatar_url") ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."saved_listings" TO "anon";
GRANT ALL ON TABLE "public"."saved_listings" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_listings" TO "service_role";



GRANT ALL ON TABLE "public"."seller_reviews" TO "anon";
GRANT ALL ON TABLE "public"."seller_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."seller_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."seller_settings" TO "anon";
GRANT ALL ON TABLE "public"."seller_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."seller_settings" TO "service_role";



GRANT ALL ON TABLE "public"."user_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."verified_sellers" TO "anon";
GRANT ALL ON TABLE "public"."verified_sellers" TO "authenticated";
GRANT ALL ON TABLE "public"."verified_sellers" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































