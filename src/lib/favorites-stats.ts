import { supabasePublic } from "@/lib/supabase";

export const getBoatFavoriteCountsMap = async (boatIds: string[]): Promise<Record<string, number>> => {
  const uniqueBoatIds = Array.from(new Set(boatIds.filter(Boolean)));
  if (uniqueBoatIds.length === 0) {
    return {};
  }

  const { data, error } = await supabasePublic
    .from("favorites")
    .select("boat_id")
    .in("boat_id", uniqueBoatIds);

  if (error || !Array.isArray(data)) {
    return {};
  }

  const counts: Record<string, number> = {};
  for (const row of data as Array<{ boat_id?: string | null }>) {
    const boatId = row?.boat_id;
    if (!boatId) {
      continue;
    }

    counts[boatId] = (counts[boatId] ?? 0) + 1;
  }

  return counts;
};
