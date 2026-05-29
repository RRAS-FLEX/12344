// Supabase Edge Function: stripe-webhook 
// Handles Stripe webhooks, confirms bookings and queues customer emails.

// @ts-nocheck
import Stripe from "https://esm.sh/stripe@16.0.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...corsHeaders } });
  }

  const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");

  if (!stripeSecret || !webhookSecret) {
    return new Response(JSON.stringify({ error: "Stripe is not configured in function env" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return new Response(JSON.stringify({ error: "Supabase admin is not configured in function env" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const stripe = new Stripe(stripeSecret, { apiVersion: "2025-02-24.acacia" });
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response(JSON.stringify({ error: "Missing Stripe signature" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid webhook payload";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const bookingId = (session.metadata?.bookingId ?? null) as string | null;

    if (bookingId) {
      const stripeSessionId = session.id;
      const stripePaymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;

      const { data: booking, error: bookingLoadError } = await supabaseAdmin
        .from("bookings")
        .select(
           "id, boat_id, boat_name, owner_name, customer_id, customer_name, customer_email, package_label, guests, start_date, end_date, departure_time, start_time, end_time, package_hours, departure_marina, extras, notes, total_price, payment_method, payment_plan, amount_due_now, deposit_amount, platform_commission, owner_payout, party_event_date, party_event_time, party_tier_selected, party_tier_price, party_ticket_code, party_ticket_count, party_ticket_status",
        )
        .eq("id", bookingId)
        .maybeSingle();

      let updatePayload: Record<string, unknown> = {
        status: "confirmed",
        stripe_session_id: stripeSessionId,
        stripe_payment_intent_id: stripePaymentIntentId,
      };

      if (!bookingLoadError && booking) {
        const stripeEmail = (session.customer_details?.email || session.customer_email || "").trim().toLowerCase() || null;
        const stripeName = (session.customer_details?.name || "").trim() || null;

        const customerEmail = booking.customer_email || stripeEmail || "";
        const customerName = booking.customer_name || stripeName || "Guest";

        let customerId = booking.customer_id || null;
        if (!customerId && customerEmail) {
          const { data: customerUser } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("email", customerEmail)
            .maybeSingle();

          if (customerUser) {
            customerId = customerUser.id;
          }
        }

        let boatName = booking.boat_name || null;
        let ownerName = booking.owner_name || null;
        let departureMarina = booking.departure_marina || null;

        if (!boatName || !ownerName || !departureMarina) {
          const { data: boat } = await supabaseAdmin
            .from("boats")
            .select("name, owner_id, departure_marina")
            .eq("id", booking.boat_id)
            .maybeSingle();

          if (boat) {
            boatName = boatName || (boat as any).name || null;
            departureMarina = departureMarina || (boat as any).departure_marina || null;

            if (!ownerName && (boat as any).owner_id) {
              const { data: owner } = await supabaseAdmin
                .from("users")
                .select("full_name, name")
                .eq("id", (boat as any).owner_id)
                .maybeSingle();

              if (owner) {
                ownerName = owner.full_name || owner.name || ownerName || null;
              }
            }
          }
        }

        const totalPrice = Number(booking.total_price ?? 0);
        const amountFromStripe = typeof session.amount_total === "number" ? session.amount_total / 100 : null;
        const resolvedTotal = totalPrice > 0
          ? totalPrice
           : (amountFromStripe !== null && Number.isFinite(amountFromStripe) && amountFromStripe > 0 ? amountFromStripe : 0);

        let amountDueNow = Number(booking.amount_due_now ?? 0);
        if (!Number.isFinite(amountDueNow) || amountDueNow <= 0) {
            amountDueNow = amountFromStripe !== null && Number.isFinite(amountFromStripe) && amountFromStripe > 0
            ? amountFromStripe
            : resolvedTotal;
        }

        let depositAmount = Number(booking.deposit_amount ?? 0);
        if (!Number.isFinite(depositAmount) || depositAmount < 0) {
          depositAmount = 0;
        }

        let platformCommission = Number(booking.platform_commission ?? 0);
        let ownerPayout = Number(booking.owner_payout ?? 0);

        if ((!Number.isFinite(platformCommission) || platformCommission < 0) && stripePaymentIntentId) {
          try {
            const paymentIntent = await stripe.paymentIntents.retrieve(stripePaymentIntentId);
            const fee = Number(paymentIntent.application_fee_amount ?? 0) / 100;
            if (Number.isFinite(fee) && fee >= 0) {
              platformCommission = fee;
            }
          } catch {
            // keep existing values
          }
        }

        if (!Number.isFinite(platformCommission) || platformCommission < 0) {
          platformCommission = 0;
        }

        if (!Number.isFinite(ownerPayout) || ownerPayout <= 0) {
          ownerPayout = Math.max(0, resolvedTotal - platformCommission);
        }

        const paymentMethod = booking.payment_method || "stripe";
        const paymentPlan = booking.payment_plan || "full";

        const safeExtras = Array.isArray(booking.extras) ? booking.extras : [];
        const safeNotes = typeof booking.notes === "string" ? booking.notes : "";

        const finalCustomerName = customerName || "Guest";
        const finalOwnerName = ownerName || booking.owner_name || "Owner";

        updatePayload = {
          ...updatePayload,
          customer_id: customerId,
          customer_email: customerEmail,
          customer_name: finalCustomerName,
          boat_name: boatName || booking.boat_name || "",
          owner_name: finalOwnerName,
          departure_marina: departureMarina || booking.departure_marina || "",
          total_price: resolvedTotal,
          payment_method: paymentMethod,
          payment_plan: paymentPlan,
          amount_due_now: amountDueNow,
          deposit_amount: depositAmount,
          platform_commission: platformCommission,
          owner_payout: ownerPayout,
          extras: safeExtras,
          notes: safeNotes,
        };

        const normalizedEmail = (customerEmail || stripeEmail || "").trim().toLowerCase();
        if (normalizedEmail) {
          try {
            const { data: existingEmail } = await supabaseAdmin
              .from("customer_emails")
              .select("id")
              .eq("booking_id", booking.id)
              .limit(1)
              .maybeSingle();

            if (!existingEmail) {
              let receiptUrl: string | null = null;
              if (stripePaymentIntentId) {
                try {
                  const paymentIntent = await stripe.paymentIntents.retrieve(stripePaymentIntentId, {
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
                  // no receipt URL
                }
              }

              const extrasLine = safeExtras.length > 0 ? safeExtras.join(", ") : "No add-ons selected";
              const notesLine = safeNotes.trim() ? safeNotes.trim() : "No special requests added.";

              const subject = `Booking receipt: ${boatName || booking.boat_name || "Boat"} on ${booking.start_date || "your trip date"}`;
              const previewText = `Your ${booking.package_label || "boat trip"} with ${finalOwnerName} plus Stripe receipt.`;

              const lines = [
                `Hi ${finalCustomerName},`,
                "",
                `Here are your booking details for ${boatName || booking.boat_name || "your trip"}.`,
                `Package: ${booking.package_label || "Nautiplex experience"}`,
                `Date: ${booking.start_date || "-"}`,
                `Departure time: ${booking.departure_time || "-"}`,
                `Meeting point: ${departureMarina || booking.departure_marina || "-"}`,
                `Guests: ${Number(booking.guests ?? 0) || 1}`,
                `Add-ons: ${extrasLine}`,
                `Special requests: ${notesLine}`,
                `Total confirmed: €${resolvedTotal}`,
                `Paid now (${paymentPlan === "deposit" ? "30% deposit" : "full"}): €${amountDueNow}`,
              ];

              if (receiptUrl) {
                lines.push("", `Stripe receipt: ${receiptUrl}`);
              }

              lines.push(
                "",
                `Host: ${finalOwnerName}`,
                "We have also notified the owner about your confirmed booking.",
                "",
                "See you on the water,",
                "Nautiplex",
              );

              const body = lines.join("\n");

              await supabaseAdmin
                .from("customer_emails")
                .insert({
                  booking_id: booking.id,
                  to_email: normalizedEmail,
                  subject,
                  preview_text: previewText,
                  body,
                  status: "queued",
                });

              if (resendApiKey) {
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
                      text: body,
                    }),
                  });
                } catch {
                  // keep queued
                }
              }
            }
          } catch {
            // best-effort email queue
          }
        }
      }

      const { error } = await supabaseAdmin
        .from("bookings")
        .update(updatePayload)
        .eq("id", bookingId);

      if (error) {
        await supabaseAdmin
          .from("bookings")
          .update({ status: "confirmed" })
          .eq("id", bookingId);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
});

