-- Enforce payment verification source of truth:
-- confirmed bookings must always have a Stripe payment intent id.

-- Repair existing rows first so constraint can be added safely.
UPDATE public.bookings
SET status = 'cancelled',
    updated_at = NOW()
WHERE LOWER(COALESCE(status, '')) = 'confirmed'
  AND (stripe_payment_intent_id IS NULL OR BTRIM(stripe_payment_intent_id) = '');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bookings_confirmed_requires_payment_intent_ck'
      AND conrelid = 'public.bookings'::regclass
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_confirmed_requires_payment_intent_ck
      CHECK (
        LOWER(COALESCE(status, '')) <> 'confirmed'
        OR (stripe_payment_intent_id IS NOT NULL AND BTRIM(stripe_payment_intent_id) <> '')
      );
  END IF;
END $$;
