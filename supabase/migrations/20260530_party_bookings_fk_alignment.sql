begin;

-- Allow party bookings to exist without a rental boats row while keeping rental FK integrity.
alter table public.bookings
  add column if not exists party_boat_id uuid;

alter table public.bookings
  drop constraint if exists bookings_party_boat_id_fkey;

alter table public.bookings
  add constraint bookings_party_boat_id_fkey
  foreign key (party_boat_id)
  references public.party_boats(id)
  on delete set null;

-- boat_id remains FK to public.boats for rental bookings but can be null for party bookings.
alter table public.bookings
  alter column boat_id drop not null;

-- Backfill party_boat_id for historical rows whose boat_id points to party_boats IDs.
update public.bookings b
set party_boat_id = p.id,
    boat_id = null
from public.party_boats p
left join public.boats bo on bo.id = b.boat_id
where b.boat_id = p.id
  and bo.id is null
  and b.party_boat_id is null;

commit;
