-- Adds the "side" manual booking-request flow: clients submit a request (no
-- payment), an admin phones the owner outside the system, then accepts or
-- rejects via the admin API. Deliberately a separate table from `bookings`
-- so this never interacts with the Stripe checkout/webhook/refund triggers.

alter table public.users add column if not exists phone text;

create table public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats(id),
  boat_name text not null,
  owner_id uuid not null references public.users(id),
  owner_name text,
  customer_id uuid,
  customer_name text not null,
  customer_email text not null,
  start_date date not null,
  departure_time text not null,
  end_time text,
  package_hours numeric,
  guests integer not null default 1,
  package_label text,
  special_requests text,
  total_price numeric not null default 0,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  admin_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.booking_requests enable row level security;
-- No public select/update policies: all access goes through the server's
-- service-role client in server/index.mjs, same as most other admin-facing data.

create trigger set_booking_requests_updated_at
  before update on public.booking_requests
  for each row execute function public.set_updated_at();
