import { supabase } from "./supabase";
import { resolveBoatVoucherPricing } from "./booking-pricing";

export type BookingPaymentMethod = "stripe" | "manual";

export interface BookingRecord {
  id: string;
  createdAt: string;
  boatId: string;
  boatName: string;
  ownerName: string;
  customerName: string;
  customerEmail: string;
  packageLabel: string;
  guests: number;
  date: string;
  departureTime: string;
  departureMarina: string;
  totalPrice: number;
  paymentMethod: BookingPaymentMethod;
  paymentPlan: "deposit" | "full";
  voucherCode?: string;
  flashSaleEnabled?: boolean;
  // voucher fields removed
  partyTicketCode?: string;
  partyTicketCount?: number;
  partyTicketStatus?: "issued" | "void";
  partyTierSelected?: string | null;
  partyTierPrice?: number | null;
  amountDueNow: number;
  depositAmount: number;
  platformCommission: number;
  ownerPayout: number;
  extras: string[];
  notes: string;
  status: "confirmed";
}

export interface OwnerNotification {
  id: string;
  bookingId: string;
  ownerName: string;
  ownerEmail: string;
  subject: string;
  message: string;
  createdAt: string;
  status: "queued";
}

export interface CustomerEmailConfirmation {
  id: string;
  bookingId: string;
  toEmail: string;
  subject: string;
  previewText: string;
  body: string;
  createdAt: string;
  status: "queued";
}

export interface ConfirmBookingInput {
  boatId: string;
  boatName: string;
  ownerName: string;
  customerName: string;
  customerEmail: string;
  packageLabel: string;
  guests: number;
  date: string;
  departureTime: string;
  packageHours: number;
  departureMarina: string;
  totalPrice: number;
  paymentMethod: BookingPaymentMethod;
  paymentPlan: "deposit" | "full";
  amountDueNow: number;
  depositAmount: number;
  platformCommission: number;
  ownerPayout: number;
  voucherCode?: string;
  flashSaleEnabled?: boolean;
  // voucher fields removed
  partyReady?: boolean;
  partyTierSelected?: string | null;
  partyTierPrice?: number | null;
  extras: string[];
  notes: string;
  queueCustomerEmail: boolean;
}

export interface ConfirmBookingResult {
  booking: BookingRecord;
  ownerNotification: OwnerNotification;
  customerEmail: CustomerEmailConfirmation | null;
}

export interface DayBookingSlot {
  departureTime: string;
  endTime: string;
}

export interface DepartureRecommendation {
  departureTime: string;
  endTime: string;
  score: number;
  reasons: string[];
}

type DayBookingRow = {
  departure_time?: string | null;
  end_time?: string | null;
  package_hours?: number | null;
};

type DayCalendarEventRow = {
  start_time?: string | null;
  end_time?: string | null;
  all_day?: boolean | null;
};

type ConfirmedBookingRow = {
  id?: string | null;
  departure_time?: string | null;
  end_time?: string | null;
  package_hours?: number | null;
  created_at?: string | null;
};

type CreatedBookingRow = {
  id: string;
  created_at: string;
  boat_id: string;
  boat_name?: string | null;
  owner_name?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  package_label?: string | null;
  guests?: number | null;
  start_date: string;
  departure_time?: string | null;
  departure_marina?: string | null;
  total_price?: number | null;
  payment_method?: string | null;
  payment_plan?: string | null;
  amount_due_now?: number | null;
  deposit_amount?: number | null;
  platform_commission?: number | null;
  owner_payout?: number | null;
  party_ticket_code?: string | null;
  party_ticket_count?: number | null;
  party_ticket_status?: string | null;
  party_tier_selected?: string | null;
  party_tier_price?: number | null;
  extras?: unknown;
  notes?: string | null;
};

type IdRow = {
  id?: string | null;
};

type SupabaseErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

const OPERATING_START_MINUTES = 7 * 60;
const OPERATING_END_MINUTES = 20 * 60;

