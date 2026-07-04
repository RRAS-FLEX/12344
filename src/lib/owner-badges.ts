import { supabase } from "./supabase";

export interface OwnerBadge {
  id: string;
  name: string;
  iconSlug: string;
  description: string | null;
  assignedAt: string;
}

export const getOwnerBadgesForBoat = async (boatId: string): Promise<OwnerBadge[]> => {
  if (!boatId) return [];

  const { data, error } = await supabase
    .from("boats")
    .select(
      `
      owner:owner_id (
        id,
        owner_badges:boat_owner_badges (
          assigned_at,
          badge:badges (
            id,
            name,
            icon_slug,
            description
          )
        )
      )
    `,
    )
    .eq("id", boatId)
    .maybeSingle();

  if (error || !data) {
    // If badges are misconfigured we should not break the page; just return none.
    return [];
  }

  const owner = (data as { owner?: unknown }).owner as
    | {
        owner_badges?: {
          assigned_at: string;
          badge: { id: string; name: string; icon_slug: string; description: string | null };
        }[];
      }
    | null
    | undefined;

  const assignments = owner?.owner_badges ?? [];

  return assignments
    .filter((assignment) => assignment && assignment.badge)
    .map((assignment) => ({
      id: assignment.badge.id,
      name: assignment.badge.name,
      iconSlug: assignment.badge.icon_slug,
      description: assignment.badge.description ?? null,
      assignedAt: assignment.assigned_at,
    }));
};
