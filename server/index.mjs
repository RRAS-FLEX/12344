import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import Stripe from "stripe";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import PDFDocument from "pdfkit";
import { resolveFlashSalePricing } from "./flash-sale-pricing.mjs";
import { resolveBoatVoucherPricing } from "./booking-pricing.mjs";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const requiredEnv = [
  "STRIPE_SECRET_KEY",
  "STRIPE_PUBLISHABLE_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const hasPlaceholderValue = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized.includes("your-project") ||
    normalized.includes("your_supabase") ||
    normalized.includes("your-stripe") ||
    normalized.includes("your_stripe") ||
    normalized.includes("placeholder") ||
    normalized.includes("changeme")
  );
};

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const hasValidSupabaseAdminConfig =
  !hasPlaceholderValue(process.env.SUPABASE_URL) &&
  !hasPlaceholderValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

const hasValidStripeConfig =
  !hasPlaceholderValue(process.env.STRIPE_SECRET_KEY) &&
  !hasPlaceholderValue(process.env.STRIPE_PUBLISHABLE_KEY);

const hasValidResendConfig =
  Boolean(process.env.RESEND_API_KEY) &&
  !hasPlaceholderValue(process.env.RESEND_API_KEY);

const resendFromAddress =
  (process.env.RESEND_FROM && process.env.RESEND_FROM.trim().length > 0)
    ? process.env.RESEND_FROM.trim()
    : "onboarding@resend.dev";

const getSupabaseConfigErrorMessage = () =>
  "Supabase admin is not configured. Set real SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY values in .env/.env.local (do not use placeholder values).";

const getStripeConfigErrorMessage = () =>
  "Stripe is not configured. Set real STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY values in .env/.env.local (do not use placeholder values).";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-02-24.acacia",
});

const resend = hasValidResendConfig ? new Resend(process.env.RESEND_API_KEY) : null;

const testEmailRecipient =
  (process.env.RESEND_TEST_EMAIL && process.env.RESEND_TEST_EMAIL.trim().length > 0)
    ? process.env.RESEND_TEST_EMAIL.trim()
    : null;

const contactInboxAddress =
  (process.env.CONTACT_INBOX && process.env.CONTACT_INBOX.trim().length > 0)
    ? process.env.CONTACT_INBOX.trim()
    : (process.env.RESEND_TEST_EMAIL || "info@nautiplex.com");

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const isValidTime = (value) => TIME_REGEX.test(String(value ?? ""));

const toMinutes = (timeValue) => {
  if (!isValidTime(timeValue)) return null;
  const [h, m] = String(timeValue).split(":");
  return Number(h) * 60 + Number(m);
};

const rangesOverlap = (startA, endA, startB, endB) => startA < endB && endA > startB;

