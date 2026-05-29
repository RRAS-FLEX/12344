-- Recommended least-privilege RLS policies for Nautiplex
-- Safe to run multiple times (drops/recreates only named policies below)

begin;

-- Helper: admin check from public.admin_users
create or replace function public.is_admin_user(uid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.admin_users a
    where a.user_id = uid
  );
$$;

-- Enable RLS on core tables if they exist.
do $$
begin
  if to_regclass('public.boats') is not null then
    execute 'alter table public.boats enable row level security';
  end if;
  if to_regclass('public.bookings') is not null then
    execute 'alter table public.bookings enable row level security';
  end if;
  if to_regclass('public.owner_notifications') is not null then
    execute 'alter table public.owner_notifications enable row level security';
  end if;
  if to_regclass('public.customer_emails') is not null then
    execute 'alter table public.customer_emails enable row level security';
  end if;
end $$;

-- BOATS policies
-- Public can read active boats, owners/admin can read all.
do $$
begin
  if to_regclass('public.boats') is null then
    return;
  end if;

  execute 'drop policy if exists boats_select_public_active on public.boats';
  execute 'drop policy if exists boats_select_owner_or_admin on public.boats';
  execute 'drop policy if exists boats_insert_owner_or_admin on public.boats';
  execute 'drop policy if exists boats_update_owner_or_admin on public.boats';
  execute 'drop policy if exists boats_delete_owner_or_admin on public.boats';

  execute $p$
    create policy boats_select_public_active
    on public.boats for select
    using (lower(coalesce(status, 'active')) not in ('inactive', 'maintenance', 'archived', 'draft'))
  $p$;

  execute $p$
    create policy boats_select_owner_or_admin
    on public.boats for select
    using (auth.uid() = owner_id or public.is_admin_user(auth.uid()))
  $p$;

  execute $p$
    create policy boats_insert_owner_or_admin
    on public.boats for insert
    with check (auth.uid() = owner_id or public.is_admin_user(auth.uid()))
  $p$;

  execute $p$
    create policy boats_update_owner_or_admin
    on public.boats for update
    using (auth.uid() = owner_id or public.is_admin_user(auth.uid()))
    with check (auth.uid() = owner_id or public.is_admin_user(auth.uid()))
  $p$;

  execute $p$
    create policy boats_delete_owner_or_admin
    on public.boats for delete
    using (auth.uid() = owner_id or public.is_admin_user(auth.uid()))
  $p$;
end $$;

-- BOOKINGS policies
-- Customer owns own bookings; owner can see bookings for owned boats; admin full access.
do $$
begin
  if to_regclass('public.bookings') is null then
    return;
  end if;

  execute 'drop policy if exists bookings_select_customer_owner_admin on public.bookings';
  execute 'drop policy if exists bookings_insert_customer_or_admin on public.bookings';
  execute 'drop policy if exists bookings_update_customer_owner_admin on public.bookings';
  execute 'drop policy if exists bookings_delete_admin_only on public.bookings';

  execute $p$
    create policy bookings_select_customer_owner_admin
    on public.bookings for select
    using (
      customer_id = auth.uid()
      or exists (
        select 1 from public.boats b
        where b.id = bookings.boat_id and b.owner_id = auth.uid()
      )
      or public.is_admin_user(auth.uid())
    )
  $p$;

  execute $p$
    create policy bookings_insert_customer_or_admin
    on public.bookings for insert
    with check (
      (auth.uid() is null and customer_id is null)
      or customer_id = auth.uid()
      or public.is_admin_user(auth.uid())
    )
  $p$;

  execute $p$
    create policy bookings_update_customer_owner_admin
    on public.bookings for update
    using (
      customer_id = auth.uid()
      or exists (
        select 1 from public.boats b
        where b.id = bookings.boat_id and b.owner_id = auth.uid()
      )
      or public.is_admin_user(auth.uid())
    )
    with check (
      customer_id = auth.uid()
      or exists (
        select 1 from public.boats b
        where b.id = bookings.boat_id and b.owner_id = auth.uid()
      )
      or public.is_admin_user(auth.uid())
    )
  $p$;

  execute $p$
    create policy bookings_delete_admin_only
    on public.bookings for delete
    using (public.is_admin_user(auth.uid()))
  $p$;
end $$;

