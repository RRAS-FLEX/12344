// Supabase Edge Function: stripe-create-checkout
// Handles creating Stripe Checkout sessions based on boat + booking context stored in Supabase.

import Stripe from "https://esm.sh/stripe@16.0.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0?target=deno";

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const isValidTime = (value: string | null | undefined): boolean => TIME_REGEX.test(String(value ?? ""));

const toMinutes = (timeValue: string | null | undefined): number | null => {
  if (!isValidTime(timeValue)) return null;
  const [h, m] = String(timeValue).split(":");
  return Number(h) * 60 + Number(m);
};

const rangesOverlap = (startA: number, endA: number, startB: number, endB: number) => startA < endB && endA > startB;

const FLASH_SALE_WINDOW_MS = 24 * 60 * 60 * 1000;
const FLASH_SALE_DISCOUNT_RATE = 0.3;

const buildDepartureDateTime = (bookingDate: string | null | undefined, departureTime: string | null | undefined): Date | null => {
  if (!bookingDate || !isValidTime(departureTime)) {
    return null;
  }

  const departureDateTime = new Date(`${bookingDate}T${departureTime}:00`);
  return Number.isNaN(departureDateTime.getTime()) ? null : departureDateTime;
};

const resolveFlashSalePricing = ({
  baseTotalPrice,
  bookingDate,
  departureTime,
  flashSaleEnabled,
  paymentPlan,
}: {
  baseTotalPrice: number;
  bookingDate: string | null | undefined;
  departureTime: string | null | undefined;
  flashSaleEnabled: boolean;
  paymentPlan: "deposit" | "full" | undefined;
}) => {
  const departureDateTime = buildDepartureDateTime(bookingDate, departureTime);
  const flashSaleEligible = Boolean(
    flashSaleEnabled &&
      departureDateTime &&
      departureDateTime.getTime() > Date.now() &&
      departureDateTime.getTime() - Date.now() <= FLASH_SALE_WINDOW_MS,
  );

  const flashSaleDiscount = flashSaleEligible ? Math.round(baseTotalPrice * FLASH_SALE_DISCOUNT_RATE) : 0;
  const discountedTotal = Math.max(baseTotalPrice - flashSaleDiscount, 0);
  const depositAmount = paymentPlan === "deposit" ? Math.round(discountedTotal * 0.3) : 0;
  const amountDueNow = paymentPlan === "deposit" ? depositAmount : discountedTotal;

  return {
    flashSaleEligible,
    flashSaleDiscount,
    discountedTotal,
    depositAmount,
    amountDueNow,
  };
};

const addHoursWithoutOvernightWrap = (timeValue: string, hoursToAdd: number): string | null => {
  if (!isValidTime(timeValue) || !Number.isFinite(hoursToAdd) || hoursToAdd <= 0) {
    return null;
  }

  const [hoursPart, minutesPart] = String(timeValue).split(":");
  const startMinutes = Number(hoursPart) * 60 + Number(minutesPart);
  const endMinutes = startMinutes + Math.round(hoursToAdd * 60);

  if (endMinutes > 24 * 60) {
    return null;
  }

  const endHour = String(Math.floor(endMinutes / 60)).padStart(2, "0");
  const endMinute = String(endMinutes % 60).padStart(2, "0");
  return `${endHour}:${endMinute}`;
};

