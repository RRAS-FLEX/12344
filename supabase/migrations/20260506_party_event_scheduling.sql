-- Party event scheduling: add the columns used by the party booking flow.

BEGIN;

ALTER TABLE public.boats
  ADD COLUMN IF NOT EXISTS party_event_date date,
  ADD COLUMN IF NOT EXISTS party_event_time text,
  ADD COLUMN IF NOT EXISTS party_event_timezone text DEFAULT 'UTC';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'boats_party_event_time_format'
  ) THEN
    ALTER TABLE public.boats
      ADD CONSTRAINT boats_party_event_time_format
        CHECK (party_event_time IS NULL OR party_event_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS boats_party_event_date_idx
  ON public.boats USING btree (party_event_date)
  WHERE party_ready = true;

COMMIT;