-- OWNER_NOTIFICATIONS policies
-- Supports either owner_id or owner_email linkage depending on schema.
do $$
declare
  has_owner_id boolean;
  has_owner_email boolean;
begin
  if to_regclass('public.owner_notifications') is null then
    return;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='owner_notifications' and column_name='owner_id'
  ) into has_owner_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='owner_notifications' and column_name='owner_email'
  ) into has_owner_email;

  execute 'drop policy if exists owner_notifications_select_owner_or_admin on public.owner_notifications';
  execute 'drop policy if exists owner_notifications_insert_admin_only on public.owner_notifications';
  execute 'drop policy if exists owner_notifications_insert_app_or_admin on public.owner_notifications';
  execute 'drop policy if exists owner_notifications_update_owner_or_admin on public.owner_notifications';

  if has_owner_id then
    execute $p$
      create policy owner_notifications_select_owner_or_admin
      on public.owner_notifications for select
      using (owner_id = auth.uid() or public.is_admin_user(auth.uid()))
    $p$;

    execute $p$
      create policy owner_notifications_update_owner_or_admin
      on public.owner_notifications for update
      using (owner_id = auth.uid() or public.is_admin_user(auth.uid()))
      with check (owner_id = auth.uid() or public.is_admin_user(auth.uid()))
    $p$;
  elsif has_owner_email then
    execute $p$
      create policy owner_notifications_select_owner_or_admin
      on public.owner_notifications for select
      using (
        public.is_admin_user(auth.uid())
        or exists (
          select 1 from public.users u
          where u.id = auth.uid() and lower(u.email) = lower(owner_notifications.owner_email)
        )
      )
    $p$;

    execute $p$
      create policy owner_notifications_update_owner_or_admin
      on public.owner_notifications for update
      using (
        public.is_admin_user(auth.uid())
        or exists (
          select 1 from public.users u
          where u.id = auth.uid() and lower(u.email) = lower(owner_notifications.owner_email)
        )
      )
      with check (
        public.is_admin_user(auth.uid())
        or exists (
          select 1 from public.users u
          where u.id = auth.uid() and lower(u.email) = lower(owner_notifications.owner_email)
        )
      )
    $p$;
  else
    execute $p$
      create policy owner_notifications_select_owner_or_admin
      on public.owner_notifications for select
      using (public.is_admin_user(auth.uid()))
    $p$;

    execute $p$
      create policy owner_notifications_update_owner_or_admin
      on public.owner_notifications for update
      using (public.is_admin_user(auth.uid()))
      with check (public.is_admin_user(auth.uid()))
    $p$;
  end if;

  execute $p$
    create policy owner_notifications_insert_app_or_admin
    on public.owner_notifications for insert
    with check (true)
  $p$;
end $$;

-- CUSTOMER_EMAILS policies
-- Supports either customer_id or to_email linkage depending on schema.
do $$
declare
  has_customer_id boolean;
  has_to_email boolean;
begin
  if to_regclass('public.customer_emails') is null then
    return;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='customer_emails' and column_name='customer_id'
  ) into has_customer_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='customer_emails' and column_name='to_email'
  ) into has_to_email;

  execute 'drop policy if exists customer_emails_select_customer_or_admin on public.customer_emails';
  execute 'drop policy if exists customer_emails_insert_admin_only on public.customer_emails';
  execute 'drop policy if exists customer_emails_insert_app_or_admin on public.customer_emails';

  if has_customer_id then
    execute $p$
      create policy customer_emails_select_customer_or_admin
      on public.customer_emails for select
      using (customer_id = auth.uid() or public.is_admin_user(auth.uid()))
    $p$;
  elsif has_to_email then
    execute $p$
      create policy customer_emails_select_customer_or_admin
      on public.customer_emails for select
      using (
        public.is_admin_user(auth.uid())
        or exists (
          select 1 from public.users u
          where u.id = auth.uid() and lower(u.email) = lower(customer_emails.to_email)
        )
      )
    $p$;
  else
    execute $p$
      create policy customer_emails_select_customer_or_admin
      on public.customer_emails for select
      using (public.is_admin_user(auth.uid()))
    $p$;
  end if;

  execute $p$
    create policy customer_emails_insert_app_or_admin
    on public.customer_emails for insert
    with check (true)
  $p$;
end $$;

commit;

