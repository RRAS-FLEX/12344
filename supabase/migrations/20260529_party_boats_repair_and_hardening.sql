begin;

-- Repair obviously broken party rows caused by partial updates.
-- 1) Recover ticket_max_people from capacity when missing/zero.
update public.party_boats pb
set ticket_max_people = pb.capacity
where coalesce(pb.ticket_max_people, 0) <= 0
  and coalesce(pb.capacity, 0) > 0;

-- 2) Recover ticket_price_per_person from the cheapest positive tier price when possible.
with tier_prices as (
  select
    pb.id,
    min((tier.value ->> 'price')::numeric) as min_tier_price
  from public.party_boats pb
  cross join lateral jsonb_array_elements(coalesce(pb.party_tiers, '[]'::jsonb)) as tier(value)
  where jsonb_typeof(coalesce(pb.party_tiers, '[]'::jsonb)) = 'array'
    and (tier.value ->> 'price') ~ '^[0-9]+(\.[0-9]+)?$'
    and (tier.value ->> 'price')::numeric > 0
  group by pb.id
)
update public.party_boats pb
set ticket_price_per_person = tp.min_tier_price
from tier_prices tp
where pb.id = tp.id
  and coalesce(pb.ticket_price_per_person, 0) <= 0;

-- 3) Recover missing event date/time from nearest non-cancelled booking for same party boat.
with booking_seed as (
  select distinct on (b.boat_id)
    b.boat_id,
    b.start_date,
    b.departure_time
  from public.bookings b
  where b.boat_id is not null
    and coalesce(b.status, '') not in ('cancelled', 'canceled')
    and b.start_date is not null
    and b.departure_time is not null
  order by b.boat_id, b.start_date asc, b.departure_time asc
)
update public.party_boats pb
set
  party_event_date = coalesce(pb.party_event_date, bs.start_date),
  party_event_time = coalesce(pb.party_event_time, bs.departure_time)
from booking_seed bs
where pb.id = bs.boat_id
  and (pb.party_event_date is null or pb.party_event_time is null);

commit;
