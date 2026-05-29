-- Split sector-specific listing data out of public.boats.
--
-- Compatibility-first migration:
-- 1) Keep public.boats available for existing app paths.
-- 2) Create dedicated tables for party and watersports sectors.
-- 3) Backfill from existing boats records so data is not lost.
--
-- After application code is switched to the new tables, party/watersports
-- columns can be dropped from public.boats in a follow-up cleanup migration.

BEGIN;

CREATE TABLE IF NOT EXISTS public.party_boats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  name text NOT NULL,
  location text NOT NULL,
  description text,
  departure_marina text,
  capacity integer NOT NULL,
  ticket_max_people integer,
  ticket_price_per_person numeric(12,2),
  party_tiers jsonb,
  party_event_date date,
  party_event_time text,
  party_event_timezone text NOT NULL DEFAULT 'UTC',
  images text,
  status text NOT NULL DEFAULT 'active',
  map_query text,
  flash_sale_enabled boolean NOT NULL DEFAULT false,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT party_boats_boat_id_key UNIQUE (boat_id),
  CONSTRAINT party_boats_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users (id) ON DELETE CASCADE,
  CONSTRAINT party_boats_status_check CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'maintenance'::text])),
  CONSTRAINT party_boats_event_time_format CHECK (
    party_event_time IS NULL OR party_event_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  )
);

CREATE INDEX IF NOT EXISTS idx_party_boats_owner_id
  ON public.party_boats USING btree (owner_id);

CREATE INDEX IF NOT EXISTS idx_party_boats_event_date
  ON public.party_boats USING btree (party_event_date)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_party_boats_status
  ON public.party_boats USING btree (status);

CREATE INDEX IF NOT EXISTS idx_party_boats_tiers
  ON public.party_boats USING gin (party_tiers)
  WHERE party_tiers IS NOT NULL;


CREATE TABLE IF NOT EXISTS public.watersports_boats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  name text NOT NULL,
  location text NOT NULL,
  description text,
  departure_marina text,
  capacity integer NOT NULL,
  price_per_day numeric,
  images text,
  status text NOT NULL DEFAULT 'active',
  map_query text,
  flash_sale_enabled boolean NOT NULL DEFAULT false,
  equipment jsonb,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT watersports_boats_boat_id_key UNIQUE (boat_id),
  CONSTRAINT watersports_boats_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users (id) ON DELETE CASCADE,
  CONSTRAINT watersports_boats_status_check CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'maintenance'::text]))
);

CREATE INDEX IF NOT EXISTS idx_watersports_boats_owner_id
  ON public.watersports_boats USING btree (owner_id);

CREATE INDEX IF NOT EXISTS idx_watersports_boats_status
  ON public.watersports_boats USING btree (status);

CREATE INDEX IF NOT EXISTS idx_watersports_boats_equipment
  ON public.watersports_boats USING gin (equipment)
  WHERE equipment IS NOT NULL;


INSERT INTO public.party_boats (
  boat_id,
  owner_id,
  name,
  location,
  description,
  departure_marina,
  capacity,
  ticket_max_people,
  ticket_price_per_person,
  party_tiers,
  party_event_date,
  party_event_time,
  party_event_timezone,
  images,
  status,
  map_query,
  flash_sale_enabled,
  created_at,
  updated_at
)
SELECT
  b.id,
  b.owner_id,
  b.name,
  b.location,
  b.description,
  b.departure_marina,
  COALESCE(b.capacity, 0),
  COALESCE(b.capacity, 0) as ticket_max_people,
  0::numeric(12,2) as ticket_price_per_person,
  '[]'::jsonb as party_tiers,
  NULL::date as party_event_date,
  NULL::text as party_event_time,
  'UTC' as party_event_timezone,
  b.images,
  COALESCE(b.status, 'active'),
  b.map_query,
  COALESCE(b.flash_sale_enabled, false),
  COALESCE(b.created_at, now()),
  COALESCE(b.updated_at, now())
FROM public.boats b
WHERE b.type = 'Party Boat'
ON CONFLICT (boat_id) DO UPDATE
SET
  owner_id = EXCLUDED.owner_id,
  name = EXCLUDED.name,
  location = EXCLUDED.location,
  description = EXCLUDED.description,
  departure_marina = EXCLUDED.departure_marina,
  capacity = EXCLUDED.capacity,
  ticket_max_people = EXCLUDED.ticket_max_people,
  ticket_price_per_person = EXCLUDED.ticket_price_per_person,
  party_tiers = EXCLUDED.party_tiers,
  party_event_date = EXCLUDED.party_event_date,
  party_event_time = EXCLUDED.party_event_time,
  party_event_timezone = EXCLUDED.party_event_timezone,
  images = EXCLUDED.images,
  status = EXCLUDED.status,
  map_query = EXCLUDED.map_query,
  flash_sale_enabled = EXCLUDED.flash_sale_enabled,
  updated_at = now();


INSERT INTO public.watersports_boats (
  boat_id,
  owner_id,
  name,
  location,
  description,
  departure_marina,
  capacity,
  price_per_day,
  images,
  status,
  map_query,
  flash_sale_enabled,
  created_at,
  updated_at
)
SELECT
  b.id,
  b.owner_id,
  b.name,
  b.location,
  b.description,
  b.departure_marina,
  COALESCE(b.capacity, 0),
  COALESCE(b.price_per_day, 0::numeric),
  b.images,
  COALESCE(b.status, 'active'),
  b.map_query,
  COALESCE(b.flash_sale_enabled, false),
  COALESCE(b.created_at, now()),
  COALESCE(b.updated_at, now())
FROM public.boats b
WHERE lower(COALESCE(b.type, '')) LIKE '%watersports%'
ON CONFLICT (boat_id) DO UPDATE
SET
  owner_id = EXCLUDED.owner_id,
  name = EXCLUDED.name,
  location = EXCLUDED.location,
  description = EXCLUDED.description,
  departure_marina = EXCLUDED.departure_marina,
  capacity = EXCLUDED.capacity,
  price_per_day = EXCLUDED.price_per_day,
  images = EXCLUDED.images,
  status = EXCLUDED.status,
  map_query = EXCLUDED.map_query,
  flash_sale_enabled = EXCLUDED.flash_sale_enabled,
  updated_at = now();


COMMENT ON TABLE public.party_boats IS 'Sector table for party listings migrated from public.boats.';
COMMENT ON TABLE public.watersports_boats IS 'Sector table for watersports listings migrated from public.boats.';


-- Enable RLS and add access policies for sector tables
ALTER TABLE public.party_boats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watersports_boats ENABLE ROW LEVEL SECURITY;

-- Owner access policies (for authenticated users)
CREATE POLICY party_boats_owner_access ON public.party_boats
  FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY party_boats_public_read ON public.party_boats
  FOR SELECT
  USING (status = 'active');

CREATE POLICY watersports_boats_owner_access ON public.watersports_boats
  FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY watersports_boats_public_read ON public.watersports_boats
  FOR SELECT
  USING (status = 'active');

COMMIT;
