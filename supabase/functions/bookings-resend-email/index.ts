// Supabase Edge Function: bookings-resend-email
// Resends a customer booking email using data from Supabase and Stripe receipt.

// @ts-nocheck
import Stripe from "https://esm.sh/stripe@16.0.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0?target=deno";

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
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Supabase admin is not configured in function env" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY is not configured in function env" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const stripe = stripeSecretKey
      ? new Stripe(stripeSecretKey, { apiVersion: "2025-02-24.acacia" })
      : null;

    const rawBody = await req.text();
    let body: any;
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const { bookingId, customerEmail: overrideEmail } = body ?? {};
    if (!bookingId || typeof bookingId !== "string") {
      return new Response(
        JSON.stringify({ error: "bookingId is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select(
        "id, boat_name, owner_name, customer_name, customer_email, package_label, guests, start_date, departure_time, departure_marina, total_price, amount_due_now, payment_plan, extras, notes, stripe_payment_intent_id",
      )
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError || !booking) {
      return new Response(
        JSON.stringify({ error: "Booking not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const normalizedEmail = (overrideEmail || booking.customer_email || "").trim().toLowerCase();
    if (!normalizedEmail) {
      return new Response(
        JSON.stringify({ error: "Booking has no customer email and none was provided." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const extrasArray = Array.isArray(booking.extras) ? booking.extras : [];
    const notesText = typeof booking.notes === "string" ? booking.notes : "";

    const extrasLine = extrasArray.length > 0 ? extrasArray.join(", ") : "No add-ons selected";
    const notesLine = notesText.trim() ? notesText.trim() : "No special requests added.";

    let receiptUrl: string | null = null;
    if (booking.stripe_payment_intent_id && stripe) {
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id, {
          expand: ["latest_charge"],
        });

        const latestCharge = paymentIntent.latest_charge as any;
        const chargeObject =
          latestCharge && typeof latestCharge === "object"
            ? latestCharge
            : paymentIntent.charges?.data?.[0] || null;

        if (chargeObject && chargeObject.receipt_url) {
          receiptUrl = chargeObject.receipt_url as string;
        }
      } catch {
        // ignore
      }
    }

    const subject = `Booking receipt: ${booking.boat_name || "Boat"} on ${booking.start_date || "your trip date"}`;
    const previewText = `Your ${booking.package_label || "boat trip"} with ${booking.owner_name || "your host"} plus Stripe receipt.`;

    const lines = [
      `Hi ${booking.customer_name || "there"},`,
      "",
      `Here are your booking details for ${booking.boat_name || "your trip"}.`,
      `Package: ${booking.package_label || "Nautiplex experience"}`,
      `Date: ${booking.start_date || "-"}`,
      `Departure time: ${booking.departure_time || "-"}`,
      `Meeting point: ${booking.departure_marina || "-"}`,
      `Guests: ${Number(booking.guests ?? 0) || 1}`,
      `Add-ons: ${extrasLine}`,
      `Special requests: ${notesLine}`,
      `Total confirmed: €${Number(booking.total_price ?? 0)}`,
      `Paid now (${booking.payment_plan === "deposit" ? "30% deposit" : "full"}): €${Number(booking.amount_due_now ?? booking.total_price ?? 0)}`,
    ];

    if (receiptUrl) {
      lines.push("", `Stripe receipt: ${receiptUrl}`);
    }

    lines.push(
      "",
      `Host: ${booking.owner_name || "your boat owner"}`,
      "We have also notified the owner about your confirmed booking.",
      "",
      "See you on the water,",
      "Nautiplex",
    );

    const emailBody = lines.join("\n");

    const { data: customerEmailRow, error: emailError } = await supabaseAdmin
      .from("customer_emails")
      .insert({
        booking_id: booking.id,
        to_email: normalizedEmail,
        subject,
        preview_text: previewText,
        body: emailBody,
        status: "queued",
      })
      .select("id")
      .single();

    if (emailError || !customerEmailRow) {
      return new Response(
        JSON.stringify({ error: emailError?.message || "Failed to queue customer email" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: "Nautiplex Bookings <bookings@mail.nautiplex.com>",
          to: normalizedEmail,
          subject,
          text: emailBody,
        }),
      });
    } catch {
      // email row remains queued
    }

    return new Response(
      JSON.stringify({ emailId: customerEmailRow.id, queued: true }),
      { status: 201, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error) {
    console.error("bookings-resend-email error", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
});