const addHoursWithoutOvernightWrap = (timeValue, hoursToAdd) => {
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

const addHoursAllowWrap = (timeValue, hoursToAdd) => {
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

const buildBookingEmailContent = ({
  booking,
  customerName,
  departureMarina,
  receiptUrl,
}) => {
  const name = customerName || booking.customer_name || "Guest";
  const boatName = booking.boat_name || "Your boat";
  const startDate = booking.start_date || new Date().toISOString().slice(0, 10);
  const marina = departureMarina || booking.departure_marina || "Departure marina";

  const total = Number(booking.total_price ?? 0) || 0;
  const paidNow = Number(booking.amount_due_now ?? total) || 0;
  const remaining = Math.max(0, total - paidNow);

  const formattedDate = new Date(startDate).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const subject = `Booking confirmed: ${boatName} on ${formattedDate}`;
  const previewText = `Your Nautiplex booking for ${boatName} on ${formattedDate} is confirmed.`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #2D3748; margin: 0; padding: 0; background-color: #f9fafb;">
        <div style="max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #E2E8F0; border-radius: 8px; background-color: #ffffff;">
          <div style="text-align: center; border-bottom: 2px solid #3182CE; padding-bottom: 20px;">
            <img src="http://desk-jojos.tail9d3e44.ts.net:8080/nautiplex_logo.png" 
                 alt="NAUTIPLEX" 
                 style="height: 60px; width: auto;" />
          </div>

          <div style="background-color: #F7FAFC; padding: 30px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <h1 style="margin:0; font-size: 24px; color: #2D3748;">Booking Confirmed!</h1>
            <p style="color: #718096; font-size: 16px;">Get ready to set sail, ${name}.</p>
          </div>

          <h2 style="font-size: 18px; color: #3182CE; border-bottom: 1px solid #EDF2F7; padding-bottom: 8px;">Trip Overview</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 12px 0; font-weight: bold; color: #4A5568; width: 40%;">Boat</td><td style="padding: 12px 0;">${boatName}</td></tr>
            <tr><td style="padding: 12px 0; font-weight: bold; color: #4A5568;">Date</td><td style="padding: 12px 0;">${formattedDate}</td></tr>
            <tr><td style="padding: 12px 0; font-weight: bold; color: #4A5568;">Marina</td><td style="padding: 12px 0;">${marina}</td></tr>
          </table>

          <h2 style="font-size: 18px; color: #3182CE; border-bottom: 1px solid #EDF2F7; padding-bottom: 8px; margin-top: 30px;">Payment Summary</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 12px 0; font-weight: bold; color: #4A5568;">Total Price</td><td style="padding: 12px 0;">€${total.toFixed(2)}</td></tr>
            <tr><td style="padding: 12px 0; font-weight: bold; color: #4A5568;">Amount Paid Now</td><td style="padding: 12px 0; color: #38A169; font-weight: bold;">€${paidNow.toFixed(2)}</td></tr>
            <tr><td style="padding: 12px 0; font-weight: bold; color: #4A5568;">Remaining Balance</td><td style="padding: 12px 0;">€${remaining.toFixed(2)}</td></tr>
          </table>

          ${receiptUrl
            ? `<p style="margin-top: 16px; font-size: 14px;">Stripe receipt: <a href="${receiptUrl}" style="color: #3182CE;">View payment receipt</a></p>`
            : ""}

          <div style="text-align: center; margin: 40px 0;">
            <a href="https://nautiplex.com/my-bookings" style="background-color: #3182CE; color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Manage My Booking</a>
          </div>

          <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #E2E8F0;">
            <p style="font-size: 14px; font-weight: bold; color: #4A5568; margin: 0;">Nautiplex Boat Rentals</p>
            <p style="font-size: 12px; color: #A0AEC0; margin: 5px 0;">Athens, Greece &bull; Support: info@nautiplex.com</p>
            <p style="font-size: 11px; color: #CBD5E0; margin-top: 20px;">
              You received this email because you made a booking on nautiplex.com.<br />
              &copy; 2026 Nautiplex. All rights reserved.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  const lines = [
    `Hi ${name},`,
    "",
    `Your Nautiplex booking for ${boatName} is confirmed.`,
    `Date: ${formattedDate}`,
    `Marina: ${marina}`,
    `Total: €${total.toFixed(2)}`,
    `Paid now: €${paidNow.toFixed(2)}`,
    `Remaining: €${remaining.toFixed(2)}`,
  ];

  if (receiptUrl) {
    lines.push("", `Stripe receipt: ${receiptUrl}`);
  }

  lines.push(
    "",
    "See you on the water,",
    "Nautiplex",
  );

  const text = lines.join("\n");

  return { subject, previewText, html, text };
};

const buildOwnerBookingEmailContent = ({
  booking,
  ownerName,
  receiptUrl,
}) => {
  const safeOwnerName = ownerName || booking.owner_name || "Owner";
  const guestName = booking.customer_name || "Guest";
  const boatName = booking.boat_name || "Your boat";
  const startDate = booking.start_date || new Date().toISOString().slice(0, 10);
  const marina = booking.departure_marina || "Departure marina";

  const total = Number(booking.total_price ?? 0) || 0;
  const paidNow = Number(booking.amount_due_now ?? total) || 0;
  const ownerPayout = Number(booking.owner_payout ?? 0) || 0;

  const formattedDate = new Date(startDate).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const subject = `New Nautiplex booking for ${boatName} on ${formattedDate}`;
  const previewText = `${guestName} just booked ${boatName} for ${formattedDate}.`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #2D3748; margin: 0; padding: 0; background-color: #f9fafb;">
        <div style="max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #E2E8F0; border-radius: 8px; background-color: #ffffff;">
          <div style="text-align: center; border-bottom: 2px solid #3182CE; padding-bottom: 20px;">
            <img src="http://desk-jojos.tail9d3e44.ts.net:8080/nautiplex_logo.png" 
                 alt="NAUTIPLEX" 
                 style="height: 60px; width: auto;" />
          </div>

          <div style="background-color: #EBF8FF; padding: 24px; text-align: left; border-radius: 8px; margin: 20px 0;">
            <h1 style="margin:0; font-size: 20px; color: #2D3748;">New booking on Nautiplex</h1>
            <p style="color: #4A5568; font-size: 14px; margin-top: 8px;">Hi ${safeOwnerName},</p>
            <p style="color: #4A5568; font-size: 14px;">${guestName} just booked <strong>${boatName}</strong> for <strong>${formattedDate}</strong>.</p>
          </div>

          <h2 style="font-size: 16px; color: #3182CE; border-bottom: 1px solid #EDF2F7; padding-bottom: 6px;">Trip details</h2>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr><td style="padding: 8px 0; font-weight: bold; color: #4A5568; width: 40%;">Boat</td><td style="padding: 8px 0;">${boatName}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold; color: #4A5568;">Date</td><td style="padding: 8px 0;">${formattedDate}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold; color: #4A5568;">Marina</td><td style="padding: 8px 0;">${marina}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold; color: #4A5568;">Guest</td><td style="padding: 8px 0;">${guestName}</td></tr>
          </table>

          <h2 style="font-size: 16px; color: #3182CE; border-bottom: 1px solid #EDF2F7; padding-bottom: 6px; margin-top: 24px;">Payout overview</h2>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr><td style="padding: 8px 0; font-weight: bold; color: #4A5568;">Total price</td><td style="padding: 8px 0;">€${total.toFixed(2)}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold; color: #4A5568;">Paid now</td><td style="padding: 8px 0;">€${paidNow.toFixed(2)}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold; color: #4A5568;">Estimated payout</td><td style="padding: 8px 0; font-weight: bold; color: #2F855A;">€${ownerPayout.toFixed(2)}</td></tr>
          </table>

          ${receiptUrl
            ? `<p style="margin-top: 12px; font-size: 13px;">Stripe receipt: <a href="${receiptUrl}" style="color: #3182CE;">View payment receipt</a></p>`
            : ""}

          <p style="margin-top: 24px; font-size: 13px; color: #4A5568;">
            You can review booking details and coordinate with the guest from your Nautiplex owner dashboard.
          </p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="https://nautiplex.com/owner-dashboard" style="background-color: #3182CE; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 14px;">Open owner dashboard</a>
          </div>

          <div style="text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #E2E8F0;">
            <p style="font-size: 13px; font-weight: bold; color: #4A5568; margin: 0;">Nautiplex Boat Rentals</p>
            <p style="font-size: 11px; color: #A0AEC0; margin: 6px 0;">Athens, Greece • Owner support: info@nautiplex.com</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const textLines = [
    `Hi ${safeOwnerName},`,
    "",
    `${guestName} just booked ${boatName} on ${formattedDate}.`,
    `Marina: ${marina}`,
    `Total price: €${total.toFixed(2)}`,
    `Paid now: €${paidNow.toFixed(2)}`,
    `Estimated payout: €${ownerPayout.toFixed(2)}`,
  ];

  if (receiptUrl) {
    textLines.push("", `Stripe receipt: ${receiptUrl}`);
  }

  textLines.push(
    "",
    "You can review this booking from your Nautiplex owner dashboard.",
    "",
    "See you on the water,",
    "Nautiplex team",
  );

  const text = textLines.join("\n");

  return { subject, previewText, html, text };
};

const generateReceiptPdfBuffer = ({
  booking,
  receiptUrl,
}) => {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks = [];

  doc.on("data", (chunk) => chunks.push(chunk));

  doc.fontSize(20).text("Nautiplex Booking Receipt", { align: "center" });
  doc.moveDown();

  doc.fontSize(12).text(`Booking ID: ${booking.id}`);
  doc.text(`Boat: ${booking.boat_name || "N/A"}`);
  doc.text(`Guest: ${booking.customer_name || "Guest"}`);
  doc.text(`Email: ${booking.customer_email || ""}`);
  doc.text(`Date: ${booking.start_date || "N/A"}`);
  doc.text(`Marina: ${booking.departure_marina || "N/A"}`);
  doc.moveDown();

  const total = Number(booking.total_price ?? 0) || 0;
  const paidNow = Number(booking.amount_due_now ?? total) || 0;
  const ownerPayout = Number(booking.owner_payout ?? 0) || 0;

  doc.fontSize(12).text(`Total price: €${total.toFixed(2)}`);
  doc.text(`Amount paid now: €${paidNow.toFixed(2)}`);
  doc.text(`Estimated owner payout: €${ownerPayout.toFixed(2)}`);

  if (receiptUrl) {
    doc.moveDown();
    doc.text(`Stripe receipt: ${receiptUrl}`, { link: receiptUrl, underline: true });
  }

  doc.moveDown(2);
  doc.fontSize(10).fillColor("#718096").text("Thank you for booking with Nautiplex.", { align: "center" });

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on("end", () => {
      try {
        const buffer = Buffer.concat(chunks);
        resolve(buffer);
      } catch (error) {
        reject(error);
      }
    });

    doc.on("error", (error) => {
      reject(error);
    });
  });
};

const getBearerToken = (req) => {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || Array.isArray(header)) {
    return null;
  }

  const [scheme, token] = String(header).split(" ");
  if (!token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token.trim() || null;
};

const requireSupabaseUser = async (req, res, next) => {
  if (!hasValidSupabaseAdminConfig) {
    return res.status(500).json({ error: getSupabaseConfigErrorMessage() });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "Missing Supabase access token" });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: "Invalid Supabase access token" });
    }

    req.supabaseUser = data.user;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid Supabase access token" });
  }
};

const requireOwnerRole = async (req, res, next) => {
  const user = req.supabaseUser;
  if (!user) {
    return res.status(500).json({ error: "Supabase user context is missing" });
  }

  const { data: profile, error } = await supabaseAdmin
    .from("users")
    .select("id, is_owner")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    return res.status(403).json({ error: "Owner profile not found" });
  }

  if (!profile.is_owner) {
    return res.status(403).json({ error: "Only boat owners can perform this action" });
  }

  req.ownerProfile = profile;
  return next();
};

const normalizeEmail = (value) => String(value ?? "").trim().toLowerCase();

