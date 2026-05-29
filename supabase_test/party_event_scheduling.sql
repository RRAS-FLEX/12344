-- Party event scheduling: Add date/time columns for scheduled party events
-- Allows owners to set when each party boat event happens

BEGIN;

-- Add scheduled event date/time columns to boats table
ALTER TABLE public.boats
  ADD COLUMN IF NOT EXISTS party_event_date date,
  ADD COLUMN IF NOT EXISTS party_event_time text,
  ADD COLUMN IF NOT EXISTS party_event_timezone text DEFAULT 'UTC';

-- Add check constraint to ensure valid time format (HH:MM)
ALTER TABLE public.boats
  ADD CONSTRAINT boats_party_event_time_format
    CHECK (party_event_time IS NULL OR party_event_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- Create index for efficient party event filtering
CREATE INDEX IF NOT EXISTS boats_party_event_date_idx
  ON public.boats USING btree (party_event_date) WHERE party_ready = true;

COMMIT;
