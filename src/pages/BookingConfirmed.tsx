import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarCheck2, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookingConfirmationSkeleton } from "@/components/loading/LoadingUI";
import { fetchJsonFromEndpoints, resolveBookingLookupEndpoints } from "@/lib/api-endpoints";
import { supabase, getSessionSafe } from "@/lib/supabase";

type ResolvedBooking = {
  bookingId: string;
  boat: string;
  date: string;
  departure: string;
  amount: number;
  paymentVerified?: boolean;
  bookingStatus?: string;
  stripePaymentStatus?: string;
  stripeCheckoutStatus?: string;
  stripeCheckoutUrl?: string;
  ownerNotified: boolean;
  emailQueued: boolean;
  bookingType?: "party" | "rental";
  partyEventDate?: string;
  partyEventTime?: string;
  partyTicketCode?: string;
  partyTicketCount?: number;
  partyTicketStatus?: string;
  partyTicketPrice?: number;
  partyTicketQuantity?: number;
  partyTierSelected?: string;
  partyTierPrice?: number;
  duration?: number;
  endTime?: string;
};

const BookingConfirmed = () => {
  const [searchParams] = useSearchParams();

  const bookingId = searchParams.get("bookingId") ?? "";
  const boat = searchParams.get("boat") ?? "Boat";
  const date = searchParams.get("date") ?? "";
  const departure = searchParams.get("departure") ?? "";
  const amount = searchParams.get("amount") ?? "";
  const emailQueued = searchParams.get("emailQueued") === "true";
  const ownerNotified = searchParams.get("ownerNotified") === "true";
  const bookingTypeParam = searchParams.get("bookingType") ?? "rental";
  const partyEventDate = searchParams.get("partyEventDate") ?? "";
  const partyEventTime = searchParams.get("partyEventTime") ?? "";
  const partyTicketCode = searchParams.get("partyTicketCode") ?? "";
  const partyTicketCount = Number(searchParams.get("partyTicketCount") ?? 0);
  const partyTicketStatus = searchParams.get("partyTicketStatus") ?? "";
  const partyTicketPrice = Number(searchParams.get("partyTicketPrice") ?? 0);
  const partyTicketQuantity = Number(searchParams.get("partyTicketQuantity") ?? 0);
  const partyTierSelected = searchParams.get("partyTierSelected") ?? "";
  const partyTierPrice = Number(searchParams.get("partyTierPrice") ?? 0);
  const stripeSessionId = searchParams.get("session_id") ?? searchParams.get("sessionId") ?? "";

  const [resolvedBooking, setResolvedBooking] = useState<ResolvedBooking | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(stripeSessionId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stripeSessionId) {
      return;
    }

    let cancelled = false;
    const loadBooking = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const {
          data: { session },
        } = await getSessionSafe();

        if (!session?.access_token) {
          if (!cancelled) {
            setError("Sign in is required to verify Stripe payment status.");
            setIsLoading(false);
          }
          return;
        }

        const bookingLookupEndpoints = resolveBookingLookupEndpoints();
        const data = await fetchJsonFromEndpoints<ResolvedBooking>(bookingLookupEndpoints.map((endpoint) => `${endpoint}?session_id=${encodeURIComponent(stripeSessionId)}`), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });
        if (!cancelled) {
          setResolvedBooking(data);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Failed to load booking details.";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadBooking();

    return () => {
      cancelled = true;
    };
  }, [stripeSessionId]);

  const effectiveBookingId = resolvedBooking?.bookingId || bookingId;
  const effectiveBoat = resolvedBooking?.boat || boat;
  const effectiveDate = resolvedBooking?.date || date;
  const effectiveDeparture = resolvedBooking?.departure || departure;
  const effectiveAmount =
    resolvedBooking && Number.isFinite(resolvedBooking.amount)
      ? String(resolvedBooking.amount)
      : amount;
  const effectiveOwnerNotified = resolvedBooking?.ownerNotified ?? ownerNotified;
  const effectiveEmailQueued = resolvedBooking?.emailQueued ?? emailQueued;
  const effectivePartyTicketCode = resolvedBooking?.partyTicketCode || partyTicketCode;
  const effectivePartyTicketCount = Number(resolvedBooking?.partyTicketCount ?? partyTicketCount);
  const effectivePartyTicketStatus = resolvedBooking?.partyTicketStatus || partyTicketStatus;
  const effectivePartyTicketPrice = Number(resolvedBooking?.partyTicketPrice ?? partyTicketPrice);
  const effectivePartyTicketQuantity = Number(resolvedBooking?.partyTicketQuantity ?? partyTicketQuantity);
  const effectiveBookingType = resolvedBooking?.bookingType || bookingTypeParam;
  const effectivePartyEventDate = resolvedBooking?.partyEventDate || partyEventDate;
  const effectivePartyEventTime = resolvedBooking?.partyEventTime || partyEventTime;
  const effectivePartyTierSelected = resolvedBooking?.partyTierSelected || partyTierSelected;
  const effectivePartyTierPrice = Number(resolvedBooking?.partyTierPrice ?? partyTierPrice);
  const effectiveDuration = resolvedBooking?.duration;
  const effectiveEndTime = resolvedBooking?.endTime;
  const hasPartyTicket = Boolean(effectivePartyTicketCode && effectivePartyTicketStatus === "issued");
  const isPartyBooking = effectiveBookingType === "party";
  const paymentVerified = Boolean(stripeSessionId) && Boolean(resolvedBooking?.paymentVerified);
  const stripeCheckoutUrl = resolvedBooking?.stripeCheckoutUrl || "";
  const stripePaymentStatus = resolvedBooking?.stripePaymentStatus || "unknown";

  const pageTitle = paymentVerified
    ? (isPartyBooking ? "Party Booking Confirmed 🎉" : "Booking Confirmed")
    : "Payment not completed";
  const pageSummary = paymentVerified
    ? (isPartyBooking
      ? "Your party event is confirmed! Your tickets are ready. Show your ticket code at check-in."
      : "Your trip is secured. We lock this slot immediately to avoid overlaps and keep your booking reliable.")
    : (!stripeSessionId
      ? "No Stripe payment session was found. A booking is confirmed only after Stripe returns a paid session."
      : "Stripe has not confirmed a successful payment for this booking yet. Going back from checkout does not complete payment.");

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-20 pb-12">
        <section className="container mx-auto px-4 max-w-3xl">
          <Card className="shadow-card-hover">
            <CardHeader>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle className="flex items-center gap-2">
                  <CalendarCheck2 className="h-5 w-5 text-aegean" />
                  {pageTitle}
                </CardTitle>
                <Badge className={paymentVerified ? (isPartyBooking ? "bg-amber-100 text-amber-900 border-amber-300" : "bg-aegean/10 text-aegean border-aegean/30") : "bg-rose-100 text-rose-900 border-rose-300"}>
                  {paymentVerified ? (isPartyBooking ? "Party Event" : "Rental") : "Awaiting payment"} • {effectiveBookingId || "pending"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-muted-foreground">
                {pageSummary}
              </p>

              {isLoading ? <BookingConfirmationSkeleton /> : null}
              {error ? (
                <p className="text-xs text-destructive">{error}</p>
              ) : null}

              {!paymentVerified ? (
                <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900 space-y-2">
                  <p className="font-semibold">Payment is still pending</p>
                  <p>
                    Stripe status: {stripePaymentStatus}. This booking will only become confirmed after Stripe reports payment as paid.
                  </p>
                </div>
              ) : null}

              {/* Booking Details Card */}
              <div className={`rounded-2xl border ${isPartyBooking ? "border-amber-300/50 bg-amber-50" : "border-border bg-muted/20"} p-4 space-y-2 text-sm`}>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">{isPartyBooking ? "Party Boat" : "Boat"}</span>
                  <span className="font-medium text-foreground">{effectiveBoat}</span>
                </div>
                
                {isPartyBooking && (effectivePartyEventDate || effectiveDate) ? (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Event Date</span>
                    <span className="font-medium text-foreground">{effectivePartyEventDate || effectiveDate || "-"}</span>
                  </div>
                ) : null}

                {isPartyBooking && (effectivePartyEventTime || effectiveDeparture) ? (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Start Time</span>
                    <span className="font-medium text-foreground">{effectivePartyEventTime || effectiveDeparture || "-"}</span>
                  </div>
                ) : null}

                {!isPartyBooking ? (
                  <>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Date</span>
                      <span className="font-medium text-foreground">{effectiveDate || "-"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Departure</span>
                      <span className="font-medium text-foreground">{effectiveDeparture || "-"}</span>
                    </div>
                    {effectiveEndTime ? (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Return</span>
                        <span className="font-medium text-foreground">{effectiveEndTime}</span>
                      </div>
                    ) : null}
                    {effectiveDuration ? (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Duration</span>
                        <span className="font-medium text-foreground">{effectiveDuration} hours</span>
                      </div>
                    ) : null}
                  </>
                ) : null}

                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">{isPartyBooking ? "Total Cost" : "Paid Now"}</span>
                  <span className="font-medium text-foreground">€{effectiveAmount || "0"}</span>
                </div>
              </div>

              {/* Party Tickets Section */}
              {paymentVerified && hasPartyTicket ? (
                <div className="rounded-2xl border border-amber-400/40 bg-amber-50 p-4 text-sm text-foreground space-y-3">
                  <p className="font-semibold text-amber-900">🎟️ Party Tickets Issued</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-amber-700">Tickets</span>
                      <span className="font-medium text-amber-900">{Math.max(1, effectivePartyTicketQuantity || effectivePartyTicketCount)} tickets</span>
                    </div>
                    {effectivePartyTicketPrice > 0 && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-amber-700">Unit Price</span>
                        <span className="font-medium text-amber-900">€{effectivePartyTicketPrice.toFixed(effectivePartyTicketPrice % 1 === 0 ? 0 : 2)}</span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-amber-200">
                      <p className="text-xs text-amber-700 mb-1">Ticket Code</p>
                      <p className="font-mono font-semibold text-lg text-amber-900 tracking-wider">{effectivePartyTicketCode}</p>
                    </div>
                  </div>
                  <p className="text-xs text-amber-700 bg-amber-100 -mx-4 -mb-4 px-4 py-3 rounded-b-xl">
                    📋 Show this code at check-in. Keep it safe for your party boarding list.
                  </p>
                </div>
              ) : null}

              {/* Party Tier Section */}
              {paymentVerified && isPartyBooking && effectivePartyTierSelected ? (
                <div className="rounded-2xl border border-amber-300/50 bg-amber-50 p-4 text-sm text-foreground space-y-3">
                  <p className="font-semibold text-amber-900">✨ Party Tier Selected</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-amber-700">Tier</span>
                      <span className="font-medium text-amber-900">{effectivePartyTierSelected}</span>
                    </div>
                    {effectivePartyTierPrice > 0 && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-amber-700">Tier Price</span>
                        <span className="font-medium text-amber-900">€{effectivePartyTierPrice.toFixed(effectivePartyTierPrice % 1 === 0 ? 0 : 2)}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-amber-700 bg-amber-100 -mx-4 -mb-4 px-4 py-3 rounded-b-xl">
                    🎭 Your exclusive {effectivePartyTierSelected} tier benefits are included in your event.
                  </p>
                </div>
              ) : null}

              {/* Notification Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-2xl border border-border p-4 bg-background">
                  <p className="text-sm font-medium text-foreground flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-aegean" />
                    Owner Notification
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {effectiveOwnerNotified ? "✓ Sent to owner queue." : "⏳ Pending owner notification."}
                  </p>
                </div>
                <div className="rounded-2xl border border-border p-4 bg-background">
                  <p className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Mail className="h-4 w-4 text-aegean" />
                    Confirmation Email
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {effectiveEmailQueued ? "✓ Confirmation email queued." : "ℹ️ In-app confirmation active."}
                  </p>
                </div>
              </div>

              {/* Trust & Security */}
              <div className="rounded-2xl border border-aegean/30 bg-aegean/5 p-4 text-sm text-foreground flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 text-aegean mt-0.5 shrink-0" />
                <span>
                  {isPartyBooking 
                    ? "Your party tickets are reserved. Check-in is required 30 minutes before event start. Cancellations receive full refunds if made 7+ days in advance."
                    : "Trust-first protection: overlapping bookings are blocked before confirmation, and live availability updates are applied in real time."}
                </span>
              </div>

              {/* Cancellation Policy */}
              <div className="rounded-2xl border border-border bg-muted/20 p-4 text-sm text-foreground">
                <p className="font-medium">Cancellation & Refund</p>
                <p className="text-muted-foreground mt-1">
                  {isPartyBooking
                    ? "Need to cancel your party? Open My bookings and use Cancel booking. Full refund if cancelled 7+ days before, 50% if cancelled 7 days or less."
                    : "Need to cancel later? Open My bookings and use Cancel booking. Refunds are processed automatically: 100% refund when cancelled 48+ hours before trip start, otherwise 50%."}
                </p>
              </div>

              {/* Action Buttons */}
              {paymentVerified ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button asChild>
                    <Link to="/history">View My Bookings</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/boats">{isPartyBooking ? "Browse More Parties" : "Book Another Trip"}</Link>
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {stripeSessionId && stripeCheckoutUrl ? (
                    <Button asChild>
                      <a href={stripeCheckoutUrl}>Continue payment in Stripe</a>
                    </Button>
                  ) : (
                    <Button asChild>
                      <Link to="/booking">Back to booking</Link>
                    </Button>
                  )}
                  <Button asChild variant="outline">
                    <Link to="/history">Open booking history</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default BookingConfirmed;