const generatePartyTicketCode = () => {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PRTY-${stamp}-${random}`;
};

const addHoursToTime = (timeValue: string, hoursToAdd: number) => {
  const [hoursPart, minutesPart] = String(timeValue).split(":");
  const hours = Number(hoursPart);
  const minutes = Number(minutesPart ?? 0);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return timeValue;
  }

  const totalMinutes = (hours * 60) + minutes + Math.max(0, hoursToAdd) * 60;
  const normalized = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const normalizedHours = String(Math.floor(normalized / 60)).padStart(2, "0");
  const normalizedMinutes = String(normalized % 60).padStart(2, "0");

  return `${normalizedHours}:${normalizedMinutes}`;
};

const isValidTime = (timeValue: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(timeValue ?? ""));

const toMinutes = (timeValue: string) => {
  if (!isValidTime(timeValue)) {
    return null;
  }

  const [hoursPart, minutesPart] = timeValue.split(":");
  return Number(hoursPart) * 60 + Number(minutesPart);
};

const rangesOverlap = (startA: number, endA: number, startB: number, endB: number) =>
  startA < endB && endA > startB;

const mergeIntervals = (intervals: Array<{ start: number; end: number }>) => {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];

  for (const interval of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || interval.start > previous.end) {
      merged.push({ ...interval });
      continue;
    }

    previous.end = Math.max(previous.end, interval.end);
  }

  return merged;
};

const getFreeWindows = (occupiedIntervals: Array<{ start: number; end: number }>) => {
  const merged = mergeIntervals(occupiedIntervals);
  const freeWindows: Array<{ start: number; end: number; minutes: number }> = [];
  let cursor = OPERATING_START_MINUTES;

  for (const interval of merged) {
    if (interval.start > cursor) {
      freeWindows.push({ start: cursor, end: interval.start, minutes: interval.start - cursor });
    }
    cursor = Math.max(cursor, interval.end);
  }

  if (cursor < OPERATING_END_MINUTES) {
    freeWindows.push({ start: cursor, end: OPERATING_END_MINUTES, minutes: OPERATING_END_MINUTES - cursor });
  }

  return freeWindows.filter((window) => window.minutes > 0);
};

const addHoursWithoutOvernightWrap = (timeValue: string, hoursToAdd: number) => {
  if (!isValidTime(timeValue) || !Number.isFinite(hoursToAdd) || hoursToAdd <= 0) {
    return null;
  }

  const [hoursPart, minutesPart] = timeValue.split(":");
  const startMinutes = Number(hoursPart) * 60 + Number(minutesPart);
  const endMinutes = startMinutes + Math.round(hoursToAdd * 60);

  if (endMinutes > 24 * 60) {
    return null;
  }

  const endHour = String(Math.floor(endMinutes / 60)).padStart(2, "0");
  const endMinute = String(endMinutes % 60).padStart(2, "0");
  return `${endHour}:${endMinute}`;
};

const isInsideOperatingWindow = (startTime: string, endTime: string) => {
  const startMinutes = toMinutes(startTime);
  const endMinutes = toMinutes(endTime);

  if (startMinutes === null || endMinutes === null) {
    return false;
  }

  return startMinutes >= OPERATING_START_MINUTES && endMinutes <= OPERATING_END_MINUTES;
};

const isoToTimeString = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  const hours = String(dt.getHours()).padStart(2, "0");
  const minutes = String(dt.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};

const loadDayBookedSlots = async (boatId: string, date: string): Promise<DayBookingSlot[]> => {
  // Confirmed bookings for this day
  const { data: bookingRows, error: bookingsError } = await supabase
    .from("bookings")
    .select("departure_time, end_time, package_hours, status")
    .eq("boat_id", boatId)
    .eq("start_date", date)
    .eq("status", "confirmed");

  const slotsFromBookings: DayBookingSlot[] =
    !bookingsError && Array.isArray(bookingRows)
      ? bookingRows
          .map((row) => {
            const bookingRow = row as DayBookingRow;
            const departureTime = String(bookingRow.departure_time ?? "");
            const fallbackEnd = addHoursWithoutOvernightWrap(departureTime, Number(bookingRow.package_hours ?? 0));
            const endTime = String(bookingRow.end_time ?? fallbackEnd ?? "");
            if (!isValidTime(departureTime) || !isValidTime(endTime)) {
              return null;
            }

            return { departureTime, endTime } satisfies DayBookingSlot;
          })
          .filter((slot: DayBookingSlot | null): slot is DayBookingSlot => Boolean(slot))
      : [];

  // Blocked / maintenance events from calendar_events for this day
  const dayStartIso = `${date}T00:00:00.000Z`;
  const nextDay = new Date(`${date}T00:00:00.000Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const nextDayIso = nextDay.toISOString();

  const { data: calendarRows, error: calendarError } = await supabase
    .from("calendar_events")
    .select("start_time, end_time, all_day")
    .eq("boat_id", boatId)
    .gte("start_time", dayStartIso)
    .lt("start_time", nextDayIso);

  const slotsFromCalendar: DayBookingSlot[] =
    !calendarError && Array.isArray(calendarRows)
      ? calendarRows
          .map((row) => {
            const calendarRow = row as DayCalendarEventRow;
            const isAllDay = Boolean(calendarRow.all_day);
            const startTime = isoToTimeString(calendarRow.start_time);
            const endTime = isAllDay
              ? "20:00"
              : isoToTimeString(calendarRow.end_time ?? calendarRow.start_time);

            if (!startTime || !endTime || !isValidTime(startTime) || !isValidTime(endTime)) {
              return null;
            }

            return { departureTime: startTime, endTime } satisfies DayBookingSlot;
          })
          .filter((slot: DayBookingSlot | null): slot is DayBookingSlot => Boolean(slot))
      : [];

  return [...slotsFromBookings, ...slotsFromCalendar];
};

