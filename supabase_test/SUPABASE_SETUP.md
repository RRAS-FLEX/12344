# Supabase Integration Setup

This guide explains how to set up Supabase for Nautiplex.

## 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up / log in
2. Create a new project:
   - **Project Name**: `nautiq` (or your choice)
   - **Database Password**: Create a strong password and save it
   - **Region**: Choose the closest to your users
3. Wait for the project to initialize (2-5 minutes)

## 2. Get Your API Keys

In your Supabase dashboard, go to **Settings → API**:
- Copy your **Project URL** (`https://xxxx.supabase.co`)
- Copy your **anon/public key** (starts with `eyJ...`)

Add these to your `.env.local`:
```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

## 3. Create Database Tables

In your Supabase dashboard, go to **SQL Editor** and run the following SQL:

```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT auth.uid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_owner BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Boats table
CREATE TABLE boats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  location TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  price_per_day DECIMAL NOT NULL,
  rating FLOAT DEFAULT 0,
  image TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
  bookings INTEGER DEFAULT 0,
  revenue DECIMAL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Boat features table (for flexibility)
CREATE TABLE boat_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id UUID NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(boat_id, feature)
);

-- Boat documents table (for papers/certifications)
CREATE TABLE boat_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id UUID NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Bookings table
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id UUID NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  total_price DECIMAL NOT NULL,
  -- Dynamic commission fields (see supabase_dynamic_commission.sql for trigger logic)
  fuel_included BOOLEAN NOT NULL DEFAULT FALSE,
  duration_hours NUMERIC,
  estimated_fuel_cost NUMERIC NOT NULL DEFAULT 0,
  total_agency_commission NUMERIC NOT NULL DEFAULT 0,
  base_rental_price NUMERIC,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Calendar events table
CREATE TABLE public.calendar_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text NULL,
  location text NULL,
  start_time timestamp with time zone NOT NULL,
  end_time timestamp with time zone NULL,
  all_day boolean NOT NULL DEFAULT FALSE,
  timezone text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  booking_id uuid NULL,
  boat_id uuid NULL,
  event_type public.calendar_event_type NOT NULL DEFAULT 'booked'::calendar_event_type,
  CONSTRAINT calendar_events_pkey PRIMARY KEY (id),
  CONSTRAINT calendar_events_boat_id_fkey FOREIGN KEY (boat_id) REFERENCES boats (id)
);

CREATE INDEX IF NOT EXISTS calendar_events_user_id_event_type_start_time_idx
  ON public.calendar_events USING btree (user_id, event_type, start_time);

CREATE INDEX IF NOT EXISTS calendar_events_user_id_start_time_idx
  ON public.calendar_events USING btree (user_id, start_time);

CREATE TRIGGER set_calendar_events_updated_at
BEFORE UPDATE ON public.calendar_events
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_calendar_events_fill_boat_id
BEFORE INSERT OR UPDATE OF booking_id, boat_id ON public.calendar_events
FOR EACH ROW
EXECUTE FUNCTION fn_calendar_events_fill_boat_id();

-- Admin users table
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Reviews table
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id UUID NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_boats_owner_id ON boats(owner_id);
CREATE INDEX idx_bookings_boat_id ON bookings(boat_id);
CREATE INDEX idx_bookings_customer_id ON bookings(customer_id);
```

## 4. Set Up Row-Level Security (RLS)

This restricts data access — users can only see/edit their own data.

Go to **SQL Editor** and run:

```sql
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE boats ENABLE ROW LEVEL SECURITY;
ALTER TABLE boat_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE boat_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Users can only read their own profile
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (auth.uid() = id);

-- Owners can read/write their own boats
CREATE POLICY "Owners can CRUD own boats"
  ON boats FOR ALL
  USING (auth.uid() = owner_id);

-- Anyone can read active boats
CREATE POLICY "Anyone can view active boats"
  ON boats FOR SELECT
  USING (status = 'active');

-- Owners can manage their boat features
CREATE POLICY "Owners can manage boat features"
  ON boat_features FOR ALL
  USING (boat_id IN (SELECT id FROM boats WHERE owner_id = auth.uid()));

-- Similar for documents, bookings, etc. (add as needed)
```

## 5. Enable Supabase Auth

In your dashboard, go to **Authentication → Providers**:
- Ensure **Email** is enabled (already default)
- Optionally enable Google, GitHub, etc. for OAuth

## 6. Set Up Storage Buckets (Recommended)

Run the SQL file [supabase_storage_buckets.sql](./supabase_storage_buckets.sql) in Supabase SQL Editor.

This creates the bucket structure and policies:

- `boat-images` (public) — boat listing and gallery images
- `destination-images` (public) — destination page/card images
- `profile-images` (public) — user avatars/profile photos
- `boat-documents` (private) — permits, insurance, licenses, registration docs
- `review-media` (public) — optional review attachments
- `owner-verification-docs` (private) — KYC/owner verification documents
- `chat-attachments` (private) — message attachments (served via signed URLs)
- `payment-receipts` (private) — invoice/receipt files
- `support-attachments` (private) — support ticket attachments
- `temp-uploads` (private) — short-lived uploads with optional hourly cleanup job

Folder naming convention used by policies:

- Public upload buckets: `<user-id>/<entity-id>/<filename>`
- Private boat documents: `<owner-user-id>/<boat-id>/<filename>`
- Other private buckets: `<user-id>/<context-id>/<filename>`

## 7. Environment Variables

Update `.env.example`:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## 8. Test the Connection

Run `npm run dev` and check the browser console for any connection errors.

## Next Steps

- Replace `src/lib/auth.ts` with Supabase Auth
- Update `src/lib/owner-dashboard.ts` to query Supabase
- Migrate boat creation/editing to insert into `boats` table
- Set up real-time subscriptions for live updates

For more info, see [Supabase docs](https://supabase.com/docs).

