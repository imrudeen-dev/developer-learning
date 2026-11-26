# Becho Marketplace

Becho is a mobile-first local marketplace built with Expo, React Native, TypeScript, and Supabase. Users can discover, sell, rent, and negotiate local listings.

## Features

- Email/password authentication and editable seller profiles.
- Live marketplace feed with icon-led category tiles, search, city/price/seller-verification filters, sort options, sale/rent modes, saved listings, and separate popular/recommended/recently-sold sections.
- Multi-photo listing creation with optional GPS-based locality.
- Listing details with seller contact preferences, likes, views, ratings, and chat or offer actions.
- Realtime chat, live listing activity counts, in-app notifications, and native push notification support for configured iOS/Android builds.
- Buyer and seller activity for saved items, offers, deals, completed sales, reviews, and relisting; listing management includes active/archive search and live view/like totals.
- Seller analytics and verification requests.
- Three selectable dark accent themes and English/Tamil localization for primary navigation and key screens.
- First launch opens an interactive self-guided tour with shortcuts to Explore, My activity, Chats, Create, and Profile; it supports back/next navigation and English/Tamil copy.
- Shared responsive app shell: one header on mobile and web, a mobile navigation drawer and bottom navigation, and a persistent desktop sidebar with a desktop footer.
- Owner-only controls for maintenance, feature availability, and seller verification.
- Chat includes buyer-safety guidance and optional, foreground-only live location sharing with the selected chat partner.
- Database-enforced access policies and marketplace actions through Supabase.

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile framework | React Native, Expo SDK 58, Expo Router |
| Language and styling | TypeScript, NativeWind, Tailwind CSS |
| Backend and auth | Supabase PostgreSQL, Auth, Row Level Security |
| Storage and realtime | Supabase Storage, Realtime channels |
| Device APIs | `expo-image-picker`, `expo-location` |

## Local Setup

1. Install Node.js 22.13+ and npm.
2. Create a `.env` file in the project root:

   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-publishable-or-anon-key
   ```

3. Install dependencies and start Expo:

   ```bash
   npm install
   npx expo start
   ```

## Supabase Setup

For a completely new Supabase project, run these files once, in order, from the Supabase SQL Editor:

1. [`supabase/fresh_schema.sql`](./supabase/fresh_schema.sql) creates the core profiles, listings, messages, image storage bucket, and chat realtime setup.
2. [`supabase/migrations/20261124_marketplace_features.sql`](./supabase/migrations/20261124_marketplace_features.sql) adds saved items, offers, deals, reviews, notifications, seller verification, and owner controls.
3. [`supabase/migrations/20261124_owner_tools_announcements.sql`](./supabase/migrations/20261124_owner_tools_announcements.sql) grants trusted platform owners listing moderation access and adds realtime marketplace announcements.
4. [`supabase/migrations/20261124_notifications_realtime.sql`](./supabase/migrations/20261124_notifications_realtime.sql) enables realtime notifications and listing activity counts, adds deal notifications, and creates the device push-token table.
5. [`supabase/migrations/20261124_live_location_authorization.sql`](./supabase/migrations/20261124_live_location_authorization.sql) restricts private, ephemeral location broadcasts to the listing seller and the other chat participant.

These are intended for a new, empty project. Do not rerun them after a successful run. To add marketplace features to an existing project, apply only the feature migration after verifying its base `profiles`, `listings`, and `messages` columns match the app.

If the earlier scripts are already applied to `becho-dev`, apply only the specific migration for the capability you need. For private location sharing, run `20261124_live_location_authorization.sql` and turn off **Allow public access** in Supabase Realtime settings; private channels cannot protect location broadcasts while public channel access remains enabled.

Platform-owner access is granted only through trusted Supabase Auth `app_metadata` with the role `platform_owner`. Set that role from a secure server-side admin workflow; never expose a service-role key in the mobile app.

## Native Push Notifications

The browser preview supports live in-app updates, but operating-system push alerts require an installed iOS/Android app on a physical device.

1. Deploy `supabase/functions/send-push-notification` and set a private `PUSH_WEBHOOK_SECRET` with Supabase Functions secrets. The Supabase function runtime supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; never put the service-role key in the app.
2. In Supabase Database Webhooks, create an `INSERT` webhook for `public.notifications` that calls the deployed `send-push-notification` function. Add an `x-becho-webhook-secret` header with the same secret.
3. Link the app to an Expo project so `extra.eas.projectId` is available, configure the Expo push credentials for APNs and FCM, and build/install an iOS or Android development build.
4. Sign in on the device and enable **Profile → Device push alerts**.

Push delivery has not been activated until those project credentials and the database webhook are configured. The app does not send push requests directly from the client.

Remote push notifications are not supported in Expo Go on Android; use a development build to test push alerts. Other app features can still be tested in Expo Go.

## Checks

```bash
npx expo lint
npx tsc --noEmit
npx expo install --check
npx expo-doctor
```
