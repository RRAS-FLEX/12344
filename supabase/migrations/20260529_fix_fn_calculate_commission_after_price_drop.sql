begin;

create or replace function public.fn_calculate_commission()
returns trigger
language plpgsql
as $$
begin
  -- Keep caller-provided values when present; only backfill safe defaults.
  new.base_rental_price := coalesce(new.base_rental_price, new.total_price, 0);
  new.duration_hours := coalesce(new.duration_hours, new.package_hours::numeric, 0);
  new.estimated_fuel_cost := coalesce(new.estimated_fuel_cost, 0);
  new.platform_commission := coalesce(new.platform_commission, 0);

  -- total_agency_commission is required and should at least track platform commission.
  new.total_agency_commission := coalesce(nullif(new.total_agency_commission, 0), new.platform_commission, 0);

  -- Preserve explicit owner payout if provided; otherwise infer from price and commission.
  if new.owner_payout is null then
    new.owner_payout := greatest(coalesce(new.total_price, 0) - coalesce(new.platform_commission, 0), 0);
  end if;

  return new;
end;
$$;

commit;
