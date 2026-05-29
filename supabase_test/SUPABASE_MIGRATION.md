# Supabase Migration Guide - Nautiplex

This document explains what's been done to add Supabase support and how to activate it.

## What Changed

### New Files Created

1. **`src/lib/supabase.ts`** — Supabase client initialization with full TypeScript types for all tables
2. **`src/lib/supabase-auth.ts`** — Supabase-based authentication functions (sign up, sign in, session management)
3. **`src/lib/supabase-owner-dashboard.ts`** — Supabase-based boat management (CRUD operations)
4. **`src/lib/auth-hybrid.ts`** — Smart wrapper that **automatically switches between localStorage and Supabase**
5. **`src/lib/dashboard-hybrid.ts`** — Smart wrapper for boat management (localStorage ↔ Supabase)
6. **`SUPABASE_SETUP.md`** — Step-by-step guide to set up your Supabase project

### Modified Components

1. **`src/components/AuthDialog.tsx`**
   - Now uses `auth-hybrid` module
   - Async sign-in/sign-up handlers
   - Works with both localStorage and Supabase

2. **`src/components/Navbar.tsx`**
   - Now uses `auth-hybrid` module
   - Async session loading with proper error handling
   - Works with both localStorage and Supabase

3. **`src/pages/OwnerProfile.tsx`**
   - Now uses `dashboard-hybrid` module
   - Async boat data loading with useEffect
   - Auto-refresh on add/edit boat
   - Works with both localStorage and Supabase

## How It Works Now (Hybrid Mode)

All components use **hybrid modules** that intelligently pick the right backend:

```ts
// Before (localhost only):
import { getSessionUser } from "@/lib/auth";
const user = getSessionUser(); // Synchronous, from localStorage

// After (hybrid):
import { getSessionUser } from "@/lib/auth-hybrid";
const user = await getSessionUser(); // async, uses Supabase if configured, else localStorage
```

**No Supabase configured?** → Uses localStorage (your current system)  
**Supabase configured?** → Uses Supabase with automatic fallback to localStorage on error

## Activation Steps

### Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Sign up / log in
3. Create a new project
4. Save your **Project URL** and **anon key**

### Step 2: Add Environment Variables

Create or update `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

⚠️ **Never commit `.env.local` to git** — it contains secrets!

### Step 3: Set Up Database Schema

Follow the SQL instructions in **[SUPABASE_SETUP.md](./SUPABASE_SETUP.md)**:
- Copy the SQL schema
- Paste it into **Supabase → SQL Editor**
- Run it to create all tables

### Step 4: Test the Integration

1. Run `npm run dev`
2. Click "Sign In" in the navbar
3. **Sign up** with a new account (will create user in Supabase)
4. Check **Supabase Dashboard → Authentication → Users** to confirm

If it works → you're connected!  
If it fails → falls back to localStorage automatically (check browser console for details)

## File Structure

```
src/lib/
├── auth.ts                    ← Original localStorage auth (kept for compatibility)
├── auth-hybrid.ts             ← NEW: Smart wrapper (localStorage + Supabase)
├── supabase.ts                ← NEW: Supabase client initialization
├── supabase-auth.ts           ← NEW: Supabase authentication
├── supabase-owner-dashboard.ts← NEW: Supabase boat management
├── dashboard-hybrid.ts        ← NEW: Smart wrapper for boats
└── owner-dashboard.ts         ← Original localStorage boats (kept for compatibility)
```

## Gradual Migration Path

You don't have to migrate everything at once:

1. **Phase 1** (Done ✓): Hybrid modules in place, works with localStorage
2. **Phase 2** (Optional): Set up Supabase, test with hybrid modules
3. **Phase 3** (Optional): Migrate other features (bookings, reviews, messages)
4. **Phase 4** (Optional): Replace all `import from "auth"` with `import from "supabase-auth"` (stop using localStorage)

## Troubleshooting

### "Supabase environment variables not configured"

This warning appears when `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` are missing. It's **OK** — the app falls back to localStorage.

### "Email already exists"

If you tried signing up with the same email in both localStorage and Supabase, the app remembers the localStorage user. Use a different email for Supabase testing.

### Sign in works but boat data doesn't load

Make sure the SQL schema was created. Check **Supabase Dashboard → Tables**. You should see: `users`, `boats`, `boat_features`, `boat_documents`, `bookings`, `calendar_events`, `admin_users`, `reviews`.

### Row-Level Security (RLS) errors

If you enable RLS but don't set the policies, queries will fail. Either:
- A) Don't enable RLS (Supabase is public by default)
- B) Follow the RLS policies in **SUPABASE_SETUP.md**

## Next Steps

### To Go Fully to Supabase

Once you're comfortable with the hybrid setup, you can:

1. Replace `import from "auth-hybrid"` with `import from "supabase-auth"`
2. Replace `import from "dashboard-hybrid"` with `import from "supabase-owner-dashboard"`
3. Delete localStorage auth code (keep as backup)
4. Implement missing features:
   - Bookings (CRUD in Supabase)
   - Reviews (CRUD in Supabase)
   - Real-time chat/messages
   - File uploads for boat images/documents

### Real-Time Features

Supabase supports live subscriptions:

```ts
const subscription = supabase
  .from('bookings')
  .on('*', payload => {
    console.log('Booking updated:', payload);
  })
  .subscribe();
```

### File Upload Support

For boat images and documents, use Supabase Storage:

```ts
const { data, error } = await supabase.storage
  .from('boat-images')
  .upload(`${boatId}/main.jpg`, file);
