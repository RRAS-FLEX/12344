import { supabase } from "@/lib/supabase";

export interface CustomerHistoryItem {
  id: string;
  boatId: string;
  boatName: string;
  ownerName: string;
  packageLabel: string;
  createdAt: string;
  startDate: string;
  departureTime: string;
  departureMarina: string;
  status: string;
  totalPrice: number;
  paymentMethod: string;
  paymentPlan: string;
  amountDueNow: number;
  depositAmount: number;
  platformCommission: number;
  ownerPayout: number;
  extras: string[];
  notes: string;
  hasReview: boolean;
  reviewRating: number | null;
  reviewTitle: string;
  reviewComment: string;
  reviewCreatedAt: string;
}

export interface OwnerSalesHistoryItem {
  id: string;
  boatId: string;
  boatName: string;
  customerName: string;
  packageLabel: string;
  createdAt: string;
  startDate: string;
  departureTime: string;
  departureMarina: string;
  status: string;
  totalPrice: number;
  paymentMethod: string;
  paymentPlan: string;
  amountDueNow: number;
  depositAmount: number;
  platformCommission: number;
  ownerPayout: number;
  extras: string[];
  notes: string;
  hasReview: boolean;
  reviewRating: number | null;
  reviewTitle: string;
  reviewComment: string;
  reviewCreatedAt: string;
}

export interface CancelBookingResult {
  bookingId: string;
  status: string;
  alreadyCancelled: boolean;
  refundAmount: number;
  refundRatePercent: number;
  refundStatus: string;
}

export const getCustomerBookingHistory = async (): Promise<CustomerHistoryItem[]> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return [];
  }

  const [bookingsResult, reviewsResult] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, boat_id, boat_name, owner_name, package_label, created_at, start_date, departure_time, departure_marina, status, total_price, payment_method, payment_plan, amount_due_now, deposit_amount, platform_commission, owner_payout, extras, notes")
      .eq("customer_id", session.user.id)
      .order("start_date", { ascending: false }),
    supabase
      .from("reviews")
      .select("booking_id, rating, title, comment, created_at")
      .eq("customer_id", session.user.id),
  ]);

  if (bookingsResult.error) {
    throw new Error(bookingsResult.error.message || "Failed to load booking history");
  }

  if (reviewsResult.error) {
    throw new Error(reviewsResult.error.message || "Failed to load review history");
  }

  const reviewsByBookingId = new Map<string, { rating: number; title: string; comment: string; created_at: string }>();
  if (Array.isArray(reviewsResult.data)) {
    for (const review of reviewsResult.data) {
      const bookingId = String(review.booking_id ?? "").trim();
      if (!bookingId) continue;
      reviewsByBookingId.set(bookingId, review);
    }
  }

  return Array.isArray(bookingsResult.data)
    ? bookingsResult.data.map((booking) => ({
        id: booking.id,
        boatId: booking.boat_id,
        boatName: booking.boat_name ?? "Boat",
        ownerName: booking.owner_name ?? "Owner",
        packageLabel: booking.package_label ?? "Custom booking",
        createdAt: booking.created_at ?? booking.start_date,
        startDate: booking.start_date,
        departureTime: booking.departure_time ?? "",
        departureMarina: booking.departure_marina ?? "",
        status: booking.status ?? "confirmed",
        totalPrice: Number(booking.total_price ?? 0),
        paymentMethod: booking.payment_method ?? "stripe",
        paymentPlan: booking.payment_plan ?? "full",
        amountDueNow: Number(booking.amount_due_now ?? booking.total_price ?? 0),
        depositAmount: Number(booking.deposit_amount ?? 0),
        platformCommission: Number(booking.platform_commission ?? 0),
        ownerPayout: Number(booking.owner_payout ?? 0),
        extras: Array.isArray(booking.extras) ? booking.extras.map((entry: unknown) => String(entry)) : [],
        notes: booking.notes ?? "",
        hasReview: reviewsByBookingId.has(booking.id),
        reviewRating: reviewsByBookingId.has(booking.id)
          ? Number(reviewsByBookingId.get(booking.id)?.rating ?? 0)
          : null,
        reviewTitle: String(reviewsByBookingId.get(booking.id)?.title ?? ""),
        reviewComment: String(reviewsByBookingId.get(booking.id)?.comment ?? ""),
        reviewCreatedAt: String(reviewsByBookingId.get(booking.id)?.created_at ?? ""),
      }))
    : [];
};