const requireBookingOwnerAccess = async (req, res, next) => {
  const user = req.supabaseUser;
  if (!user) {
    return res.status(500).json({ error: "Supabase user context is missing" });
  }

  const bookingId = String(req.body?.bookingId ?? req.query?.bookingId ?? "").trim();
  if (!bookingId) {
    return res.status(400).json({ error: "Missing bookingId" });
  }

  const { data: booking, error } = await supabaseAdmin
    .from("bookings")
    .select("id, customer_id, customer_email")
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !booking) {
    return res.status(404).json({ error: "Booking not found" });
  }

  const userEmail = normalizeEmail(user.email);
  const bookingEmail = normalizeEmail(booking.customer_email);
  const ownsById = Boolean(booking.customer_id && booking.customer_id === user.id);
  const ownsByEmail = Boolean(userEmail && bookingEmail && userEmail === bookingEmail);

  if (!ownsById && !ownsByEmail) {
    return res.status(403).json({ error: "You are not allowed to access this booking." });
  }

  req.bookingRow = booking;
  return next();
};

const app = express();
const port = Number(process.env.API_PORT ?? 4242);

app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? true,
  credentials: false,
}));

app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(500).json({ error: "STRIPE_WEBHOOK_SECRET is not configured." });
  }

  const signature = req.headers["stripe-signature"];
  if (!signature || Array.isArray(signature)) {
    return res.status(400).json({ error: "Missing Stripe signature." });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid webhook payload";
    return res.status(400).json({ error: message });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const bookingId = session.metadata?.bookingId;

    if (bookingId) {
      const stripeSessionId = session.id;
      const stripePaymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;

      // Load the current booking so we can hydrate missing fields on confirmation.
      const { data: booking, error: bookingLoadError } = await supabaseAdmin
        .from("bookings")
        .select(
           "id, boat_id, boat_name, owner_name, customer_id, customer_name, customer_email, package_label, guests, start_date, end_date, departure_time, start_time, end_time, package_hours, departure_marina, extras, notes, total_price, payment_method, payment_plan, amount_due_now, deposit_amount, platform_commission, owner_payout, party_event_date, party_event_time, party_tier_selected, party_tier_price, party_ticket_code, party_ticket_count, party_ticket_status",
        )
        .eq("id", bookingId)
        .maybeSingle();

      let updatePayload = {
        status: "confirmed",
        stripe_session_id: stripeSessionId,
        stripe_payment_intent_id: stripePaymentIntentId,
      };

      let ownerEmail = null;
      let ownerId = null;

      if (!bookingLoadError && booking) {
        // Derive customer fields from Stripe if missing.
        const stripeEmail = (session.customer_details?.email || session.customer_email || "").trim().toLowerCase() || null;
        const stripeName = (session.customer_details?.name || "").trim() || null;

        const customerEmail = booking.customer_email || stripeEmail || "";
        const customerName = booking.customer_name || stripeName || "Guest";

        // Try to backfill customer_id from users table when missing but we have an email.
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

        // Ensure boat and owner info is present.
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
            boatName = boatName || boat.name || null;
            departureMarina = departureMarina || boat.departure_marina || null;

            if (boat.owner_id) {
              ownerId = boat.owner_id;
              const { data: owner } = await supabaseAdmin
                .from("users")
                .select("full_name, name, email")
                .eq("id", boat.owner_id)
                .maybeSingle();

              if (owner) {
                ownerName = ownerName || owner.full_name || owner.name || null;
                ownerEmail = owner.email || ownerEmail;
              }
            }
          }
        }

        // Monetary fields – keep stored total_price as the full trip value
        // and use Stripe totals only as a fallback when missing.
        const totalPrice = Number(booking.total_price ?? 0);
        const amountFromStripe = typeof session.amount_total === "number" ? session.amount_total / 100 : null;
        const resolvedTotal = totalPrice > 0
          ? totalPrice
          : (Number.isFinite(amountFromStripe) && amountFromStripe > 0 ? amountFromStripe : 0);

        let amountDueNow = Number(booking.amount_due_now ?? 0);
        if (!Number.isFinite(amountDueNow) || amountDueNow <= 0) {
          amountDueNow = Number.isFinite(amountFromStripe) && amountFromStripe > 0
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
            // If Stripe lookup fails, keep existing values or fall back later.
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

        // Queue customer confirmation email with Stripe receipt via customer_emails table.
        const normalizedEmail = (customerEmail || stripeEmail || "").trim().toLowerCase();
        if (normalizedEmail) {
          try {
            const { data: existingEmail } = await supabaseAdmin
              .from("customer_emails")
              .select("id")
              .eq("booking_id", booking.id)
              .limit(1)
              .maybeSingle();

            let receiptUrl = null;

            if (!existingEmail) {
              if (stripePaymentIntentId && hasValidStripeConfig) {
                try {
                  const paymentIntent = await stripe.paymentIntents.retrieve(stripePaymentIntentId, {
                    expand: ["latest_charge"],
                  });

                  const latestCharge = paymentIntent.latest_charge;
                  const chargeObject =
                    latestCharge && typeof latestCharge === "object"
                      ? latestCharge
                      : paymentIntent.charges?.data?.[0] || null;

                  if (chargeObject && chargeObject.receipt_url) {
                    receiptUrl = chargeObject.receipt_url;
                  }
                } catch {
                  // If Stripe lookup fails, continue without a receipt URL.
                }
              }

              const { subject, previewText, html, text } = buildBookingEmailContent({
                booking: {
                  ...booking,
                  boat_name: boatName || booking.boat_name,
                  departure_marina: departureMarina || booking.departure_marina,
                  total_price: resolvedTotal,
                  amount_due_now: amountDueNow,
                },
                customerName: finalCustomerName,
                departureMarina,
                receiptUrl,
              });

              await supabaseAdmin
                .from("customer_emails")
                .insert({
                  booking_id: booking.id,
                  to_email: normalizedEmail,
                  subject,
                  preview_text: previewText,
                  body: text,
                  status: "queued",
                });

              if (resend && hasValidResendConfig) {
                try {
                  const { data: resendData, error: resendError } = await resend.emails.send({
                    from: resendFromAddress,
                    to: testEmailRecipient || normalizedEmail,
                    subject,
                    text,
                    html,
                  });

                  if (resendError) {
                    console.error("Resend send error in Stripe webhook", resendError);
                  } else {
                    console.log("Resend email queued in Stripe webhook", resendData);
                  }
                } catch (error) {
                  console.error("Resend send failed in Stripe webhook", error);
                  // Email remains queued for fallback processing.
                }
              }
            }

            // Send an owner notification email (does not depend on existing customer_emails row).
            if (ownerEmail && resend && hasValidResendConfig) {
              try {
                const { subject: ownerSubject, previewText: ownerPreview, html: ownerHtml, text: ownerText } = buildOwnerBookingEmailContent({
                  booking: {
                    ...booking,
                    boat_name: boatName || booking.boat_name,
                    departure_marina: departureMarina || booking.departure_marina,
                    total_price: resolvedTotal,
                    amount_due_now: amountDueNow,
                    owner_payout: ownerPayout,
                  },
                  ownerName: finalOwnerName,
                  receiptUrl,
                });

                const ownerAddress = ownerEmail.trim().toLowerCase();
                if (ownerAddress) {
                  const { error: ownerResendError } = await resend.emails.send({
                    from: resendFromAddress,
                    to: testEmailRecipient || ownerAddress,
                    subject: ownerSubject,
                    text: ownerText,
                    html: ownerHtml,
                  });

                  if (ownerResendError) {
                    console.error("Resend send error in Stripe webhook (owner email)", ownerResendError);
                  }
                }
              } catch (error) {
                console.error("Owner email send failed in Stripe webhook", error);
              }
            }
          } catch {
            // If queuing email fails, do not fail the webhook; booking is already confirmed.
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

      // Generate and store a PDF receipt in Supabase Storage (best-effort).
      try {
        const safeBoatName = String(booking?.boat_name || boatName || "boat")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "boat";

        const buffer = await generateReceiptPdfBuffer({
          booking: {
            ...booking,
            boat_name: boatName || booking?.boat_name,
            departure_marina: departureMarina || booking?.departure_marina,
            total_price: resolvedTotal,
            amount_due_now: amountDueNow,
            owner_payout: ownerPayout,
          },
          receiptUrl: null,
        });

        const receiptsPathOwner = ownerId || "unknown-owner";
        const objectPath = `${receiptsPathOwner}/${safeBoatName}/${bookingId}.pdf`;

        await supabaseAdmin.storage
          .from("payment-receipts")
          .upload(objectPath, buffer, {
            contentType: "application/pdf",
            upsert: true,
          });
      } catch (error) {
        console.error("Failed to generate or upload booking receipt PDF", error);
      }

      // No calendar_events writes here; Stripe confirmation only updates bookings.
    }
  }

  return res.json({ received: true });
});

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

const contactMessageSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  topic: z.string().min(1).max(64),
  message: z.string().min(1).max(4000),
  pageUrl: z.string().url().optional().nullable(),
});

app.post("/api/contact-messages", async (req, res) => {
  if (!hasValidSupabaseAdminConfig) {
    return res.status(500).json({ error: getSupabaseConfigErrorMessage() });
  }

  const parsed = contactMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
  }

  const { name, email, topic, message, pageUrl } = parsed.data;

  try {
    const { error } = await supabaseAdmin
      .from("contact_messages")
      .insert({
        name,
        email,
        topic,
        message,
        page_url: pageUrl || null,
      });

    if (error) {
      throw new Error(error.message || "Failed to store contact message");
    }

    if (resend && hasValidResendConfig && contactInboxAddress) {
      try {
        const { error: contactError } = await resend.emails.send({
          from: resendFromAddress,
          to: testEmailRecipient || contactInboxAddress,
          subject: `[Nautiplex contact] ${topic} — ${name}`,
          text: `From: ${name} <${email}>\nTopic: ${topic}\nPage: ${pageUrl || "(not provided)"}\n\n${message}`,
        });

        if (contactError) {
          console.error("Resend send error in contact-messages", contactError);
        }
      } catch (error) {
        console.error("Resend send failed in contact-messages", error);
      }
    }

    return res.status(201).json({ ok: true });
  } catch (error) {
    const messageOut = error instanceof Error ? error.message : "Failed to handle contact message";
    return res.status(500).json({ error: messageOut });
  }
});

app.get("/api/stripe/config", (_req, res) => {
  res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
});

const createConnectAccountSchema = z.object({
  ownerId: z.string().min(1),
  email: z.string().email().optional(),
  country: z.string().length(2).optional(),
});