export const hasAnyDayOccupancy = async (boatId: string, date: string): Promise<boolean> => {
  const slots = await loadDayBookedSlots(boatId, date);
  return slots.length > 0;
};

const isSlotAvailable = (bookedSlots: DayBookingSlot[], departureTime: string, packageHours: number) => {
  const desiredEndTime = addHoursWithoutOvernightWrap(departureTime, packageHours);
  if (!desiredEndTime) {
    return false;
  }

  if (!isInsideOperatingWindow(departureTime, desiredEndTime)) {
    return false;
  }

  const desiredStartMinutes = toMinutes(departureTime);
  const desiredEndMinutes = toMinutes(desiredEndTime);
  if (desiredStartMinutes === null || desiredEndMinutes === null) {
    return false;
  }

  return !bookedSlots.some((slot) => {
    const slotStart = toMinutes(slot.departureTime);
    const slotEnd = toMinutes(slot.endTime);
    if (slotStart === null || slotEnd === null) {
      return false;
    }

    return rangesOverlap(desiredStartMinutes, desiredEndMinutes, slotStart, slotEnd);
  });
};

const hasOverlapWithExistingBooking = (
  bookedSlots: DayBookingSlot[],
  departureTime: string,
  endTime: string,
) => {
  const desiredStartMinutes = toMinutes(departureTime);
  const desiredEndMinutes = toMinutes(endTime);
  if (desiredStartMinutes === null || desiredEndMinutes === null) {
    return false;
  }

  return bookedSlots.some((slot) => {
    const slotStart = toMinutes(slot.departureTime);
    const slotEnd = toMinutes(slot.endTime);
    if (slotStart === null || slotEnd === null) {
      return false;
    }

    return rangesOverlap(desiredStartMinutes, desiredEndMinutes, slotStart, slotEnd);
  });
};

