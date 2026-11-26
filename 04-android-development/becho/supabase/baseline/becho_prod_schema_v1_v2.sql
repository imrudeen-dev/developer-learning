


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






CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', 'user');
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_listing_view"("p_listing_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.listings
  SET views_count = COALESCE(views_count, 0) + 1
  WHERE id = p_listing_id;
END;
$$;


ALTER FUNCTION "public"."increment_listing_view"("p_listing_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_listing_owner"("p_listing_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.listings
    WHERE id = p_listing_id AND seller_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_listing_owner"("p_listing_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_superadmin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'superadmin' and is_blocked = false
  );
$$;


ALTER FUNCTION "public"."is_superadmin"() OWNER TO "postgres";


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

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."chats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."chats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listing_likes" (
    "user_id" "uuid" NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."listing_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listing_offers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "offer_amount" numeric NOT NULL,
    "note" "text",
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "listing_offers_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'ACCEPTED'::"text", 'DECLINED'::"text", 'COUNTERED'::"text"])))
);


ALTER TABLE "public"."listing_offers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "listing_type" "text" NOT NULL,
    "category" "text" NOT NULL,
    "price" numeric NOT NULL,
    "rent_period" "text",
    "security_deposit" numeric DEFAULT 0,
    "city" "text" DEFAULT 'Chennai'::"text" NOT NULL,
    "locality" "text",
    "latitude" double precision,
    "longitude" double precision,
    "images" "text"[] DEFAULT '{}'::"text"[],
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "views_count" integer DEFAULT 0 NOT NULL,
    "likes_count" integer DEFAULT 0 NOT NULL,
    "allow_offers" boolean DEFAULT true NOT NULL,
    "show_phone" boolean DEFAULT true NOT NULL,
    "is_featured" boolean DEFAULT false NOT NULL,
    "is_verified" boolean DEFAULT false NOT NULL,
    "archived_at" timestamp with time zone,
    "buyer_id" "uuid",
    "original_listing_id" "uuid",
    "allow_chat" boolean DEFAULT true NOT NULL,
    "is_verified_listing" boolean DEFAULT false NOT NULL,
    "condition" "text" DEFAULT 'good'::"text",
    "offer_price" numeric,
    CONSTRAINT "listings_condition_check" CHECK (("condition" = ANY (ARRAY['new'::"text", 'like-new'::"text", 'good'::"text", 'fair'::"text"]))),
    CONSTRAINT "listings_listing_type_check" CHECK (("listing_type" = ANY (ARRAY['SELL'::"text", 'RENT'::"text"]))),
    CONSTRAINT "listings_price_check" CHECK (("price" >= (0)::numeric)),
    CONSTRAINT "listings_rent_period_check" CHECK ((("rent_period" = ANY (ARRAY['DAY'::"text", 'WEEK'::"text", 'MONTH'::"text"])) OR ("rent_period" IS NULL))),
    CONSTRAINT "listings_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'SOLD'::"text", 'RENTED'::"text"])))
);


ALTER TABLE "public"."listings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "receiver_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" DEFAULT 'SYSTEM'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "listing_id" "uuid",
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_config" (
    "id" integer DEFAULT 1 NOT NULL,
    "allow_offers" boolean DEFAULT true NOT NULL,
    "allow_calls" boolean DEFAULT true NOT NULL,
    "allow_guest_browse" boolean DEFAULT true NOT NULL,
    "require_seller_verification" boolean DEFAULT false NOT NULL,
    "show_views_counter" boolean DEFAULT true NOT NULL,
    "enable_resell" boolean DEFAULT true NOT NULL,
    "maintenance_mode" boolean DEFAULT false NOT NULL,
    "announcement_banner" "text" DEFAULT 'Welcome to Becho v2.0 — Buy, Rent & Resell locally!'::"text",
    "active_tour_version" "text" DEFAULT '2.0.0'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "platform_config_id_check" CHECK (("id" = 1))
);


ALTER TABLE "public"."platform_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_settings" (
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."platform_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "phone" "text",
    "city" "text" DEFAULT 'Chennai'::"text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "role" "text" DEFAULT 'user'::"text" NOT NULL,
    "is_verified" boolean DEFAULT false NOT NULL,
    "rating_avg" numeric(2,1) DEFAULT 5.0 NOT NULL,
    "rating_count" integer DEFAULT 0 NOT NULL,
    "preferred_language" "text" DEFAULT 'en'::"text" NOT NULL,
    "preferred_theme" "text" DEFAULT 'obsidian'::"text" NOT NULL,
    "is_blocked" boolean DEFAULT false NOT NULL,
    "phone_public" boolean DEFAULT false NOT NULL,
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'seller_pro'::"text", 'superadmin'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seller_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "reviewer_id" "uuid" NOT NULL,
    "listing_id" "uuid",
    "rating" integer NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "seller_reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."seller_reviews" OWNER TO "postgres";


ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listing_likes"
    ADD CONSTRAINT "listing_likes_pkey" PRIMARY KEY ("user_id", "listing_id");



ALTER TABLE ONLY "public"."listing_offers"
    ADD CONSTRAINT "listing_offers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_config"
    ADD CONSTRAINT "platform_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_settings"
    ADD CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seller_reviews"
    ADD CONSTRAINT "seller_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "unique_chat_per_listing" UNIQUE ("listing_id", "buyer_id");



CREATE INDEX "listings_category_idx" ON "public"."listings" USING "btree" ("category");



CREATE INDEX "listings_created_at_idx" ON "public"."listings" USING "btree" ("created_at" DESC);



CREATE INDEX "listings_type_idx" ON "public"."listings" USING "btree" ("listing_type");



CREATE INDEX "messages_listing_idx" ON "public"."messages" USING "btree" ("listing_id", "created_at");



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_likes"
    ADD CONSTRAINT "listing_likes_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_likes"
    ADD CONSTRAINT "listing_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_offers"
    ADD CONSTRAINT "listing_offers_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_offers"
    ADD CONSTRAINT "listing_offers_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_offers"
    ADD CONSTRAINT "listing_offers_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_original_listing_id_fkey" FOREIGN KEY ("original_listing_id") REFERENCES "public"."listings"("id");



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seller_reviews"
    ADD CONSTRAINT "seller_reviews_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."seller_reviews"
    ADD CONSTRAINT "seller_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seller_reviews"
    ADD CONSTRAINT "seller_reviews_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Anyone can read platform_config" ON "public"."platform_config" FOR SELECT USING (true);



CREATE POLICY "Anyone reads reviews" ON "public"."seller_reviews" FOR SELECT USING (true);



CREATE POLICY "Auth users insert reviews" ON "public"."seller_reviews" FOR INSERT WITH CHECK (("auth"."uid"() = "reviewer_id"));



CREATE POLICY "Authenticated create listings" ON "public"."listings" FOR INSERT WITH CHECK ((("auth"."uid"() = "seller_id") AND (NOT (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."is_blocked" = true)))))));



