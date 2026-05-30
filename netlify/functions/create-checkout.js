import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const isValidTime = (value) => TIME_REGEX.test(String(value ?? ""));
const toMinutes = (timeValue) => {
  if (!isValidTime(timeValue)) return null;
  const [h, m] = String(timeValue).split(":");
  return Number(h) * 60 + Number(m);
};
const rangesOverlap = (startA, endA, startB, endB) => startA < endB && endA > startB;
const addHoursWithoutOvernightWrap = (timeValue, hoursToAdd) => {
  if (!isValidTime(timeValue) || !Number.isFinite(hoursToAdd) || hoursToAdd <= 0) return null;
  const [hoursPart, minutesPart] = String(timeValue).split(":");
  const startMinutes = Number(hoursPart) * 60 + Number(minutesPart);
  const endMinutes = startMinutes + Math.round(hoursToAdd * 60);
  if (endMinutes > 24 * 60) return null;
  const endHour = String(Math.floor(endMinutes / 60)).padStart(2, "0");
  const endMinute = String(endMinutes % 60).padStart(2, "0");
  return `${endHour}:${endMinute}`;
};
const addHoursAllowWrap = (timeValue, hoursToAdd) => {
  if (!isValidTime(timeValue) || !Number.isFinite(hoursToAdd) || hoursToAdd <= 0) return null;
  const [hoursPart, minutesPart] = String(timeValue).split(":");
  const startMinutes = Number(hoursPart) * 60 + Number(minutesPart);
  const endMinutes = startMinutes + Math.round(hoursToAdd * 60);
  const normalized = ((endMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const endHour = String(Math.floor(normalized / 60)).padStart(2, "0");
  const endMinute = String(normalized % 60).padStart(2, "0");
  return `${endHour}:${endMinute}`;
};
const isSlotAvailableForRange = (occupiedSlots, departureTime, packageHours) => {
  const desiredEndTime = addHoursWithoutOvernightWrap(departureTime, packageHours);
  if (!desiredEndTime) return false;
  const desiredStartMinutes = toMinutes(departureTime);
  const desiredEndMinutes = toMinutes(desiredEndTime);
  if (desiredStartMinutes === null || desiredEndMinutes === null) return false;
  return !occupiedSlots.some((slot) => {
    const slotStart = toMinutes(slot.start);
    const slotEnd = toMinutes(slot.end);
    if (slotStart === null || slotEnd === null) return false;
    return rangesOverlap(desiredStartMinutes, desiredEndMinutes, slotStart, slotEnd);
  });
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const getRequestOrigin = (event) => {
  const explicitBaseUrl = process.env.APP_BASE_URL?.trim();
  if (explicitBaseUrl) return explicitBaseUrl.replace(/\/$/, "");

  const headers = event.headers || {};
  const requestOrigin = headers.origin || headers.Origin;
  if (typeof requestOrigin === "string" && requestOrigin.trim()) {
    return requestOrigin.trim().replace(/\/$/, "");
  }

  const forwardedProto = headers["x-forwarded-proto"] || headers["X-Forwarded-Proto"] || "https";
  const forwardedHost = headers["x-forwarded-host"] || headers["X-Forwarded-Host"] || headers.host || headers.Host;
  if (typeof forwardedHost === "string" && forwardedHost.trim()) {
    return `${String(forwardedProto).split(",")[0].trim() || "https"}://${forwardedHost.trim().replace(/\/$/, "")}`;
  }

  return "https://your-deployed-netlify-site.netlify.app";
};

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) };
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Supabase admin is not configured in function env" }) };
    }
    if (!stripeSecretKey) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Stripe is not configured in function env" }) };
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-02-24" });
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const body = event.body ? JSON.parse(event.body) : {};
    const {
      boatId,
      boatName,
      customerEmail,
      customerId,
      bookingDate,
      departureTime,
      packageHours,
      preDiscountTotal: preDiscountTotalFromClient,
      totalPrice: totalPriceFromClient,
      paymentPlan,
      successUrl,
      cancelUrl,
      isPartyBooking,
      partyEventDate,
      partyEventTime,
      partyTierSelected,
      partyTierPrice,
    } = body || {};

    if (!boatId || typeof boatId !== "string") {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "boatId is required" }) };
    }

    const { data: boatById, error: boatByIdError } = await supabaseAdmin
      .from("boats")
      .select("id, name, owner_id, departure_marina, flash_sale_enabled")
      .eq("id", boatId)
      .maybeSingle();

    let boat = boatById;
    if (!boat && boatName) {
      const { data: boatByName, error: boatByNameError } = await supabaseAdmin
        .from("boats")
        .select("id, name, owner_id, flash_sale_enabled, departure_marina")
        .eq("name", boatName)
        .limit(1)
        .maybeSingle();
      if (boatByName) boat = boatByName;
      if (!boat && boatByNameError) {
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: `Boat lookup failed: ${String(boatByNameError.message ?? boatByNameError)}` }) };
      }
    }

    if (!boat && boatByIdError) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: `Boat lookup failed: ${String(boatByIdError.message ?? boatByIdError)}` }) };
    }

    if (!boat) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: "Boat not found" }) };

    const hasPreDiscountTotal = Number.isFinite(preDiscountTotalFromClient ?? NaN) && (preDiscountTotalFromClient ?? 0) > 0;
    const baseTotalPrice = hasPreDiscountTotal
      ? Number(preDiscountTotalFromClient)
      : (Number.isFinite(totalPriceFromClient ?? NaN) && (totalPriceFromClient ?? 0) > 0 ? Number(totalPriceFromClient) : 0);

    if (!Number.isFinite(baseTotalPrice) || baseTotalPrice <= 0) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Missing total price. Add at least one package before checkout." }) };
    }

    const { data: ownerRaw } = await supabaseAdmin
      .from("users")
      .select("id, stripe_account_id, full_name, name, email")
      .eq("id", boat.owner_id)
      .single();

    const allowPlatformFallback = String(process.env.STRIPE_ALLOW_PLATFORM_FALLBACK ?? "true").toLowerCase() !== "false";
    const owner = ownerRaw || (allowPlatformFallback ? { id: boat.owner_id, stripe_account_id: null } : null);
    if ((!ownerRaw || !owner) && !allowPlatformFallback) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: "Boat owner not found" }) };
    }

    const canTransferToOwner = Boolean(owner && owner.stripe_account_id);
    if (!canTransferToOwner && !allowPlatformFallback) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Boat owner has not completed Stripe Connect onboarding" }) };
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const selectedDate = bookingDate ?? todayIso;
    const selectedDepartureTime = departureTime ?? "10:00";
    const selectedPackageHours = Math.max(1, Math.min(8, Number(packageHours ?? 1)));

    if (!isValidTime(selectedDepartureTime)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Invalid departure time" }) };
    }

    const bookingEndTime = Boolean(isPartyBooking)
      ? addHoursAllowWrap(selectedDepartureTime, selectedPackageHours)
      : addHoursWithoutOvernightWrap(selectedDepartureTime, selectedPackageHours);
    if (!bookingEndTime) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Choose a start time that keeps the trip within the same day and max 8 hours." }) };
    }

    // Flash-sale and pricing (simple replica of edge function logic)
    const FLASH_SALE_WINDOW_MS = 24 * 60 * 60 * 1000;
    const flashSaleEligible = false; // simplified for Netlify function; keep false unless you want full logic ported
    const discountedTotal = baseTotalPrice;
    const depositAmount = paymentPlan === "deposit" ? Math.round(discountedTotal * 0.3) : 0;
    const amountDueNow = paymentPlan === "deposit" ? depositAmount : discountedTotal;

    const amountCents = Math.round(amountDueNow * 100);
    const applicationFeeAmount = Math.round(amountCents * 0.2);
    const platformCommission = applicationFeeAmount / 100;
    const ownerPayout = Math.max(0, amountDueNow - platformCommission);

    const { data: bookingRowsForDay } = await supabaseAdmin
      .from("bookings")
      .select("departure_time, end_time, package_hours, status")
      .eq("boat_id", boat.id)
      .eq("start_date", selectedDate)
      .eq("status", "confirmed");

    const occupiedFromBookings = Array.isArray(bookingRowsForDay)
      ? bookingRowsForDay
        .map((row) => {
          const dep = String(row.departure_time ?? "");
          const fallbackEnd = addHoursWithoutOvernightWrap(dep, Number(row.package_hours ?? 0));
          const end = String(row.end_time ?? fallbackEnd ?? "");
          if (!isValidTime(dep) || !isValidTime(end)) return null;
          return { start: dep, end };
        })
        .filter(Boolean)
      : [];

    const occupiedSlots = occupiedFromBookings;
    if (!Boolean(isPartyBooking) && !isSlotAvailableForRange(occupiedSlots, selectedDepartureTime, selectedPackageHours)) {
      return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ error: "Selected time slot is no longer available." }) };
    }

    // Do not keep unpaid pending rows as hard blockers for the same slot.
    await supabaseAdmin
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("boat_id", boat.id)
      .eq("start_date", selectedDate)
      .eq("departure_time", selectedDepartureTime)
      .eq("status", "pending")
      .is("stripe_payment_intent_id", null);

    const normalizedCustomerEmail = typeof customerEmail === "string" ? customerEmail.trim().toLowerCase() : "";
    const checkoutReference = `chk_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    let bookingEndDate = selectedDate;
    try {
      const startMinutes = toMinutes(selectedDepartureTime);
      const endMinutes = toMinutes(bookingEndTime);
      if (startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) {
        const next = new Date(`${selectedDate}T00:00:00.000Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        bookingEndDate = next.toISOString().slice(0, 10);
      }
    } catch {}

    const appBaseUrl = getRequestOrigin(event);

    const baseSessionPayload = {
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: amountCents,
            product_data: {
              name: `${boat.name} booking`,
              description: `Boat booking payment for ${boat.name}`,
            },
          },
        },
      ],
      customer_email: customerEmail,
      success_url: `${successUrl ?? `${appBaseUrl}/booking-confirmed`}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl ?? `${appBaseUrl}/booking`,
    };

    const createCheckoutSession = async (mode) => {
      const payoutMode = mode === "connect_split" ? "connect_split" : "platform_only";
      const paymentIntentData =
        payoutMode === "connect_split"
          ? {
              application_fee_amount: applicationFeeAmount,
              transfer_data: { destination: ownerRaw?.stripe_account_id },
              metadata: { boatId: boat.id, checkoutReference },
            }
          : { metadata: { boatId: boat.id, checkoutReference, payoutMode: "platform_only" } };

      return stripe.checkout.sessions.create({
        ...baseSessionPayload,
        metadata: {
          boatId: boat.id,
          ownerId: ownerRaw?.id,
          checkoutReference,
          bookingDate: selectedDate,
          bookingEndDate,
          departureTime: selectedDepartureTime,
          endTime: bookingEndTime,
          packageHours: String(selectedPackageHours),
          guests: String(Math.max(1, Number(body.guests ?? 1) || 1)),
          boatName: boat.name,
          departureMarina: boat.departure_marina ?? "",
          paymentPlan: paymentPlan || "full",
          totalPrice: String(discountedTotal),
          amountDueNow: String(amountDueNow),
          depositAmount: String(depositAmount),
          platformCommission: String(platformCommission),
          ownerPayout: String(ownerPayout),
          customerId: customerId ?? "",
          customerEmail: normalizedCustomerEmail,
          customerName: normalizedCustomerEmail ? (normalizedCustomerEmail.split("@")[0] || "Guest") : "Guest",
          packageLabel: Boolean(isPartyBooking) ? "Party tickets" : "Stripe checkout",
          isPartyBooking: String(Boolean(isPartyBooking)),
          partyEventDate: isPartyBooking ? (partyEventDate ?? "") : "",
          partyEventTime: isPartyBooking ? (partyEventTime ?? "") : "",
          partyTierSelected: isPartyBooking ? (partyTierSelected ?? "") : "",
          partyTierPrice: isPartyBooking ? String(partyTierPrice ?? 0) : "0",
          payoutMode,
        },
        payment_intent_data: paymentIntentData,
      });
    };

    let checkoutSession;
    let payoutMode = canTransferToOwner ? "connect_split" : "platform_only";
    let warning = canTransferToOwner ? null : "Owner has not completed Stripe Connect onboarding. Funds are collected on platform account.";
    try {
      checkoutSession = await createCheckoutSession(payoutMode);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create Stripe Checkout session";
      const normalized = String(message).toLowerCase();
      const isConnectDestinationError = normalized.includes("transfer_data") || normalized.includes("destination") || normalized.includes("acct_");
      if (payoutMode === "connect_split" && isConnectDestinationError) {
        checkoutSession = await createCheckoutSession("platform_only");
        payoutMode = "platform_only";
        warning = "Owner Stripe account is unavailable right now. Funds are collected on platform account.";
      } else {
        throw error;
      }
    }

    const stripePaymentIntentId =
      typeof checkoutSession.payment_intent === "string"
        ? checkoutSession.payment_intent
        : (checkoutSession.payment_intent && typeof checkoutSession.payment_intent === "object" && typeof checkoutSession.payment_intent.id === "string"
            ? checkoutSession.payment_intent.id
            : null);

    const pendingBookingPayload = {
      boat_id: boat.id,
      customer_id: customerId ?? null,
      customer_name: normalizedCustomerEmail ? (normalizedCustomerEmail.split("@")[0] || "Guest") : "Guest",
      customer_email: normalizedCustomerEmail || null,
      start_date: selectedDate,
      end_date: bookingEndDate,
      departure_time: selectedDepartureTime,
      start_time: selectedDepartureTime,
      end_time: bookingEndTime,
      package_hours: selectedPackageHours,
      status: "pending",
      total_price: discountedTotal,
      boat_name: boat.name || "",
      owner_name: ownerRaw?.full_name || ownerRaw?.name || "Owner",
      package_label: Boolean(isPartyBooking) ? "Party tickets" : "Stripe checkout",
      guests: Math.max(1, Number(body.guests ?? 1) || 1),
      departure_marina: boat.departure_marina ?? "",
      extras: [],
      notes: "",
      payment_method: null,
      payment_plan: paymentPlan || "full",
      amount_due_now: amountDueNow,
      deposit_amount: depositAmount,
      platform_commission: platformCommission,
      owner_payout: ownerPayout,
      request_id: checkoutReference,
      stripe_session_id: checkoutSession.id,
      stripe_payment_intent_id: stripePaymentIntentId,
      ...(Boolean(isPartyBooking)
        ? {
            party_ticket_count: Math.max(1, Number(body.guests ?? 1) || 1),
            party_ticket_status: "issued",
          }
        : {}),
    };

    const { data: pendingBooking, error: pendingBookingError } = await supabaseAdmin
      .from("bookings")
      .insert(pendingBookingPayload)
      .select("id")
      .maybeSingle();

    if (pendingBookingError) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: pendingBookingError.message || "Failed to create pending booking" }) };
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ sessionId: checkoutSession.id, checkoutUrl: checkoutSession.url, bookingId: pendingBooking?.id ?? null, amount: amountDueNow, commissionAmount: platformCommission, ownerStripeAccountId: ownerRaw?.stripe_account_id, payoutMode, warning, flashSaleEligible, flashSaleDiscount: 0 }) };
  } catch (error) {
    console.error("create-checkout error", error);
    const errorMessage = error instanceof Error ? error.message : "Unexpected error";
    const stack = error instanceof Error ? error.stack : "";
    console.error("Stack:", stack);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: errorMessage, details: stack }) };
  }
};