app.post("/api/stripe/connect/accounts", requireSupabaseUser, requireOwnerRole, async (req, res) => {
  if (!hasValidStripeConfig) {
    return res.status(500).json({ error: getStripeConfigErrorMessage() });
  }

  if (!hasValidSupabaseAdminConfig) {
    return res.status(500).json({ error: getSupabaseConfigErrorMessage() });
  }

  const parsed = createConnectAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
  }

  const { email, country } = parsed.data;
  const ownerId = req.ownerProfile?.id || req.supabaseUser.id;

  const { data: owner, error: ownerError } = await supabaseAdmin
    .from("users")
    .select("id, email, stripe_account_id")
    .eq("id", ownerId)
    .single();

  if (ownerError || !owner) {
    return res.status(404).json({ error: "Owner not found" });
  }

  if (owner.stripe_account_id) {
    return res.json({ stripeAccountId: owner.stripe_account_id, alreadyExists: true });
  }

  try {
    const account = await stripe.accounts.create({
      type: "express",
      country: (country ?? "GR").toUpperCase(),
      email: email ?? owner.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({ stripe_account_id: account.id })
      .eq("id", ownerId);

    if (updateError) {
      return res.status(500).json({ error: `Failed to persist stripe account id: ${updateError.message}` });
    }

    return res.status(201).json({ stripeAccountId: account.id, alreadyExists: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create Stripe Connect account";
    return res.status(500).json({ error: message });
  }
});

const onboardingLinkSchema = z.object({
  ownerId: z.string().min(1),
  refreshUrl: z.string().url(),
  returnUrl: z.string().url(),
});

app.post("/api/stripe/connect/onboarding-link", requireSupabaseUser, requireOwnerRole, async (req, res) => {
  if (!hasValidStripeConfig) {
    return res.status(500).json({ error: getStripeConfigErrorMessage() });
  }

  if (!hasValidSupabaseAdminConfig) {
    return res.status(500).json({ error: getSupabaseConfigErrorMessage() });
  }

  const parsed = onboardingLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
  }

  const { refreshUrl, returnUrl } = parsed.data;
  const ownerId = req.ownerProfile?.id || req.supabaseUser.id;

  const { data: owner, error: ownerError } = await supabaseAdmin
    .from("users")
    .select("stripe_account_id")
    .eq("id", ownerId)
    .single();

  if (ownerError || !owner) {
    return res.status(404).json({ error: "Owner not found" });
  }

  if (!owner.stripe_account_id) {
    return res.status(400).json({ error: "Owner does not have a Stripe Connect account yet." });
  }

  try {
    const link = await stripe.accountLinks.create({
      account: owner.stripe_account_id,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    return res.json({ url: link.url, expiresAt: link.expires_at });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create onboarding link";
    return res.status(500).json({ error: message });
  }
});

app.get("/api/stripe/connect/status", requireSupabaseUser, requireOwnerRole, async (req, res) => {
  if (!hasValidStripeConfig) {
    return res.status(500).json({ error: getStripeConfigErrorMessage() });
  }

  if (!hasValidSupabaseAdminConfig) {
    return res.status(500).json({ error: getSupabaseConfigErrorMessage() });
  }

  const ownerId = req.ownerProfile?.id || req.supabaseUser.id;

  const { data: owner, error: ownerError } = await supabaseAdmin
    .from("users")
    .select("stripe_account_id, stripe_payouts_ready")
    .eq("id", ownerId)
    .single();

  if (ownerError || !owner) {
    return res.status(404).json({ error: "Owner not found" });
  }

  if (!owner.stripe_account_id) {
    return res.json({
      hasAccount: false,
      isReady: Boolean(owner.stripe_payouts_ready ?? false),
      stripeAccountId: null,
      detailsSubmitted: false,
      chargesEnabled: false,
      payoutsEnabled: false,
    });
  }

  try {
    const account = await stripe.accounts.retrieve(owner.stripe_account_id);
    const detailsSubmitted = Boolean(account.details_submitted);
    const chargesEnabled = Boolean(account.charges_enabled);
    const payoutsEnabled = Boolean(account.payouts_enabled);

    const isReady = detailsSubmitted && chargesEnabled && payoutsEnabled;

    if (isReady && !owner.stripe_payouts_ready) {
      await supabaseAdmin
        .from("users")
        .update({ stripe_payouts_ready: true })
        .eq("id", ownerId);
    }

    return res.json({
      hasAccount: true,
      isReady,
      stripeAccountId: account.id,
      detailsSubmitted,
      chargesEnabled,
      payoutsEnabled,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Stripe Connect status";
    const normalized = String(message).toLowerCase();
    const isUnknownAccount =
      normalized.includes("no such account") ||
      normalized.includes("does not exist") ||
      normalized.includes("acct_");

    if (isUnknownAccount) {
      await supabaseAdmin
        .from("users")
        .update({ stripe_account_id: null, stripe_payouts_ready: false })
        .eq("id", ownerId);

      return res.json({
        hasAccount: false,
        isReady: false,
        stripeAccountId: null,
        detailsSubmitted: false,
        chargesEnabled: false,
        payoutsEnabled: false,
      });
    }

    return res.status(500).json({ error: message });
  }
});

const updateOwnerBookingStatusSchema = z.object({
  status: z.enum(["confirmed", "completed", "cancelled"]),
});

app.post("/api/owner/bookings/:bookingId/status", requireSupabaseUser, requireOwnerRole, async (req, res) => {
  if (!hasValidSupabaseAdminConfig) {
    return res.status(500).json({ error: getSupabaseConfigErrorMessage() });
  }

  const bookingId = String(req.params.bookingId || "").trim();
  if (!bookingId) {
    return res.status(400).json({ error: "Missing bookingId in path" });
  }

  const parsed = updateOwnerBookingStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
  }

  const { status } = parsed.data;
  const ownerProfile = req.ownerProfile;

  try {
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("id, boat_id, status")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError) {
      return res.status(500).json({ error: bookingError.message || "Failed to load booking" });
    }

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const { data: boat, error: boatError } = await supabaseAdmin
      .from("boats")
      .select("owner_id")
      .eq("id", booking.boat_id)
      .maybeSingle();

    if (boatError) {
      return res.status(500).json({ error: boatError.message || "Failed to load boat" });
    }

    if (!boat || !boat.owner_id || boat.owner_id !== ownerProfile.id) {
      return res.status(403).json({ error: "You can only manage bookings on your own boats" });
    }

    const { error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", bookingId);

    if (updateError) {
      return res.status(500).json({ error: updateError.message || "Failed to update booking status" });
    }

    return res.json({ ok: true, bookingId, status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error updating booking status";
    return res.status(500).json({ error: message });
  }
});

const createCheckoutSchema = z.object({
  boatId: z.string().min(1),
  boatName: z.string().min(1).optional(),
  customerEmail: z.string().email().optional(),
  customerId: z.string().uuid().optional(),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  departureTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  packageHours: z.number().min(1).max(8).optional(),
  guests: z.number().min(1).max(100).optional(),
  // Pricing context from the booking page
  preDiscountTotal: z.number().min(1).optional(),
  totalPrice: z.number().min(1).optional(),
  amountDueNow: z.number().min(1).optional(),
  paymentPlan: z.enum(["deposit", "full"]).optional(),
  depositAmount: z.number().min(0).optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  // Party booking fields
  isPartyBooking: z.boolean().optional(),
  partyEventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  partyEventTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  partyTierSelected: z.string().optional(),
  partyTierPrice: z.number().min(0).optional(),
});

app.post("/api/stripe/create-checkout", async (req, res) => {
  if (!hasValidStripeConfig) {
    return res.status(500).json({ error: getStripeConfigErrorMessage() });
  }

  if (!hasValidSupabaseAdminConfig) {
    return res.status(500).json({ error: getSupabaseConfigErrorMessage() });
  }

  const parsed = createCheckoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
  }

  const {
    boatId,
    boatName,
    customerEmail,
    customerId,
    bookingDate,
    departureTime,
    packageHours,
    guests,
    preDiscountTotal: preDiscountTotalFromClient,
    totalPrice: totalPriceFromClient,
    paymentPlan,
    successUrl,
    cancelUrl,
    isPartyBooking: isPartyBookingFromClient,
    partyEventDate,
    partyEventTime,
    partyTierSelected,
    partyTierPrice,
  } = parsed.data;

  let resolvedCustomerId = customerId ?? null;
  if (!resolvedCustomerId) {
    const token = getBearerToken(req);
    if (token) {
      try {
        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (!error && data?.user?.id) {
          resolvedCustomerId = data.user.id;
        }
      } catch {
        // If token inspection fails, continue without attaching customer_id.
      }
    }
  }

  const { data: boatById, error: boatByIdError } = await supabaseAdmin
    .from("boats")
    .select("id, name, owner_id, price_per_day, departure_marina, flash_sale_enabled, type")
    .eq("id", boatId)
    .maybeSingle();

  let boat = boatById;

  if (!boat && boatName) {
    const { data: boatByName, error: boatByNameError } = await supabaseAdmin
      .from("boats")
      .select("id, name, owner_id, price_per_day, flash_sale_enabled, type")
      .eq("name", boatName)
      .limit(1)
      .maybeSingle();

    if (boatByName) {
      boat = boatByName;
    }

    if (!boat && boatByNameError) {
      const message = String(boatByNameError.message ?? "Boat lookup failed");
      const normalized = message.toLowerCase();
      if (normalized.includes("fetch failed") || normalized.includes("network") || normalized.includes("failed to fetch")) {
        return res.status(500).json({
          error: `${message}. ${getSupabaseConfigErrorMessage()}`,
        });
      }

      return res.status(500).json({ error: `Boat lookup failed: ${message}` });
    }
  }

  if (!boat && boatByIdError) {
    const message = String(boatByIdError.message ?? "Boat lookup failed");
    const normalized = message.toLowerCase();
    if (normalized.includes("fetch failed") || normalized.includes("network") || normalized.includes("failed to fetch")) {
      return res.status(500).json({
        error: `${message}. ${getSupabaseConfigErrorMessage()}`,
      });
    }

    if (normalized.includes("invalid input syntax") || normalized.includes("not found") || normalized.includes("no rows")) {
      return res.status(404).json({ error: "Boat not found" });
    }

    return res.status(500).json({ error: `Boat lookup failed: ${message}` });
  }

  if (!boat) {
    return res.status(404).json({ error: "Boat not found" });
  }

  const dynamicPrice = Number(boat.price_per_day ?? 0);
  if (!Number.isFinite(dynamicPrice) || dynamicPrice <= 0) {
    return res.status(400).json({ error: "Boat has no valid dynamic price (expected price_per_day)" });
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

  const allowPlatformFallback = String(process.env.STRIPE_ALLOW_PLATFORM_FALLBACK ?? "true").toLowerCase() !== "false";

  // If the owner row is missing but platform fallback is allowed, proceed with platform-only payout
  // instead of failing Stripe checkout. This is useful for demo data or partially seeded boats.
  const owner = ownerRaw || (allowPlatformFallback
    ? { id: boat.owner_id, stripe_account_id: null, full_name: null, name: null, email: null }
    : null);

  if ((ownerError || !owner) && !allowPlatformFallback) {
    return res.status(404).json({ error: "Boat owner not found" });
  }

  const canTransferToOwner = Boolean(owner && owner.stripe_account_id);

  if (!canTransferToOwner && !allowPlatformFallback) {
    return res.status(400).json({ error: "Boat owner has not completed Stripe Connect onboarding" });
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const selectedDate = bookingDate ?? todayIso;
  const selectedDepartureTime = departureTime ?? "10:00";
  const selectedPackageHours = Math.max(1, Math.min(8, Number(packageHours ?? 1)));

  if (!isValidTime(selectedDepartureTime)) {
    return res.status(400).json({ error: "Invalid departure time" });
  }

  const bookingEndTime = Boolean(boat.party_ready)
    ? addHoursAllowWrap(selectedDepartureTime, selectedPackageHours)
    : addHoursWithoutOvernightWrap(selectedDepartureTime, selectedPackageHours);
  if (!bookingEndTime) {
    return res.status(400).json({ error: "Choose a start time that keeps the trip within the same day and max 8 hours." });
  }

    const {
      subtotalAfterVoucher,
      flashSaleEligible,
      flashSaleDiscount,
      discountedTotal,
      depositAmount,
      amountDueNow: logicalAmountDueNow,
    } = resolveBoatVoucherPricing({
      baseTotalPrice,
      bookingDate: selectedDate,
      departureTime: selectedDepartureTime,
      flashSaleEnabled: Boolean(boat.flash_sale_enabled),
      paymentPlan,
  });

  const amountCents = Math.round(logicalAmountDueNow * 100);
  // Platform commission is fixed at 20% of the charged amount.
  const applicationFeeAmount = Math.round(amountCents * 0.2);
  const platformCommission = applicationFeeAmount / 100;
  const ownerPayout = Math.max(0, logicalAmountDueNow - platformCommission);
  const isPartyBooking = Boolean(boat.party_ready);
  const partyTicketCode = isPartyBooking ? generatePartyTicketCode() : null;
  const resolvedGuestCount = Math.max(1, Number(guests ?? 1));
  const partyTicketCount = isPartyBooking ? resolvedGuestCount : 0;
  const partyTicketStatus = isPartyBooking ? "issued" : null;

  let bookingEndDate = selectedDate;
  if (isPartyBooking) {
    try {
      const startMinutes = toMinutes(selectedDepartureTime);
      const endMinutes = toMinutes(bookingEndTime);
      if (startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) {
        const next = new Date(`${selectedDate}T00:00:00.000Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        bookingEndDate = next.toISOString().slice(0, 10);
      }
    } catch {
      bookingEndDate = selectedDate;
    }
  }

  // Server-side overlap guard: prevent starting checkout if another booking or
  // calendar event already occupies this time range on the selected date.
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
        .filter((slot) => Boolean(slot))
    : [];

  const occupiedSlots = occupiedFromBookings;

  if (!isPartyBooking && !isSlotAvailableForRange(occupiedSlots, selectedDepartureTime, selectedPackageHours)) {
    return res.status(409).json({ error: "Selected time slot is no longer available." });
  }

  const [hourPart, minutePart] = selectedDepartureTime.split(":").map((part) => Number(part));
  const endMinutesRaw = ((hourPart * 60) + minutePart + (selectedPackageHours * 60)) % (24 * 60);
  const endHour = String(Math.floor(endMinutesRaw / 60)).padStart(2, "0");
  const endMinute = String(endMinutesRaw % 60).padStart(2, "0");
  const selectedEndTime = `${endHour}:${endMinute}`;

  const normalizedCustomerEmail = customerEmail?.trim().toLowerCase();

  const holdMinutesRaw = Number(process.env.STRIPE_PENDING_HOLD_MINUTES ?? 5);
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

  let bookingRow = null;
  bookingRow = await findReusablePendingBooking();

  if (!bookingRow) {
    const ownerDisplayName = owner.full_name || owner.name || owner.email || "Owner";
    const customerNameFromEmail = normalizedCustomerEmail
      ? normalizedCustomerEmail.split("@")[0] || "Guest"
      : "Guest";

    const { data: createdBooking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .insert({
        boat_id: boat.id,
        customer_id: resolvedCustomerId,
        customer_email: normalizedCustomerEmail ?? null,
        start_date: selectedDate,
        end_date: bookingEndDate,
        departure_time: selectedDepartureTime,
        start_time: selectedDepartureTime,
        end_time: selectedEndTime,
        package_hours: selectedPackageHours,
          total_price: discountedTotal,
        status: "pending",
        // Hydrated identity & experience fields
        boat_name: boat.name,
        owner_name: ownerDisplayName,
        customer_name: customerNameFromEmail,
        package_label: "Stripe checkout",
        guests: resolvedGuestCount,
        departure_marina: boat.departure_marina ?? "",
        extras: [],
        notes: "",
        // Money & payment metadata
        payment_method: "stripe",
        payment_plan: paymentPlan || "full",
        amount_due_now: logicalAmountDueNow,
        deposit_amount: depositAmount,
        platform_commission: platformCommission,
        owner_payout: ownerPayout,
        subtotal_after_voucher: subtotalAfterVoucher,
        party_ticket_code: partyTicketCode,
        party_ticket_count: partyTicketCount,
        party_ticket_status: partyTicketStatus,
        // Party tier selection
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
      if (message.includes("OVERLAP_BLOCKED")) {
        const fallbackPending = await findReusablePendingBooking();

        if (fallbackPending) {
          bookingRow = fallbackPending;
        } else {
          return res.status(409).json({ error: message });
        }
      } else {
        return res.status(500).json({ error: message });
      }
    }

    if (createdBooking) {
      bookingRow = createdBooking;
    }
  }

  if (bookingRow && (resolvedCustomerId || normalizedCustomerEmail)) {
    try {
      await supabaseAdmin
        .from("bookings")
        .update({
          ...(resolvedCustomerId ? { customer_id: resolvedCustomerId } : {}),
          ...(normalizedCustomerEmail ? { customer_email: normalizedCustomerEmail } : {}),
        })
        .eq("id", bookingRow.id);
    } catch {
      // If we cannot persist identity enrichment, continue with existing booking row.
    }
  }

  try {
    const appBaseUrl = process.env.APP_BASE_URL ?? process.env.DEPLOY_PRIME_URL ?? "https://your-deployed-netlify-site.netlify.app";
    const baseSessionPayload = {
      mode: "payment",
      // Stripe Checkout uses `card` to support card entry plus Apple Pay / Google Pay
      // automatically when wallet/domain prerequisites are satisfied in Stripe.
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
      const paymentIntentData = payoutMode === "connect_split"
        ? {
            application_fee_amount: applicationFeeAmount,
            transfer_data: {
              destination: owner.stripe_account_id,
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

    let checkoutSession;
    let payoutMode = canTransferToOwner ? "connect_split" : "platform_only";
    let warning = canTransferToOwner ? null : "Owner has not completed Stripe Connect onboarding. Funds are collected on platform account.";

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

    return res.json({
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
    });
  } catch (error) {
    await supabaseAdmin
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", bookingRow.id);

    const message = error instanceof Error ? error.message : "Failed to create Stripe Checkout session";
    return res.status(500).json({ error: message });
  }
});

const cancelBookingSchema = z.object({
  bookingId: z.string().min(1),
  customerId: z.string().uuid().optional(),
  customerEmail: z.string().email().optional(),
  reason: z.string().trim().max(500).optional(),
});

const generatePartyTicketCode = () => {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PRTY-${stamp}-${random}`;
};

const getBookingByStripeSessionSchema = z.object({
  sessionId: z.string().min(1),
});

const resendCustomerEmailSchema = z.object({
  bookingId: z.string().min(1),
  customerEmail: z.string().email().optional(),
});

const buildCancellationNote = (existingNotes, reason, refundAmountCents, refundRatePercent) => {
  const timestamp = new Date().toISOString();
  const normalizedExisting = typeof existingNotes === "string" ? existingNotes.trim() : "";
  const reasonPart = reason?.trim() ? ` Reason: ${reason.trim()}.` : "";
  const refundAmountPart = refundAmountCents > 0
    ? ` Refund issued: €${(refundAmountCents / 100).toFixed(2)} (${refundRatePercent}%).`
    : " No refund issued.";
  const cancellationLine = `[${timestamp}] Booking cancelled by customer.${reasonPart}${refundAmountPart}`;

  return normalizedExisting ? `${normalizedExisting}\n${cancellationLine}` : cancellationLine;
};

app.post("/api/bookings/cancel", requireSupabaseUser, requireBookingOwnerAccess, async (req, res) => {
  if (!hasValidSupabaseAdminConfig) {
    return res.status(500).json({ error: getSupabaseConfigErrorMessage() });
  }

  const parsed = cancelBookingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
  }

  const { bookingId, reason } = parsed.data;
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from("bookings")
    .select("id, status, start_date, customer_id, customer_email, stripe_payment_intent_id, amount_due_now, total_price, notes")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError || !booking) {
    return res.status(404).json({ error: "Booking not found" });
  }

  if (booking.status === "cancelled") {
    return res.json({
      bookingId: booking.id,
      status: "cancelled",
      alreadyCancelled: true,
      refundAmount: 0,
      refundRatePercent: 0,
      refundStatus: "none",
    });
  }

  if (!["pending", "confirmed"].includes(String(booking.status))) {
    return res.status(400).json({ error: "Only pending or confirmed bookings can be cancelled." });
  }

  let refundAmountCents = 0;
  let refundRatePercent = 0;
  let refundStatus = "none";

  if (booking.stripe_payment_intent_id && hasValidStripeConfig) {
    const tripDate = booking.start_date ? new Date(`${booking.start_date}T00:00:00.000Z`) : null;
    const hoursUntilTrip = tripDate ? (tripDate.getTime() - Date.now()) / (1000 * 60 * 60) : null;
    refundRatePercent = hoursUntilTrip !== null && Number.isFinite(hoursUntilTrip) && hoursUntilTrip >= 48 ? 100 : 50;

    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
      const fallbackAmount = Math.round(Number(booking.amount_due_now ?? booking.total_price ?? 0) * 100);
      const amountPaid = Number(paymentIntent.amount_received ?? 0) > 0 ? Number(paymentIntent.amount_received) : fallbackAmount;
      refundAmountCents = Math.max(0, Math.round(amountPaid * (refundRatePercent / 100)));

      if (refundAmountCents > 0) {
        const refund = await stripe.refunds.create({
          payment_intent: booking.stripe_payment_intent_id,
          amount: refundAmountCents,
          reason: "requested_by_customer",
          metadata: {
            bookingId: booking.id,
          },
        });
        refundStatus = refund.status ?? "pending";
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to process refund";
      return res.status(500).json({ error: message });
    }
  }

  const updatedNotes = buildCancellationNote(booking.notes, reason, refundAmountCents, refundRatePercent);

  const { error: updateError } = await supabaseAdmin
    .from("bookings")
    .update({
      status: "cancelled",
      notes: updatedNotes,
    })
    .eq("id", booking.id);

  if (updateError) {
    return res.status(500).json({ error: updateError.message ?? "Failed to cancel booking" });
  }

  return res.json({
    bookingId: booking.id,
    status: "cancelled",
    alreadyCancelled: false,
    refundAmount: refundAmountCents / 100,
    refundRatePercent,
    refundStatus,
  });
});

app.post("/api/bookings/resend-customer-email", requireSupabaseUser, requireBookingOwnerAccess, async (req, res) => {
  if (!hasValidSupabaseAdminConfig) {
    return res.status(500).json({ error: getSupabaseConfigErrorMessage() });
  }

  const parsed = resendCustomerEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
  }

  const { bookingId } = parsed.data;

  const { data: booking, error: bookingError } = await supabaseAdmin
    .from("bookings")
    .select(
      "id, boat_name, owner_name, customer_name, customer_email, package_label, guests, start_date, departure_time, departure_marina, total_price, amount_due_now, payment_plan, extras, notes, stripe_payment_intent_id",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError || !booking) {
    return res.status(404).json({ error: "Booking not found" });
  }

  const normalizedEmail = String(booking.customer_email || req.supabaseUser.email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return res.status(400).json({ error: "Booking has no customer email and the signed-in account has no email." });
  }

  let receiptUrl = null;
  if (booking.stripe_payment_intent_id && hasValidStripeConfig) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id, {
        expand: ["latest_charge"],
      });

      const latestCharge = paymentIntent.latest_charge;
      const chargeObject =
        latestCharge && typeof latestCharge === "object"
          ? latestCharge
          : paymentIntent.charges?.data?.[0] || null;

      if (chargeObject && chargeObject.receipt_url) {
        receiptUrl = chargeObject.receipt_url;
      }
    } catch {
      // If Stripe lookup fails, continue without a receipt URL.
    }
  }
  const { subject, previewText, html, text } = buildBookingEmailContent({
    booking,
    customerName: booking.customer_name,
    departureMarina: booking.departure_marina,
    receiptUrl,
  });

  const { data: customerEmailRow, error: emailError } = await supabaseAdmin
    .from("customer_emails")
    .insert({
      booking_id: booking.id,
      to_email: normalizedEmail,
      subject,
      preview_text: previewText,
      body: text,
      status: "queued",
    })
    .select("id")
    .single();

  if (emailError || !customerEmailRow) {
    return res.status(500).json({ error: emailError?.message || "Failed to queue customer email" });
  }

  if (resend && hasValidResendConfig) {
    try {
      const { data: resendData, error: resendError } = await resend.emails.send({
        from: resendFromAddress,
        to: testEmailRecipient || normalizedEmail,
        subject,
        text,
        html,
      });

      if (resendError) {
        console.error("Resend send error in resend-customer-email", resendError);
      } else {
        console.log("Resend email queued in resend-customer-email", resendData);
      }
    } catch (error) {
      console.error("Resend send failed in resend-customer-email", error);
      // Email remains queued for fallback processing.
    }
  }

  return res.status(201).json({
    emailId: customerEmailRow.id,
    queued: true,
  });
});

app.get("/api/bookings/by-stripe-session", requireSupabaseUser, async (req, res) => {
  if (!hasValidSupabaseAdminConfig) {
    return res.status(500).json({ error: getSupabaseConfigErrorMessage() });
  }

  const rawSessionId = String(req.query.session_id ?? req.query.sessionId ?? "").trim();
  const parsed = getBookingByStripeSessionSchema.safeParse({ sessionId: rawSessionId });
  if (!parsed.success) {
    return res.status(400).json({ error: "Missing or invalid session_id" });
  }

  const sessionId = parsed.data.sessionId;

  const { data: bookingBySessionId, error: bookingBySessionError } = await supabaseAdmin
    .from("bookings")
    .select("id, boat_name, start_date, departure_time, amount_due_now, total_price, customer_id, customer_email, status, stripe_session_id, party_ticket_code, party_ticket_count, party_ticket_status, party_event_date, party_event_time, party_tier_selected, party_tier_price")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();

  let booking = bookingBySessionId;

  if ((!booking || !booking.id) && hasValidStripeConfig) {
    try {
      const stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
      const bookingIdFromMetadata = stripeSession?.metadata?.bookingId;

      if (bookingIdFromMetadata) {
        const { data: bookingById } = await supabaseAdmin
          .from("bookings")
          .select("id, boat_name, start_date, departure_time, amount_due_now, total_price, customer_id, customer_email, status, stripe_session_id, party_ticket_code, party_ticket_count, party_ticket_status, party_event_date, party_event_time, party_tier_selected, party_tier_price")
          .eq("id", bookingIdFromMetadata)
          .maybeSingle();

        if (bookingById) {
          booking = bookingById;

          if (!booking.stripe_session_id) {
            try {
              await supabaseAdmin
                .from("bookings")
                .update({ stripe_session_id: sessionId })
                .eq("id", booking.id);
            } catch {
              // Best-effort backfill; ignore failures.
            }
          }
        }
      }
    } catch {
      // If Stripe lookup fails, fall back to DB-only behavior.
    }
  }

  if (bookingBySessionError && !booking) {
    return res.status(500).json({ error: bookingBySessionError.message || "Failed to look up booking" });
  }

  if (!booking) {
    return res.status(404).json({ error: "Booking not found for this session" });
  }

  const user = req.supabaseUser;
  const userEmail = normalizeEmail(user.email);
  const bookingEmail = normalizeEmail(booking.customer_email);
  const ownsById = Boolean(booking.customer_id && booking.customer_id === user.id);
  const ownsByEmail = Boolean(userEmail && bookingEmail && userEmail === bookingEmail);

  if (!ownsById && !ownsByEmail) {
    return res.status(403).json({ error: "You are not allowed to access this booking." });
  }

  const amount = Number(booking.amount_due_now ?? booking.total_price ?? 0);
  const ownerNotified = String(booking.status).toLowerCase() === "confirmed";
  const emailQueued = Boolean(booking.customer_email);
  const isPartyBooking = Boolean(booking.party_ticket_code);

  return res.json({
    bookingId: booking.id,
    boat: booking.boat_name || "Boat",
    date: booking.start_date || "",
    departure: booking.departure_time || "",
    amount,
    ownerNotified,
    emailQueued,
    bookingType: isPartyBooking ? "party" : "rental",
    partyTicketCode: booking.party_ticket_code || "",
    partyTicketCount: Number(booking.party_ticket_count ?? 0),
    partyTicketStatus: booking.party_ticket_status || "",
    partyEventDate: booking.party_event_date || "",
    partyEventTime: booking.party_event_time || "",
    partyTierSelected: booking.party_tier_selected || "",
    partyTierPrice: Number(booking.party_tier_price ?? 0),
  });
});

// Sector-aware boat fetch endpoints
const ALLOWED_RELATED_TABLES = [
  "boat_features",
  "boat_documents",
  "owner_packages",
  "owner_package_boats",
  "party_boats",
  "watersports_boats",
  "bookings",
  "calendar_events",
  "owner_reviews",
];

const parseTablesParam = (value) => {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
};

const fetchRelatedForBoatIds = async (tableNames, boatIds) => {
  const results = {};
  await Promise.all(
    tableNames.map(async (table) => {
      const { data, error } = await supabaseAdmin.from(table).select("*").in("boat_id", boatIds);
      if (error) throw error;
      results[table] = data || [];
    }),
  );
  return results;
};

const handleSectorRequest = async (req, res, sector) => {
  if (!hasValidSupabaseAdminConfig) return res.status(500).json({ error: getSupabaseConfigErrorMessage() });

  const boatId = String(req.query.boat_id || "").trim();
  const ownerId = String(req.query.owner_id || "").trim();
  const tablesParam = parseTablesParam(req.query.tables);

  const tablesToFetch = tablesParam.length === 0 ? [] : tablesParam;
  for (const t of tablesToFetch) {
    if (!ALLOWED_RELATED_TABLES.includes(t)) {
      return res.status(400).json({ error: `Related table not allowed: ${t}` });
    }
  }

  try {
    let baseRows = [];
    if (sector === "rentals") {
      if (boatId) {
        const { data } = await supabaseAdmin.from("boats").select("*").eq("id", boatId).maybeSingle();
        if (data) baseRows = [data];
      } else if (ownerId) {
        const { data } = await supabaseAdmin.from("boats").select("*").eq("owner_id", ownerId);
        baseRows = data || [];
      } else {
        const { data } = await supabaseAdmin.from("boats").select("*").limit(100);
        baseRows = data || [];
      }
    } else if (sector === "party") {
      if (boatId) {
        const { data } = await supabaseAdmin.from("party_boats").select("*").eq("boat_id", boatId).maybeSingle();
        if (data) baseRows = [data];
      } else if (ownerId) {
        const { data } = await supabaseAdmin.from("party_boats").select("*").eq("owner_id", ownerId);
        baseRows = data || [];
      } else {
        const { data } = await supabaseAdmin.from("party_boats").select("*").limit(100);
        baseRows = data || [];
      }
    } else if (sector === "watersports") {
      if (boatId) {
        const { data } = await supabaseAdmin.from("watersports_boats").select("*").eq("boat_id", boatId).maybeSingle();
        if (data) baseRows = [data];
      } else if (ownerId) {
        const { data } = await supabaseAdmin.from("watersports_boats").select("*").eq("owner_id", ownerId);
        baseRows = data || [];
      } else {
        const { data } = await supabaseAdmin.from("watersports_boats").select("*").limit(100);
        baseRows = data || [];
      }
    }

    const boatIds = baseRows.map((r) => String(r.boat_id ?? r.id ?? "").trim()).filter(Boolean);

    const related = tablesToFetch.length > 0 && boatIds.length > 0 ? await fetchRelatedForBoatIds(tablesToFetch, boatIds) : {};

    return res.json({ sector, boats: baseRows, related });
  } catch (error) {
    console.error("sector fetch error", sector, error);
    const message = error instanceof Error ? error.message : "Failed to fetch sector data";
    return res.status(500).json({ error: message });
  }
};

app.get("/api/boats/rentals", async (req, res) => handleSectorRequest(req, res, "rentals"));
app.get("/api/boats/party", async (req, res) => handleSectorRequest(req, res, "party"));
app.get("/api/boats/watersports", async (req, res) => handleSectorRequest(req, res, "watersports"));

// Migrate a single boat into sector tables (party/watersports) and clear legacy columns
app.post("/api/boats/migrate/:boatId", requireSupabaseUser, requireOwnerRole, async (req, res) => {
  if (!hasValidSupabaseAdminConfig) return res.status(500).json({ error: getSupabaseConfigErrorMessage() });

  const boatId = String(req.params.boatId || "").trim();
  if (!boatId) return res.status(400).json({ error: "Missing boatId" });

  try {
    const { data: boat, error: boatError } = await supabaseAdmin.from("boats").select("*").eq("id", boatId).maybeSingle();
    if (boatError) throw boatError;
    if (!boat) return res.status(404).json({ error: "Boat not found" });

    // Upsert into party_boats if type = 'Party Boat'
    if (boat.type === 'Party Boat') {
      const { error } = await supabaseAdmin.from("party_boats").upsert({
        boat_id: boat.id,
        owner_id: boat.owner_id,
        name: boat.name,
        location: boat.location,
        description: boat.description,
        departure_marina: boat.departure_marina,
        capacity: boat.capacity,
        ticket_max_people: boat.capacity,
        ticket_price_per_person: 0,
        party_tiers: [],
        party_event_date: null,
        party_event_time: null,
        images: boat.images,
        status: boat.status ?? "active",
        map_query: boat.map_query ?? "",
        flash_sale_enabled: boat.flash_sale_enabled ?? false,
        updated_at: new Date().toISOString(),
      }, { onConflict: "boat_id" });

      if (error) throw error;
    }

    // Upsert into watersports_boats if type includes 'watersports'
    if (String(boat.type ?? "").toLowerCase().includes("watersports")) {
      const { error } = await supabaseAdmin.from("watersports_boats").upsert({
        boat_id: boat.id,
        owner_id: boat.owner_id,
        name: boat.name,
        location: boat.location,
        description: boat.description,
        departure_marina: boat.departure_marina,
        capacity: boat.capacity,
        price_per_day: boat.price_per_day ?? 0,
        images: boat.images,
        status: boat.status ?? "active",
        map_query: boat.map_query ?? "",
        flash_sale_enabled: boat.flash_sale_enabled ?? false,
        updated_at: new Date().toISOString(),
      }, { onConflict: "boat_id" });

      if (error) throw error;
    }

    // Note: Don't update boats table - those columns don't exist
    return res.json({ ok: true, migratedBoatId: boat.id });
  } catch (error) {
    console.error("/api/boats/migrate error", error);
    const message = error instanceof Error ? error.message : "Failed to migrate boat";
    return res.status(500).json({ error: message });
  }
});

app.listen(port, () => {
  console.log(`Stripe API running on http://localhost:${port}`);
});
