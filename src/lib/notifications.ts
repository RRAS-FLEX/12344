import type { AuthUser } from "@/lib/auth-hybrid";
import { supabase } from "@/lib/supabase";

export type InAppNotificationCategory = "booking" | "sale" | "system";
export type InAppNotificationKind =
  | "booking-confirmed"
  | "booking-pending"
  | "booking-cancelled"
  | "payment"
  | "owner-workflow"
  | "owner-alert"
  | "system";

export interface InAppNotification {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  href: string;
  category: InAppNotificationCategory;
  kind: InAppNotificationKind;
  isRead: boolean;
}

const NOTIFICATION_READ_KEY_PREFIX = "nautiplex:notifications:read:";

const getReadKey = (userId: string) => `${NOTIFICATION_READ_KEY_PREFIX}${userId}`;

const readReadNotificationIds = (userId: string): Set<string> => {
  if (typeof window === "undefined" || !userId) {
    return new Set();
  }

  try {
    const raw = window.localStorage.getItem(getReadKey(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((entry) => String(entry)));
  } catch {
    return new Set();
  }
};

const writeReadNotificationIds = (userId: string, ids: Set<string>) => {
  if (typeof window === "undefined" || !userId) {
    return;
  }

  try {
    window.localStorage.setItem(getReadKey(userId), JSON.stringify(Array.from(ids)));
  } catch {
    // Ignore localStorage write failures.
  }
};

const formatTripDateTime = (dateValue: string, departureTime?: string | null) => {
  const safeDate = String(dateValue ?? "").trim();
  if (!safeDate) {
    return "Trip scheduled";
  }

  const dateText = new Date(safeDate).toLocaleDateString();
  const timeText = String(departureTime ?? "").trim();
  return timeText ? `${dateText} at ${timeText}` : dateText;
};

export const markNotificationAsRead = (userId: string, notificationId: string) => {
  const readIds = readReadNotificationIds(userId);
  readIds.add(notificationId);
  writeReadNotificationIds(userId, readIds);
};

export const markAllNotificationsAsRead = (userId: string, notificationIds: string[]) => {
  const readIds = readReadNotificationIds(userId);
  for (const id of notificationIds) {
    readIds.add(id);
  }
  writeReadNotificationIds(userId, readIds);
};

export const getInAppNotifications = async (authUser: AuthUser): Promise<InAppNotification[]> => {
  if (!authUser?.id) {
    return [];
  }

  const readIds = readReadNotificationIds(authUser.id);

  const customerBookingsPromise = supabase
    .from("bookings")
    .select("id, boat_name, start_date, departure_time, status, payment_plan, total_price, amount_due_now, created_at")
    .eq("customer_id", authUser.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const ownerNotificationsPromise = authUser.isOwner && authUser.email
    ? supabase
        .from("owner_notifications")
        .select("id, booking_id, subject, message, status, created_at")
        .eq("owner_email", authUser.email)
        .order("created_at", { ascending: false })
        .limit(20)
    : Promise.resolve({ data: [], error: null });

  const [customerBookingsResult, ownerNotificationsResult] = await Promise.all([
    customerBookingsPromise,
    ownerNotificationsPromise,
  ]);

  const customerNotifications = Array.isArray(customerBookingsResult.data)
    ? customerBookingsResult.data.map((booking) => {
        const status = String(booking.status ?? "confirmed").toLowerCase();
        const boatName = booking.boat_name ?? "Boat";
        const dateTimeLabel = formatTripDateTime(booking.start_date, booking.departure_time);
        const paymentPlan = String(booking.payment_plan ?? "").toLowerCase();
        const amountDueNow = Number(booking.amount_due_now ?? 0);
        const totalPrice = Number(booking.total_price ?? 0);

        let kind: InAppNotificationKind = "booking-confirmed";
        if (status === "cancelled") {
          kind = "booking-cancelled";
        } else if (status === "pending") {
          kind = "booking-pending";
        } else if (amountDueNow > 0 || totalPrice > 0) {
          kind = "payment";
        }

        const title =
          status === "cancelled"
            ? `Booking cancelled: ${boatName}`
            : status === "pending"
              ? `Booking pending: ${boatName}`
              : `Booking confirmed: ${boatName}`;

        const paymentSummary =
          paymentPlan === "deposit"
            ? `Deposit paid: €${amountDueNow.toFixed(0)} / €${totalPrice.toFixed(0)}`
            : totalPrice > 0
              ? `Payment: €${totalPrice.toFixed(0)}`
              : "Payment workflow updated";

        return {
          id: `booking-${booking.id}`,
          title,
          message: `${dateTimeLabel} • ${paymentSummary}`,
          createdAt: booking.created_at || booking.start_date || new Date().toISOString(),
          href: `/history?bookingId=${encodeURIComponent(String(booking.id))}`,
          category: "booking" as const,
          kind,
          isRead: readIds.has(`booking-${booking.id}`),
        };
      })
    : [];

  const ownerNotifications = Array.isArray(ownerNotificationsResult.data)
    ? ownerNotificationsResult.data.map((notification) => {
        const status = String(notification.status ?? "queued").toLowerCase();
        const isAlert = status === "failed" || status === "error";
        return {
          id: `owner-${notification.id}`,
          title: notification.subject || "New owner notification",
          message: String(notification.message ?? "A new booking workflow event was created.").slice(0, 180),
          createdAt: notification.created_at || new Date().toISOString(),
          href: notification.booking_id
            ? `/history?saleBookingId=${encodeURIComponent(String(notification.booking_id))}`
            : "/history",
          category: "sale" as const,
          kind: isAlert ? ("owner-alert" as const) : ("owner-workflow" as const),
          isRead: readIds.has(`owner-${notification.id}`),
        };
      })
    : [];

  return [...customerNotifications, ...ownerNotifications]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);
};
