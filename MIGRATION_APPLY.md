# Supabase Migration Instructions

## Step 1: Open Supabase SQL Editor
https://supabase.com/dashboard/project/wroelxqyqtnwjizgljsb/sql

## Step 2: Run First Migration (Create Tables & RLS)
Copy and paste the contents of `supabase/migrations/20260506_split_boats_into_sectors.sql` into the SQL editor and click **Execute**.

This will:
- Create `party_boats` table with boat_id foreign key
- Create `watersports_boats` table with boat_id foreign key
- Enable RLS on both tables
- Add owner-access policies
- Add public read policies for active boats
- Backfill existing party/watersports boats from the `boats` table

## Step 3: Run Second Migration (Backfill with SECURITY DEFINER)
Copy and paste the contents of `supabase/migrations/20260506_backfill_sector_rows.sql` into the SQL editor and click **Execute**.

This will:
- Create `backfill_party_boats()` function (SECURITY DEFINER bypasses RLS)
- Create `backfill_watersports_boats()` function (SECURITY DEFINER bypasses RLS)
- Execute both functions to populate sector tables from boats table
- Clean up legacy party columns from boats table

## Verification

After both migrations complete, run these queries to verify:

```sql
-- Check party boats were migrated
SELECT COUNT(*) as party_boat_count FROM public.party_boats;

-- Check watersports boats were migrated  
SELECT COUNT(*) as watersports_boat_count FROM public.watersports_boats;

-- Verify specific boat was migrated (replace with real boat_id)
SELECT id, boat_id, owner_id, name FROM public.party_boats 
WHERE boat_id = 'bbe255f6-f355-4034-85f8-2552e059ba7f';
```

## Done!

Once migrations are applied, your app can:
1. Save party boats to `party_boats` table
2. Save watersports boats to `watersports_boats` table
3. Rental boats stay in `boats` table
4. RLS policies protect owner data
5. Owner CRUD endpoints work with sector-specific tables