export const getOwnerSalesHistory = async (): Promise<OwnerSalesHistoryItem[]> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return [];
  }

  const ownerId = session.user.id;

  const { data: ownerBoats, error: boatsError } = await supabase
    .from("boats")
    .select("id")
    .eq("owner_id", ownerId);

  if (boatsError) {
    throw new Error(boatsError.message || "Failed to load owner boats");
  }

  const boatIds = Array.isArray(ownerBoats)
    ? ownerBoats.map((boat) => boat.id).filter(Boolean)
    : [];

  if (boatIds.length === 0) {
    return [];
  }

  const { data: bookingsData, error: bookingsError } = await supabase
    .from("bookings")
    .select("id, boat_id, boat_name, customer_name, package_label, created_at, start_date, departure_time, departure_marina, status, total_price, payment_method, payment_plan, amount_due_now, deposit_amount, platform_commission, owner_payout, extras, notes")
    .in("boat_id", boatIds)
    .order("start_date", { ascending: false });

  if (bookingsError) {
    throw new Error(bookingsError.message || "Failed to load owner sales history");
  }

  const bookingIds = Array.isArray(bookingsData)
    ? bookingsData.map((booking) => booking.id).filter(Boolean)
    : [];

  const reviewsByBookingId = new Map<string, { rating: number; title: string; comment: string; created_at: string }>();
  if (bookingIds.length > 0) {
    const { data: reviewsData, error: reviewsError } = await supabase
      .from("reviews")
      .select("booking_id, rating, title, comment, created_at")
      .in("booking_id", bookingIds);

    if (reviewsError) {
      throw new Error(reviewsError.message || "Failed to load sales review history");
    }

    if (Array.isArray(reviewsData)) {
      for (const review of reviewsData) {
        const bookingId = String(review.booking_id ?? "").trim();
        if (!bookingId) continue;
        reviewsByBookingId.set(bookingId, review);
      }
    }
  }

  return Array.isArray(bookingsData)
    ? bookingsData.map((booking) => ({
        id: booking.id,
        boatId: booking.boat_id,
        boatName: booking.boat_name ?? "Boat",
        customerName: booking.customer_name ?? "Guest",
        packageLabel: booking.package_label ?? "Custom booking",
        createdAt: booking.created_at ?? booking.start_date,
        startDate: booking.start_date,
        departureTime: booking.departure_time ?? "",
        departureMarina: booking.departure_marina ?? "",
        status: booking.status ?? "confirmed",
        totalPrice: Number(booking.total_price ?? 0),
        paymentMethod: booking.payment_method ?? "stripe",
        paymentPlan: booking.payment_plan ?? "full",
        amountDueNow: Number(booking.amount_due_now ?? booking.total_price ?? 0),
        depositAmount: Number(booking.deposit_amount ?? 0),
        platformCommission: Number(booking.platform_commission ?? 0),
        ownerPayout: Number(booking.owner_payout ?? 0),
        extras: Array.isArray(booking.extras) ? booking.extras.map((entry: unknown) => String(entry)) : [],
        notes: booking.notes ?? "",
        hasReview: reviewsByBookingId.has(booking.id),
        reviewRating: reviewsByBookingId.has(booking.id)
          ? Number(reviewsByBookingId.get(booking.id)?.rating ?? 0)
          : null,
        reviewTitle: String(reviewsByBookingId.get(booking.id)?.title ?? ""),
        reviewComment: String(reviewsByBookingId.get(booking.id)?.comment ?? ""),
        reviewCreatedAt: String(reviewsByBookingId.get(booking.id)?.created_at ?? ""),
      }))
    : [];
};

export const cancelCustomerBooking = async (input: {
  bookingId: string;
  reason?: string;
}): Promise<CancelBookingResult> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    throw new Error("You must be signed in to cancel a booking.");
  }

  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
  const cancelEndpoint = apiBaseUrl
    ? `${apiBaseUrl.replace(/\/$/, "")}/api/bookings/cancel`
    : "/api/bookings/cancel";

  const response = await fetch(cancelEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      bookingId: input.bookingId,
      customerId: session.user.id,
      customerEmail: session.user.email ?? undefined,
      reason: input.reason,
    }),
  });

  const raw = await response.text();
  let payload: Partial<CancelBookingResult> & { error?: string } = {};
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error("Cancellation API returned a non-JSON response.");
    }
  }

  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to cancel booking");
  }

  return {
    bookingId: String(payload.bookingId ?? input.bookingId),
    status: String(payload.status ?? "cancelled"),
    alreadyCancelled: Boolean(payload.alreadyCancelled),
    refundAmount: Number(payload.refundAmount ?? 0),
    refundRatePercent: Number(payload.refundRatePercent ?? 0),
    refundStatus: String(payload.refundStatus ?? "none"),
  };
};