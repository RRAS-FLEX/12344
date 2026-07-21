import { supabase, getSessionSafe } from "./supabase";

export interface BoatReview {
  id: string;
  boatId: string;
  customerName: string;
  rating: number;
  title: string;
  comment: string;
  tripDate: string;
  createdAt: string;
}

export interface ReviewDraftInput {
  bookingId: string;
  boatId: string;
  customerName: string;
  rating: number;
  title: string;
  comment: string;
  tripDate: string;
}

type ReviewRow = {
  id: string;
  boat_id: string;
  customer_name?: string | null;
  rating?: number | null;
  title?: string | null;
  comment?: string | null;
  trip_date?: string | null;
  created_at: string;
};

type ReviewStatsRow = {
  boat_id: string;
  rating?: number | null;
};

const mapReview = (review: ReviewRow): BoatReview => ({
  id: review.id,
  boatId: review.boat_id,
  customerName: review.customer_name ?? "Guest",
  rating: Number(review.rating ?? 0),
  title: review.title ?? "Review",
  comment: review.comment ?? "",
  tripDate: review.trip_date ?? review.created_at?.slice(0, 10) ?? "",
  createdAt: review.created_at,
});

export const getAllReviews = async (): Promise<BoatReview[]> => {
  const { data, error } = await supabase.from("reviews").select("*").order("created_at", { ascending: false });
  if (error) {
    throw new Error(error.message || "Failed to load reviews");
  }
  return Array.isArray(data) ? (data as ReviewRow[]).map(mapReview) : [];
};

export const getBoatReviews = async (boatId: string): Promise<BoatReview[]> => {
  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("boat_id", boatId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Failed to load boat reviews");
  }

  return Array.isArray(data) ? (data as ReviewRow[]).map(mapReview) : [];
};

export const getBoatReviewStatsMap = async (boatIds: string[]) => {
  const uniqueBoatIds = Array.from(new Set(boatIds.filter(Boolean)));
  if (uniqueBoatIds.length === 0) {
    return {} as Record<string, { total: number; averageRating: number }>;
  }

  const { data, error } = await supabase
    .from("reviews")
    .select("boat_id, rating")
    .in("boat_id", uniqueBoatIds);

  if (error) {
    throw new Error(error.message || "Failed to load review stats");
  }

  const accumulator: Record<string, { total: number; ratingSum: number }> = {};
  for (const boatId of uniqueBoatIds) {
    accumulator[boatId] = { total: 0, ratingSum: 0 };
  }

  for (const row of (data ?? []) as ReviewStatsRow[]) {
    const bucket = accumulator[row.boat_id] ?? { total: 0, ratingSum: 0 };
    bucket.total += 1;
    bucket.ratingSum += Number(row.rating ?? 0);
    accumulator[row.boat_id] = bucket;
  }

  const statsMap: Record<string, { total: number; averageRating: number }> = {};
  for (const [boatId, value] of Object.entries(accumulator)) {
    statsMap[boatId] = {
      total: value.total,
      averageRating: value.total > 0 ? value.ratingSum / value.total : 0,
    };
  }

  return statsMap;
};

export const getBoatReviewStats = async (boatId: string) => {
  const statsMap = await getBoatReviewStatsMap([boatId]);
  return statsMap[boatId] ?? { total: 0, averageRating: 0 };
};

export const addBoatReview = async (input: ReviewDraftInput): Promise<BoatReview> => {
  const {
    data: { session },
  } = await getSessionSafe();

  const { data, error } = await supabase
    .from("reviews")
    .insert({
      booking_id: input.bookingId,
      boat_id: input.boatId,
      customer_id: session?.user?.id ?? null,
      customer_name: input.customerName,
      rating: input.rating,
      title: input.title.trim(),
      comment: input.comment.trim(),
      trip_date: input.tripDate,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to submit review");
  }

  return mapReview(data as ReviewRow);
};
