import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, Calendar, Package, Ship, Plus, Star, Wallet, CheckCircle2, ArrowLeft, AlertTriangle } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { getOwnerBoats, getOwnerBookings, updateOwnerBookingStatus, OwnerBoat, OwnerBooking } from "../lib/owner-dashboard";
import WeatherForecastPanel from "../components/owner/WeatherForecastPanel";
import AddBoatModal from "../components/owner/AddBoatModal";
import BoatsManagement from "../components/owner/BoatsManagement";
import CalendarManagement from "../components/owner/CalendarManagement";
import PackageManagement from "../components/owner/PackageManagement";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { supabase, getSessionSafe } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";

interface StripeConnectStatus {
  isReady: boolean;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

const OwnerDashboard = () => {
  const { tl } = useLanguage();
  const { user } = useCurrentUser();
  const [activeTab, setActiveTab] = useState("overview");
  const [showAddBoat, setShowAddBoat] = useState(false);
  const [boats, setBoats] = useState<OwnerBoat[]>([]);
  const [bookings, setBookings] = useState<OwnerBooking[]>([]);
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [dashboardLoadError, setDashboardLoadError] = useState<string | null>(null);
  const [updatingBookingId, setUpdatingBookingId] = useState<string | null>(null);
  const [editingBoat, setEditingBoat] = useState<OwnerBoat | undefined>(undefined);
  const [isStripeConnectLoading, setIsStripeConnectLoading] = useState(false);
  const [stripeConnectError, setStripeConnectError] = useState<string | null>(null);
  const [stripeStatus, setStripeStatus] = useState<StripeConnectStatus | null>(null);
  const [isStripeStatusLoading, setIsStripeStatusLoading] = useState(true);
  const payoutsReady = Boolean(stripeStatus?.isReady);
  const hasStripeStatus = stripeStatus !== null;

  const getBookingEndDateTime = (booking: OwnerBooking): Date | null => {
    const datePart = booking.endDate || booking.date;
    if (!datePart) return null;

    const rawTime = booking.endTime || booking.departureTime || "23:59";
    const timePart = /^\d{2}:\d{2}(:\d{2})?$/.test(rawTime) ? rawTime : "23:59";
    const end = new Date(`${datePart}T${timePart.length === 5 ? `${timePart}:00` : timePart}`);
    if (Number.isNaN(end.getTime())) return null;
    return end;
  };

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        setIsDashboardLoading(true);
        setDashboardLoadError(null);
        const [nextBoats, nextBookings] = await Promise.all([
          getOwnerBoats(),
          getOwnerBookings(),
        ]);
        setBoats(nextBoats);
        setBookings(nextBookings);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load owner dashboard";
        setDashboardLoadError(message);
      } finally {
        setIsDashboardLoading(false);
      }
    };

    loadDashboard();
  }, [showAddBoat]);

  const stats = useMemo(() => {
    const listedBoats = boats.length;
    const totalBookings = bookings.length;
    const totalRevenue = bookings
      .filter((booking) => {
        const status = String(booking.status || "").toLowerCase();
        return status === "confirmed" || status === "completed";
      })
      .reduce((sum, booking) => sum + Number(booking.totalPrice || 0), 0);
    const averageRating = listedBoats > 0
      ? (boats.reduce((sum, boat) => sum + Number(boat.rating || 0), 0) / listedBoats).toFixed(1)
      : "0.0";

    return {
      listedBoats,
      totalBookings,
      totalRevenue,
      averageRating,
    };
  }, [boats, bookings]);

  useEffect(() => {
    const loadStripeStatus = async () => {
      try {
        setIsStripeStatusLoading(true);
        const {
          data: { session },
        } = await getSessionSafe();

        const apiBaseUrl = import.meta.env?.VITE_API_BASE_URL?.trim?.() ?? "";
        const base = apiBaseUrl ? apiBaseUrl.replace(/\/$/, "") : "";
        const statusUrl = `${base}/api/stripe/connect/status`;

        const response = await fetch(statusUrl, {
          method: "GET",
          headers: {
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
        });

        if (!response.ok) return;
        const json = await response.json();
        setStripeStatus(json);
      } catch (error) {
        console.error("Failed to load Stripe Connect status", error);
      } finally {
        setIsStripeStatusLoading(false);
      }
    };

    void loadStripeStatus();
  }, []);

  const handleStripeConnectClick = async () => {
    try {
      setStripeConnectError(null);
      setIsStripeConnectLoading(true);

      if (payoutsReady) {
        setStripeConnectError(
          tl(
            "Stripe payouts are already active for your account.",
            "Οι πληρωμές Stripe είναι ήδη ενεργές για τον λογαριασμό σου.",
          ),
        );
        return;
      }

      const {
        data: { session },
      } = await getSessionSafe();

      const apiBaseUrl = import.meta.env?.VITE_API_BASE_URL?.trim?.() ?? "";
      const base = apiBaseUrl ? apiBaseUrl.replace(/\/$/, "") : "";
      const accountsUrl = `${base}/api/stripe/connect/accounts`;
      const onboardingUrl = `${base}/api/stripe/connect/onboarding-link`;

      const accountsResponse = await fetch(accountsUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          ownerId: user?.id || "self",
          email: user?.email ?? undefined,
        }),
      });

      if (!accountsResponse.ok) {
        const text = await accountsResponse.text();
        throw new Error(text || "Failed to create Stripe Connect account");
      }

      const origin = window.location.origin;
      const refreshUrl = `${origin}/owner-dashboard`;
      const returnUrl = `${origin}/owner-dashboard`;

      const onboardingResponse = await fetch(onboardingUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          ownerId: user?.id || "self",
          refreshUrl,
          returnUrl,
        }),
      });

      if (!onboardingResponse.ok) {
        const text = await onboardingResponse.text();
        throw new Error(text || "Failed to create Stripe Connect onboarding link");
      }

      const onboardingJson = await onboardingResponse.json();
      const onboardingUrlValue = onboardingJson?.url;

      if (!onboardingUrlValue || typeof onboardingUrlValue !== "string") {
        throw new Error("Stripe onboarding URL missing in response");
      }

      window.location.href = onboardingUrlValue;
    } catch (error) {
      console.error("Stripe Connect setup failed", error);
      setStripeConnectError(
        error instanceof Error
          ? error.message
          : "Failed to start Stripe Connect onboarding. Please try again.",
      );
    } finally {
      setIsStripeConnectLoading(false);
    }
  };

  const dashboardStats = [
    { label: "Listed Boats", value: stats.listedBoats, icon: Ship, color: "text-aegean" },
    { label: "Total Bookings", value: stats.totalBookings, icon: Calendar, color: "text-turquoise" },
    { label: "Average Rating", value: stats.averageRating, icon: Star, color: "text-amber-400" },
    { label: "Revenue", value: `€${stats.totalRevenue.toLocaleString()}`, icon: Wallet, color: "text-emerald-500" },
  ];

  const forecastLocations = Array.from(
    new Set(boats.map((boat) => boat.departureMarina || boat.location).map((value) => value.trim()).filter(Boolean))
  );

  const confirmedBookings = bookings.filter((b) => b.status === "confirmed");
  const now = new Date();

  const upcomingConfirmedBookings = confirmedBookings.filter((booking) => {
    const end = getBookingEndDateTime(booking);
    if (!end) return true;
    return end.getTime() > now.getTime();
  });

  const pastOrOngoingConfirmedBookings = confirmedBookings.filter((booking) => {
    const end = getBookingEndDateTime(booking);
    return !!end && end.getTime() <= now.getTime();
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-16">
        <section className="py-8 md:py-12 border-b border-border bg-gradient-ocean">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between gap-4 mb-6">
              <div>
                <p className="text-primary-foreground/80 text-sm mb-2">
                  {user?.name
                    ? `${tl("Welcome back", "Καλώς ήρθες ξανά")}, ${user.name}`
                    : tl("Welcome back", "Καλώς ήρθες ξανά")}
                </p>
                <h1 className="text-3xl md:text-4xl font-heading font-bold text-primary-foreground">
                  {user?.name || tl("Owner Dashboard", "Πίνακας Ιδιοκτήτη")}
                </h1>
              </div>
              <div className="flex flex-col items-end gap-3 sm:flex-row sm:items-center">
                <Button
                  asChild
                  variant="outline"
                  className="bg-primary-foreground/10 text-primary-foreground border-primary-foreground/40 hover:bg-primary-foreground/20"
                >
                  <Link to="/owner-profile" className="flex items-center gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    {tl("Back to profile", "Επιστροφή στο προφίλ")}
                  </Link>
                </Button>
                <Button
                  type="button"
                  className="gap-2 bg-emerald-500 text-white hover:bg-emerald-600"
                  onClick={handleStripeConnectClick}
                  disabled={isStripeConnectLoading || payoutsReady}
                >
                  <Wallet className="h-4 w-4" />
                  {payoutsReady
                    ? tl("Payouts active (Stripe)", "Οι πληρωμές Stripe είναι ενεργές (Stripe)")
                    : isStripeConnectLoading
                      ? tl("Connecting Stripe…", "Σύνδεση Stripe…")
                      : tl("Set up payouts (Stripe)", "Ρύθμιση πληρωμών (Stripe)")}
                </Button>
              </div>
            </div>

            {isStripeStatusLoading ? (
              <div className="mb-4 max-w-2xl rounded-lg border border-border bg-background/70 px-3 py-2 text-sm shadow-sm backdrop-blur">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-52" />
                  <Skeleton className="h-3 w-72" />
                </div>
              </div>
            ) : hasStripeStatus && !payoutsReady ? (
              <div className="mb-4 max-w-2xl rounded-lg border border-amber-400/60 bg-amber-50/90 px-3 py-2 text-sm text-amber-900 shadow-sm backdrop-blur">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
                  <div className="space-y-0.5">
                    <p className="font-medium">
                      {tl(
                        "Stripe payouts are not connected yet.",
                        "Οι πληρωμές Stripe δεν έχουν συνδεθεί ακόμα.",
                      )}
                    </p>
                    <p className="text-xs text-amber-900/80">
                      {tl(
                        "Connect payouts so your active boats can appear to travelers and receive bookings.",
                        "Σύνδεσε τις πληρωμές για να εμφανίζονται τα ενεργά σκάφη σου στους ταξιδιώτες και να δέχεσαι κρατήσεις.",
                      )}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {hasStripeStatus && payoutsReady ? (
              <div className="mb-4 max-w-2xl rounded-lg border border-emerald-500/60 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 shadow-sm backdrop-blur">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                  <div className="space-y-0.5">
                    <p className="font-medium">
                      {tl(
                        "Stripe payouts are active.",
                        "Οι πληρωμές Stripe είναι ενεργές.",
                      )}
                    </p>
                    <p className="text-xs text-emerald-900/80">
                      {tl(
                        "Your active boats can now be listed to travelers and get paid.",
                        "Τα ενεργά σκάφη σου μπορούν πλέον να εμφανίζονται στους ταξιδιώτες και να πληρώνονται.",
                      )}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {stripeConnectError ? (
              <div className="mb-4 max-w-xl rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {stripeConnectError}
              </div>
            ) : null}

            {dashboardLoadError ? (
              <div className="mb-4 max-w-xl rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {dashboardLoadError}
              </div>
            ) : null}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {isDashboardLoading
                ? Array.from({ length: 4 }).map((_, index) => (
                    <Card key={`dashboard-skeleton-${index}`} className="bg-primary-foreground/10 border-primary-foreground/20">
                      <CardContent className="pt-6 space-y-3">
                        <div className="h-5 w-5 rounded bg-primary-foreground/30 animate-pulse" />
                        <div className="h-7 w-24 rounded bg-primary-foreground/30 animate-pulse" />
                        <div className="h-4 w-28 rounded bg-primary-foreground/20 animate-pulse" />
                      </CardContent>
                    </Card>
                  ))
                : dashboardStats.map((stat) => (
                    <Card key={stat.label} className="bg-primary-foreground/10 border-primary-foreground/20">
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-3">
                          <stat.icon className={`h-5 w-5 ${stat.color}`} />
                        </div>
                        <p className="text-2xl font-heading font-bold text-primary-foreground">{stat.value}</p>
                        <p className="text-sm text-primary-foreground/80">{stat.label}</p>
                      </CardContent>
                    </Card>
                  ))}
            </div>
          </div>
        </section>

        <section className="py-10 md:py-12">
          <div className="container mx-auto px-4">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <TabsList className="grid w-full sm:w-auto grid-cols-5">
                  <TabsTrigger value="bookings" className="text-xs sm:text-sm">{tl("Bookings", "Κρατήσεις")}</TabsTrigger>
                  <TabsTrigger value="overview" className="text-xs sm:text-sm">{tl("Overview", "Επισκόπηση")}</TabsTrigger>
                  <TabsTrigger value="boats" className="text-xs sm:text-sm">{tl("Boats", "Σκάφη")}</TabsTrigger>
                  <TabsTrigger value="calendar" className="text-xs sm:text-sm">{tl("Calendar", "Ημερολόγιο")}</TabsTrigger>
                  <TabsTrigger value="packages" className="text-xs sm:text-sm">{tl("Packages", "Πακέτα")}</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="bookings" className="space-y-6">
                <Card className="shadow-card-hover">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-aegean" />
                      {tl("Bookings", "Κρατήσεις")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="rounded-2xl border border-border p-4">
                        <p className="text-sm text-muted-foreground">{tl("Total bookings", "Συνολικές κρατήσεις")}</p>
                        <p className="text-2xl font-bold text-foreground mt-1">{stats.totalBookings}</p>
                      </div>
                      <div className="rounded-2xl border border-border p-4">
                        <p className="text-sm text-muted-foreground">{tl("Confirmed", "Επιβεβαιωμένες")}</p>
                        <p className="text-2xl font-bold text-foreground mt-1">{confirmedBookings.length}</p>
                      </div>
                      <div className="rounded-2xl border border-border p-4">
                        <p className="text-sm text-muted-foreground">{tl("Completed", "Ολοκληρωμένες")}</p>
                        <p className="text-2xl font-bold text-foreground mt-1">{bookings.filter((b) => b.status === "completed").length}</p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="space-y-3">
                        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                          {tl("Coming trips", "Επερχόμενες εκδρομές")}
                          <Badge variant="outline">{upcomingConfirmedBookings.length}</Badge>
                        </h3>
                        {upcomingConfirmedBookings.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            {tl("No upcoming confirmed trips.", "Δεν υπάρχουν επερχόμενες επιβεβαιωμένες εκδρομές.")}
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {upcomingConfirmedBookings.map((booking) => (
                              <div
                                key={booking.id}
                                className="rounded-xl border border-border p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                              >
                                <div className="space-y-1">
                                  <p className="font-semibold text-foreground">{booking.boatName}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {booking.date} · {booking.departureTime || tl("Time TBC", "Ώρα προς επιβεβαίωση")} · {booking.guests} {tl("guests", "επισκέπτες")}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {tl("Guest", "Επισκέπτης")}: {booking.customerName}
                                  </p>
                                </div>
                                <div className="flex items-center gap-3 justify-between md:justify-end">
                                  <div className="text-right">
                                    <p className="text-sm font-semibold text-foreground">€{booking.totalPrice.toFixed(2)}</p>
                                    <Badge variant="outline" className="mt-1 capitalize">{booking.status}</Badge>
                                  </div>
                                  <Button
                                    size="sm"
                                    className="gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
                                    disabled
                                    onClick={async () => {
                                      try {
                                        setUpdatingBookingId(booking.id);
                                        await updateOwnerBookingStatus(booking.id, "completed");
                                        setBookings((current) =>
                                          current.map((row) =>
                                            row.id === booking.id ? { ...row, status: "completed" } : row,
                                          ),
                                        );
                                      } finally {
                                        setUpdatingBookingId(null);
                                      }
                                    }}
                                  >
                                    <CheckCircle2 className="h-4 w-4" />
                                    {tl("Mark completed", "Σήμανση ως ολοκληρωμένη")}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1"
                                    disabled={updatingBookingId === booking.id}
                                    onClick={async () => {
                                      try {
                                        setUpdatingBookingId(booking.id);
                                        await updateOwnerBookingStatus(booking.id, "cancelled");
                                        setBookings((current) =>
                                          current.map((row) =>
                                            row.id === booking.id ? { ...row, status: "cancelled" } : row,
                                          ),
                                        );
                                      } finally {
                                        setUpdatingBookingId(null);
                                      }
                                    }}
                                  >
                                    {tl("Cancel", "Ακύρωση")}
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-3 pt-2 border-t border-border/60">
                        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                          {tl("Trips happening or past", "Εκδρομές σε εξέλιξη ή παρελθόν")}
                          <Badge variant="outline">{pastOrOngoingConfirmedBookings.length}</Badge>
                        </h3>
                        {pastOrOngoingConfirmedBookings.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            {tl("No trips have started yet.", "Δεν έχουν ξεκινήσει ακόμα εκδρομές.")}
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {pastOrOngoingConfirmedBookings.map((booking) => (
                              <div
                                key={booking.id}
                                className="rounded-xl border border-border p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                              >
                                <div className="space-y-1">
                                  <p className="font-semibold text-foreground">{booking.boatName}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {booking.date} · {booking.departureTime || tl("Time TBC", "Ώρα προς επιβεβαίωση")} · {booking.guests} {tl("guests", "επισκέπτες")}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {tl("Guest", "Επισκέπτης")}: {booking.customerName}
                                  </p>
                                </div>
                                <div className="flex items-center gap-3 justify-between md:justify-end">
                                  <div className="text-right">
                                    <p className="text-sm font-semibold text-foreground">€{booking.totalPrice.toFixed(2)}</p>
                                    <Badge variant="outline" className="mt-1 capitalize">{booking.status}</Badge>
                                  </div>
                                  <Button
                                    size="sm"
                                    className="gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
                                    disabled={updatingBookingId === booking.id}
                                    onClick={async () => {
                                      try {
                                        setUpdatingBookingId(booking.id);
                                        await updateOwnerBookingStatus(booking.id, "completed");
                                        setBookings((current) =>
                                          current.map((row) =>
                                            row.id === booking.id ? { ...row, status: "completed" } : row,
                                          ),
                                        );
                                      } finally {
                                        setUpdatingBookingId(null);
                                      }
                                    }}
                                  >
                                    <CheckCircle2 className="h-4 w-4" />
                                    {tl("Mark completed", "Σήμανση ως ολοκληρωμένη")}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1"
                                    disabled={updatingBookingId === booking.id}
                                    onClick={async () => {
                                      try {
                                        setUpdatingBookingId(booking.id);
                                        await updateOwnerBookingStatus(booking.id, "cancelled");
                                        setBookings((current) =>
                                          current.map((row) =>
                                            row.id === booking.id ? { ...row, status: "cancelled" } : row,
                                          ),
                                        );
                                      } finally {
                                        setUpdatingBookingId(null);
                                      }
                                    }}
                                  >
                                    {tl("Cancel", "Ακύρωση")}
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3 pt-2 border-t border-border/60">
                      <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                        {tl("Completed trips", "Ολοκληρωμένες εκδρομές")}
                        <Badge variant="outline">{bookings.filter((b) => b.status === "completed").length}</Badge>
                      </h3>
                      {bookings.filter((b) => b.status === "completed").length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {tl("No completed trips yet.", "Δεν υπάρχουν ολοκληρωμένες εκδρομές ακόμα.")}
                        </p>
                      ) : (
                        <div className="space-y-1 text-sm text-muted-foreground">
                          {bookings
                            .filter((b) => b.status === "completed")
                            .slice(0, 6)
                            .map((booking) => (
                              <div key={booking.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                                <span className="truncate mr-2">{booking.boatName}</span>
                                <span className="text-xs opacity-80">
                                  {booking.date} · €{booking.totalPrice.toFixed(0)}
                                </span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="overview" className="space-y-6">
                <WeatherForecastPanel locations={forecastLocations} />

                <Card className="shadow-card-hover">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-aegean" />
                      {tl("Quick stats", "Γρήγορα στατιστικά")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="rounded-2xl border border-border p-4">
                        <p className="text-sm text-muted-foreground">{tl("Boats listed", "Καταχωρημένα σκάφη")}</p>
                        <p className="text-2xl font-bold text-foreground mt-1">{stats.listedBoats}</p>
                      </div>
                      <div className="rounded-2xl border border-border p-4">
                        <p className="text-sm text-muted-foreground">{tl("Trips hosted", "Διαδρομές που φιλοξενήθηκαν")}</p>
                        <p className="text-2xl font-bold text-foreground mt-1">{stats.totalBookings}</p>
                      </div>
                      <div className="rounded-2xl border border-border p-4">
                        <p className="text-sm text-muted-foreground">{tl("Lifetime revenue", "Συνολικά έσοδα")}</p>
                        <p className="text-2xl font-bold text-foreground mt-1">€{stats.totalRevenue.toLocaleString()}</p>
                      </div>
                      <div className="rounded-2xl border border-border p-4">
                        <p className="text-sm text-muted-foreground">{tl("Guest rating", "Βαθμολογία επισκεπτών")}</p>
                        <p className="text-2xl font-bold text-foreground mt-1">{stats.averageRating}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-card">
                  <CardHeader>
                    <CardTitle>Your Boats</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {boats.length > 0 ? (
                      <div className="space-y-3">
                        {boats.map((boat) => (
                          <div
                            key={boat.id}
                            className="rounded-xl border border-border p-4 flex flex-col gap-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1">
                                <p className="font-semibold text-foreground">{boat.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {boat.location} • {boat.capacity} guests • €{boat.pricePerDay}/day
                                </p>
                              </div>
                              <Badge className={boat.status === "active" ? "bg-emerald-500" : "bg-slate-400"}>
                                {boat.status}
                              </Badge>
                            </div>
                            {(boat.partyReady || boat.flashSaleEnabled) && (
                              <div className="flex flex-wrap gap-1">
                                {boat.partyReady && (
                                  <Badge variant="outline" className="text-[10px]">Party ready</Badge>
                                )}
                                {boat.flashSaleEnabled && (
                                  <Badge variant="outline" className="text-[10px]">Flash sale</Badge>
                                )}
                                {/* voucher feature removed */}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Ship className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                        <p className="text-muted-foreground">No boats added yet.</p>
                        <Button
                          onClick={() => setShowAddBoat(true)}
                          variant="outline"
                          className="mt-4 gap-2"
                        >
                          <Plus className="h-4 w-4" />
                          Add Your First Boat
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="boats">
                <BoatsManagement
                  onAddBoat={() => {
                    setEditingBoat(undefined);
                    setShowAddBoat(true);
                  }}
                  onEditBoat={(boat) => {
                    setEditingBoat(boat);
                    setShowAddBoat(true);
                  }}
                />
              </TabsContent>

              <TabsContent value="calendar">
                <CalendarManagement />
              </TabsContent>

              <TabsContent value="packages" className="space-y-6">
                <Card className="shadow-card-hover">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Package className="h-5 w-5 text-aegean" />
                      {tl("Trip packages", "Πακέτα διαδρομών")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <PackageManagement />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </section>
      </main>

      {showAddBoat && (
        <AddBoatModal
          onClose={() => {
            setShowAddBoat(false);
            setEditingBoat(undefined);
          }}
          boat={editingBoat}
        />
      )}

      <Footer />
    </div>
  );
};

export default OwnerDashboard;
