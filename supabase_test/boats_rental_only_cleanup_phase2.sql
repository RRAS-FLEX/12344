-- Phase 2 cleanup: make public.boats rental-only after app code has migrated
-- to public.party_boats and public.watersports_boats.

BEGIN;

-- Auto-remediate: move any leftover party metadata from boats into party_boats
-- so cleanup can proceed without losing data.
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
  b.capacity,
  b.ticket_max_people,
  b.ticket_price_per_person,
  b.party_tiers,
  b.party_event_date,
  b.party_event_time,
  COALESCE(NULLIF(b.party_event_timezone, ''), 'UTC'),
  b.images,
  COALESCE(b.status, 'active'),
  b.map_query,
  COALESCE(b.flash_sale_enabled, false),
  COALESCE(b.created_at, now()),
  COALESCE(b.updated_at, now())
FROM public.boats b
WHERE
  COALESCE(b.party_ready, false) = true
  OR b.ticket_max_people IS NOT NULL
  OR b.ticket_price_per_person IS NOT NULL
  OR b.party_tiers IS NOT NULL
  OR b.party_event_date IS NOT NULL
  OR b.party_event_time IS NOT NULL
  OR b.party_event_timezone IS NOT NULL
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

-- Clear deprecated party fields from boats after backfill/upsert.
UPDATE public.boats
SET
  party_ready = false,
  ticket_max_people = NULL,
  ticket_price_per_person = NULL,
  party_tiers = NULL,
  party_event_date = NULL,
  party_event_time = NULL,
  party_event_timezone = NULL
WHERE
  COALESCE(party_ready, false) = true
  OR ticket_max_people IS NOT NULL
  OR ticket_price_per_person IS NOT NULL
  OR party_tiers IS NOT NULL
  OR party_event_date IS NOT NULL
  OR party_event_time IS NOT NULL
  OR party_event_timezone IS NOT NULL;

DO $$
DECLARE
  party_rows integer;
  party_data_rows integer;
  watersports_rows integer;
BEGIN
  SELECT COUNT(*) INTO party_rows
  FROM public.boats
  WHERE COALESCE(party_ready, false) = true;

  SELECT COUNT(*) INTO party_data_rows
  FROM public.boats
  WHERE
    ticket_max_people IS NOT NULL
    OR ticket_price_per_person IS NOT NULL
    OR party_tiers IS NOT NULL
    OR party_event_date IS NOT NULL
    OR party_event_time IS NOT NULL
    OR party_event_timezone IS NOT NULL;

  SELECT COUNT(*) INTO watersports_rows
  FROM public.boats
  WHERE lower(COALESCE(type, '')) IN ('watersports', 'watersports charter');

  IF party_rows > 0 OR party_data_rows > 0 OR watersports_rows > 0 THEN
    RAISE EXCEPTION 'Cannot make boats rental-only yet. Remaining rows: party_flag=% party_data=% watersports=%', party_rows, party_data_rows, watersports_rows;
  END IF;
END $$;

DROP INDEX IF EXISTS public.boats_party_tiers_idx;
DROP INDEX IF EXISTS public.boats_party_event_date_idx;
DROP INDEX IF EXISTS public.boats_party_ready_idx;

ALTER TABLE public.boats
  DROP CONSTRAINT IF EXISTS boats_party_event_time_format;

ALTER TABLE public.boats
  DROP CONSTRAINT IF EXISTS boats_rental_type_check;

ALTER TABLE public.boats
  DROP COLUMN IF EXISTS party_ready,
  DROP COLUMN IF EXISTS ticket_max_people,
  DROP COLUMN IF EXISTS ticket_price_per_person,
  DROP COLUMN IF EXISTS party_tiers,
  DROP COLUMN IF EXISTS party_event_date,
  DROP COLUMN IF EXISTS party_event_time,
  DROP COLUMN IF EXISTS party_event_timezone;

ALTER TABLE public.boats
  ADD CONSTRAINT boats_rental_type_check
  CHECK (lower(COALESCE(type, '')) NOT IN ('watersports', 'watersports charter'));

COMMIT;
