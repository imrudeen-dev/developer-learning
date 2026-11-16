# Becho — Local Buy, Sell & Rent Marketplace App

**Becho** is a full-stack OLX-style mobile marketplace built with **React Native (Expo Router)** and **Supabase**. Users can list items for **sale (`SELL`)** or **rent (`RENT`)** with multi-photo uploads, GPS locality detection, category & price filtering, real-time buyer–seller messaging, and full ad lifecycle management.

## Core Features

- **Authentication & Seller Profiles:** Email/password auth powered by Supabase Auth with automatic `profiles` provisioning via Postgres triggers and editable city/contact details.
- **Dual Marketplace (`BUY` & `RENT`):**
  - **Sell Ads:** Fixed-price listings across 10 categories (`Mobiles`, `Electronics`, `Vehicles`, `Property`, `Furniture`, `Bikes`, `Appliances`, `Fashion`, `Books & Sports`, `Tools & Gear`).
  - **Rent Ads:** Flexible billing periods (`Per Day`, `Per Week`, `Per Month`) with optional refundable security deposits.
- **Multi-Photo Upload & GPS Locality:** Upload up to 5 gallery photos per listing (`base64-arraybuffer` -> Supabase Storage `listing-images`) and auto-fill city/area using `expo-location` reverse geocoding.
- **Discovery Feed & Search:** Two-column marketplace feed with `All` / `Buy` / `Rent` mode filters, category chips, keyword search, pull-to-refresh, and multi-photo detail carousel.
- **Real-Time Buyer ↔ Seller Chat:** Live 1-on-1 listing threads powered by Supabase Realtime (`postgres_changes` on `public.messages`) plus a unified inbox grouped by listing and counterparty.
- **My Ads Lifecycle Management:** Sellers can mark items as `SOLD` or `RENTED`, relist them as `ACTIVE`, or delete listings along with their stored images.

## Tech Stack

| Layer | Technology |
|---|---|
| **Mobile Framework** | React Native, Expo SDK, Expo Router (file-based navigation) |
| **Language** | TypeScript |
| **Backend & Auth** | Supabase (PostgreSQL, Row Level Security, Auth) |
| **Storage & Realtime** | Supabase Storage (`listing-images`), Supabase Realtime channels |
| **Device APIs** | `expo-image-picker`, `expo-location`, `@react-native-async-storage/async-storage` |

## Project Structure

```text
becho/
├── src/
│   ├── app/
│   │   ├── _layout.tsx              # Root Stack + AuthProvider
│   │   ├── (tabs)/
│   │   │   ├── _layout.tsx          # 4-Tab Navigator (Home, Post Ad, Chats, Profile)
│   │   │   ├── index.tsx            # Marketplace Feed (All/Buy/Rent, Search, Categories)
│   │   │   ├── post.tsx             # Post Ad (SELL/RENT, Photos, GPS Location)
│   │   │   ├── chats.tsx            # Buyer/Seller Conversations Inbox
│   │   │   └── profile.tsx          # Auth, Seller Profile & My Ads Management
│   │   ├── listing/[id].tsx         # Listing Detail + Photo Carousel + Chat CTA
│   │   └── chat/[listingId].tsx     # Real-Time 1-on-1 Chat Thread
│   └── lib/
│       ├── auth-context.tsx         # Global Session & UserProfile Provider
│       ├── constants.ts             # Categories & Rental Billing Periods
│       ├── listings.ts              # Listing Types, INR & Relative Time Formatters
│       ├── supabase.ts              # SSR-Safe Supabase Client
│       └── theme.ts                 # Dark Slate & Emerald Design Tokens
├── .env                             # Local environment secrets (Git-ignored)
└── package.json
```

## Local Setup

### 1. Prerequisites
- Node.js 18+ and npm
- Expo Go app installed on Android or iOS

### 2. Environment Variables
Create a `.env` file in the `becho/` root directory:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-publishable-or-anon-key
```

### 3. Install & Run

```bash
npm install
npx expo start --tunnel
```

Scan the QR code with **Expo Go** to launch the app on your device.
