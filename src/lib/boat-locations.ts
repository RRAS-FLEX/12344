import { supabase } from "@/lib/supabase";

export interface BoatLocation {
  id: string;
  name: string;
  location: string;
  mapQuery: string;
  latitude: number | null;
  longitude: number | null;
}

const FALLBACK_LOCATIONS: BoatLocation[] = [
  { id: "fallback-limena", name: "Limena Marina", location: "Thassos", mapQuery: "Limena Marina, Thassos, Greece", latitude: 40.7788, longitude: 24.7097 },
  { id: "fallback-limenaria", name: "Limenaria Marina", location: "Thassos", mapQuery: "Limenaria Marina, Thassos, Greece", latitude: 40.6268, longitude: 24.5756 },
  { id: "fallback-skala-potamias", name: "Skala Potamias Pier", location: "Thassos", mapQuery: "Skala Potamias Pier, Thassos, Greece", latitude: 40.7138, longitude: 24.7748 },
  { id: "fallback-keramoti", name: "Keramoti Port", location: "Keramoti", mapQuery: "Keramoti Port, Keramoti, Greece", latitude: 40.8554, longitude: 24.7062 },
];

export const getBoatLocations = async (): Promise<BoatLocation[]> => {
  const { data, error } = await supabase
    .from("boat_locations")
    .select("id, name, location, map_query, latitude, longitude")
    .order("location", { ascending: true })
    .order("name", { ascending: true });

  if (error || !Array.isArray(data) || data.length === 0) {
    return FALLBACK_LOCATIONS;
  }

  return data.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    location: String(row.location ?? ""),
    mapQuery: String(row.map_query ?? ""),
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
  }));
};

export const formatBoatLocationLabel = (location: Pick<BoatLocation, "name" | "location">) =>
  `${location.name}, ${location.location}`;
