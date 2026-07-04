-- Fix trg_sync_booking_to_calendar_event, which was live in production but
-- untracked in any migration file.
--
-- Two bugs:
-- 1. It unconditionally inserted into calendar_events using NEW.customer_id as
--    the (NOT NULL) user_id column, which crashed with a not-null constraint
--    violation for guest checkouts (no signed-in customer_id). This made
--    /api/stripe/create-checkout return 500 for every guest booking.
-- 2. It unconditionally forced `UPDATE bookings SET status = 'confirmed'` on
--    every INSERT, regardless of the row's actual status. The Stripe checkout
--    flow deliberately inserts bookings as status = 'cancelled' until the
--    webhook verifies payment -- this trigger was silently overriding that,
--    confirming bookings before any payment was verified.
--
-- Fix: only mirror bookings into calendar_events when status is genuinely
-- 'confirmed' AND a customer_id is present, and only once per booking. Never
-- force the status here -- that must come from the caller / payment webhook.

CREATE OR REPLACE FUNCTION public.sync_booking_to_calendar_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'confirmed' and new.customer_id is not null then
    if not exists (select 1 from public.calendar_events where booking_id = new.id) then
      insert into public.calendar_events (
        booking_id,
        user_id,
        title,
        start_time,
        end_time,
        all_day,
        timezone
      )
      values (
        new.id,
        new.customer_id,
        coalesce(new.boat_name, new.package_label, 'Booking'),
        ((new.start_date::timestamp without time zone) + new.start_time) AT TIME ZONE 'UTC',
        ((new.end_date::timestamp without time zone) + new.end_time) AT TIME ZONE 'UTC',
        false,
        'UTC'
      );
    end if;
  end if;

  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_sync_booking_to_calendar_event ON public.bookings;

CREATE TRIGGER trg_sync_booking_to_calendar_event
AFTER INSERT OR UPDATE OF status ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.sync_booking_to_calendar_event();