const shouldCancelNewlyCreatedOverlap = async (
  boatId: string,
  date: string,
  bookingId: string,
  departureTime: string,
  endTime: string,
) => {
  const { data, error } = await supabase
    .from("bookings")
    .select("id, departure_time, end_time, package_hours, created_at, status")
    .eq("boat_id", boatId)
    .eq("start_date", date)
    .eq("status", "confirmed")
    .order("created_at", { ascending: true });

  if (error || !Array.isArray(data)) {
    return false;
  }

  const activeSlots = data
    .map((row) => {
      const bookingRow = row as ConfirmedBookingRow;
      const rowDepartureTime = String(bookingRow.departure_time ?? "");
      const fallbackEnd = addHoursWithoutOvernightWrap(rowDepartureTime, Number(bookingRow.package_hours ?? 0));
      const rowEndTime = String(bookingRow.end_time ?? fallbackEnd ?? "");

      if (!isValidTime(rowDepartureTime) || !isValidTime(rowEndTime)) {
        return null;
      }

      return {
        id: String(bookingRow.id ?? ""),
        createdAt: String(bookingRow.created_at ?? ""),
        departureTime: rowDepartureTime,
        endTime: rowEndTime,
      };
    })
    .filter((row): row is { id: string; createdAt: string; departureTime: string; endTime: string } => Boolean(row));

  const currentBooking = activeSlots.find((slot) => slot.id === bookingId);
  if (!currentBooking) {
    return false;
  }

  const olderOverlappingBooking = activeSlots
    .filter((slot) => slot.id !== bookingId)
    .filter((slot) => hasOverlapWithExistingBooking([{ departureTime: slot.departureTime, endTime: slot.endTime }], departureTime, endTime))
    .find((slot) => {
      if (!currentBooking.createdAt || !slot.createdAt) {
        return true;
      }
      return new Date(slot.createdAt).getTime() <= new Date(currentBooking.createdAt).getTime();
    });

  return Boolean(olderOverlappingBooking);
};

const buildRecommendationForSlot = (bookedSlots: DayBookingSlot[], departureTime: string, packageHours: number): DepartureRecommendation | null => {
  const endTime = addHoursWithoutOvernightWrap(departureTime, packageHours);
  const startMinutes = toMinutes(departureTime);
  const endMinutes = endTime ? toMinutes(endTime) : null;
  if (!endTime || startMinutes === null || endMinutes === null) {
    return null;
  }

  const bookedIntervals = bookedSlots
    .map((slot) => {
      const slotStart = toMinutes(slot.departureTime);
      const slotEnd = toMinutes(slot.endTime);
      if (slotStart === null || slotEnd === null) {
        return null;
      }
      return { start: slotStart, end: slotEnd };
    })
    .filter((interval): interval is { start: number; end: number } => Boolean(interval));

  const occupiedIntervals = [...bookedIntervals, { start: startMinutes, end: endMinutes }];
  const freeWindows = getFreeWindows(occupiedIntervals);
  const sellableWindows = freeWindows.filter((window) => window.minutes >= 180);
  const largestRemainingWindow = freeWindows.reduce((max, window) => Math.max(max, window.minutes), 0);

  let score = sellableWindows.length * 1000 + largestRemainingWindow;
  const reasons: string[] = [];

  if (sellableWindows.length > 0) {
    reasons.push(`${sellableWindows.length} additional sellable window(s) remain`);
  }

  if (packageHours === 5) {
    if (startMinutes <= 9 * 60) {
      score += 400;
      reasons.push("morning half-day keeps later sessions open");
    } else if (startMinutes <= 10 * 60) {
      score += 180;
      reasons.push("early start preserves more day coverage");
    } else if (startMinutes >= 13 * 60) {
      score -= 120;
    }
  }

  if (packageHours >= 8) {
    const distanceFromNine = Math.abs(startMinutes - 9 * 60);
    score += Math.max(0, 180 - distanceFromNine);
  }

  return {
    departureTime,
    endTime,
    score,
    reasons,
  };
};

