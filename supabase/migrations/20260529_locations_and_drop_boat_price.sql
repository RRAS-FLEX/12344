create table if not exists public.boat_locations (
  id uuid not null default gen_random_uuid(),
  name text not null,
  location text not null,
  map_query text not null,
  latitude double precision null,
  longitude double precision null,
  created_at timestamp without time zone null default now(),
  constraint boat_locations_pkey primary key (id)
);

create index if not exists idx_boat_locations_location
  on public.boat_locations using btree (location);

create unique index if not exists idx_boat_locations_name_location
  on public.boat_locations using btree (name, location);

insert into public.boat_locations (name, location, map_query, latitude, longitude)
values
  ('Limena Marina', 'Thassos', 'Limena Marina, Thassos, Greece', 40.7788, 24.7097),
  ('Limenaria Marina', 'Thassos', 'Limenaria Marina, Thassos, Greece', 40.6268, 24.5756),
  ('Skala Potamias Pier', 'Thassos', 'Skala Potamias Pier, Thassos, Greece', 40.7138, 24.7748),
  ('Keramoti Port', 'Keramoti', 'Keramoti Port, Keramoti, Greece', 40.8554, 24.7062),
  ('Nea Peramos Marina', 'Kavala', 'Nea Peramos Marina, Kavala, Greece', 40.8384, 24.3121),
  ('Ormos Panagias Marina', 'Halkidiki', 'Ormos Panagias Marina, Halkidiki, Greece', 40.2409, 23.7288),
  ('Chora Mykonos Old Port', 'Mykonos', 'Chora Mykonos Old Port, Mykonos, Greece', 37.4482, 25.3286),
  ('Vlychada Marina', 'Santorini', 'Vlychada Marina, Santorini, Greece', 36.3374, 25.4329)
on conflict (name, location) do nothing;

alter table public.boats
  add column if not exists location_id uuid references public.boat_locations(id) on delete set null;

-- Backfill rough matches from current location text.
update public.boats b
set location_id = l.id,
    updated_at = now()
from public.boat_locations l
where b.location_id is null
  and (
    lower(coalesce(b.departure_marina, '')) like '%' || lower(l.name) || '%'
    or lower(coalesce(b.location, '')) like '%' || lower(l.location) || '%'
    or lower(coalesce(b.map_query, '')) like '%' || lower(l.map_query) || '%'
  );

alter table public.boats
  drop column if exists price_per_day;
