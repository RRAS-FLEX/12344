-- Add party tier customization for boat parties
-- Allows owners to define custom party tiers (e.g., Casual, VIP, Premium)

BEGIN;

-- Add party_tiers column to boats table (optional, JSON format)
ALTER TABLE public.boats
  ADD COLUMN IF NOT EXISTS party_tiers jsonb;

-- Example structure for party_tiers:
-- [{"name": "Casual", "price": 50}, {"name": "VIP", "price": 100}, {"name": "Premium", "price": 150}]

-- Create index for efficient filtering if needed later
CREATE INDEX IF NOT EXISTS boats_party_tiers_idx
  ON public.boats USING gin (party_tiers) WHERE party_ready = true;

COMMIT;
