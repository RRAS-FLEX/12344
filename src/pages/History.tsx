import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarDays, CheckCircle2, Clock3, FileText, ListChecks, MapPin, MessageSquareText, Star, Wallet } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import RatingComparisonPill from "@/components/ratings/RatingComparisonPill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useIsMobile } from "@/hooks/use-mobile";
import { buildBoatDetailsPath, buildBoatPublicSlug, getBoats } from "@/lib/boats";
import type { Boat } from "@/lib/boats";
import {
  cancelCustomerBooking,
  getCustomerBookingHistory,
  getOwnerSalesHistory,
  type CancelBookingResult,
  type CustomerHistoryItem,
  type OwnerSalesHistoryItem,
} from "@/lib/history";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";

const isReviewEligible = (booking: CustomerHistoryItem) => {
  const tripDate = new Date(booking.startDate);
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  return booking.status !== "cancelled" && tripDate.getTime() <= today.getTime() && !booking.hasReview;
};

const History = () => {
  const { tl } = useLanguage();
  const { toast } = useToast();
  const { user, isLoading } = useCurrentUser();
  const [customerHistory, setCustomerHistory] = useState<CustomerHistoryItem[]>([]);
  const [salesHistory, setSalesHistory] = useState<OwnerSalesHistoryItem[]>([]);
  const [boats, setBoats] = useState<Boat[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);
  const [cancelResults, setCancelResults] = useState<Record<string, CancelBookingResult>>({});
  const [selectedBookingDetail, setSelectedBookingDetail] = useState<CustomerHistoryItem | null>(null);
  const [selectedSaleDetail, setSelectedSaleDetail] = useState<OwnerSalesHistoryItem | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();

  useEffect(() => {
    getBoats().then(setBoats).catch(() => setBoats([]));
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setCustomerHistory([]);
      setSalesHistory([]);
      setHistoryError("");
      return;
    }

    let cancelled = false;

    const loadHistory = async () => {
      try {
        setHistoryError("");
        const [nextCustomerHistory, nextSalesHistory] = await Promise.all([
          getCustomerBookingHistory(),
          user.isOwner ? getOwnerSalesHistory() : Promise.resolve([]),
        ]);

        if (!cancelled) {
          setCustomerHistory(nextCustomerHistory);
          setSalesHistory(nextSalesHistory);
        }
      } catch (error) {
        if (!cancelled) {
          setHistoryError(error instanceof Error ? error.message : tl("Unable to load history", "Αδυναμία φόρτωσης ιστορικού"));
        }
      }
    };

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.isOwner, tl]);

  const reviewableTrips = useMemo(() => customerHistory.filter(isReviewEligible).length, [customerHistory]);
  const completedSales = useMemo(() => salesHistory.filter((entry) => entry.status === "completed"), [salesHistory]);
  const totalSalesRevenue = useMemo(
    () => completedSales.reduce((sum, entry) => sum + Number(entry.totalPrice || 0), 0),
    [completedSales],
  );
  const pendingSales = useMemo(
    () => salesHistory.filter((entry) => entry.status === "pending" || entry.status === "confirmed").length,
    [salesHistory],
  );
  const getBoatById = (boatId: string) => boats.find((entry) => entry.id === boatId);
  const getBoatPath = (boatId: string) => {
    const matchingBoat = getBoatById(boatId);
    return matchingBoat ? buildBoatDetailsPath(matchingBoat) : "/boats";
  };
  const getBoatReference = (boatId: string) => {
    const matchingBoat = getBoatById(boatId);
    return matchingBoat ? matchingBoat.publicSlug || buildBoatPublicSlug(matchingBoat) : boatId;
  };

  const formatTripDateLabel = (dateValue: string, departureTime?: string | null) => {
    const dateText = new Date(dateValue).toLocaleDateString();
    const timeText = String(departureTime ?? "").trim();
    return timeText ? `${dateText} • ${timeText}` : dateText;
  };

  const activeDetail = selectedBookingDetail || selectedSaleDetail;
  const activeDetailBoatId = activeDetail?.boatId ?? "";
  const activeDetailTitle = selectedBookingDetail ? selectedBookingDetail.boatName : selectedSaleDetail?.boatName;
  const activeDetailSubtitle = selectedBookingDetail
    ? `${selectedBookingDetail.ownerName} • ${selectedBookingDetail.packageLabel}`
    : selectedSaleDetail
      ? `${tl("Guest", "Πελάτης")}: ${selectedSaleDetail.customerName} • ${selectedSaleDetail.packageLabel}`
      : "";
  const activeDetailDateTime = activeDetail
    ? formatTripDateLabel(activeDetail.startDate, activeDetail.departureTime)
    : "";
  const activeDetailTotal = activeDetail?.totalPrice ?? 0;
  const activeDetailPaidNow = activeDetail?.amountDueNow ?? activeDetailTotal;
  const activeDetailRemaining = Math.max(activeDetailTotal - activeDetailPaidNow, 0);
  const activeDetailStatus = activeDetail?.status ?? "";
  const activeDetailMarina = activeDetail?.departureMarina?.trim() || tl("Not provided", "Δεν ορίστηκε");
  const activeDetailPaymentMethod = String(activeDetail?.paymentMethod ?? "").trim() || "stripe";
  const activeDetailPaymentPlan = String(activeDetail?.paymentPlan ?? "").trim() || "full";
  const activeDetailBookedAt = activeDetail?.createdAt ? new Date(activeDetail.createdAt).toLocaleString() : "";
  const activeDetailExtras = Array.isArray(activeDetail?.extras) ? activeDetail.extras : [];
  const activeDetailNotes = activeDetail?.notes?.trim() || "";
  const activeDetailHasReview = Boolean(activeDetail?.hasReview);
  const activeDetailReviewRating = Number(activeDetail?.reviewRating ?? 0);
  const activeDetailReviewTitle = String(activeDetail?.reviewTitle ?? "").trim();
  const activeDetailReviewComment = String(activeDetail?.reviewComment ?? "").trim();
  const activeDetailReviewCreatedAt = activeDetail?.reviewCreatedAt
    ? new Date(activeDetail.reviewCreatedAt).toLocaleString()
    : "";
  const activeDetailCanRate = Boolean(selectedBookingDetail && isReviewEligible(selectedBookingDetail));
  const activeDetailBoatRating = getBoatById(activeDetailBoatId)?.rating ?? 0;
  const activeDetailComparisonRating = activeDetailHasReview
    ? activeDetailReviewRating
    : activeDetailBoatRating;
  const activeDetailComparisonCount = activeDetailHasReview ? 1 : 0;

  const formatEuro = (value: number) => `€${Number(value || 0).toFixed(2)}`;

  const canCancelBooking = (booking: CustomerHistoryItem) => {
    if (!["pending", "confirmed"].includes(booking.status)) {
      return false;
    }

    const tripDate = new Date(booking.startDate);
    return tripDate.getTime() > Date.now();
  };

  useEffect(() => {
    if (selectedBookingDetail || selectedSaleDetail) {
      return;
    }

    const bookingId = searchParams.get("bookingId");
    const saleBookingId = searchParams.get("saleBookingId");

    if (bookingId) {
      const match = customerHistory.find((entry) => entry.id === bookingId);
      if (match) {
        setSelectedBookingDetail(match);
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete("bookingId");
        setSearchParams(nextParams, { replace: true });
      }
      return;
    }

    if (saleBookingId) {
      const match = salesHistory.find((entry) => entry.id === saleBookingId);
      if (match) {
        setSelectedSaleDetail(match);
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete("saleBookingId");
        setSearchParams(nextParams, { replace: true });
      }
    }
  }, [
    customerHistory,
    salesHistory,
    searchParams,
    selectedBookingDetail,
    selectedSaleDetail,
    setSearchParams,
  ]);

  const handleCancelBooking = async (booking: CustomerHistoryItem) => {
    const accepted = window.confirm(
      `Cancel booking for ${booking.boatName} on ${new Date(booking.startDate).toLocaleDateString()}?`,
    );

    if (!accepted) {
      return;
    }

    setCancellingBookingId(booking.id);
    try {
      const result = await cancelCustomerBooking({
        bookingId: booking.id,
        reason: "customer-request",
      });

      setCancelResults((current) => ({
        ...current,
        [booking.id]: result,
      }));

      setCustomerHistory((current) =>
        current.map((entry) =>
          entry.id === booking.id
            ? {
                ...entry,
                status: "cancelled",
              }
            : entry,
        ),
      );

      const refundMessage = result.refundAmount > 0
        ? `Refund initiated: €${result.refundAmount.toFixed(2)} (${result.refundRatePercent}%).`
        : "Booking cancelled. No payment refund was required.";

      toast({
        title: "Booking cancelled",
        description: refundMessage,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to cancel booking";
      toast({
        title: "Cancellation failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setCancellingBookingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-16">
        <section className="py-12 border-b border-border bg-muted/30">
          <div className="container mx-auto px-4">
            <p className="text-sm text-muted-foreground">Trip history</p>
            <h1 className="mt-2 text-4xl font-heading font-bold text-foreground">{tl("Bookings and reviews", "Κρατήσεις και αξιολογήσεις")}</h1>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              {tl("Review requests appear here once the trip date has passed, which is the cleanest point in the workflow to ask for a customer rating.", "Τα αιτήματα αξιολόγησης εμφανίζονται εδώ αφού περάσει η ημερομηνία εκδρομής, που είναι το κατάλληλο σημείο στη ροή για να ζητηθεί βαθμολογία πελάτη.")}
            </p>

            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card className="shadow-card">
                <CardContent className="pt-6">
                  <div className="mb-3 flex items-center justify-between">
                    <CalendarDays className="h-5 w-5 text-aegean" />
                    <Badge variant="outline">Trips</Badge>
                  </div>
                  <p className="text-2xl font-heading font-bold text-foreground">{customerHistory.length}</p>
                  <p className="text-sm text-muted-foreground">{tl("Total bookings", "Συνολικές κρατήσεις")}</p>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardContent className="pt-6">
                  <div className="mb-3 flex items-center justify-between">
                    <MessageSquareText className="h-5 w-5 text-aegean" />
                    <Badge variant="outline">Action</Badge>
                  </div>
                  <p className="text-2xl font-heading font-bold text-foreground">{reviewableTrips}</p>
                  <p className="text-sm text-muted-foreground">{tl("Trips waiting for review", "Εκδρομές που περιμένουν αξιολόγηση")}</p>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardContent className="pt-6">
                  <div className="mb-3 flex items-center justify-between">
                    <CheckCircle2 className="h-5 w-5 text-aegean" />
                    <Badge variant="outline">Complete</Badge>
                  </div>
                  <p className="text-2xl font-heading font-bold text-foreground">{customerHistory.filter((item) => item.hasReview).length}</p>
                  <p className="text-sm text-muted-foreground">{tl("Trips already reviewed", "Εκδρομές που αξιολογήθηκαν")}</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="py-10">
          <div className="container mx-auto px-4">
            {!user && !isLoading ? (
              <Card className="shadow-card">
                <CardContent className="pt-6 space-y-4">
                  <p className="text-muted-foreground">{tl("Sign in to see your booking history and leave reviews.", "Συνδέσου για να δεις το ιστορικό κρατήσεων και να αφήσεις αξιολογήσεις.")}</p>
                  <Button asChild className="bg-gradient-accent text-accent-foreground">
                    <Link to="/">{tl("Back to home", "Επιστροφή στην αρχική")}</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : historyError ? (
              <Card className="shadow-card">
                <CardContent className="pt-6 space-y-4">
                  <p className="text-muted-foreground">{historyError}</p>
                  <Button asChild variant="outline">
                    <Link to="/boats">{tl("Browse boats", "Περιήγηση στα σκάφη")}</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Tabs defaultValue="bookings" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="bookings">{tl("Booking history", "Ιστορικό κρατήσεων")}</TabsTrigger>
                  {user?.isOwner ? <TabsTrigger value="sales">{tl("Selling history", "Ιστορικό πωλήσεων")}</TabsTrigger> : null}
                </TabsList>

                <TabsContent value="bookings" className="space-y-4">
                  {customerHistory.map((booking) => (
                    <Card key={booking.id} className="shadow-card-hover">
                      <CardHeader className="flex flex-row items-start justify-between gap-4">
                        <div>
                          <CardTitle>{booking.boatName}</CardTitle>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {booking.ownerName} • {booking.packageLabel}
                          </p>
                        </div>
                        <Badge variant="outline" className="capitalize">{booking.status}</Badge>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-medium text-foreground">{formatTripDateLabel(booking.startDate, booking.departureTime)}</p>
                          <p className="text-sm text-muted-foreground">{tl("Total paid", "Συνολικό ποσό")}: €{booking.totalPrice}</p>
                          {cancelResults[booking.id]?.refundAmount ? (
                            <p className="text-xs text-aegean mt-1">
                              Refund: €{cancelResults[booking.id].refundAmount.toFixed(2)} ({cancelResults[booking.id].refundRatePercent}%)
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <Button type="button" variant="outline" onClick={() => setSelectedBookingDetail(booking)}>
                            {tl("View details", "Προβολή λεπτομερειών")}
                          </Button>
                          <Button asChild variant="outline">
                            <Link to={getBoatPath(booking.boatId)}>{tl("Boat details", "Λεπτομέρειες σκάφους")}</Link>
                          </Button>
                          {canCancelBooking(booking) ? (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => handleCancelBooking(booking)}
                              disabled={cancellingBookingId === booking.id}
                            >
                              {cancellingBookingId === booking.id ? "Cancelling..." : "Cancel booking"}
                            </Button>
                          ) : null}
                          {isReviewEligible(booking) ? (
                            <Button asChild className="bg-gradient-accent text-accent-foreground">
                              <Link to={`/post-trip-review?bookingId=${encodeURIComponent(booking.id)}&boatRef=${encodeURIComponent(getBoatReference(booking.boatId))}&boat=${encodeURIComponent(booking.boatName)}`}>{tl("Leave review", "Αφήστε αξιολόγηση")}</Link>
                            </Button>
                          ) : booking.hasReview ? (
                            <Badge className="bg-emerald-500">{tl("Review submitted", "Η αξιολόγηση υποβλήθηκε")}</Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1">
                              <Clock3 className="h-3.5 w-3.5" /> {tl("Review after trip", "Αξιολόγηση μετά την εκδρομή")}
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {customerHistory.length === 0 && !isLoading ? (
                    <Card className="shadow-card">
                      <CardContent className="pt-6">
                        <p className="text-muted-foreground">{tl("No bookings yet.", "Δεν υπάρχουν κρατήσεις ακόμη.")}</p>
                      </CardContent>
                    </Card>
                  ) : null}
                </TabsContent>

                {user?.isOwner ? (
                  <TabsContent value="sales" className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <Card className="shadow-card">
                        <CardContent className="pt-6">
                          <p className="text-2xl font-heading font-bold text-foreground">{salesHistory.length}</p>
                          <p className="text-sm text-muted-foreground">{tl("Total sales bookings", "Συνολικές κρατήσεις πώλησης")}</p>
                        </CardContent>
                      </Card>
                      <Card className="shadow-card">
                        <CardContent className="pt-6">
                          <p className="text-2xl font-heading font-bold text-foreground">{pendingSales}</p>
                          <p className="text-sm text-muted-foreground">{tl("Pending or confirmed", "Σε εκκρεμότητα ή επιβεβαιωμένες")}</p>
                        </CardContent>
                      </Card>
                      <Card className="shadow-card">
                        <CardContent className="pt-6">
                          <p className="text-2xl font-heading font-bold text-foreground">€{totalSalesRevenue.toLocaleString()}</p>
                          <p className="text-sm text-muted-foreground">{tl("Completed sales revenue", "Έσοδα από ολοκληρωμένες πωλήσεις")}</p>
                        </CardContent>
                      </Card>
                    </div>

                    {salesHistory.map((sale) => (
                      <Card key={sale.id} className="shadow-card-hover">
                        <CardHeader className="flex flex-row items-start justify-between gap-4">
                          <div>
                            <CardTitle>{sale.boatName}</CardTitle>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {tl("Guest", "Πελάτης")}: {sale.customerName} • {sale.packageLabel}
                            </p>
                          </div>
                          <Badge variant="outline" className="capitalize">{sale.status}</Badge>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div>
                              <p className="font-medium text-foreground">{formatTripDateLabel(sale.startDate, sale.departureTime)}</p>
                            <p className="text-sm text-muted-foreground">{tl("Sale value", "Αξία πώλησης")}: €{sale.totalPrice}</p>
                          </div>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                              <Button type="button" variant="outline" onClick={() => setSelectedSaleDetail(sale)}>
                                {tl("View details", "Προβολή λεπτομερειών")}
                              </Button>
                              <Button asChild variant="outline">
                                <Link to={getBoatPath(sale.boatId)}>{tl("Boat details", "Λεπτομέρειες σκάφους")}</Link>
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}

                      {salesHistory.length === 0 && !isLoading ? (
                        <Card className="shadow-card">
                          <CardContent className="pt-6">
                            <p className="text-muted-foreground">{tl("No selling history yet.", "Δεν υπάρχει ακόμη ιστορικό πωλήσεων.")}</p>
                          </CardContent>
                        </Card>
                      ) : null}
                    </TabsContent>
                  ) : null}
                </Tabs>
              )}
            </div>
          </section>
        </main>

        {isMobile ? (
          <Drawer open={Boolean(activeDetail)} onOpenChange={(open) => { if (!open) { setSelectedBookingDetail(null); setSelectedSaleDetail(null); } }}>
            <DrawerContent className="max-h-[85vh]">
              <DrawerHeader>
                <DrawerTitle>{activeDetailTitle}</DrawerTitle>
                <DrawerDescription>{activeDetailSubtitle}</DrawerDescription>
              </DrawerHeader>
              <div className="px-4 pb-6 space-y-4 overflow-y-auto">
                <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <CalendarDays className="h-4 w-4 text-aegean" />
                    <span>{tl("When", "Πότε")}</span>
                  </div>
                  <div className="border-l-2 border-aegean/30 pl-3 space-y-2">
                    <p className="font-medium text-foreground">{activeDetailDateTime}</p>
                    <p className="text-sm text-muted-foreground">{tl("Status", "Κατάσταση")}: <span className="capitalize">{activeDetailStatus}</span></p>
                    {activeDetailBookedAt ? <p className="text-sm text-muted-foreground">{tl("Booked at", "Καταχωρήθηκε")}: {activeDetailBookedAt}</p> : null}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <MapPin className="h-4 w-4 text-aegean" />
                    <span>{tl("Where", "Πού")}</span>
                  </div>
                  <div className="border-l-2 border-aegean/30 pl-3">
                    <p className="text-sm text-foreground">{tl("Meeting point", "Σημείο συνάντησης")}: {activeDetailMarina}</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-background p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Wallet className="h-4 w-4 text-aegean" />
                    <span>{tl("Payment", "Πληρωμή")}</span>
                  </div>
                  <div className="border-l-2 border-aegean/30 pl-3 space-y-2">
                    <p className="text-sm text-foreground">{tl("Method", "Μέθοδος")}: <span className="capitalize">{activeDetailPaymentMethod}</span></p>
                    <p className="text-sm text-foreground">{tl("Plan", "Πλάνο")}: <span className="capitalize">{activeDetailPaymentPlan}</span></p>
                    <p className="text-sm text-foreground">{tl("Total", "Σύνολο")}: {formatEuro(activeDetailTotal)}</p>
                    <p className="text-sm text-foreground">{tl("Amount paid", "Πληρωμένο ποσό")}: {formatEuro(activeDetailPaidNow)}</p>
                    <p className="text-sm text-foreground">{tl("Remaining", "Υπόλοιπο")}: {formatEuro(activeDetailRemaining)}</p>
                    <p className="text-sm text-foreground">{tl("Deposit", "Προκαταβολή")}: {formatEuro(activeDetail?.depositAmount ?? 0)}</p>
                    <p className="text-sm text-foreground">{tl("Platform fee", "Προμήθεια πλατφόρμας")}: {formatEuro(activeDetail?.platformCommission ?? 0)}</p>
                    <p className="text-sm text-foreground">{tl("Owner payout", "Πληρωμή ιδιοκτήτη")}: {formatEuro(activeDetail?.ownerPayout ?? 0)}</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-background p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <ListChecks className="h-4 w-4 text-aegean" />
                    <span>{tl("Add-ons", "Πρόσθετα")}</span>
                  </div>
                  <div className="border-l-2 border-aegean/30 pl-3">
                    {activeDetailExtras.length > 0 ? (
                      <ul className="list-disc pl-5 text-sm text-foreground space-y-1">
                        {activeDetailExtras.map((extra) => (
                          <li key={`${activeDetail?.id}-${extra}`}>{extra}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">{tl("No add-ons selected", "Δεν έχουν επιλεγεί πρόσθετα")}</p>
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-background p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <FileText className="h-4 w-4 text-aegean" />
                    <span>{tl("Notes", "Σημειώσεις")}</span>
                  </div>
                  <div className="border-l-2 border-aegean/30 pl-3">
                    <p className="text-sm text-foreground">{activeDetailNotes || tl("No special notes", "Χωρίς ειδικές σημειώσεις")}</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-background p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Star className="h-4 w-4 text-aegean" />
                    <span>{tl("Rating", "Αξιολόγηση")}</span>
                  </div>
                  <div className="border-l-2 border-aegean/30 pl-3 space-y-2">
                    <RatingComparisonPill
                      rating={activeDetailComparisonRating}
                      reviewCount={activeDetailComparisonCount}
                      benchmarkRating={4.6}
                      label={tl("fleet", "στόλο")}
                    />
                    {activeDetailHasReview ? (
                      <>
                        <div className="flex items-center gap-1" aria-label={`Rating ${activeDetailReviewRating} out of 5`}>
                          {[1, 2, 3, 4, 5].map((value) => (
                            <Star
                              key={`mobile-detail-rating-${value}`}
                              className={`h-4 w-4 ${value <= activeDetailReviewRating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`}
                            />
                          ))}
                        </div>
                        {activeDetailReviewTitle ? <p className="text-sm font-medium text-foreground">{activeDetailReviewTitle}</p> : null}
                        {activeDetailReviewComment ? <p className="text-sm text-foreground">{activeDetailReviewComment}</p> : null}
                        {activeDetailReviewCreatedAt ? <p className="text-xs text-muted-foreground">{activeDetailReviewCreatedAt}</p> : null}
                      </>
                    ) : activeDetailCanRate && selectedBookingDetail ? (
                      <Button asChild variant="outline" className="w-full sm:w-auto">
                        <Link
                          to={`/post-trip-review?bookingId=${encodeURIComponent(selectedBookingDetail.id)}&boatRef=${encodeURIComponent(getBoatReference(selectedBookingDetail.boatId))}&boat=${encodeURIComponent(selectedBookingDetail.boatName)}`}
                          onClick={() => { setSelectedBookingDetail(null); setSelectedSaleDetail(null); }}
                        >
                          {tl("Rate this trip", "Αξιολόγησε αυτή την εκδρομή")}
                        </Link>
                      </Button>
                    ) : (
                      <p className="text-sm text-muted-foreground">{tl("No rating yet", "Δεν υπάρχει ακόμη αξιολόγηση")}</p>
                    )}
                  </div>
                </div>
                {activeDetailBoatId ? (
                  <Button asChild variant="outline" className="w-full">
                    <Link to={getBoatPath(activeDetailBoatId)} onClick={() => { setSelectedBookingDetail(null); setSelectedSaleDetail(null); }}>
                      {tl("Open boat details", "Άνοιγμα λεπτομερειών σκάφους")}
                    </Link>
                  </Button>
                ) : null}
              </div>
            </DrawerContent>
          </Drawer>
        ) : (
          <Dialog open={Boolean(activeDetail)} onOpenChange={(open) => { if (!open) { setSelectedBookingDetail(null); setSelectedSaleDetail(null); } }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{activeDetailTitle}</DialogTitle>
                <DialogDescription>{activeDetailSubtitle}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <CalendarDays className="h-4 w-4 text-aegean" />
                    <span>{tl("When", "Πότε")}</span>
                  </div>
                  <div className="border-l-2 border-aegean/30 pl-3 space-y-2">
                    <p className="font-medium text-foreground">{activeDetailDateTime}</p>
                    <p className="text-sm text-muted-foreground">{tl("Status", "Κατάσταση")}: <span className="capitalize">{activeDetailStatus}</span></p>
                    {activeDetailBookedAt ? <p className="text-sm text-muted-foreground">{tl("Booked at", "Καταχωρήθηκε")}: {activeDetailBookedAt}</p> : null}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <MapPin className="h-4 w-4 text-aegean" />
                    <span>{tl("Where", "Πού")}</span>
                  </div>
                  <div className="border-l-2 border-aegean/30 pl-3">
                    <p className="text-sm text-foreground">{tl("Meeting point", "Σημείο συνάντησης")}: {activeDetailMarina}</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-background p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Wallet className="h-4 w-4 text-aegean" />
                    <span>{tl("Payment", "Πληρωμή")}</span>
                  </div>
                  <div className="border-l-2 border-aegean/30 pl-3 space-y-2">
                    <p className="text-sm text-foreground">{tl("Method", "Μέθοδος")}: <span className="capitalize">{activeDetailPaymentMethod}</span></p>
                    <p className="text-sm text-foreground">{tl("Plan", "Πλάνο")}: <span className="capitalize">{activeDetailPaymentPlan}</span></p>
                    <p className="text-sm text-foreground">{tl("Total", "Σύνολο")}: {formatEuro(activeDetailTotal)}</p>
                    <p className="text-sm text-foreground">{tl("Amount paid", "Πληρωμένο ποσό")}: {formatEuro(activeDetailPaidNow)}</p>
                    <p className="text-sm text-foreground">{tl("Remaining", "Υπόλοιπο")}: {formatEuro(activeDetailRemaining)}</p>
                    <p className="text-sm text-foreground">{tl("Deposit", "Προκαταβολή")}: {formatEuro(activeDetail?.depositAmount ?? 0)}</p>
                    <p className="text-sm text-foreground">{tl("Platform fee", "Προμήθεια πλατφόρμας")}: {formatEuro(activeDetail?.platformCommission ?? 0)}</p>
                    <p className="text-sm text-foreground">{tl("Owner payout", "Πληρωμή ιδιοκτήτη")}: {formatEuro(activeDetail?.ownerPayout ?? 0)}</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-background p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <ListChecks className="h-4 w-4 text-aegean" />
                    <span>{tl("Add-ons", "Πρόσθετα")}</span>
                  </div>
                  <div className="border-l-2 border-aegean/30 pl-3">
                    {activeDetailExtras.length > 0 ? (
                      <ul className="list-disc pl-5 text-sm text-foreground space-y-1">
                        {activeDetailExtras.map((extra) => (
                          <li key={`${activeDetail?.id}-${extra}`}>{extra}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">{tl("No add-ons selected", "Δεν έχουν επιλεγεί πρόσθετα")}</p>
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-background p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <FileText className="h-4 w-4 text-aegean" />
                    <span>{tl("Notes", "Σημειώσεις")}</span>
                  </div>
                  <div className="border-l-2 border-aegean/30 pl-3">
                    <p className="text-sm text-foreground">{activeDetailNotes || tl("No special notes", "Χωρίς ειδικές σημειώσεις")}</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-background p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Star className="h-4 w-4 text-aegean" />
                    <span>{tl("Rating", "Αξιολόγηση")}</span>
                  </div>
                  <div className="border-l-2 border-aegean/30 pl-3 space-y-2">
                    <RatingComparisonPill
                      rating={activeDetailComparisonRating}
                      reviewCount={activeDetailComparisonCount}
                      benchmarkRating={4.6}
                      label={tl("fleet", "στόλο")}
                    />
                    {activeDetailHasReview ? (
                      <>
                        <div className="flex items-center gap-1" aria-label={`Rating ${activeDetailReviewRating} out of 5`}>
                          {[1, 2, 3, 4, 5].map((value) => (
                            <Star
                              key={`desktop-detail-rating-${value}`}
                              className={`h-4 w-4 ${value <= activeDetailReviewRating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`}
                            />
                          ))}
                        </div>
                        {activeDetailReviewTitle ? <p className="text-sm font-medium text-foreground">{activeDetailReviewTitle}</p> : null}
                        {activeDetailReviewComment ? <p className="text-sm text-foreground">{activeDetailReviewComment}</p> : null}
                        {activeDetailReviewCreatedAt ? <p className="text-xs text-muted-foreground">{activeDetailReviewCreatedAt}</p> : null}
                      </>
                    ) : activeDetailCanRate && selectedBookingDetail ? (
                      <Button asChild variant="outline" className="w-full sm:w-auto">
                        <Link
                          to={`/post-trip-review?bookingId=${encodeURIComponent(selectedBookingDetail.id)}&boatRef=${encodeURIComponent(getBoatReference(selectedBookingDetail.boatId))}&boat=${encodeURIComponent(selectedBookingDetail.boatName)}`}
                          onClick={() => { setSelectedBookingDetail(null); setSelectedSaleDetail(null); }}
                        >
                          {tl("Rate this trip", "Αξιολόγησε αυτή την εκδρομή")}
                        </Link>
                      </Button>
                    ) : (
                      <p className="text-sm text-muted-foreground">{tl("No rating yet", "Δεν υπάρχει ακόμη αξιολόγηση")}</p>
                    )}
                  </div>
                </div>
                {activeDetailBoatId ? (
                  <Button asChild variant="outline" className="w-full">
                    <Link to={getBoatPath(activeDetailBoatId)} onClick={() => { setSelectedBookingDetail(null); setSelectedSaleDetail(null); }}>
                      {tl("Open boat details", "Άνοιγμα λεπτομερειών σκάφους")}
                    </Link>
                  </Button>
                ) : null}
              </div>
            </DialogContent>
          </Dialog>
        )}

        <Footer />
      </div>
    );
  };

  export default History;