const addHoursAllowWrap = (timeValue: string, hoursToAdd: number): string | null => {
  if (!isValidTime(timeValue) || !Number.isFinite(hoursToAdd) || hoursToAdd <= 0) {
    return null;
  }

  const [hoursPart, minutesPart] = String(timeValue).split(":");
  const startMinutes = Number(hoursPart) * 60 + Number(minutesPart);
  const endMinutes = startMinutes + Math.round(hoursToAdd * 60);
  const normalized = ((endMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const endHour = String(Math.floor(normalized / 60)).padStart(2, "0");
  const endMinute = String(normalized % 60).padStart(2, "0");
  return `${endHour}:${endMinute}`;
};

const isSlotAvailableForRange = (
  occupiedSlots: { start: string; end: string }[],
  departureTime: string,
  packageHours: number,
): boolean => {
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

type CheckoutRequestBody = {
  boatId?: string;
  boatName?: string;
  customerEmail?: string;
  customerId?: string;
  bookingDate?: string;
  departureTime?: string;
  packageHours?: number;
  preDiscountTotal?: number;
  totalPrice?: number;
  paymentPlan?: "deposit" | "full";
  successUrl?: string;
  cancelUrl?: string;
  isPartyBooking?: boolean;
  partyEventDate?: string;
  partyEventTime?: string;
  partyTierSelected?: string;
  partyTierPrice?: number;
};

type BookingTimeRow = {
  departure_time?: string | null;
  end_time?: string | null;
  package_hours?: number | null;
  status?: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...corsHeaders } });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Supabase admin is not configured in function env" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: "Stripe is not configured in function env" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2025-02-24.acacia",
    });

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const rawBody = await req.text();
    let body: Partial<CheckoutRequestBody> = {};
    try {
      body = rawBody ? (JSON.parse(rawBody) as Partial<CheckoutRequestBody>) : {};
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

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
    } = body ?? {};

    if (!boatId || typeof boatId !== "string") {
      return new Response(
        JSON.stringify({ error: "boatId is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const { data: boatById, error: boatByIdError } = await supabaseAdmin
      .from("boats")
      .select("id, name, owner_id, price_per_day, departure_marina, flash_sale_enabled")
      .eq("id", boatId)
      .maybeSingle();

    let boat = boatById;

    if (!boat && boatName) {
      const { data: boatByName, error: boatByNameError } = await supabaseAdmin
        .from("boats")
        .select("id, name, owner_id, price_per_day, flash_sale_enabled")
        .eq("name", boatName)
        .limit(1)
        .maybeSingle();

      if (boatByName) {
        boat = boatByName;
      }

      if (!boat && boatByNameError) {
        const message = String(boatByNameError.message ?? "Boat lookup failed");
        return new Response(
          JSON.stringify({ error: `Boat lookup failed: ${message}` }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      }
    }

    if (!boat && boatByIdError) {
      const message = String(boatByIdError.message ?? "Boat lookup failed");
      return new Response(
        JSON.stringify({ error: `Boat lookup failed: ${message}` }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    if (!boat) {
      return new Response(
        JSON.stringify({ error: "Boat not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const dynamicPrice = Number(boat.price_per_day ?? 0);
    if (!Number.isFinite(dynamicPrice) || dynamicPrice <= 0) {
      return new Response(
        JSON.stringify({ error: "Boat has no valid dynamic price (expected price_per_day)" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const hasPreDiscountTotal = Number.isFinite(preDiscountTotalFromClient ?? NaN) && (preDiscountTotalFromClient ?? 0) > 0;
    const baseTotalPrice = hasPreDiscountTotal
      ? Number(preDiscountTotalFromClient)
      : (Number.isFinite(totalPriceFromClient ?? NaN) && (totalPriceFromClient ?? 0) > 0 ? Number(totalPriceFromClient) : dynamicPrice);

    const { data: ownerRaw, error: ownerError } = await supabaseAdmin
      .from("users")
      .select("id, stripe_account_id, full_name, name, email")
      .eq("id", boat.owner_id)
      .single();

    const allowPlatformFallback = String(Deno.env.get("STRIPE_ALLOW_PLATFORM_FALLBACK") ?? "true").toLowerCase() !== "false";

    const owner = ownerRaw || (allowPlatformFallback
      ? { id: boat.owner_id, stripe_account_id: null, full_name: null, name: null, email: null }
      : null);

    if ((ownerError || !owner) && !allowPlatformFallback) {
      return new Response(
        JSON.stringify({ error: "Boat owner not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const canTransferToOwner = Boolean(owner && owner.stripe_account_id);

    if (!canTransferToOwner && !allowPlatformFallback) {
      return new Response(
        JSON.stringify({ error: "Boat owner has not completed Stripe Connect onboarding" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const selectedDate: string = bookingDate ?? todayIso;
    const selectedDepartureTime: string = departureTime ?? "10:00";
    const selectedPackageHours = Math.max(1, Math.min(8, Number(packageHours ?? 1)));

    if (!isValidTime(selectedDepartureTime)) {
      return new Response(
        JSON.stringify({ error: "Invalid departure time" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const bookingEndTime = Boolean(isPartyBooking)
      ? addHoursAllowWrap(selectedDepartureTime, selectedPackageHours)
      : addHoursWithoutOvernightWrap(selectedDepartureTime, selectedPackageHours);
    if (!bookingEndTime) {
      return new Response(
        JSON.stringify({ error: "Choose a start time that keeps the trip within the same day and max 8 hours." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const {
      flashSaleEligible,
      flashSaleDiscount,
      discountedTotal,
      depositAmount,
      amountDueNow: logicalAmountDueNow,
    } = resolveFlashSalePricing({
      baseTotalPrice,
      bookingDate: selectedDate,
      departureTime: selectedDepartureTime,
      flashSaleEnabled: Boolean(boat.flash_sale_enabled),
      paymentPlan,
    });

    const amountCents = Math.round(logicalAmountDueNow * 100);
    const applicationFeeAmount = Math.round(amountCents * 0.2);
    const platformCommission = applicationFeeAmount / 100;
    const ownerPayout = Math.max(0, logicalAmountDueNow - platformCommission);

    const { data: bookingRowsForDay } = await supabaseAdmin
      .from("bookings")
      .select("departure_time, end_time, package_hours, status")
      .eq("boat_id", boat.id)
      .eq("start_date", selectedDate)
      .eq("status", "confirmed");

    const occupiedFromBookings = Array.isArray(bookingRowsForDay)
      ? bookingRowsForDay
        .map((row) => {
          const typedRow = row as BookingTimeRow;
          const dep = String(typedRow.departure_time ?? "");
          const fallbackEnd = addHoursWithoutOvernightWrap(dep, Number(typedRow.package_hours ?? 0));
          const end = String(typedRow.end_time ?? fallbackEnd ?? "");
          if (!isValidTime(dep) || !isValidTime(end)) return null;
          return { start: dep, end };
        })
        .filter((slot): slot is { start: string; end: string } => Boolean(slot))
      : [];

    const occupiedSlots = occupiedFromBookings as { start: string; end: string }[];

    if (!Boolean(isPartyBooking) && !isSlotAvailableForRange(occupiedSlots, selectedDepartureTime, selectedPackageHours)) {
      return new Response(
        JSON.stringify({ error: "Selected time slot is no longer available." }),
        { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const [hourPart, minutePart] = selectedDepartureTime.split(":").map((part) => Number(part));
    const endMinutesRaw = ((hourPart * 60) + minutePart + (selectedPackageHours * 60)) % (24 * 60);
    const endHour = String(Math.floor(endMinutesRaw / 60)).padStart(2, "0");
    const endMinute = String(endMinutesRaw % 60).padStart(2, "0");
    const selectedEndTime = `${endHour}:${endMinute}`;

    const normalizedCustomerEmail = typeof customerEmail === "string" ? customerEmail.trim().toLowerCase() : undefined;

    const holdMinutesRaw = Number(Deno.env.get("STRIPE_PENDING_HOLD_MINUTES") ?? 5);
    const holdMinutes = Number.isFinite(holdMinutesRaw) && holdMinutesRaw > 0 ? holdMinutesRaw : 5;
    const staleCutoffIso = new Date(Date.now() - (holdMinutes * 60 * 1000)).toISOString();

    await supabaseAdmin
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("boat_id", boat.id)
      .eq("start_date", selectedDate)
      .eq("status", "pending")
      .lt("created_at", staleCutoffIso)
      .is("stripe_payment_intent_id", null);

    await supabaseAdmin
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("boat_id", boat.id)
      .eq("start_date", selectedDate)
      .eq("status", "pending")
      .is("departure_time", null)
      .lt("created_at", staleCutoffIso)
      .is("stripe_payment_intent_id", null);

    const findReusablePendingBooking = async () => {
      if (normalizedCustomerEmail) {
        const { data: byEmail } = await supabaseAdmin
          .from("bookings")
          .select("id")
          .eq("boat_id", boat.id)
          .eq("start_date", selectedDate)
          .eq("departure_time", selectedDepartureTime)
          .eq("status", "pending")
          .eq("customer_email", normalizedCustomerEmail)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (byEmail) {
          return byEmail;
        }
      }

      const { data: byNullEmail } = await supabaseAdmin
        .from("bookings")
        .select("id")
        .eq("boat_id", boat.id)
        .eq("start_date", selectedDate)
        .eq("departure_time", selectedDepartureTime)
        .eq("status", "pending")
        .is("customer_email", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return byNullEmail ?? null;
    };

    let bookingRow: { id: string } | null = null;
    bookingRow = await findReusablePendingBooking();

    if (!bookingRow) {
      const ownerDisplayName = owner.full_name || owner.name || owner.email || "Owner";
      const customerNameFromEmail = normalizedCustomerEmail
        ? normalizedCustomerEmail.split("@")[0] || "Guest"
        : "Guest";
      const partyTicketCount = Math.max(1, Number(body.guests ?? 1) || 1);

      // determine end_date when the end time wraps past midnight
      let bookingEndDate = selectedDate;
      try {
        const startMinutes = toMinutes(selectedDepartureTime);
        const endMinutes = toMinutes(selectedEndTime);
        if (startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) {
          const next = new Date(`${selectedDate}T00:00:00.000Z`);
          next.setUTCDate(next.getUTCDate() + 1);
          bookingEndDate = next.toISOString().slice(0, 10);
        }
      } catch {}

      const { data: createdBooking, error: bookingError } = await supabaseAdmin
        .from("bookings")
        .insert({
          boat_id: boat.id,
          customer_id: customerId ?? null,
          customer_email: normalizedCustomerEmail ?? null,
          start_date: selectedDate,
          end_date: bookingEndDate,
          departure_time: selectedDepartureTime,
          start_time: selectedDepartureTime,
          end_time: selectedEndTime,
          package_hours: selectedPackageHours,
          guests: partyTicketCount,
          total_price: discountedTotal,
          status: "pending",
          boat_name: boat.name,
          owner_name: ownerDisplayName,
          customer_name: customerNameFromEmail,
          package_label: Boolean(isPartyBooking) ? "Party tickets" : "Stripe checkout",
          departure_marina: boat.departure_marina ?? "",
          extras: [],
          notes: "",
          payment_method: "stripe",
          payment_plan: paymentPlan || "full",
          amount_due_now: logicalAmountDueNow,
          deposit_amount: depositAmount,
          platform_commission: platformCommission,
          owner_payout: ownerPayout,
          ...(isPartyBooking ? {
            party_event_date: partyEventDate ?? null,
            party_event_time: partyEventTime ?? null,
            party_tier_selected: partyTierSelected ?? null,
            party_tier_price: partyTierPrice ?? null,
          } : {}),
        })
        .select("id")
        .single();

      if (bookingError || !createdBooking) {
        const message = bookingError?.message ?? "Failed to create pending booking";
        return new Response(
          JSON.stringify({ error: message }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      }

      if (createdBooking) {
        bookingRow = createdBooking;
      }
    }

    if (bookingRow && (customerId || normalizedCustomerEmail)) {
      try {
        await supabaseAdmin
          .from("bookings")
          .update({
            ...(customerId ? { customer_id: customerId } : {}),
            ...(normalizedCustomerEmail ? { customer_email: normalizedCustomerEmail } : {}),
          })
          .eq("id", bookingRow.id);
      } catch {
        // best-effort enrichment
      }
    }

    const appBaseUrl = Deno.env.get("APP_BASE_URL") ?? Deno.env.get("DEPLOY_PRIME_URL") ?? "https://your-deployed-netlify-site.netlify.app";

    const baseSessionPayload: Stripe.Checkout.SessionCreateParams = {
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

    const createCheckoutSession = async (mode: "connect_split" | "platform_only") => {
      const payoutMode = mode === "connect_split" ? "connect_split" : "platform_only";

      const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData =
        payoutMode === "connect_split"
          ? {
              application_fee_amount: applicationFeeAmount,
              transfer_data: {
                destination: owner.stripe_account_id!,
              },
              metadata: {
                bookingId: bookingRow.id,
                boatId: boat.id,
              },
            }
          : {
              metadata: {
                bookingId: bookingRow.id,
                boatId: boat.id,
                payoutMode: "platform_only",
              },
            };

      return stripe.checkout.sessions.create({
        ...baseSessionPayload,
        metadata: {
          boatId: boat.id,
          ownerId: owner.id,
          bookingId: bookingRow.id,
          payoutMode,
        },
        payment_intent_data: paymentIntentData,
      });
    };

    let checkoutSession: Stripe.Checkout.Session;
    let payoutMode: "connect_split" | "platform_only" = canTransferToOwner ? "connect_split" : "platform_only";
    let warning: string | null = canTransferToOwner
      ? null
      : "Owner has not completed Stripe Connect onboarding. Funds are collected on platform account.";

    try {
      checkoutSession = await createCheckoutSession(payoutMode);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create Stripe Checkout session";
      const normalized = String(message).toLowerCase();
      const isConnectDestinationError =
        normalized.includes("transfer_data") ||
        normalized.includes("destination") ||
        normalized.includes("no such account") ||
        normalized.includes("does not exist") ||
        normalized.includes("connected account") ||
        normalized.includes("acct_");

      if (payoutMode === "connect_split" && isConnectDestinationError) {
        checkoutSession = await createCheckoutSession("platform_only");
        payoutMode = "platform_only";
        warning = "Owner Stripe account is unavailable right now. Funds are collected on platform account.";
      } else {
        throw error;
      }
    }

    await supabaseAdmin
      .from("bookings")
      .update({ stripe_session_id: checkoutSession.id })
      .eq("id", bookingRow.id);

    return new Response(
      JSON.stringify({
        sessionId: checkoutSession.id,
        checkoutUrl: checkoutSession.url,
        bookingId: bookingRow.id,
        amount: logicalAmountDueNow,
        commissionAmount: platformCommission,
        ownerStripeAccountId: owner.stripe_account_id,
        payoutMode,
        warning,
        flashSaleEligible,
        flashSaleDiscount,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unexpected error";
    const stack = error instanceof Error ? error.stack : "";
    console.error("stripe-create-checkout error", errorMessage);
    console.error("Stack:", stack);
    return new Response(
      JSON.stringify({ error: errorMessage, details: stack }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
});
