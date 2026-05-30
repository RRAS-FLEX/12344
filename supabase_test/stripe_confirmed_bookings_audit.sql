-- Audit confirmed Stripe bookings for missing reference evidence.
-- Safe read-only checks.

-- 1) Confirmed Stripe bookings with missing Stripe refs.
select
  b.id,
  b.created_at,
  b.updated_at,
  b.status,
  b.payment_method,
  b.stripe_session_id,
  b.stripe_payment_intent_id,
  b.customer_email,
  b.boat_name,
  b.amount_due_now,
  b.total_price
from public.bookings b
where b.status = 'confirmed'
  and lower(coalesce(b.payment_method, '')) = 'stripe'
  and (
    nullif(trim(coalesce(b.stripe_session_id, '')), '') is null
    or nullif(trim(coalesce(b.stripe_payment_intent_id, '')), '') is null
  )
order by b.updated_at desc;

-- 2) Stripe pending rows older than 30 minutes (possible stuck checkout/webhook issue).
select
  b.id,
  b.created_at,
  b.updated_at,
  b.status,
  b.payment_method,
  b.stripe_session_id,
  b.stripe_payment_intent_id,
  b.customer_email,
  b.boat_name,
  b.amount_due_now,
  b.total_price
from public.bookings b
where b.status = 'pending'
  and lower(coalesce(b.payment_method, '')) in ('', 'stripe')
  and b.created_at < (now() - interval '30 minutes')
order by b.created_at asc;

-- 3) Summary counters.
select
  count(*) filter (
    where b.status = 'confirmed'
      and lower(coalesce(b.payment_method, '')) = 'stripe'
  ) as confirmed_stripe_total,
  count(*) filter (
    where b.status = 'confirmed'
      and lower(coalesce(b.payment_method, '')) = 'stripe'
      and nullif(trim(coalesce(b.stripe_session_id, '')), '') is null
  ) as confirmed_missing_session_id,
  count(*) filter (
    where b.status = 'confirmed'
      and lower(coalesce(b.payment_method, '')) = 'stripe'
      and nullif(trim(coalesce(b.stripe_payment_intent_id, '')), '') is null
  ) as confirmed_missing_payment_intent_id,
  count(*) filter (
    where b.status = 'pending'
      and lower(coalesce(b.payment_method, '')) in ('', 'stripe')
      and b.created_at < (now() - interval '30 minutes')
  ) as stale_pending_over_30m
from public.bookings b;
