-- Nautiplex trust hardening: overlap prevention, idempotency, and booking audit trail

begin;

-- 1) Optional idempotency key to prevent duplicate booking creates from retries.
alter table if exists public.bookings
  add column if not exists request_id text;

create unique index if not exists bookings_request_id_unique
  on public.bookings (request_id)
  where request_id is not null;

-- 2) Booking event audit log for operational traceability.
create table if not exists public.booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid null,
  event_type text not null,
  source text not null default 'db_trigger',
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists booking_events_booking_id_idx on public.booking_events (booking_id);
create index if not exists booking_events_created_at_idx on public.booking_events (created_at desc);

create or replace function public.log_booking_event()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.booking_events (booking_id, event_type, payload)
    values (new.id, 'booking_created', to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.booking_events (booking_id, event_type, payload)
    values (
      new.id,
      case
        when coalesce(old.status, '') <> coalesce(new.status, '') then 'booking_status_changed'
        else 'booking_updated'
      end,
      jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
    );
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.booking_events (booking_id, event_type, payload)
    values (old.id, 'booking_deleted', to_jsonb(old));
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_booking_events_audit on public.bookings;
create trigger trg_booking_events_audit
after insert or update or delete on public.bookings
for each row execute function public.log_booking_event();

-- 3) Hard overlap prevention for trust-first booking confirmations.
create or replace function public.prevent_overlapping_bookings()
returns trigger
language plpgsql
as $$
declare
  new_start timestamp;
  new_end timestamp;
  conflict_exists boolean;
begin
  -- Only block active customer-reserved states.
  if coalesce(new.status, 'pending') not in ('pending', 'confirmed') then
    return new;
  end if;

  new_start := new.start_date::timestamp
    + coalesce(new.departure_time::time, new.start_time, '00:00'::time);

  new_end := coalesce(new.end_date, new.start_date)::timestamp
    + coalesce(
      new.end_time,
      (
        coalesce(new.departure_time::time, new.start_time, '00:00'::time)
        + make_interval(hours => greatest(coalesce(new.package_hours, 1), 1))
      )::time,
      coalesce(new.start_time, new.departure_time::time, '00:00'::time)
    );

  if new_end <= new_start then
    new_end := new_start + make_interval(hours => greatest(coalesce(new.package_hours, 1), 1));
  end if;

  select exists (
    select 1
    from public.bookings b
    where b.boat_id = new.boat_id
      and b.start_date = new.start_date
      and coalesce(b.status, 'pending') in ('pending', 'confirmed')
      and b.id is distinct from new.id
      and tsrange(
            b.start_date::timestamp + coalesce(b.departure_time::time, b.start_time, '00:00'::time),
            case
              when (
                coalesce(b.end_date, b.start_date)::timestamp
                + coalesce(
                    b.end_time,
                    (
                      coalesce(b.departure_time::time, b.start_time, '00:00'::time)
                      + make_interval(hours => greatest(coalesce(b.package_hours, 1), 1))
                    )::time,
                    coalesce(b.start_time, b.departure_time::time, '00:00'::time)
                  )
              ) <= (b.start_date::timestamp + coalesce(b.departure_time::time, b.start_time, '00:00'::time))
              then (b.start_date::timestamp + coalesce(b.departure_time::time, b.start_time, '00:00'::time)) + make_interval(hours => 1)
              else (
                coalesce(b.end_date, b.start_date)::timestamp
                + coalesce(
                    b.end_time,
                    (
                      coalesce(b.departure_time::time, b.start_time, '00:00'::time)
                      + make_interval(hours => greatest(coalesce(b.package_hours, 1), 1))
                    )::time,
                    coalesce(b.start_time, b.departure_time::time, '00:00'::time)
                  )
              )
            end,
            '[)'
          ) && tsrange(new_start, new_end, '[)')
  ) into conflict_exists;

  if conflict_exists then
    raise exception 'OVERLAP_BLOCKED: The selected time slot is no longer available.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_overlapping_bookings on public.bookings;
create trigger trg_prevent_overlapping_bookings
before insert or update on public.bookings
for each row execute function public.prevent_overlapping_bookings();

commit;