```

## Owner Badges Migration

This project includes an **owner performance badges** system that can power
customer-facing badges on boat listings (e.g. "Fast Responder", "Zero-Cancel").

All SQL for this lives in `supabase_test/supabase_owner_badges.sql` and is
designed to be **rerunnable** in Supabase.

### What the migration adds

1. `badges` table — catalog of badge definitions (`name`, `icon_slug`, `description`)
2. `boat_owner_badges` table — link table from `users.id` (owners) to `badges.id`
3. `owner_performance_metrics` view — aggregates bookings + reviews per owner
4. `fn_refresh_owner_badges()` — recomputes badges for all owners based on metrics
5. `trg_refresh_owner_badges_after_change` + triggers on `bookings` and `reviews`
6. `boat_listing_owner_badges` view — exposes, per `boat_id`, a JSON array of
    badges for that boat's owner, safe for public listings.

### How to apply the badge SQL

1. Open `supabase_test/supabase_owner_badges.sql` in your editor.
2. Copy its full contents.
3. In Supabase Dashboard, go to **SQL Editor → New query**.
4. Paste the SQL and run it once.

The script is idempotent: it uses `IF NOT EXISTS` and `CREATE OR REPLACE` so
you can re-run it safely when you tweak badge logic.

### Row-Level Security for badges

The migration enables RLS and adds these policies:

- `badges`: `"Public can read badges"` → anyone can read the badge catalog.
- `boat_owner_badges`: `"Owners can read their badges"` → owners can read
   their own assignments using `auth.uid()`.
- `boat_owner_badges`: `"Public can read owner badges"` → anonymous/public
   clients can read badge assignments, which is needed for listings.

Because of the public read policy, you can safely query `boat_listing_owner_badges`
from the frontend using the anon key.

### How listings consume badges

The `boat_listing_owner_badges` view returns rows like:

```sql
SELECT * FROM boat_listing_owner_badges WHERE boat_id = :boat_id;
```

Each row contains:

- `boat_id` — the public `boats.id`
- `owner_badges` — `json_agg` of objects
   `{ name: text, icon_slug: text }` for that owner

Frontend pattern (pseudocode):

1. Query boats as usual from `boats` (or existing view/API).
2. For each boat, either:
    - Join `boat_listing_owner_badges` server-side (preferred for SSR/edge), or
    - Make a client-side Supabase query filtering by `boat_id`.
3. Render one or more badge pills/icons using `badge.name` + `badge.icon_slug`.

Once this is wired into the UI, high-performing owners automatically earn and
lose badges over time as bookings and reviews change.

## Calendar Events boat_id Backfill & Trigger

To make sure `calendar_events.boat_id` is always populated when a
`booking_id` is present, there is a helper SQL script:

- `supabase_test/supabase_calendar_events_fill_boat_id.sql`

Run this once in Supabase **SQL Editor**:

1. Open the file in your editor and copy its contents.
2. In Supabase Dashboard, go to **SQL Editor → New query**.
3. Paste and run it.

This will:

- Backfill any existing `calendar_events` rows that have `booking_id` set
   but `boat_id` NULL, copying `boat_id` from the related booking.
- Create a trigger so that future inserts/updates on `calendar_events`
   automatically fill `boat_id` from `bookings` whenever `booking_id` is set
   and `boat_id` is missing.

## Calendar Events RLS Policies

Booking calendars and owner availability tools need to read
`calendar_events` to show blocked/maintenance dates.

Use the helper script:

- `supabase_test/supabase_calendar_events_policies.sql`

Run this once in Supabase **SQL Editor**:

1. Open the file in your editor and copy its contents.
2. In Supabase Dashboard, go to **SQL Editor → New query**.
3. Paste and run it.

This will:

- Enable RLS on `public.calendar_events` (if not already enabled).
- Allow public/anon clients to `SELECT` events, which is needed so the
   booking page calendar can see blocked days.
- Allow authenticated owners to manage (`INSERT/UPDATE/DELETE`) only
   their own events, based on `user_id`.

## External Calendar Sync + Flash Sales

The boat-level iCal bridge lives in the scheduled sync flow:

- Edge Function: `supabase/functions/sync-boat-calendars/index.ts`
- Local runner: `scripts/ops/sync-boat-calendars.mjs`
- Cron helper: `supabase_test/supabase_schedule_calendar_sync.sql`

What to do in Supabase:

1. Deploy the Edge Function.
2. Create the Vault secrets referenced in the SQL helper (`project_url` and `calendar_sync_secret`).
3. Run `supabase_test/supabase_schedule_calendar_sync.sql` once in the SQL editor.

That schedule keeps `calendar_events` in sync with external iCal feeds so the booking calendar can block imported busy windows automatically.

Flash-sale support is data-only:

- `boats.external_calendar_url` stores the iCal feed URL.
- `boats.flash_sale_enabled` turns on the 30% last-minute discount path in the booking page.

No separate cron is required for flash sales; the discount is evaluated live during checkout.

## Support

If something breaks:

1. Check browser console (`F12 → Console`)
2. Look for "Supabase" error messages
3. Check that `.env.local` has correct values
4.  Verify SQL schema was created (all 8 tables present)

---

**Current Status**: ✅ Hybrid auth + boat management ready to activate

**Fallback**: Always works with localStorage if Supabase is not set up

**Next**: Follow SUPABASE_SETUP.md to create your project and activate Supabase!

