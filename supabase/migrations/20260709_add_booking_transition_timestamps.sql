-- Give each booking lifecycle transition its own timestamp instead of
-- overloading the shared updated_at column, and store cancellation reason
-- as a structured column instead of only appending it to free-text notes.

alter table public.bookings
  add column if not exists confirmed_at timestamp with time zone null,
  add column if not exists cancelled_at timestamp with time zone null,
  add column if not exists completed_at timestamp with time zone null,
  add column if not exists cancellation_reason text null;

-- Best-effort backfill from existing status + updated_at for rows already
-- in a terminal/confirmed state before this migration.
update public.bookings
set confirmed_at = updated_at
where lower(coalesce(status, '')) = 'confirmed'
  and confirmed_at is null;

update public.bookings
set cancelled_at = updated_at
where lower(coalesce(status, '')) = 'cancelled'
  and cancelled_at is null;

update public.bookings
set completed_at = updated_at
where lower(coalesce(status, '')) = 'completed'
  and completed_at is null;
