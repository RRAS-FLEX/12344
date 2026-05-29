import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Content-Type": "application/json",
};

// Netlify passes the raw body as event.body (string) and provides headers.
export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) };
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!stripeSecret || !webhookSecret) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Stripe is not configured in function env" }) };
  }
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Supabase admin is not configured in function env" }) };
  }

  const stripe = new Stripe(stripeSecret, { apiVersion: "2025-02-24" });
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const signature = event.headers && (event.headers["stripe-signature"] || event.headers["Stripe-Signature"] || event.headers["stripe-signature".toLowerCase()]);
  if (!signature) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Missing Stripe signature" }) };
  }

  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body || "";

  let ev;
  try {
    ev = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid webhook payload";
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: message }) };
  }

  try {
    if (ev.type === "checkout.session.completed") {
      const session = ev.data.object;
      const bookingId = (session.metadata?.bookingId ?? null) || null;

      if (bookingId) {
        const stripeSessionId = session.id;
        const stripePaymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;

        const { data: booking } = await supabaseAdmin
          .from("bookings")
          .select("id, boat_id, boat_name, owner_name, customer_id, customer_name, customer_email, package_label, guests, start_date, end_date, departure_time, start_time, end_time, package_hours, departure_marina, extras, notes, total_price, payment_method, payment_plan, amount_due_now, deposit_amount, platform_commission, owner_payout, party_event_date, party_event_time, party_tier_selected, party_tier_price")
          .eq("id", bookingId)
          .maybeSingle();

        let updatePayload = { status: "confirmed", stripe_session_id: stripeSessionId, stripe_payment_intent_id: stripePaymentIntentId };

        if (booking) {
          const stripeEmail = (session.customer_details?.email || session.customer_email || "").trim().toLowerCase() || null;
          const stripeName = (session.customer_details?.name || "").trim() || null;
          const customerEmail = booking.customer_email || stripeEmail || "";
          const customerName = booking.customer_name || stripeName || "Guest";

          let customerId = booking.customer_id || null;
          if (!customerId && customerEmail) {
            const { data: customerUser } = await supabaseAdmin.from("users").select("id").eq("email", customerEmail).maybeSingle();
            if (customerUser) customerId = customerUser.id;
          }

          let boatName = booking.boat_name || null;
          let ownerName = booking.owner_name || null;
          let departureMarina = booking.departure_marina || null;

          if (!boatName || !ownerName || !departureMarina) {
            const { data: boat } = await supabaseAdmin.from("boats").select("name, owner_id, departure_marina").eq("id", booking.boat_id).maybeSingle();
            if (boat) {
              boatName = boatName || boat.name || null;
              departureMarina = departureMarina || boat.departure_marina || null;
              if (!ownerName && boat.owner_id) {
                const { data: owner } = await supabaseAdmin.from("users").select("full_name, name").eq("id", boat.owner_id).maybeSingle();
                if (owner) ownerName = owner.full_name || owner.name || ownerName || null;
              }
            }
          }

          const totalPrice = Number(booking.total_price ?? 0);
          const amountFromStripe = typeof session.amount_total === "number" ? session.amount_total / 100 : null;
          const resolvedTotal = totalPrice > 0 ? totalPrice : (Number.isFinite(amountFromStripe) && amountFromStripe > 0 ? amountFromStripe : 0);

          let amountDueNow = Number(booking.amount_due_now ?? 0);
          if (!Number.isFinite(amountDueNow) || amountDueNow <= 0) {
            amountDueNow = Number.isFinite(amountFromStripe) && amountFromStripe > 0 ? amountFromStripe : resolvedTotal;
          }

          let depositAmount = Number(booking.deposit_amount ?? 0);
          if (!Number.isFinite(depositAmount) || depositAmount < 0) depositAmount = 0;

          let platformCommission = Number(booking.platform_commission ?? 0);
          let ownerPayout = Number(booking.owner_payout ?? 0);

          if ((!Number.isFinite(platformCommission) || platformCommission < 0) && stripePaymentIntentId) {
            try {
              const paymentIntent = await stripe.paymentIntents.retrieve(stripePaymentIntentId);
              const fee = Number(paymentIntent.application_fee_amount ?? 0) / 100;
              if (Number.isFinite(fee) && fee >= 0) platformCommission = fee;
            } catch {}
          }

          if (!Number.isFinite(platformCommission) || platformCommission < 0) platformCommission = 0;
          if (!Number.isFinite(ownerPayout) || ownerPayout <= 0) ownerPayout = Math.max(0, resolvedTotal - platformCommission);

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
            ...(booking.party_event_date ? { party_event_date: booking.party_event_date } : {}),
            ...(booking.party_event_time ? { party_event_time: booking.party_event_time } : {}),
            ...(booking.party_tier_selected ? { party_tier_selected: booking.party_tier_selected } : {}),
            ...(booking.party_tier_price ? { party_tier_price: booking.party_tier_price } : {}),
          };

          const normalizedEmail = (customerEmail || stripeEmail || "").trim().toLowerCase();
          if (normalizedEmail) {
            try {
              const { data: existingEmail } = await supabaseAdmin.from("customer_emails").select("id").eq("booking_id", booking.id).limit(1).maybeSingle();
              if (!existingEmail) {
                let receiptUrl = null;
                if (stripePaymentIntentId) {
                  try {
                    const paymentIntent = await stripe.paymentIntents.retrieve(stripePaymentIntentId, { expand: ["latest_charge"] });
                    const latestCharge = paymentIntent.latest_charge || (paymentIntent.charges && paymentIntent.charges.data && paymentIntent.charges.data[0]) || null;
                    if (latestCharge && latestCharge.receipt_url) receiptUrl = latestCharge.receipt_url;
                  } catch {}
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
                if (receiptUrl) lines.push("", `Stripe receipt: ${receiptUrl}`);
                lines.push("", `Host: ${finalOwnerName}`, "We have also notified the owner about your confirmed booking.", "", "See you on the water,", "Nautiplex");
                const body = lines.join("\n");

                await supabaseAdmin.from("customer_emails").insert({ booking_id: booking.id, to_email: normalizedEmail, subject, preview_text: previewText, body, status: "queued" });
                if (resendApiKey) {
                  try {
                    await fetch("https://api.resend.com/emails", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}` }, body: JSON.stringify({ from: "Nautiplex Bookings <bookings@mail.nautiplex.com>", to: normalizedEmail, subject, text: body }) });
                  } catch {}
                }
              }
            } catch {}
          }
        }

        const { error } = await supabaseAdmin.from("bookings").update(updatePayload).eq("id", bookingId);
        if (error) {
          await supabaseAdmin.from("bookings").update({ status: "confirmed" }).eq("id", bookingId);
        }
      }
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ received: true }) };
  } catch (err) {
    console.error("stripe-webhook error", err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err instanceof Error ? err.message : "Unexpected error" }) };
  }
};

