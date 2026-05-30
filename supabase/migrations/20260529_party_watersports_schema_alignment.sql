begin;

-- Ensure party_boats can interoperate with existing code paths while remaining
-- an independent source-of-truth table (id-first).
alter table public.party_boats
  add column if not exists boat_id uuid;

update public.party_boats
set boat_id = id
where boat_id is null;

create unique index if not exists party_boats_boat_id_key
  on public.party_boats (boat_id)
  where boat_id is not null;

-- Keep compatibility column synchronized for new/updated rows.
create or replace function public.trg_party_boats_sync_boat_id()
returns trigger
language plpgsql
as $$
begin
  if new.boat_id is null then
    new.boat_id := new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_party_boats_sync_boat_id on public.party_boats;
create trigger trg_party_boats_sync_boat_id
before insert or update of id, boat_id
on public.party_boats
for each row
execute function public.trg_party_boats_sync_boat_id();

-- boats table should represent rental inventory only.
alter table public.boats
  drop constraint if exists boats_rental_only_type_check;

alter table public.boats
  add constraint boats_rental_only_type_check
  check (
    lower(coalesce(type, '')) <> all (
      array[
        'party boat',
        'party',
        'watersports',
        'watersports charter'
      ]
    )
  );

commit;
