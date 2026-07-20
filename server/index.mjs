import { fileURLToPath } from "node:url";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import Stripe from "stripe";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import PDFDocument from "pdfkit";
import { resolveFlashSalePricing } from "./flash-sale-pricing.mjs";
import { resolveBoatVoucherPricing, calculateRefundTier } from "./booking-pricing.mjs";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

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

for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY"]) {
  if (!process.env[key]) {
    console.warn(`Missing environment variable: ${key}. Routes that depend on it will return a 500 with a config error instead of crashing the whole API.`);
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

// Resolves the public site origin used in outbound links/images (Stripe
// redirect URLs, email assets). Prefers an explicit APP_BASE_URL, then falls
// back to the platform-provided deployment URL (Vercel or Netlify), then a
// placeholder so local dev without any of these still runs.
const getAppBaseUrl = () => {
  const explicit = String(process.env.APP_BASE_URL ?? "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercelUrl = String(process.env.VERCEL_URL ?? "").trim();
  if (vercelUrl) return `https://${vercelUrl}`;

  const netlifyUrl = String(process.env.DEPLOY_PRIME_URL ?? "").trim();
  if (netlifyUrl) return netlifyUrl.replace(/\/+$/, "");

  return "https://your-deployed-site.vercel.app";
};

const getSupabaseConfigErrorMessage = () =>
  "Supabase admin is not configured. Set real SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY values in .env/.env.local (do not use placeholder values).";

const getStripeConfigErrorMessage = () =>
  "Stripe is not configured. Set real STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY values in .env/.env.local (do not use placeholder values).";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
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

// createClient() throws synchronously if the URL/key are empty, which would
// otherwise crash this module for every route (including ones like
// /api/health and /api/stripe/config that don't touch Supabase at all).
// Routes that need it already check hasValidSupabaseAdminConfig and return
// getSupabaseConfigErrorMessage() themselves.
const supabaseAdmin = hasValidSupabaseAdminConfig
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

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
      <body style="font-family: Helvetica, Arial, sans-serif; color: #2D3748; margin: 0; padding: 0; background-color: #f9fafb;">
        <div style="max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #E2E8F0; border-radius: 8px; background-color: #ffffff;">
          <h1 style="margin:0; font-size: 24px; color: #2D3748;">Booking Confirmed</h1>
          <p style="color: #718096; font-size: 16px;">Get ready to set sail, ${name}.</p>
          <p><strong>Boat:</strong> ${boatName}</p>
          <p><strong>Date:</strong> ${formattedDate}</p>
          <p><strong>Marina:</strong> ${marina}</p>
          <p><strong>Total:</strong> EUR ${total.toFixed(2)}</p>
          <p><strong>Paid now:</strong> EUR ${paidNow.toFixed(2)}</p>
          <p><strong>Remaining:</strong> EUR ${remaining.toFixed(2)}</p>
          ${receiptUrl ? `<p>Stripe receipt: <a href="${receiptUrl}">View payment receipt</a></p>` : ""}
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
    `Total: EUR ${total.toFixed(2)}`,
    `Paid now: EUR ${paidNow.toFixed(2)}`,
    `Remaining: EUR ${remaining.toFixed(2)}`,
  ];

  if (receiptUrl) {
    lines.push("", `Stripe receipt: ${receiptUrl}`);
  }

  lines.push("", "See you on the water,", "Nautiplex");

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
            <img src="${getAppBaseUrl()}/nautiplex_logo.png"
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

const requireAdminRole = async (req, res, next) => {
  const user = req.supabaseUser;
  if (!user) {
    return res.status(500).json({ error: "Supabase user context is missing" });
  }

  const { data: adminRow, error } = await supabaseAdmin
    .from("admin_users")
    .select("id, user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !adminRow) {
    return res.status(403).json({ error: "Admin access required" });
  }

  req.adminRow = adminRow;
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

// Every booking status write should go through this so each transition
// (confirmed/cancelled/completed) leaves its own timestamp instead of only
// the shared updated_at column being overwritten.
const statusTransitionTimestamp = (status) => {
  const now = new Date().toISOString();
  if (status === "confirmed") return { confirmed_at: now };
  if (status === "cancelled") return { cancelled_at: now };
  if (status === "completed") return { completed_at: now };
  return {};
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

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object;
    const stripePaymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent && typeof session.payment_intent === "object" && typeof session.payment_intent.id === "string"
            ? session.payment_intent.id
            : null);
    const metadata = session.metadata ?? {};
    let resolvedBookingId = String(metadata.bookingId ?? "").trim() || null;
    const paymentStatus = String(session.payment_status ?? "").toLowerCase();
    let paymentIntentStatus = "unknown";
    if (stripePaymentIntentId) {
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(stripePaymentIntentId);
        paymentIntentStatus = String(paymentIntent?.status ?? "unknown").toLowerCase();
      } catch {
        // Keep unknown when PaymentIntent lookup fails.
      }
    }
    const isPaid = paymentStatus === "paid" || paymentIntentStatus === "succeeded";
    const hasVerifiedPaymentIntent = Boolean(String(stripePaymentIntentId ?? "").trim());

    const metadataNumber = (key, fallback = 0) => {
      const raw = String(metadata[key] ?? "").trim();
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const metadataString = (key, fallback = "") => String(metadata[key] ?? fallback).trim();

    if (!resolvedBookingId) {
      try {
        const { data: bySession } = await supabaseAdmin
          .from("bookings")
          .select("id")
          .eq("stripe_session_id", session.id)
          .maybeSingle();

        if (bySession?.id) {
          resolvedBookingId = bySession.id;
        }
      } catch {
        // Ignore lookup errors here; create flow below handles missing rows.
      }
    }

    if (!resolvedBookingId && isPaid && hasVerifiedPaymentIntent) {
      const boatId = metadataString("boatId");
      const bookingDate = metadataString("bookingDate");
      const bookingEndDate = metadataString("bookingEndDate") || bookingDate;
      const departureTime = metadataString("departureTime");
      const endTime = metadataString("endTime");
      const packageHours = Math.max(1, Math.min(8, metadataNumber("packageHours", 1)));
      const guests = Math.max(1, metadataNumber("guests", 1));
      const customerEmail = (session.customer_details?.email || metadataString("customerEmail") || "").trim().toLowerCase();
      const customerName = metadataString("customerName") || String(session.customer_details?.name ?? "").trim() || "Guest";

      if (boatId && bookingDate && isValidTime(departureTime) && isValidTime(endTime)) {
        const { data: boat } = await supabaseAdmin
          .from("boats")
          .select("id, name, owner_id, departure_marina")
          .eq("id", boatId)
          .maybeSingle();

        if (boat?.id) {
          const { data: owner } = await supabaseAdmin
            .from("users")
            .select("id, full_name, name")
            .eq("id", boat.owner_id)
            .maybeSingle();

          let inferredCustomerId = metadataString("customerId") || null;
          if (!inferredCustomerId && customerEmail) {
            const { data: customerUser } = await supabaseAdmin
              .from("users")
              .select("id")
              .eq("email", customerEmail)
              .maybeSingle();
            inferredCustomerId = customerUser?.id ?? null;
          }

          const { data: insertedBooking } = await supabaseAdmin
            .from("bookings")
            .insert({
              boat_id: boat.id,
              customer_id: inferredCustomerId,
              customer_email: customerEmail || null,
              start_date: bookingDate,
              end_date: bookingEndDate,
              departure_time: departureTime,
              start_time: departureTime,
              end_time: endTime,
              package_hours: packageHours,
              total_price: metadataNumber("totalPrice", metadataNumber("amountDueNow", 0)),
              status: "confirmed",
              ...statusTransitionTimestamp("confirmed"),
              boat_name: metadataString("boatName") || boat.name || "",
              owner_name: owner?.full_name || owner?.name || "Owner",
              customer_name: customerName,
              package_label: metadataString("packageLabel") || "Stripe checkout",
              guests,
              departure_marina: metadataString("departureMarina") || boat.departure_marina || "",
              extras: [],
              notes: "",
              payment_method: "stripe",
              payment_plan: metadataString("paymentPlan") || "full",
              amount_due_now: metadataNumber("amountDueNow", 0),
              deposit_amount: metadataNumber("depositAmount", 0),
              platform_commission: metadataNumber("platformCommission", 0),
              owner_payout: metadataNumber("ownerPayout", 0),
              stripe_session_id: session.id,
              stripe_payment_intent_id: stripePaymentIntentId,
              ...(metadataString("isPartyBooking") === "true" ? {
                party_ticket_code: metadataString("partyTicketCode") || null,
                party_ticket_count: metadataNumber("partyTicketCount", 0),
                party_ticket_status: metadataString("partyTicketStatus") || null,
              } : {}),
            })
            .select("id")
            .maybeSingle();

          if (insertedBooking?.id) {
            resolvedBookingId = insertedBooking.id;
          }
        }
      }
    }

    if (resolvedBookingId) {
      const stripeSessionId = session.id;

      if (!isPaid || !hasVerifiedPaymentIntent) {
        await supabaseAdmin
          .from("bookings")
          .update({
            status: "cancelled",
            ...statusTransitionTimestamp("cancelled"),
            stripe_session_id: stripeSessionId,
            stripe_payment_intent_id: stripePaymentIntentId || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", resolvedBookingId);

        return res.json({ received: true });
      }

      // Load the current booking so we can hydrate missing fields on confirmation.
      const { data: booking, error: bookingLoadError } = await supabaseAdmin
        .from("bookings")
        .select(
           "id, boat_id, boat_name, owner_name, customer_id, customer_name, customer_email, package_label, guests, start_date, end_date, departure_time, start_time, end_time, package_hours, departure_marina, extras, notes, total_price, payment_method, payment_plan, amount_due_now, deposit_amount, platform_commission, owner_payout, party_ticket_code, party_ticket_count, party_ticket_status",
        )
          .eq("id", resolvedBookingId)
        .maybeSingle();

      let updatePayload = {
        status: "confirmed",
        ...statusTransitionTimestamp("confirmed"),
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
        .eq("id", resolvedBookingId);

      if (error) {
        await supabaseAdmin
          .from("bookings")
          .update({
            status: "cancelled",
            ...statusTransitionTimestamp("cancelled"),
            stripe_session_id: stripeSessionId,
            stripe_payment_intent_id: stripePaymentIntentId || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", resolvedBookingId);
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
        const objectPath = `${receiptsPathOwner}/${safeBoatName}/${resolvedBookingId}.pdf`;

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
  } else if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
    const session = event.data.object;
    const stripeSessionId = String(session.id ?? "").trim();
    const stripePaymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent && typeof session.payment_intent === "object" && typeof session.payment_intent.id === "string"
            ? session.payment_intent.id
            : null);

    if (stripeSessionId) {
      await supabaseAdmin
        .from("bookings")
        .update({
          status: "cancelled",
          ...statusTransitionTimestamp("cancelled"),
          stripe_session_id: stripeSessionId,
          stripe_payment_intent_id: stripePaymentIntentId,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_session_id", stripeSessionId)
        .in("status", ["pending", "cancelled"]);
    }
  } else if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object;
    const paymentIntentId = String(paymentIntent.id ?? "").trim();
    const checkoutReference = String(paymentIntent.metadata?.checkoutReference ?? "").trim();
    const nowIso = new Date().toISOString();

    if (paymentIntentId) {
      const updatePayload = {
        status: "confirmed",
        ...statusTransitionTimestamp("confirmed"),
        stripe_payment_intent_id: paymentIntentId,
        updated_at: nowIso,
      };

      // Primary match: explicit Stripe payment intent id on booking row.
      const { data: updatedByIntent, error: byIntentError } = await supabaseAdmin
        .from("bookings")
        .update(updatePayload)
        .eq("stripe_payment_intent_id", paymentIntentId)
        .select("id")
        .limit(1);

      const matchedByIntent = !byIntentError && Array.isArray(updatedByIntent) && updatedByIntent.length > 0;

      // Fallback match: checkout reference stored in payment_intent_data.metadata.
      // This handles rows created before Stripe returned an intent id at session creation.
      if (!matchedByIntent && checkoutReference) {
        await supabaseAdmin
          .from("bookings")
          .update(updatePayload)
          .eq("request_id", checkoutReference)
          .in("status", ["pending", "cancelled"]);
      }
    }
  } else if (event.type === "payment_intent.payment_failed") {
    const paymentIntent = event.data.object;
    const paymentIntentId = String(paymentIntent.id ?? "").trim();

    if (paymentIntentId) {
      await supabaseAdmin
        .from("bookings")
        .update({
          status: "cancelled",
          ...statusTransitionTimestamp("cancelled"),
          stripe_payment_intent_id: paymentIntentId,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_payment_intent_id", paymentIntentId)
        .in("status", ["pending", "confirmed"]);
    }
  }

  return res.json({ received: true });
});

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

const signBoatImageSchema = z.object({
  paths: z.array(z.string().min(1)).min(1).max(200),
  expiresIn: z.number().int().min(60).max(60 * 60 * 24).optional(),
});

const hasFileExtension = (value) => /\.\w{2,6}(\?|$)/.test(String(value ?? ""));
const BOAT_IMAGE_FILE_REGEX = /\.(avif|jpe?g|png|webp|gif)$/i;

const normalizeBoatImagePath = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  let candidate = raw;
  if (/^https?:\/\//i.test(candidate)) {
    try {
      candidate = new URL(candidate).pathname || "";
    } catch {
      return "";
    }
  }

  candidate = candidate
    .replace(/^\/+/, "")
    .replace(/^storage\/v1\/object\/(public|sign)\/boat-images\//i, "")
    .replace(/^boat-images\//i, "")
    .replace(/^\/+/, "")
    .split("?")[0]
    .trim();

  if (!candidate || candidate.includes("..")) return "";

  return candidate;
};

const resolveBoatImageObjectPath = async (normalizedPath) => {
  if (!normalizedPath) return null;
  if (hasFileExtension(normalizedPath)) {
    return normalizedPath;
  }

  const folder = normalizedPath.replace(/\/+$/, "");
  if (!folder) return null;

  const { data, error } = await supabaseAdmin.storage
    .from("boat-images")
    .list(folder, {
      limit: 100,
    });

  if (error || !Array.isArray(data)) {
    return null;
  }

  const expectedPrefix = `${folder}/`;
  const files = data
    .filter((entry) => {
      const name = String(entry?.name ?? "").trim();
      if (!name || !BOAT_IMAGE_FILE_REGEX.test(name)) return false;
      return true;
    })
    .map((entry) => `${folder}/${entry.name}`)
    .filter((path) => path.startsWith(expectedPrefix));

  if (files.length === 0) {
    return null;
  }

  const preferred = files.find((path) => /\/1\.(avif|jpe?g|png|webp|gif)$/i.test(path));
  return preferred || files.sort((a, b) => a.localeCompare(b))[0];
};

app.post("/api/storage/boat-images/sign", async (req, res) => {
  if (!hasValidSupabaseAdminConfig) {
    return res.status(500).json({ error: getSupabaseConfigErrorMessage() });
  }

  const parsed = signBoatImageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
  }

  const expiresIn = Number(parsed.data.expiresIn ?? 60 * 60);
  const normalizedPaths = Array.from(
    new Set(parsed.data.paths.map((path) => normalizeBoatImagePath(path)).filter(Boolean)),
  );

  if (normalizedPaths.length === 0) {
    return res.json({ urls: {} });
  }

  const urls = {};
  for (const requestedPath of normalizedPaths) {
    const objectPath = await resolveBoatImageObjectPath(requestedPath);
    if (!objectPath) {
      continue;
    }

    const { data, error } = await supabaseAdmin.storage
      .from("boat-images")
      .createSignedUrl(objectPath, expiresIn);

    if (!error && data?.signedUrl) {
      urls[requestedPath] = data.signedUrl;
    }
  }

  return res.json({ urls });
});

const signDestinationImageSchema = z.object({
  paths: z.array(z.string().min(1)).min(1).max(200),
  expiresIn: z.number().int().min(60).max(60 * 60 * 24).optional(),
});

const DESTINATION_IMAGE_FILE_REGEX = /\.(avif|jpe?g|png|webp|gif)$/i;

const normalizeDestinationImagePath = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  let candidate = raw;
  if (/^https?:\/\//i.test(candidate)) {
    try {
      candidate = new URL(candidate).pathname || "";
    } catch {
      return "";
    }
  }

  candidate = candidate
    .replace(/^\/+/, "")
    .replace(/^storage\/v1\/object\/(public|sign)\/destination-images\//i, "")
    .replace(/^destination-images\//i, "")
    .replace(/^\/+/, "")
    .split("?")[0]
    .trim();

  if (!candidate || candidate.includes("..")) return "";

  return candidate;
};

const resolveDestinationImageObjectPath = async (normalizedPath) => {
  if (!normalizedPath) return null;
  if (hasFileExtension(normalizedPath)) {
    return normalizedPath;
  }

  const folder = normalizedPath.replace(/\/+$/, "");
  if (!folder) return null;

  const { data, error } = await supabaseAdmin.storage
    .from("destination-images")
    .list(folder, {
      limit: 100,
    });

  if (error || !Array.isArray(data)) {
    return null;
  }

  const expectedPrefix = `${folder}/`;
  const files = data
    .filter((entry) => {
      const name = String(entry?.name ?? "").trim();
      if (!name || !DESTINATION_IMAGE_FILE_REGEX.test(name)) return false;
      return true;
    })
    .map((entry) => `${folder}/${entry.name}`)
    .filter((path) => path.startsWith(expectedPrefix));

  if (files.length === 0) {
    return null;
  }

  const preferred = files.find((path) => /\/1\.(avif|jpe?g|png|webp|gif)$/i.test(path));
  return preferred || files.sort((a, b) => a.localeCompare(b))[0];
};

app.post("/api/storage/destination-images/sign", async (req, res) => {
  if (!hasValidSupabaseAdminConfig) {
    return res.status(500).json({ error: getSupabaseConfigErrorMessage() });
  }

  const parsed = signDestinationImageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
  }

  const expiresIn = Number(parsed.data.expiresIn ?? 60 * 60);
  const normalizedPaths = Array.from(
    new Set(parsed.data.paths.map((path) => normalizeDestinationImagePath(path)).filter(Boolean)),
  );

  if (normalizedPaths.length === 0) {
    return res.json({ urls: {} });
  }

  const urls = {};
  for (const requestedPath of normalizedPaths) {
    const objectPath = await resolveDestinationImageObjectPath(requestedPath);
    if (!objectPath) {
      continue;
    }

    const { data, error } = await supabaseAdmin.storage
      .from("destination-images")
      .createSignedUrl(objectPath, expiresIn);

    if (!error && data?.signedUrl) {
      urls[requestedPath] = data.signedUrl;
    }
  }

  return res.json({ urls });
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
      .select("id, boat_id, status, stripe_payment_intent_id")
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

    if (status === "confirmed" && !String(booking.stripe_payment_intent_id ?? "").trim()) {
      return res.status(400).json({
        error: "Cannot confirm booking without verified Stripe payment intent.",
      });
    }

    const { error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({ status, ...statusTransitionTimestamp(status), updated_at: new Date().toISOString() })
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
    .select("id, name, owner_id, departure_marina, flash_sale_enabled, type")
    .eq("id", boatId)
    .maybeSingle();

  let boat = boatById;
  let partySector = null;

  if (!boat && boatName) {
    const { data: boatByName, error: boatByNameError } = await supabaseAdmin
      .from("boats")
      .select("id, name, owner_id, departure_marina, flash_sale_enabled, type")
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

  if (!boat && isPartyBookingFromClient) {
    const { data: partyById } = await supabaseAdmin
      .from("party_boats")
      .select("id, boat_id, owner_id, name, departure_marina, flash_sale_enabled, party_event_date, party_event_time")
      .eq("id", boatId)
      .maybeSingle();

    if (partyById) {
      partySector = partyById;
      boat = {
        id: partyById.id,
        name: partyById.name,
        owner_id: partyById.owner_id,
        departure_marina: partyById.departure_marina,
        flash_sale_enabled: partyById.flash_sale_enabled,
        type: "party",
      };
    }
  }

  if (!boat && isPartyBookingFromClient && boatName) {
    const { data: partyByName } = await supabaseAdmin
      .from("party_boats")
      .select("id, boat_id, owner_id, name, departure_marina, flash_sale_enabled, party_event_date, party_event_time")
      .eq("name", boatName)
      .limit(1)
      .maybeSingle();

    if (partyByName) {
      partySector = partyByName;
      boat = {
        id: partyByName.id,
        name: partyByName.name,
        owner_id: partyByName.owner_id,
        departure_marina: partyByName.departure_marina,
        flash_sale_enabled: partyByName.flash_sale_enabled,
        type: "party",
      };
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

  const isPartyType = String(boat?.type ?? "").toLowerCase().includes("party");
  const isPartyBookingResolved = Boolean(isPartyBookingFromClient || isPartyType || partySector);

  const hasPreDiscountTotal = Number.isFinite(preDiscountTotalFromClient ?? NaN) && (preDiscountTotalFromClient ?? 0) > 0;
  const baseTotalPrice = hasPreDiscountTotal
    ? Number(preDiscountTotalFromClient)
    : (Number.isFinite(totalPriceFromClient ?? NaN) && (totalPriceFromClient ?? 0) > 0 ? Number(totalPriceFromClient) : 0);

  if (!Number.isFinite(baseTotalPrice) || baseTotalPrice <= 0) {
    return res.status(400).json({ error: "Missing total price. Add at least one package before checkout." });
  }

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

  const bookingEndTime = isPartyBookingResolved
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
  const isPartyBooking = isPartyBookingResolved;
  let bookingBoatIdForPersistence = boat.id;
  if (isPartyBooking) {
    const candidates = Array.from(
      new Set(
        [String(partySector?.boat_id ?? "").trim(), String(boat.id ?? "").trim()].filter(Boolean),
      ),
    );

    if (candidates.length > 0) {
      const { data: candidateBoats } = await supabaseAdmin
        .from("boats")
        .select("id")
        .in("id", candidates);

      const existingBoatIds = new Set((candidateBoats ?? []).map((row) => String(row.id ?? "").trim()).filter(Boolean));
      const chosen = candidates.find((id) => existingBoatIds.has(id));
      if (chosen) {
        bookingBoatIdForPersistence = chosen;
      } else {
        return res.status(400).json({
          error: "Party boat is not linked to a rental boat id. Set party_boats.boat_id to a valid boats.id and retry checkout.",
        });
      }
    }
  }
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
  const checkoutReference = `chk_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  try {
    const appBaseUrl = getAppBaseUrl();
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
              boatId: boat.id,
              checkoutReference,
            },
          }
        : {
            metadata: {
              boatId: boat.id,
              checkoutReference,
              payoutMode: "platform_only",
            },
          };

      return stripe.checkout.sessions.create({
        ...baseSessionPayload,
        metadata: {
          boatId: bookingBoatIdForPersistence || "",
          ownerId: owner.id,
          checkoutReference,
          bookingDate: selectedDate,
          bookingEndDate,
          departureTime: selectedDepartureTime,
          endTime: selectedEndTime,
          packageHours: String(selectedPackageHours),
          guests: String(resolvedGuestCount),
          boatName: boat.name,
          departureMarina: boat.departure_marina ?? "",
          paymentPlan: paymentPlan || "full",
          totalPrice: String(discountedTotal),
          amountDueNow: String(logicalAmountDueNow),
          depositAmount: String(depositAmount),
          platformCommission: String(platformCommission),
          ownerPayout: String(ownerPayout),
          customerId: resolvedCustomerId || "",
          customerEmail: normalizedCustomerEmail || "",
          customerName: normalizedCustomerEmail ? (normalizedCustomerEmail.split("@")[0] || "Guest") : "Guest",
          packageLabel: "Stripe checkout",
          isPartyBooking: String(Boolean(isPartyBooking)),
          partyTicketCode: partyTicketCode ?? "",
          partyTicketCount: String(partyTicketCount),
          partyTicketStatus: partyTicketStatus ?? "",
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

    const stripePaymentIntentId =
      typeof checkoutSession.payment_intent === "string"
        ? checkoutSession.payment_intent
        : (checkoutSession.payment_intent && typeof checkoutSession.payment_intent === "object" && typeof checkoutSession.payment_intent.id === "string"
            ? checkoutSession.payment_intent.id
            : null);

    const pendingBookingPayload = {
      boat_id: bookingBoatIdForPersistence,
      customer_id: resolvedCustomerId,
      customer_name: normalizedCustomerEmail ? (normalizedCustomerEmail.split("@")[0] || "Guest") : "Guest",
      customer_email: normalizedCustomerEmail || null,
      start_date: selectedDate,
      end_date: bookingEndDate,
      departure_time: selectedDepartureTime,
      start_time: selectedDepartureTime,
      end_time: selectedEndTime,
      package_hours: selectedPackageHours,
      // Do not hold time slots before verified payment.
      // Booking remains cancelled until Stripe confirms payment, then webhook/by-session flow upgrades it to confirmed.
      status: "cancelled",
      total_price: discountedTotal,
      boat_name: boat.name || "",
      owner_name: owner.full_name || owner.name || "Owner",
      package_label: isPartyBooking ? "Party tickets" : "Stripe checkout",
      guests: resolvedGuestCount,
      departure_marina: boat.departure_marina ?? "",
      extras: [],
      notes: "",
      payment_method: null,
      payment_plan: paymentPlan || "full",
      amount_due_now: logicalAmountDueNow,
      deposit_amount: depositAmount,
      platform_commission: platformCommission,
      owner_payout: ownerPayout,
      request_id: checkoutReference,
      stripe_session_id: checkoutSession.id,
      stripe_payment_intent_id: stripePaymentIntentId,
      ...(isPartyBooking ? {
        party_ticket_code: partyTicketCode,
        party_ticket_count: partyTicketCount,
        party_ticket_status: partyTicketStatus,
      } : {}),
    };

    const { data: pendingBooking, error: pendingBookingError } = await supabaseAdmin
      .from("bookings")
      .insert(pendingBookingPayload)
      .select("id")
      .maybeSingle();

    if (pendingBookingError) {
      return res.status(500).json({ error: pendingBookingError.message || "Failed to create pending booking" });
    }

    return res.json({
      sessionId: checkoutSession.id,
      checkoutUrl: checkoutSession.url,
      bookingId: pendingBooking?.id ?? null,
      amount: logicalAmountDueNow,
      commissionAmount: platformCommission,
      ownerStripeAccountId: owner.stripe_account_id,
      payoutMode,
      warning,
      flashSaleEligible,
      flashSaleDiscount,
    });
  } catch (error) {
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

    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
      const fallbackAmount = Math.round(Number(booking.amount_due_now ?? booking.total_price ?? 0) * 100);
      const amountPaid = Number(paymentIntent.amount_received ?? 0) > 0 ? Number(paymentIntent.amount_received) : fallbackAmount;
      ({ refundRatePercent, refundAmountCents } = calculateRefundTier({ hoursUntilTrip, amountPaidCents: amountPaid }));

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
      ...statusTransitionTimestamp("cancelled"),
      cancellation_reason: reason?.trim() || null,
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
    .select("id, boat_id, boat_name, start_date, departure_time, amount_due_now, total_price, customer_id, customer_email, status, stripe_session_id, stripe_payment_intent_id, party_ticket_code, party_ticket_count, party_ticket_status")
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
          .select("id, boat_id, boat_name, start_date, departure_time, amount_due_now, total_price, customer_id, customer_email, status, stripe_session_id, stripe_payment_intent_id, party_ticket_code, party_ticket_count, party_ticket_status")
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

  let partyDetails = null;
  if (booking.party_ticket_code || booking.boat_id) {
    const partyLookupId = booking.boat_id;
    const { data: partyById } = await supabaseAdmin
      .from("party_boats")
      .select("id, party_event_date, party_event_time, party_tiers")
      .eq("id", partyLookupId)
      .maybeSingle();

    if (partyById) {
      partyDetails = partyById;
    } else {
      const { data: partyByBoatId } = await supabaseAdmin
        .from("party_boats")
        .select("boat_id, party_event_date, party_event_time, party_tiers")
        .eq("boat_id", partyLookupId)
        .maybeSingle();

      partyDetails = partyByBoatId;
    }
  }

  const user = req.supabaseUser;
  const userEmail = normalizeEmail(user.email);
  const bookingEmail = normalizeEmail(booking.customer_email);
  const ownsById = Boolean(booking.customer_id && booking.customer_id === user.id);
  const ownsByEmail = Boolean(userEmail && bookingEmail && userEmail === bookingEmail);

  if (!ownsById && !ownsByEmail) {
    return res.status(403).json({ error: "You are not allowed to access this booking." });
  }

  let stripePaymentStatus = "unknown";
  let stripeCheckoutStatus = "unknown";
  let stripeCheckoutUrl = "";
  let stripePaymentIntentId = String(booking.stripe_payment_intent_id ?? "").trim();
  let stripePaymentIntentStatus = "unknown";

  if (hasValidStripeConfig) {
    try {
      const stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
      stripePaymentStatus = String(stripeSession?.payment_status ?? "unknown");
      stripeCheckoutStatus = String(stripeSession?.status ?? "unknown");
      const sessionPaymentIntentId =
        typeof stripeSession?.payment_intent === "string"
          ? stripeSession.payment_intent
          : (stripeSession?.payment_intent && typeof stripeSession.payment_intent === "object" && typeof stripeSession.payment_intent.id === "string"
              ? stripeSession.payment_intent.id
              : "");
      if (sessionPaymentIntentId) {
        stripePaymentIntentId = sessionPaymentIntentId;
      }

      if (stripePaymentIntentId) {
        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(stripePaymentIntentId);
          stripePaymentIntentStatus = String(paymentIntent?.status ?? "unknown").toLowerCase();
        } catch {
          // Keep unknown when PaymentIntent lookup fails.
        }
      }

      if (stripeCheckoutStatus === "open" && typeof stripeSession?.url === "string") {
        stripeCheckoutUrl = stripeSession.url;
      }
    } catch {
      // Keep unknown statuses when Stripe lookup fails.
    }
  }

  const amount = Number(booking.amount_due_now ?? booking.total_price ?? 0);
  const hasPaymentIntentRef = Boolean(String(stripePaymentIntentId ?? "").trim());
  const hasStripeRefs = Boolean(String(booking.stripe_session_id ?? "").trim()) && hasPaymentIntentRef;

  const bookingStatus = String(booking.status).toLowerCase();

  if (bookingStatus === "confirmed" && !hasPaymentIntentRef) {
    await supabaseAdmin
      .from("bookings")
      .update({
        status: "cancelled",
        ...statusTransitionTimestamp("cancelled"),
        stripe_session_id: sessionId,
        stripe_payment_intent_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", booking.id);
    booking.status = "cancelled";
  }

  if (hasValidStripeConfig && stripePaymentStatus === "paid" && bookingStatus !== "confirmed" && hasStripeRefs) {
    await supabaseAdmin
      .from("bookings")
      .update({
        status: "confirmed",
        ...statusTransitionTimestamp("confirmed"),
        stripe_session_id: sessionId,
        stripe_payment_intent_id: stripePaymentIntentId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", booking.id);
    booking.status = "confirmed";
  }

  if (hasValidStripeConfig && stripeCheckoutStatus === "expired" && bookingStatus === "pending") {
    await supabaseAdmin
      .from("bookings")
      .update({
        status: "cancelled",
        ...statusTransitionTimestamp("cancelled"),
        stripe_session_id: sessionId,
        stripe_payment_intent_id: stripePaymentIntentId || booking.stripe_payment_intent_id || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", booking.id);
    booking.status = "cancelled";
  }

  const normalizedBookingStatus = String(booking.status).toLowerCase();
  const paymentCompleted = stripePaymentStatus === "paid" || stripePaymentIntentStatus === "succeeded";
  const paymentVerified = normalizedBookingStatus === "confirmed" && paymentCompleted && hasPaymentIntentRef;
  const ownerNotified = paymentVerified;
  const emailQueued = Boolean(booking.customer_email);
  const isPartyBooking = Boolean(booking.party_ticket_code);

  return res.json({
    bookingId: booking.id,
    boat: booking.boat_name || "Boat",
    date: booking.start_date || "",
    departure: booking.departure_time || "",
    amount,
    paymentVerified,
    bookingStatus: normalizedBookingStatus,
    stripePaymentStatus,
    stripePaymentIntentStatus,
    stripeCheckoutStatus,
    stripeCheckoutUrl,
    stripePaymentIntentId,
    ownerNotified,
    emailQueued,
    bookingType: isPartyBooking ? "party" : "rental",
    partyTicketCode: booking.party_ticket_code || "",
    partyTicketCount: Number(booking.party_ticket_count ?? 0),
    partyTicketStatus: booking.party_ticket_status || "",
    partyEventDate: partyDetails?.party_event_date || booking.start_date || "",
    partyEventTime: partyDetails?.party_event_time || booking.departure_time || "",
    partyTierSelected: "",
    partyTierPrice: 0,
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

// Public availability read: owners manage calendar_events (booked/blocked/maintenance)
// under their own RLS-protected session, so the customer booking flow can't query that
// table directly. This returns only the minimal, non-identifying fields needed to keep
// the booking calendar in sync with owner-set blocks -- no description, booking_id, or
// user_id, since those could leak another customer's identity.
app.get("/api/boats/:boatId/blocked-slots", async (req, res) => {
  if (!hasValidSupabaseAdminConfig) return res.status(500).json({ error: getSupabaseConfigErrorMessage() });

  const boatId = String(req.params.boatId || "").trim();
  if (!boatId) {
    return res.status(400).json({ error: "Missing boatId in path" });
  }

  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();

  try {
    let query = supabaseAdmin
      .from("calendar_events")
      .select("start_time, end_time, all_day, event_type")
      .eq("boat_id", boatId)
      .in("event_type", ["blocked", "maintenance"]);

    if (from) query = query.gte("start_time", `${from}T00:00:00`);
    if (to) query = query.lte("start_time", `${to}T23:59:59`);

    const { data, error } = await query;
    if (error) {
      return res.status(500).json({ error: error.message || "Failed to load blocked slots" });
    }

    const blockedSlots = (data || []).map((row) => ({
      startTime: row.start_time,
      endTime: row.end_time,
      allDay: Boolean(row.all_day),
    }));

    return res.json({ boatId, blockedSlots });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error loading blocked slots";
    return res.status(500).json({ error: message });
  }
});

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

// --- "Side" manual booking-request flow ---------------------------------
// Deliberately separate from the Stripe checkout/webhook/refund routes above:
// no payment, no interaction with the bookings table's Stripe-related triggers.
// A client submits a request; an admin (using a separate Flutter app) phones
// the owner outside this system, then accepts or rejects via the routes below.

const bookingRequestSchema = z.object({
  boatId: z.string().min(1),
  boatName: z.string().min(1),
  customerId: z.string().uuid().optional(),
  customerName: z.string().min(1),
  customerEmail: z.string().email(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  departureTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  packageHours: z.number().min(0).max(24).optional(),
  guests: z.number().min(1).max(100).optional(),
  packageLabel: z.string().optional(),
  specialRequests: z.string().optional(),
  totalPrice: z.number().min(0).optional(),
});

app.post("/api/booking-requests", async (req, res) => {
  if (!hasValidSupabaseAdminConfig) {
    return res.status(500).json({ error: getSupabaseConfigErrorMessage() });
  }

  const parsed = bookingRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
  }

  const data = parsed.data;

  const { data: boat, error: boatError } = await supabaseAdmin
    .from("boats")
    .select("id, name, owner_id")
    .eq("id", data.boatId)
    .maybeSingle();

  if (boatError || !boat) {
    return res.status(404).json({ error: "Boat not found" });
  }

  const { data: owner } = await supabaseAdmin
    .from("users")
    .select("id, name, phone")
    .eq("id", boat.owner_id)
    .maybeSingle();

  // Basic conflict check across both the Stripe-confirmed bookings table and
  // already-accepted side-path requests, so the two systems don't obviously
  // double-book the same boat/date/time while both exist.
  const [{ data: existingBookings }, { data: existingRequests }] = await Promise.all([
    supabaseAdmin
      .from("bookings")
      .select("departure_time, status")
      .eq("boat_id", data.boatId)
      .eq("start_date", data.startDate)
      .in("status", ["pending", "confirmed"]),
    supabaseAdmin
      .from("booking_requests")
      .select("departure_time, status")
      .eq("boat_id", data.boatId)
      .eq("start_date", data.startDate)
      .in("status", ["pending", "accepted"]),
  ]);

  const isTaken = [...(existingBookings ?? []), ...(existingRequests ?? [])].some(
    (row) => row.departure_time === data.departureTime,
  );
  if (isTaken) {
    return res.status(409).json({ error: "This time slot is already requested or booked." });
  }

  const { data: created, error: insertError } = await supabaseAdmin
    .from("booking_requests")
    .insert({
      boat_id: boat.id,
      boat_name: boat.name || data.boatName,
      owner_id: boat.owner_id,
      owner_name: owner?.name ?? null,
      customer_id: data.customerId ?? null,
      customer_name: data.customerName,
      customer_email: data.customerEmail.trim().toLowerCase(),
      start_date: data.startDate,
      departure_time: data.departureTime,
      end_time: data.endTime ?? null,
      package_hours: data.packageHours ?? null,
      guests: data.guests ?? 1,
      package_label: data.packageLabel ?? null,
      special_requests: data.specialRequests ?? null,
      total_price: data.totalPrice ?? 0,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !created) {
    return res.status(500).json({ error: insertError?.message || "Failed to create booking request" });
  }

  const adminAlertEmail = process.env.ADMIN_ALERT_EMAIL;
  if (adminAlertEmail && resend && hasValidResendConfig) {
    try {
      await resend.emails.send({
        from: resendFromAddress,
        to: testEmailRecipient || adminAlertEmail,
        subject: `New booking request: ${boat.name}`,
        text: `${data.customerName} (${data.customerEmail}) requested ${boat.name} on ${data.startDate} at ${data.departureTime}. Owner: ${owner?.name ?? "unknown"} (${owner?.phone ?? "no phone on file"}). Request id: ${created.id}`,
      });
    } catch (error) {
      console.error("Failed to send admin alert email for booking request", error);
    }
  }

  return res.json({ ok: true, bookingRequestId: created.id });
});

app.get("/api/admin/booking-requests", requireSupabaseUser, requireAdminRole, async (req, res) => {
  const status = typeof req.query?.status === "string" ? req.query.status : null;

  let query = supabaseAdmin
    .from("booking_requests")
    .select("*, owner:users(phone)")
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    return res.status(500).json({ error: error.message || "Failed to load booking requests" });
  }

  return res.json({ bookingRequests: data ?? [] });
});

app.post("/api/admin/booking-requests/:id/accept", requireSupabaseUser, requireAdminRole, async (req, res) => {
  const { id } = req.params;

  const { data: bookingRequest, error: fetchError } = await supabaseAdmin
    .from("booking_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !bookingRequest) {
    return res.status(404).json({ error: "Booking request not found" });
  }

  const { error: updateError } = await supabaseAdmin
    .from("booking_requests")
    .update({
      status: "accepted",
      reviewed_by: req.supabaseUser.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    return res.status(500).json({ error: updateError.message || "Failed to accept booking request" });
  }

  if (resend && hasValidResendConfig) {
    try {
      await resend.emails.send({
        from: resendFromAddress,
        to: testEmailRecipient || bookingRequest.customer_email,
        subject: `Your booking is confirmed: ${bookingRequest.boat_name}`,
        text: `Good news — your booking for ${bookingRequest.boat_name} on ${bookingRequest.start_date} at ${bookingRequest.departure_time} is confirmed. We'll be in touch with any further details.`,
      });
    } catch (error) {
      console.error("Failed to send booking-accepted email", error);
    }
  }

  return res.json({ ok: true, status: "accepted" });
});

app.post("/api/admin/booking-requests/:id/reject", requireSupabaseUser, requireAdminRole, async (req, res) => {
  const { id } = req.params;
  const adminNotes = typeof req.body?.adminNotes === "string" ? req.body.adminNotes.trim() : null;

  const { error: updateError } = await supabaseAdmin
    .from("booking_requests")
    .update({
      status: "rejected",
      admin_notes: adminNotes,
      reviewed_by: req.supabaseUser.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    return res.status(500).json({ error: updateError.message || "Failed to reject booking request" });
  }

  return res.json({ ok: true, status: "rejected" });
});

app.patch("/api/admin/booking-requests/:id/reassign", requireSupabaseUser, requireAdminRole, async (req, res) => {
  const { id } = req.params;
  const newBoatId = typeof req.body?.boatId === "string" ? req.body.boatId.trim() : "";

  if (!newBoatId) {
    return res.status(400).json({ error: "Missing boatId" });
  }

  const { data: boat, error: boatError } = await supabaseAdmin
    .from("boats")
    .select("id, name, owner_id")
    .eq("id", newBoatId)
    .maybeSingle();

  if (boatError || !boat) {
    return res.status(404).json({ error: "Boat not found" });
  }

  const { data: owner } = await supabaseAdmin
    .from("users")
    .select("name")
    .eq("id", boat.owner_id)
    .maybeSingle();

  const { error: updateError } = await supabaseAdmin
    .from("booking_requests")
    .update({
      boat_id: boat.id,
      boat_name: boat.name,
      owner_id: boat.owner_id,
      owner_name: owner?.name ?? null,
      status: "pending",
      admin_notes: null,
      reviewed_by: null,
      reviewed_at: null,
    })
    .eq("id", id);

  if (updateError) {
    return res.status(500).json({ error: updateError.message || "Failed to reassign booking request" });
  }

  return res.json({ ok: true });
});

const isDirectlyExecuted = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectlyExecuted) {
  app.listen(port, () => {
    console.log(`Stripe API running on http://localhost:${port}`);
  });
}

export default app;
