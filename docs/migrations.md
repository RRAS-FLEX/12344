Migrations

Run the backfill migration to move party/watersports rows out of `public.boats` into sector tables.

Apply migration locally (supabase CLI) or via psql (use service role key):

```bash
# with supabase CLI (recommended)
supabase db remote set <your-db-connection-string>
psql <your-db-connection-string> -f supabase/migrations/20260506_backfill_sector_rows.sql

# or with psql directly
PGPASSWORD=$SERVICE_ROLE_KEY psql -h <host> -U <user> -d <db> -f supabase/migrations/20260506_backfill_sector_rows.sql
```

Single-boat migration (API):

POST /api/boats/migrate/:boatId
- Requires authenticated owner and owner role when called via server.
- Example:

```bash
curl -X POST "http://localhost:3000/api/boats/migrate/bbe255f6-f355-4034-85f8-2552e059ba7f" -H "Authorization: Bearer <token>"
```

Notes:
- Migration is idempotent and safe to run multiple times.
- Review results before dropping legacy columns.
