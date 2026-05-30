-- Test/ops mirror of migration:
-- Require Stripe references when a booking is set to confirmed.

drop trigger if exists trg_bookings_require_stripe_payment_refs on public.bookings;
drop function if exists public.enforce_stripe_confirm_requires_payment_refs();

create function public.enforce_stripe_confirm_requires_payment_refs()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'confirmed' and lower(coalesce(new.payment_method, '')) = 'stripe' then
    if nullif(trim(coalesce(new.stripe_payment_intent_id::text, '')), '') is null then
      raise exception 'Stripe confirmed bookings must include stripe_payment_intent_id';
    end if;

    if nullif(trim(coalesce(new.stripe_session_id::text, '')), '') is null then
      raise exception 'Stripe confirmed bookings must include stripe_session_id';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_bookings_require_stripe_payment_refs
before insert or update of status, payment_method, stripe_payment_intent_id, stripe_session_id
on public.bookings
for each row
execute function public.enforce_stripe_confirm_requires_payment_refs();