CREATE POLICY "Listings viewable" ON "public"."listings" FOR SELECT USING ((("status" = ANY (ARRAY['ACTIVE'::"text", 'SOLD'::"text", 'RENTED'::"text"])) OR ("seller_id" = "auth"."uid"()) OR "public"."is_superadmin"()));



CREATE POLICY "Offer participants access" ON "public"."listing_offers" USING ((("auth"."uid"() = "buyer_id") OR ("auth"."uid"() = "seller_id") OR "public"."is_superadmin"())) WITH CHECK ((("auth"."uid"() = "buyer_id") OR ("auth"."uid"() = "seller_id") OR "public"."is_superadmin"()));



CREATE POLICY "Owners or superadmin delete listings" ON "public"."listings" FOR DELETE USING ((("seller_id" = "auth"."uid"()) OR "public"."is_superadmin"()));



CREATE POLICY "Owners or superadmin update listings" ON "public"."listings" FOR UPDATE USING ((("seller_id" = "auth"."uid"()) OR "public"."is_superadmin"())) WITH CHECK ((("seller_id" = "auth"."uid"()) OR "public"."is_superadmin"()));



CREATE POLICY "Participants read messages" ON "public"."messages" FOR SELECT USING ((("auth"."uid"() = "sender_id") OR ("auth"."uid"() = "receiver_id") OR "public"."is_superadmin"()));



CREATE POLICY "Participants view chats" ON "public"."chats" FOR SELECT USING ((("auth"."uid"() = "buyer_id") OR ("auth"."uid"() = "seller_id")));



CREATE POLICY "Public profiles viewable" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Superadmin update any profile" ON "public"."profiles" FOR UPDATE USING ("public"."is_superadmin"());



CREATE POLICY "Superadmin updates platform_config" ON "public"."platform_config" FOR UPDATE USING ("public"."is_superadmin"());



CREATE POLICY "Users create chats" ON "public"."chats" FOR INSERT WITH CHECK (("auth"."uid"() = "buyer_id"));



CREATE POLICY "Users manage own likes" ON "public"."listing_likes" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own notifications" ON "public"."notifications" USING ((("auth"."uid"() = "user_id") OR "public"."is_superadmin"())) WITH CHECK ((("auth"."uid"() = "user_id") OR "public"."is_superadmin"()));



CREATE POLICY "Users send own messages" ON "public"."messages" FOR INSERT WITH CHECK (("auth"."uid"() = "sender_id"));



CREATE POLICY "Users update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



ALTER TABLE "public"."chats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listing_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listing_offers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seller_reviews" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_listing_view"("p_listing_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_listing_view"("p_listing_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_listing_view"("p_listing_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_listing_owner"("p_listing_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_listing_owner"("p_listing_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_listing_owner"("p_listing_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";


















GRANT ALL ON TABLE "public"."chats" TO "anon";
GRANT ALL ON TABLE "public"."chats" TO "authenticated";
GRANT ALL ON TABLE "public"."chats" TO "service_role";



GRANT ALL ON TABLE "public"."listing_likes" TO "anon";
GRANT ALL ON TABLE "public"."listing_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."listing_likes" TO "service_role";



GRANT ALL ON TABLE "public"."listing_offers" TO "anon";
GRANT ALL ON TABLE "public"."listing_offers" TO "authenticated";
GRANT ALL ON TABLE "public"."listing_offers" TO "service_role";



GRANT ALL ON TABLE "public"."listings" TO "anon";
GRANT ALL ON TABLE "public"."listings" TO "authenticated";
GRANT ALL ON TABLE "public"."listings" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."platform_config" TO "anon";
GRANT ALL ON TABLE "public"."platform_config" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_config" TO "service_role";



GRANT ALL ON TABLE "public"."platform_settings" TO "anon";
GRANT ALL ON TABLE "public"."platform_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_settings" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."seller_reviews" TO "anon";
GRANT ALL ON TABLE "public"."seller_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."seller_reviews" TO "service_role";









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



































