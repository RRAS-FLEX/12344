begin;

delete from public.boats b
using public.party_boats p
where b.id = p.boat_id;

commit;