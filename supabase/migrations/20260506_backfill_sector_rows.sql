-- Backfill party_boats and watersports_boats from public.boats
-- Uses SECURITY DEFINER function to bypass RLS policies during backfill
-- Idempotent: safe to run multiple times

BEGIN;

-- Create helper function to backfill party_boats (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION backfill_party_boats()
RETURNS TABLE(rows_affected bigint) AS $$
DECLARE
  v_affected bigint;
BEGIN
  -- Upsert party boats from boats where type = 'Party Boat'
  INSERT INTO public.party_boats (
    boat_id, owner_id, name, location, description, departure_marina, capacity,
    ticket_max_people, ticket_price_per_person, party_tiers, party_event_date, party_event_time, images, status, map_query, flash_sale_enabled, updated_at
  )
  SELECT
    b.id as boat_id,
    b.owner_id,
    b.name,
    b.location,
    b.description,
    b.departure_marina,
    COALESCE(b.capacity, 0) as capacity,
    COALESCE(b.capacity, 0) as ticket_max_people,
    0::numeric(12,2) as ticket_price_per_person,
    '[]'::jsonb as party_tiers,
    NULL::date as party_event_date,
    NULL::text as party_event_time,
    b.images,
    COALESCE(b.status, 'active') as status,
    b.map_query,
    COALESCE(b.flash_sale_enabled, false) as flash_sale_enabled,
    NOW() as updated_at
  FROM public.boats b
  WHERE b.type = 'Party Boat'
  ON CONFLICT (boat_id) DO UPDATE SET
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
    images = EXCLUDED.images,
    status = EXCLUDED.status,
    map_query = EXCLUDED.map_query,
    flash_sale_enabled = EXCLUDED.flash_sale_enabled,
    updated_at = EXCLUDED.updated_at;
  
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN QUERY SELECT v_affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public;


-- Create helper function to backfill watersports_boats (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION backfill_watersports_boats()
RETURNS TABLE(rows_affected bigint) AS $$
DECLARE
  v_affected bigint;
BEGIN
  -- Upsert watersports boats from boats where type indicates watersports
  INSERT INTO public.watersports_boats (
    boat_id, owner_id, name, location, description, departure_marina, capacity, 
    price_per_day, images, status, map_query, flash_sale_enabled, updated_at
  )
  SELECT
    b.id as boat_id,
    b.owner_id,
    b.name,
    b.location,
    b.description,
    b.departure_marina,
    COALESCE(b.capacity, 0) as capacity,
    COALESCE(b.price_per_day, 0) as price_per_day,
    b.images,
    COALESCE(b.status, 'active') as status,
    b.map_query,
    COALESCE(b.flash_sale_enabled, false) as flash_sale_enabled,
    NOW() as updated_at
  FROM public.boats b
  WHERE LOWER(COALESCE(b.type, '')) LIKE '%watersports%'
  ON CONFLICT (boat_id) DO UPDATE SET
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
    updated_at = EXCLUDED.updated_at;
  
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN QUERY SELECT v_affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public;


-- Execute backfill operations
SELECT backfill_party_boats();
SELECT backfill_watersports_boats();

COMMIT;
