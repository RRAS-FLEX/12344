-- Add party tier tracking to bookings table
-- Allows tracking which party tier (Casual, VIP, Premium, etc.) was selected

BEGIN;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS party_tier_selected text,
  ADD COLUMN IF NOT EXISTS party_tier_price numeric(12,2);

-- Index for efficient party booking queries
CREATE INDEX IF NOT EXISTS bookings_party_tier_selected_idx
  ON public.bookings USING btree (party_tier_selected) WHERE party_ready = true;

COMMIT;