export const getRecommendedDepartureTimes = async (boatId: string, date: string, packageHours: number): Promise<DepartureRecommendation[]> => {
  if (!boatId || !date || !Number.isFinite(packageHours) || packageHours <= 0 || packageHours > 8) {
    return [];
  }

  const bookedSlots = await loadDayBookedSlots(boatId, date);
  const recommendations: DepartureRecommendation[] = [];

  for (let hour = 7; hour <= 18; hour += 1) {
    const candidate = `${String(hour).padStart(2, "0")}:00`;
    if (!isSlotAvailable(bookedSlots, candidate, packageHours)) {
      continue;
    }

    const recommendation = buildRecommendationForSlot(bookedSlots, candidate, packageHours);
    if (recommendation) {
      recommendations.push(recommendation);
    }
  }

  return recommendations.sort((a, b) => b.score - a.score || a.departureTime.localeCompare(b.departureTime));
};

export const getAvailableDepartureTimes = async (boatId: string, date: string, packageHours: number) => {
  const recommendations = await getRecommendedDepartureTimes(boatId, date, packageHours);
  return recommendations.map((item) => item.departureTime);
};

export const confirmBookingWorkflow = async (input: ConfirmBookingInput): Promise<ConfirmBookingResult> => {
  if (!Number.isFinite(input.packageHours) || input.packageHours <= 0 || input.packageHours > 8) {
    throw new Error("Bookings cannot exceed 8 hours.");
  }

  if (!isValidTime(input.departureTime)) {
    throw new Error("Invalid departure time.");
  }

  const isPartyBooking = Boolean(input.partyReady);

  // For regular bookings we enforce the same-day restriction; for party bookings
  // allow overnight wrap (party events may continue past midnight).
  const bookingEndTime = isPartyBooking
    ? addHoursToTime(input.departureTime, input.packageHours)
    : addHoursWithoutOvernightWrap(input.departureTime, input.packageHours);

  if (!bookingEndTime) {
    if (isPartyBooking) {
      throw new Error("Invalid departure time for party booking.");
    }
    throw new Error("Choose a start time that keeps the trip within the same day and max 8 hours.");
  }

  if (!isPartyBooking && !isInsideOperatingWindow(input.departureTime, bookingEndTime)) {
    throw new Error("Choose a start time within operating hours (07:00-20:00).");
  }

  const bookedSlots = await loadDayBookedSlots(input.boatId, input.date);
  if (!isSlotAvailable(bookedSlots, input.departureTime, input.packageHours)) {
    throw new Error("Selected time slot is no longer available.");
  }

  const timestamp = new Date().toISOString();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const pricing = resolveBoatVoucherPricing({
    baseTotalPrice: input.totalPrice,
    bookingDate: input.date,
    departureTime: input.departureTime,
    flashSaleEnabled: Boolean(input.flashSaleEnabled),
    paymentPlan: input.paymentPlan,
  });

  const partyTicketCode = isPartyBooking ? generatePartyTicketCode() : null;
  const partyTicketCount = isPartyBooking ? Math.max(1, Number(input.guests) || 1) : 0;
  const partyTicketStatus = isPartyBooking ? "issued" : null;

  // If the booking end time wrapped past midnight, set end_date to the next day.
  let bookingEndDate = input.date;
  try {
    const startMinutes = toMinutes(input.departureTime);
    const endMinutes = toMinutes(bookingEndTime);
    if (startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) {
      // wrapped to next day
      const next = new Date(`${input.date}T00:00:00.000Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      bookingEndDate = next.toISOString().slice(0, 10);
    }
  } catch {}

  const { data: bookingRowRaw, error: bookingError } = await supabase
    .from("bookings")
    .insert({
      boat_id: input.boatId,
      boat_name: input.boatName,
      owner_name: input.ownerName,
      customer_id: session?.user?.id ?? null,
      customer_name: input.customerName,
      customer_email: input.customerEmail,
      package_label: input.packageLabel,
      guests: input.guests,
      start_date: input.date,
      end_date: bookingEndDate,
      departure_time: input.departureTime,
      start_time: input.departureTime,
      end_time: bookingEndTime,
      package_hours: input.packageHours,
      departure_marina: input.departureMarina,
      total_price: pricing.discountedTotal,
      payment_method: input.paymentMethod,
      payment_plan: input.paymentPlan,
      amount_due_now: pricing.amountDueNow,
      deposit_amount: pricing.depositAmount,
      platform_commission: Math.round(pricing.amountDueNow * 0.15),
      owner_payout: Math.max(pricing.amountDueNow - Math.round(pricing.amountDueNow * 0.15), 0),
      // voucher columns removed
      party_ticket_code: partyTicketCode,
      party_ticket_count: partyTicketCount,
      party_ticket_status: partyTicketStatus,
      party_tier_selected: input.partyTierSelected ?? null,
      party_tier_price: input.partyTierPrice ?? null,
      extras: input.extras,
      notes: input.notes,
      status: "confirmed",
    })
    .select()
    .single();

  const bookingRow = bookingRowRaw as CreatedBookingRow | null;

  if (bookingError || !bookingRow) {
    const errorInfo = (bookingError ?? null) as SupabaseErrorLike | null;
    const details = errorInfo?.details || "";
    const hint = errorInfo?.hint || "";
    const code = errorInfo?.code || "";
    const parts = [errorInfo?.message, details, hint, code && `code=${code}`].filter(Boolean);
    throw new Error(parts.join(" | ") || "Failed to confirm booking");
  }

  const shouldCancelForOverlap = await shouldCancelNewlyCreatedOverlap(
    input.boatId,
    input.date,
    bookingRow.id,
    input.departureTime,
    bookingEndTime,
  );

  if (shouldCancelForOverlap) {
    await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", bookingRow.id);

    throw new Error("This slot was just booked by another customer. Please choose another available time.");
  }

  // Do not write to calendar_events for now; bookings table remains the single source of truth.

  const booking: BookingRecord = {
    id: bookingRow.id,
    createdAt: bookingRow.created_at,
    boatId: bookingRow.boat_id,
    boatName: bookingRow.boat_name ?? input.boatName,
    ownerName: bookingRow.owner_name ?? input.ownerName,
    customerName: bookingRow.customer_name ?? input.customerName,
    customerEmail: bookingRow.customer_email ?? input.customerEmail,
    packageLabel: bookingRow.package_label ?? input.packageLabel,
    guests: Number(bookingRow.guests ?? input.guests),
    date: bookingRow.start_date,
    departureTime: bookingRow.departure_time ?? input.departureTime,
    departureMarina: bookingRow.departure_marina ?? input.departureMarina,
    totalPrice: Number(bookingRow.total_price ?? input.totalPrice),
    paymentMethod: (bookingRow.payment_method ?? input.paymentMethod) as BookingPaymentMethod,
    paymentPlan: (bookingRow.payment_plan ?? input.paymentPlan) as "deposit" | "full",
    amountDueNow: Number(bookingRow.amount_due_now ?? pricing.amountDueNow),
    depositAmount: Number(bookingRow.deposit_amount ?? pricing.depositAmount),
    platformCommission: Number(bookingRow.platform_commission ?? Math.round(pricing.amountDueNow * 0.15)),
    ownerPayout: Number(bookingRow.owner_payout ?? Math.max(pricing.amountDueNow - Math.round(pricing.amountDueNow * 0.15), 0)),
    // voucher removed
    partyTicketCode: bookingRow.party_ticket_code ?? partyTicketCode ?? undefined,
    partyTicketCount: Number(bookingRow.party_ticket_count ?? partyTicketCount),
    partyTicketStatus: (bookingRow.party_ticket_status as "issued" | "void" | null) ?? (partyTicketStatus as "issued" | null) ?? undefined,
    partyTierSelected: bookingRow.party_tier_selected ?? input.partyTierSelected ?? null,
    partyTierPrice: Number(bookingRow.party_tier_price ?? input.partyTierPrice ?? 0) || null,
    extras: Array.isArray(bookingRow.extras) ? bookingRow.extras : input.extras,
    notes: bookingRow.notes ?? input.notes,
    status: "confirmed",
  };

  const ownerNotification: OwnerNotification = {
    id: "",
    bookingId: booking.id,
    ownerName: input.ownerName,
    ownerEmail: "owner@nautiplex.com",
    subject: `New Nautiplex booking for ${input.boatName}`,
    message: `${input.customerName} confirmed ${input.packageLabel} on ${input.date} at ${input.departureTime} for ${input.guests} guests. Total: €${pricing.discountedTotal}. Due now: €${pricing.amountDueNow}. Owner payout: €${Math.max(pricing.amountDueNow - Math.round(pricing.amountDueNow * 0.15), 0)}.`,
    createdAt: timestamp,
    status: "queued",
  };

  const extrasLine = input.extras.length > 0 ? input.extras.join(", ") : "No add-ons selected";
  const notesLine = input.notes.trim() ? input.notes.trim() : "No special requests added.";
  const customerEmail: CustomerEmailConfirmation | null = input.queueCustomerEmail
    ? {
        id: "",
        bookingId: booking.id,
        toEmail: input.customerEmail,
        subject: `Booking confirmed: ${input.boatName} on ${input.date}`,
        previewText: `Your ${input.packageLabel} trip is confirmed with ${input.ownerName}.`,
        body: [
          `Hi ${input.customerName},`,
          "",
          `Your booking for ${input.boatName} is confirmed.`,
          `Package: ${input.packageLabel}`,
          `Date: ${input.date}`,
          `Departure time: ${input.departureTime}`,
          `Meeting point: ${input.departureMarina}`,
          `Guests: ${input.guests}`,
          `Add-ons: ${extrasLine}`,
          `Special requests: ${notesLine}`,
          `Total confirmed: €${pricing.discountedTotal}`,
          `Paid now (${input.paymentPlan === "deposit" ? "30% deposit" : "full"}): €${pricing.amountDueNow}`,
          ...(isPartyBooking
            ? [
                `Party ticket code: ${partyTicketCode}`,
                `Tickets issued: ${partyTicketCount}`,
              ]
            : []),
          "",
          `Host: ${input.ownerName}`,
          "We have also notified the owner and queued your confirmation email.",
          "",
          "See you on the water,",
          "Nautiplex",
        ].join("\n"),
        createdAt: timestamp,
        status: "queued",
      }
    : null;

  const { data: notificationRowRaw } = await supabase
    .from("owner_notifications")
    .insert({
      booking_id: booking.id,
      owner_name: ownerNotification.ownerName,
      owner_email: ownerNotification.ownerEmail,
      subject: ownerNotification.subject,
      message: ownerNotification.message,
      status: ownerNotification.status,
    })
    .select()
    .single();

  const notificationRow = notificationRowRaw as IdRow | null;

  if (notificationRow?.id) {
    ownerNotification.id = notificationRow.id;
  }

  if (customerEmail) {
    const { data: customerEmailRowRaw } = await supabase
      .from("customer_emails")
      .insert({
        booking_id: booking.id,
        to_email: customerEmail.toEmail,
        subject: customerEmail.subject,
        preview_text: customerEmail.previewText,
        body: customerEmail.body,
        status: customerEmail.status,
      })
      .select()
      .single();

    const customerEmailRow = customerEmailRowRaw as IdRow | null;

    if (customerEmailRow?.id) {
      customerEmail.id = customerEmailRow.id;
    }
  }

  return {
    booking,
    ownerNotification,
    customerEmail,
  };
};
