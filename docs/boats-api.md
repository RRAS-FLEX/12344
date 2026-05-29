Boats API

Three sector endpoints exist to fetch sector-specific boat rows and optional related tables.

GET /api/boats/rentals
GET /api/boats/party
GET /api/boats/watersports

Query parameters:
- `boat_id` — fetch a single boat by id
- `owner_id` — fetch boats for owner
- `tables` — comma-separated related tables to include (whitelisted)

Example:

GET /api/boats/party?boat_id=abc123&tables=bookings,boat_documents

Response:
{
  "sector": "party",
  "boats": [ ... ],
  "related": { "bookings": [...], "boat_documents": [...] }
}
