import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { addDays, addHours, format, isSameDay, isWeekend, parseISO, startOfDay } from "date-fns";
import { CalendarCheck2, CalendarDays, Clock, CreditCard, Fuel, Loader2, LogIn, Mail, MapPin, MessageCircle, Navigation, ShieldCheck, Sparkles, Star, Users } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import BoatLocationMap from "@/components/BoatLocationMap";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { confirmBookingWorkflow, getAvailableDepartureTimes, getRecommendedDepartureTimes, type ConfirmBookingResult, type DepartureRecommendation } from "@/lib/booking-workflow";
import { resolveBoatVoucherPricing } from "@/lib/booking-pricing";
import { buildBoatDetailsPath, buildBoatPublicSlug, getBoatByPublicReference, getBoats } from "@/lib/boats";
import type { Boat } from "@/lib/boats";
import { trackBookingConfirmed, trackBookingStarted } from "@/lib/analytics";
import { signInWithGoogle } from "@/lib/auth-hybrid";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLanguage } from "@/contexts/LanguageContext";
import { Skeleton } from "@/components/ui/skeleton";

type BoatPackage = {
  id: string;
  name: string;
  hours: number;
  price: number;
  description?: string | null;
};

type PaymentMethod = "stripe";

type OwnerPackageJoinRow = {
  package_id: string;
  owner_packages: {
    id?: string | null;
    name?: string | null;
    duration_hours?: number | null;
    price?: number | null;
    description?: string | null;
  } | null;
};

type OwnerExtraJoinRow = {
  extra_id: string;
  owner_extras: {
    id?: string | null;
    name?: string | null;
    price?: number | null;
    description?: string | null;
  } | null;
};

type BookingRealtimeRow = {
  start_date?: string | null;
};

type OilPriceSettingsRow = {
  value?: number | string | null;
};
type PartyInventoryRow = {
  guests?: number | null;
  status?: string | null;
  package_label?: string | null;
};

const Booking = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user: sessionUser } = useCurrentUser();
  const { toast } = useToast();
  const { tl } = useLanguage();
  const boatReference = searchParams.get("boatRef") ?? searchParams.get("boatId");
  const boatNameFromQuery = searchParams.get("boat") ?? "Selected boat";
  const dateFromQuery = searchParams.get("date") ?? "";
  const parsedDateFromQuery = dateFromQuery ? parseISO(dateFromQuery) : null;
  const initialSelectedDate = parsedDateFromQuery && !Number.isNaN(parsedDateFromQuery.getTime())
    ? startOfDay(parsedDateFromQuery)
    : undefined;
  const [boat, setBoat] = useState<Boat | null>(null);
  const [isBoatLoading, setIsBoatLoading] = useState(true);
  const [boatPackages, setBoatPackages] = useState<BoatPackage[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadBoat = async () => {
      if (!cancelled) {
        setIsBoatLoading(true);
      }

      try {
        if (boatReference) {
          const resolved = await getBoatByPublicReference(boatReference);
          if (resolved) {
            if (!cancelled) {
              setBoat(resolved);
              setIsBoatLoading(false);
            }
            return;
          }
        }

        const boats = await getBoats();
        const byName = boats.find((entry) => entry.name === boatNameFromQuery) ?? null;
        if (!cancelled) {
          setBoat(byName);
          setIsBoatLoading(false);
        }
      } catch {
        if (!cancelled) {
          setBoat(null);
          setIsBoatLoading(false);
        }
      }
    };

    loadBoat();

    return () => {
      cancelled = true;
    };
  }, [boatReference, boatNameFromQuery]);

  const boatName = boat?.name ?? boatNameFromQuery;
  const dailyRate = boat?.pricePerDay ?? 450;
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [fuelLitres, setFuelLitres] = useState([40]);
  const [guestCount, setGuestCount] = useState(1);
  const [includeSkipper, setIncludeSkipper] = useState(true);
  const [includeFlexibleCancellation, setIncludeFlexibleCancellation] = useState(false);
  const [ownerUpgrades, setOwnerUpgrades] = useState<Array<{ id: string; label: string; price: number }>>([]);
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(initialSelectedDate);
  const [hasDateIntent, setHasDateIntent] = useState(Boolean(initialSelectedDate));
  const [departureTime, setDepartureTime] = useState("");
  const [customerName, setCustomerName] = useState(sessionUser?.name ?? "");
  const [customerEmail, setCustomerEmail] = useState(sessionUser?.email ?? "");
  const [specialRequests, setSpecialRequests] = useState("");
  // voucher support removed
  const [workflowResult, setWorkflowResult] = useState<ConfirmBookingResult | null>(null);
  const [availableDepartureTimes, setAvailableDepartureTimes] = useState<string[]>([]);
  const [departureRecommendations, setDepartureRecommendations] = useState<DepartureRecommendation[]>([]);
  const [isLoadingDepartureTimes, setIsLoadingDepartureTimes] = useState(false);
  const [isCalendarLoading, setIsCalendarLoading] = useState(false);
  const [bookingsRealtimeTick, setBookingsRealtimeTick] = useState(0);
  const [calendarRealtimeTick, setCalendarRealtimeTick] = useState(0);
  const [liveAvailabilityNotice, setLiveAvailabilityNotice] = useState(false);
  const [partyTicketsSold, setPartyTicketsSold] = useState(0);
  const [isLoadingPartyTickets, setIsLoadingPartyTickets] = useState(false);
  const paymentMethod: PaymentMethod = "stripe";
  const [paymentPlan, setPaymentPlan] = useState<"deposit" | "full" | null>(null);
  const [bookingStep, setBookingStep] = useState<1 | 2 | 3 | 4>(1);
  const [autoUnavailableDates, setAutoUnavailableDates] = useState<Date[]>([]);
  const [oilPricePerLitre, setOilPricePerLitre] = useState(1.95);
  const [isConfirming, setIsConfirming] = useState(false);
  const partyStartTime = boat?.partyEventTime?.trim() || "";
  const partyDurationHours = 8;
  const [selectedPartyTier, setSelectedPartyTier] = useState<string | null>(null);

  useEffect(() => {
    if (boat?.partyReady) {
      setIncludeSkipper(false);
      setIncludeFlexibleCancellation(false);
      setPaymentPlan("full");
      setDepartureTime(partyStartTime);
    }
  }, [boat?.partyReady, partyStartTime]);

  useEffect(() => {
    if (sessionUser?.name && !customerName) {
      setCustomerName(sessionUser.name);
    }
    if (sessionUser?.email && !customerEmail) {
      setCustomerEmail(sessionUser.email);
    }
  }, [sessionUser, customerEmail, customerName]);

  useEffect(() => {
    const loadOwnerUpgrades = async () => {
      if (!boat?.id) {
        setOwnerUpgrades([]);
        return;
      }

      const { data, error } = await supabase
        .from("owner_extra_boats")
        .select("extra_id, owner_extras(id, name, price, description)")
        .eq("boat_id", boat.id);

      if (error || !Array.isArray(data)) {
        setOwnerUpgrades([]);
        return;
      }

      const mapped = (data as OwnerExtraJoinRow[])
        .filter((row) => row.owner_extras?.name)
        .map((row) => ({
          id: row.extra_id,
          label: row.owner_extras!.name ?? "Extra",
          price: Number(row.owner_extras!.price ?? 0),
        }));

      setOwnerUpgrades(mapped);
      setSelectedExtras((current) => current.filter((id) => mapped.some((item) => item.id === id)));
    };

    loadOwnerUpgrades();
  }, [boat?.id]);

  useEffect(() => {
    if (boat?.skipperRequired) {
      setIncludeSkipper(true);
    }
  }, [boat?.skipperRequired]);

  const isBoatPending = isBoatLoading && !boat;

  useEffect(() => {
    const loadBoatPackages = async () => {
      if (!boat?.id) {
        setBoatPackages([]);
        setSelectedPackageId(null);
        return;
      }

      let cancelled = false;

      const { data, error } = await supabase
        .from("owner_package_boats")
        .select("owner_packages(id, name, duration_hours, price, description)")
        .eq("boat_id", boat.id);

      if (cancelled) return;

      if (error || !Array.isArray(data)) {
        setBoatPackages([]);
        setSelectedPackageId(null);
        return;
      }

      const BOAT_EXTRA_MARKER = "[boat-extra]";

      const corePackages: BoatPackage[] = (data as OwnerPackageJoinRow[])
        .map((row) => row.owner_packages)
        .filter((pkg) => pkg && (!pkg.description || !String(pkg.description).includes(BOAT_EXTRA_MARKER)))
        .map((pkg) => ({
          id: String(pkg.id),
          name: String(pkg.name ?? "Package"),
          hours: Number(pkg.duration_hours ?? 0),
          price: Number(pkg.price ?? 0),
          description: pkg.description ?? "",
        }))
        .filter((pkg) => pkg.hours > 0);

      setBoatPackages(corePackages);
      setSelectedPackageId((previous) => {
        if (previous && corePackages.some((pkg) => pkg.id === previous)) {
          return previous;
        }
        return corePackages[0]?.id ?? null;
      });

      return () => {
        cancelled = true;
      };
    };

    loadBoatPackages();
  }, [boat?.id]);

  const selectedPackage: BoatPackage = useMemo(() => {
    const fromBoat = boatPackages.find((pkg) => pkg.id === selectedPackageId) ?? boatPackages[0];
    if (fromBoat) return fromBoat;

    // Fallback: if no predefined durations exist yet, use the boat's daily rate
    return {
      id: "daily-rate",
      name: "Daily rate",
      // Default to a 5-hour trip so availability and pricing logic work
      // even when the owner has not configured packages yet.
      hours: 5,
      price: dailyRate,
      description: "",
    };
  }, [boatPackages, selectedPackageId, dailyRate]);

  const isPartyBooking = Boolean(boat?.partyReady);
  const ticketMaxPeople = boat ? (boat.ticketMaxPeople > 0 ? boat.ticketMaxPeople : boat.capacity) : 0;
  const ticketPricePerPerson = boat
    ? (boat.ticketPricePerPerson > 0 ? boat.ticketPricePerPerson : boat.capacity > 0 ? boat.pricePerDay / boat.capacity : 0)
    : 0;
  const partyInventoryDateString = selectedDate ? format(selectedDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
  const ticketsRemaining = isPartyBooking ? Math.max(ticketMaxPeople - partyTicketsSold, 0) : 0;
  const guestLimit = isPartyBooking ? ticketsRemaining : (boat?.capacity ?? 12);
  const ticketQuantity = isPartyBooking
    ? (guestLimit > 0 ? Math.min(Math.max(guestCount, 1), guestLimit) : 0)
    : guestCount;
  const ticketSubtotal = isPartyBooking ? ticketPricePerPerson * ticketQuantity : 0;
  const formatEuroAmount = (value: number) => `€${value.toFixed(value % 1 === 0 ? 0 : 2)}`;
  const bookingDurationHours = isPartyBooking ? partyDurationHours : selectedPackage.hours;

  const basePackagePrice = isPartyBooking ? ticketSubtotal : selectedPackage.price;
  const showFuelEstimate = !boat?.skipperRequired && !isPartyBooking;
  const fuelCost = showFuelEstimate ? Math.round(fuelLitres[0] * oilPricePerLitre) : 0;
  const skipperCost = isPartyBooking ? 0 : (includeSkipper ? Math.round(selectedPackage.hours * 28) : 0);
  const guestExperienceFee = isPartyBooking ? 0 : Math.max(guestCount - 4, 0) * 18;
  const flexibleCancellationCost = isPartyBooking ? 0 : (includeFlexibleCancellation ? Math.round(basePackagePrice * 0.12) : 0);
  const extrasCost = ownerUpgrades
    .filter((item) => selectedExtras.includes(item.id))
    .reduce((total, item) => total + item.price, 0);
  const crazySeaRoutingFee = isPartyBooking ? 0 : (selectedPackage.hours >= 8 ? 95 : 0);
  const suggestedFuelLitres = Math.min(120, bookingDurationHours * 8 + Math.max(guestCount - 4, 0) * 2);
  const unavailableDates = useMemo(() => {
    if (autoUnavailableDates.length === 0) return autoUnavailableDates;
    const seen = new Set<number>();
    return autoUnavailableDates.filter((date) => {
      const key = startOfDay(date).getTime();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [autoUnavailableDates]);
  const nextAvailableDate = useMemo(() => {
    return Array.from({ length: 21 }, (_, index) => addDays(startOfDay(new Date()), index)).find(
      (date) => !unavailableDates.some((blockedDate) => isSameDay(blockedDate, date)),
    );
  }, [unavailableDates]);
  const boatProfileLink = boat ? buildBoatDetailsPath(boat) : "/boats";
  const mapQuery = boat?.mapQuery ?? "";
  const googleDirectionsUrl = boat ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapQuery)}` : "/boats";
  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
  const stripeCheckoutEndpoint = apiBaseUrl
    ? `${apiBaseUrl.replace(/\/$/, "")}/api/stripe/create-checkout`
    : "/api/stripe/create-checkout";

  const preDiscountTotal = isPartyBooking
    ? ticketSubtotal + extrasCost
    : basePackagePrice +
      fuelCost +
      skipperCost +
      flexibleCancellationCost +
      extrasCost +
      crazySeaRoutingFee;

  const pricing = resolveBoatVoucherPricing({
    baseTotalPrice: preDiscountTotal,
    bookingDate: selectedDate ? format(selectedDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
    departureTime: departureTime || "10:00",
    flashSaleEnabled: Boolean(boat?.flashSaleEnabled),
    paymentPlan: paymentPlan ?? "full",
  });

  const estimatedTotal = pricing.discountedTotal;

  const platformCommission = Math.round(estimatedTotal * 0.15);
  const ownerPayout = Math.max(estimatedTotal - platformCommission, 0);
  const depositAmount = pricing.depositAmount;
  const amountDueNow = pricing.amountDueNow;
  const resolvedPartyEventDate = boat?.partyEventDate?.trim() || (selectedDate ? format(selectedDate, "yyyy-MM-dd") : "");
  const resolvedPartyEventTime = boat?.partyEventTime?.trim() || departureTime || "";
  const bookingDateString = isPartyBooking
    ? resolvedPartyEventDate
    : (selectedDate ? format(selectedDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"));
  // Allow party bookings to proceed without selecting a calendar date (owner provides event date)
  const isPartySoldOut = isPartyBooking && ticketMaxPeople > 0 && ticketsRemaining <= 0;
  const canContinueStep1 = isPartyBooking ? !isPartySoldOut : Boolean(selectedDate && availableDepartureTimes.includes(departureTime));
  const canContinueStep2 = Boolean(customerName.trim() && customerEmail.trim());
  const canContinueStep3 = Boolean(paymentPlan);
  // For party bookings, collapse flow into a single step for a simpler UX.
  const bookingStepCount = isPartyBooking ? 1 : 4;
  const finalBookingStep = isPartyBooking ? 1 : 4;

  const selectedExtraLabels = useMemo(
    () => ownerUpgrades.filter((item) => selectedExtras.includes(item.id)).map((item) => item.label),
    [selectedExtras, ownerUpgrades],
  );

  const sortedDepartureTimes = useMemo(
    () => [...availableDepartureTimes].sort((a, b) => a.localeCompare(b)),
    [availableDepartureTimes],
  );

  const recommendedDepartureTimeSet = useMemo(() => {
    const ranked = [...departureRecommendations]
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((item) => item.departureTime);
    return new Set(ranked);
  }, [departureRecommendations]);

  const recommendedDepartureTimes = useMemo(
    () => sortedDepartureTimes.filter((slot) => recommendedDepartureTimeSet.has(slot)),
    [sortedDepartureTimes, recommendedDepartureTimeSet],
  );

  const otherDepartureTimes = useMemo(
    () => sortedDepartureTimes.filter((slot) => !recommendedDepartureTimeSet.has(slot)),
    [sortedDepartureTimes, recommendedDepartureTimeSet],
  );

  useEffect(() => {
    // Keep fuel price in sync with Supabase global_settings.oil_price_per_liter
    let cancelled = false;

    const loadOilPrice = async () => {
      const { data, error } = await supabase
        .from("global_settings")
        .select("value")
        .eq("key", "oil_price_per_liter")
        .maybeSingle();

      const row = data as OilPriceSettingsRow | null;
      if (!cancelled && !error && row && row.value != null) {
        const next = Number(row.value);
        if (Number.isFinite(next) && next > 0) {
          setOilPricePerLitre(next);
        }
      }
    };

    loadOilPrice();

    const channel = supabase
      .channel("global-settings-oil-price")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "global_settings",
          filter: "key=eq.oil_price_per_liter",
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as OilPriceSettingsRow | null;
          if (!row || typeof row.value === "undefined" || row.value === null) return;
          const next = Number(row.value);
          if (Number.isFinite(next) && next > 0) {
            setOilPricePerLitre(next);
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!boat?.id || !isPartyBooking) {
      setPartyTicketsSold(0);
      setIsLoadingPartyTickets(false);
      return;
    }

    let cancelled = false;

    const loadPartyTicketInventory = async () => {
      setIsLoadingPartyTickets(true);

      const { data, error } = await supabase
        .from("bookings")
        .select("guests, status, package_label")
        .or(`boat_id.eq.${boat.id},boat_name.eq.${boat.name}`)
        .eq("start_date", partyInventoryDateString)
        .eq("status", "confirmed");

      if (cancelled) return;

      if (error || !Array.isArray(data)) {
        setPartyTicketsSold(0);
        setIsLoadingPartyTickets(false);
        return;
      }

      const sold = (data as PartyInventoryRow[])
        .filter((row) => String(row.package_label ?? "") === "Party tickets")
        .reduce((total, row) => total + Math.max(0, Math.floor(Number(row.guests ?? 0))), 0);

      setPartyTicketsSold(sold);
      setIsLoadingPartyTickets(false);
    };

    loadPartyTicketInventory();

    return () => {
      cancelled = true;
    };
  }, [boat?.id, isPartyBooking, bookingsRealtimeTick, partyInventoryDateString]);

  useEffect(() => {
    if (!boat?.id) {
      setAutoUnavailableDates([]);
      setIsCalendarLoading(false);
      return;
    }

    let cancelled = false;
    const computeAutoUnavailable = async () => {
      if (!boat?.id || bookingDurationHours <= 0) {
        if (!cancelled) {
          setAutoUnavailableDates([]);
          setIsCalendarLoading(false);
        }
        return;
      }

      const today = startOfDay(new Date());
      // Keep calendar responsive: only precompute about 10 days ahead.
      const horizonDays = 10;
      const daysToCheck = Array.from({ length: horizonDays }, (_, index) => addDays(today, index));

      const dynamicDates: Date[] = [];

      if (!cancelled) {
        setIsCalendarLoading(true);
      }

      for (const date of daysToCheck) {
        if (cancelled) return;

        const isoDate = format(date, "yyyy-MM-dd");
        const availableTimesForDay = await getAvailableDepartureTimes(boat.id, isoDate, bookingDurationHours);
        if (cancelled) return;

        // Mark dates as unavailable only when there are no free departure slots left
        if (availableTimesForDay.length === 0) {
          dynamicDates.push(date);
        }
      }

      if (!cancelled) {
        setAutoUnavailableDates(dynamicDates);
        setIsCalendarLoading(false);
      }
    };

    computeAutoUnavailable();

    return () => {
      cancelled = true;
      setIsCalendarLoading(false);
    };
  }, [boat?.id, bookingDurationHours, bookingsRealtimeTick, calendarRealtimeTick]);

  useEffect(() => {
    if (isPartyBooking) {
      if (!boat?.id) {
        setAvailableDepartureTimes([]);
        setDepartureRecommendations([]);
        return;
      }

      if (!resolvedPartyEventDate || !resolvedPartyEventTime) {
        setAvailableDepartureTimes([]);
        setDepartureRecommendations([]);
        return;
      }

      setAvailableDepartureTimes([resolvedPartyEventTime]);
      setDepartureRecommendations([]);
      setDepartureTime(resolvedPartyEventTime);
      return;
    }

    let cancelled = false;

    const loadAvailableTimes = async () => {
      if (!boat?.id || !selectedDate) {
        if (!cancelled) {
          setAvailableDepartureTimes([]);
          setDepartureRecommendations([]);
        }
        return;
      }

      if (unavailableDates.some((blockedDate) => isSameDay(blockedDate, selectedDate))) {
        if (!cancelled) {
          setAvailableDepartureTimes([]);
          setDepartureRecommendations([]);
        }
        if (hasDateIntent) {
          navigate(
            `/booking-closed?boat=${encodeURIComponent(boat.name)}&date=${encodeURIComponent(format(selectedDate, "yyyy-MM-dd"))}&reason=${encodeURIComponent("date-unavailable")}`,
          );
        }
        return;
      }

      setIsLoadingDepartureTimes(true);
      try {
        const nextRecommendations = await getRecommendedDepartureTimes(
          boat.id,
          format(selectedDate, "yyyy-MM-dd"),
          bookingDurationHours,
        );

        if (cancelled) {
          return;
        }

        const nextTimes = nextRecommendations.map((item) => item.departureTime);
        setDepartureRecommendations(nextRecommendations);
        setAvailableDepartureTimes(nextTimes);

        if (nextTimes.length > 0) {
          setDepartureTime((current) => (nextTimes.includes(current) ? current : ""));
          return;
        }

        if (hasDateIntent) {
          navigate(
            `/booking-closed?boat=${encodeURIComponent(boat.name)}&date=${encodeURIComponent(format(selectedDate, "yyyy-MM-dd"))}&reason=${encodeURIComponent("day-fully-booked")}`,
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDepartureTimes(false);
        }
      }
    };

    loadAvailableTimes();

    return () => {
      cancelled = true;
    };
  }, [boat?.id, boat?.name, bookingsRealtimeTick, bookingDurationHours, hasDateIntent, isPartyBooking, navigate, partyStartTime, selectedDate, unavailableDates]);

  useEffect(() => {
    if (!boat?.id || !selectedDate) {
      return;
    }

    const selectedDateValue = format(selectedDate, "yyyy-MM-dd");
    const channel = supabase
      .channel(`bookings-live-${boat.id}-${selectedDateValue}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `boat_id=eq.${boat.id}`,
        },
        (payload) => {
          const row = payload.new ?? payload.old;
          const changedDate = row && typeof row === "object"
            ? String((row as BookingRealtimeRow).start_date ?? "")
            : "";
          if (changedDate === selectedDateValue) {
            setBookingsRealtimeTick((value) => value + 1);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [boat?.id, selectedDate]);

  useEffect(() => {
    if (!boat?.id) {
      return;
    }

    const channel = supabase
      .channel(`booking-calendar-events-${boat.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "calendar_events",
          filter: `boat_id=eq.${boat.id}`,
        },
        () => {
          setCalendarRealtimeTick((value) => value + 1);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [boat?.id]);

  useEffect(() => {
    if (bookingsRealtimeTick <= 0) {
      return;
    }

    setLiveAvailabilityNotice(true);
    const timeout = window.setTimeout(() => setLiveAvailabilityNotice(false), 5000);
    return () => window.clearTimeout(timeout);
  }, [bookingsRealtimeTick]);

  useEffect(() => {
    if (!boat) {
      return;
    }

    trackBookingStarted({
      boatId: boat.id,
      boatName: boat.name,
      source: "booking_page",
    });
  }, [boat]);

  const toggleExtra = (extraId: string) => {
    setSelectedExtras((currentExtras) =>
      currentExtras.includes(extraId)
        ? currentExtras.filter((item) => item !== extraId)
        : [...currentExtras, extraId],
    );
  };

  const handleConfirmBooking = async () => {
    if (isConfirming) {
      return;
    }

    if (!boat) {
      toast({
        title: tl("Boat not found", "Το σκάφος δεν βρέθηκε"),
        description: isBoatLoading
          ? tl("Boat data is still loading. Please wait a moment and try again.", "Τα στοιχεία του σκάφους φορτώνουν ακόμα. Περίμενε λίγο και δοκίμασε ξανά.")
          : tl("Open the boat profile again and retry the booking.", "Άνοιξε ξανά το προφίλ του σκάφους και δοκίμασε ξανά την κράτηση."),
        variant: "destructive",
      });
      return;
    }

    if (!customerName.trim() || !customerEmail.trim()) {
      toast({
        title: tl("Missing customer details", "Λείπουν στοιχεία πελάτη"),
        description: tl("Add your full name and email before confirming the booking.", "Συμπλήρωσε ονοματεπώνυμο και email πριν την επιβεβαίωση της κράτησης."),
        variant: "destructive",
      });
      return;
    }

    if (!selectedDate && !isPartyBooking) {
      toast({
        title: tl("Select a date", "Επίλεξε ημερομηνία"),
        description: tl("Choose an available date from the calendar before confirming.", "Επίλεξε διαθέσιμη ημεμηνία από το ημερολόγιο πριν την επιβεβαίωση."),
        variant: "destructive",
      });
      return;
    }

    if (isPartyBooking) {
      if (!resolvedPartyEventDate || !resolvedPartyEventTime) {
        toast({
          title: tl("Party date missing", "Λείπει η ημερομηνία πάρτι"),
          description: tl("The owner needs to set the original party date and time before this booking can continue.", "Ο ιδιοκτήτης πρέπει να έχει ορίσει την αρχική ημερομηνία και ώρα πάρτι πριν συνεχίσει αυτή η κράτηση."),
          variant: "destructive",
        });
        return;
      }
    } else if (availableDepartureTimes.length === 0 || !availableDepartureTimes.includes(departureTime)) {
      navigate(
        `/booking-closed?boat=${encodeURIComponent(boat.name)}&date=${encodeURIComponent(bookingDateString)}&reason=${encodeURIComponent("slot-unavailable")}`,
      );
      return;
    }

    const effectiveDepartureTime = isPartyBooking ? resolvedPartyEventTime : departureTime;

    if (isPartyBooking && ticketMaxPeople > 0 && ticketsRemaining <= 0) {
      toast({
        title: tl("Sold out", "Εξαντλήθηκε"),
        description: tl("No party tickets are left for this event.", "Δεν έχουν απομείνει εισιτήρια για αυτή την εκδήλωση."),
        variant: "destructive",
      });
      return;
    }

    if (isPartyBooking && ticketQuantity > ticketsRemaining) {
      toast({
        title: tl("Not enough tickets left", "Δεν υπάρχουν αρκετά εισιτήρια"),
        description: tl(
          `Only ${ticketsRemaining} ticket${ticketsRemaining === 1 ? "" : "s"} left for this event.`,
          `Απομένουν μόνο ${ticketsRemaining} εισιτήριο${ticketsRemaining === 1 ? "" : "α"} για αυτή την εκδήλωση.`,
        ),
        variant: "destructive",
      });
      return;
    }

    if (!isPartyBooking && selectedPackage.hours > 8) {
      toast({
        title: tl("Package too long", "Το πακέτο είναι πολύ μεγάλο"),
        description: tl("Customers cannot book a boat for more than 8 hours.", "Οι πελάτες δεν μπορούν να κλείσουν σκάφος για περισσότερες από 8 ώρες."),
        variant: "destructive",
      });
      return;
    }

    if (!paymentPlan && !isPartyBooking) {
      toast({
        title: tl("Select payment plan", "Επίλεξε πλάνο πληρωμής"),
        description: tl("Choose deposit or full payment before confirming.", "Επίλεξε προκαταβολή ή πλήρη πληρωμή πριν την επιβεβαίωση."),
        variant: "destructive",
      });
      return;
    }

    if (paymentMethod === "stripe") {
      setIsConfirming(true);
      let redirectedToCheckout = false;
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const checkoutAbortController = new AbortController();
        let checkoutTimeoutId: number | null = window.setTimeout(() => {
          checkoutAbortController.abort();
        }, 15000);
        let checkoutRaceTimeoutId: number | null = null;

        let checkoutResponse: Response;
        try {
          const fetchPromise = fetch(stripeCheckoutEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
            },
            signal: checkoutAbortController.signal,
            body: JSON.stringify({
              boatId: boat.id,
              boatName: boat.name,
              customerEmail: customerEmail.trim().toLowerCase(),
              customerId: sessionUser?.id,
              bookingDate: bookingDateString,
              departureTime: effectiveDepartureTime,
              packageHours: bookingDurationHours,
              guests: guestCount,
              isPartyBooking,
              preDiscountTotal,
              totalPrice: estimatedTotal,
              amountDueNow,
              paymentPlan: paymentPlan ?? "full",
              depositAmount,
              successUrl: `${window.location.origin}/booking-confirmed`,
              cancelUrl: window.location.href,
              ...(isPartyBooking ? {
                partyEventDate: resolvedPartyEventDate || undefined,
                partyEventTime: resolvedPartyEventTime || undefined,
              } : {}),
              ...(isPartyBooking && selectedPartyTier && boat.partyTiers
                ? {
                    partyTierSelected: selectedPartyTier,
                    partyTierPrice:
                      boat.partyTiers.find((tier) => tier.name === selectedPartyTier)?.price ?? 0,
                  }
                : {}),
            }),
          });

          const timeoutPromise = new Promise<never>((_, reject) => {
            checkoutRaceTimeoutId = window.setTimeout(() => reject(new Error("Checkout request timed out after 15 seconds. Please try again.")), 15500);
          });

          checkoutResponse = await Promise.race([fetchPromise, timeoutPromise]);
        } finally {
          if (checkoutTimeoutId !== null) {
            window.clearTimeout(checkoutTimeoutId);
            checkoutTimeoutId = null;
          }
          if (checkoutRaceTimeoutId !== null) {
            window.clearTimeout(checkoutRaceTimeoutId);
            checkoutRaceTimeoutId = null;
          }
        }

        const checkoutRaw = await checkoutResponse.text();
        let checkoutPayload: { sessionId?: string; checkoutUrl?: string; error?: string; details?: string } = {};
        if (checkoutRaw) {
          try {
            checkoutPayload = JSON.parse(checkoutRaw);
          } catch {
            throw new Error("Stripe checkout API returned a non-JSON response. Check Vite /api proxy and API server logs.");
          }
        }
        if (!checkoutResponse.ok) {
          const errorMsg = checkoutPayload?.error || "Failed to create checkout session";
          const details = checkoutPayload?.details ? ` (${checkoutPayload.details})` : "";
          throw new Error(errorMsg + details);
        }

        const checkoutUrl = String(checkoutPayload.checkoutUrl ?? "").trim();
        if (checkoutUrl) {
          redirectedToCheckout = true;
          window.location.assign(checkoutUrl);
          return;
        }

        throw new Error("Stripe checkout URL is missing from API response.");

        return;
      } catch (error) {
        const message = error instanceof Error
          ? (error.name === "AbortError"
              ? "Checkout request timed out after 15 seconds. Please try again."
              : error.message)
          : "Checkout failed";
        const normalized = message.toLowerCase();
        const isConfigOrNetworkIssue =
          normalized.includes("fetch failed") ||
          normalized.includes("failed to fetch") ||
          normalized.includes("network") ||
          normalized.includes("not configured") ||
          normalized.includes("supabase admin");

        toast({
          title: tl("Stripe checkout failed", "Αποτυχία checkout Stripe"),
          description: isConfigOrNetworkIssue
            ? `${message}. Check API server env (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY) and VITE_API_BASE_URL/proxy.`
            : message,
          variant: "destructive",
        });
        return;
      } finally {
        if (!redirectedToCheckout) {
          setIsConfirming(false);
        }
      }
    }

    const shouldQueueCustomerEmail = customerEmail.trim().length > 0;
    let result: ConfirmBookingResult;

    try {
      result = await confirmBookingWorkflow({
        boatId: boat.id,
        boatName: boat.name,
        ownerName: boat.owner.name || "Owner",
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim().toLowerCase(),
        packageLabel: isPartyBooking ? "Party tickets" : selectedPackage.name,
        packageHours: bookingDurationHours,
        guests: ticketQuantity,
        date: bookingDateString,
        departureTime: effectiveDepartureTime,
        departureMarina: boat.departureMarina,
        totalPrice: estimatedTotal,
        paymentMethod,
        paymentPlan,
        // voucher fields removed
        flashSaleEnabled: Boolean(boat.flashSaleEnabled),
        partyReady: Boolean(boat.partyReady),
        amountDueNow,
        depositAmount,
        platformCommission,
        ownerPayout,
        extras: selectedExtraLabels,
        notes: specialRequests,
        queueCustomerEmail: shouldQueueCustomerEmail,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not confirm booking";
      if (message.toLowerCase().includes("no longer available") || message.toLowerCase().includes("operating hours")) {
        navigate(
          `/booking-closed?boat=${encodeURIComponent(boat.name)}&date=${encodeURIComponent(format(selectedDate, "yyyy-MM-dd"))}&reason=${encodeURIComponent("slot-unavailable")}`,
        );
        return;
      }

      toast({
        title: tl("Booking failed", "Αποτυχία κράτησης"),
        description: message,
        variant: "destructive",
      });
      return;
    }

    setWorkflowResult(result);
    trackBookingConfirmed({
      boatId: boat.id,
      boatName: boat.name,
      totalPrice: estimatedTotal,
      guests: ticketQuantity,
      paymentMethod,
    });
    toast({
      title: tl("Booking confirmed", "Η κράτηση επιβεβαιώθηκε"),
      description: shouldQueueCustomerEmail
        ? tl(`Owner notified and confirmation email queued for ${result.customerEmail?.toEmail}. Charged now: €${amountDueNow}.`, `Ο ιδιοκτήτης ενημερώθηκε και το email επιβεβαίωσης μπήκε σε ουρά για ${result.customerEmail?.toEmail}. Χρέωση τώρα: €${amountDueNow}.`)
        : tl("Owner notified. Google sign-in booking confirmed in-app.", "Ο ιδιοκτήτης ενημερώθηκε. Η κράτηση με Google sign-in επιβεβαιώθηκε εντός εφαρμογής."),
    });

    navigate(
      `/booking-confirmed?bookingId=${encodeURIComponent(result.booking.id)}&boat=${encodeURIComponent(result.booking.boatName)}&date=${encodeURIComponent(result.booking.date)}&departure=${encodeURIComponent(result.booking.departureTime)}&amount=${encodeURIComponent(String(amountDueNow))}&emailQueued=${encodeURIComponent(String(Boolean(result.customerEmail)))}&ownerNotified=${encodeURIComponent("true")}&bookingType=${encodeURIComponent(isPartyBooking ? "party" : "rental")}&partyEventDate=${encodeURIComponent(String(resolvedPartyEventDate))}&partyEventTime=${encodeURIComponent(String(resolvedPartyEventTime))}&partyTicketCode=${encodeURIComponent(String(result.booking.partyTicketCode ?? ""))}&partyTicketCount=${encodeURIComponent(String(result.booking.partyTicketCount ?? 0))}&partyTicketStatus=${encodeURIComponent(String(result.booking.partyTicketStatus ?? ""))}&partyTicketPrice=${encodeURIComponent(String(ticketPricePerPerson))}&partyTicketQuantity=${encodeURIComponent(String(ticketQuantity))}`,
    );
  };

  const handleGoogleFastSignIn = async () => {
    try {
      await signInWithGoogle(window.location.href);
    } catch (error) {
      toast({
        title: tl("Google sign-in failed", "Αποτυχία σύνδεσης Google"),
        description: error instanceof Error ? error.message : tl("Try again or continue with email.", "Δοκίμασε ξανά ή συνέχισε με email."),
        variant: "destructive",
      });
    }
  };

  const loadingState = isBoatPending ? (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-20 pb-12">
        <div className="container mx-auto px-4 max-w-5xl space-y-6">
          <Card className="overflow-hidden shadow-card-hover">
            <CardContent className="p-6 md:p-8 space-y-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-3/4 max-w-xl" />
              <Skeleton className="h-5 w-full max-w-2xl" />
            </CardContent>
          </Card>
          <div className="grid gap-6 lg:grid-cols-[1.35fr_0.9fr]">
            <Card className="shadow-card-hover">
              <CardContent className="p-6 space-y-4">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
              </CardContent>
            </Card>
            <Card className="shadow-card-hover">
              <CardContent className="p-6 space-y-4">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  ) : null;

  return loadingState ?? (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="relative z-10 pt-16">
        <section className="border-b border-border bg-gradient-ocean py-14 md:py-18">
          <div className="container mx-auto px-4">
            <p className="text-primary-foreground/80 text-sm mb-2">{tl("Booking", "Κράτηση")}</p>
            <h1 className="text-4xl md:text-5xl font-heading font-bold text-primary-foreground mb-4">
              {tl("Complete your booking", "Ολοκλήρωσε την κράτησή σου")}
            </h1>
            <p className="text-primary-foreground/70 max-w-2xl">
              {tl("Secure your trip for", "Κλείσε την εκδρομή σου για")} {boatName} {tl("with preferred date, guest count, and contact details.", "με ημερομηνία, αριθμό επισκεπτών και στοιχεία επικοινωνίας.")}
            </p>
            <div className="flex flex-wrap gap-2 mt-5">
              <Badge className="bg-primary-foreground/15 text-primary-foreground border-primary-foreground/20">
                {isPartyBooking ? tl("Ticket pricing", "Τιμολόγηση εισιτηρίων") : tl("Live pricing", "Ζωντανή τιμολόγηση")}
              </Badge>
              <Badge className="bg-primary-foreground/15 text-primary-foreground border-primary-foreground/20">
                {isPartyBooking ? tl("Max guest list", "Μέγιστη λίστα καλεσμένων") : tl("Fuel-sensitive estimate", "Εκτίμηση βάσει καυσίμων")}
              </Badge>
              <Badge className="bg-primary-foreground/15 text-primary-foreground border-primary-foreground/20">
                {isPartyBooking ? tl("Party booking workflow", "Ροή κράτησης πάρτι") : tl("Owner notification workflow", "Ροή ειδοποίησης ιδιοκτήτη")}
              </Badge>
            </div>
          </div>
        </section>

        <section className="py-10 md:py-12">
          <div className="container mx-auto px-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 shadow-card-hover">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-aegean" />
                  {isPartyBooking ? tl("Party booking details", "Λεπτομέρειες κράτησης πάρτι") : tl("Booking details", "Λεπτομέρειες κράτησης")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className={`grid gap-2 ${bookingStepCount === 1 ? "grid-cols-1" : "grid-cols-4"}`}>
                  {Array.from({ length: bookingStepCount }, (_, index) => index + 1).map((step) => (
                    <div key={step} className="space-y-1">
                      <div className={`h-1 rounded-full ${step <= bookingStep ? "bg-aegean" : "bg-muted"}`} />
                      <p className={`text-xs ${step === bookingStep ? "text-foreground" : "text-muted-foreground"}`}>Step {step}</p>
                    </div>
                  ))}
                </div>

                {bookingStep === 1 ? (
                <>
                <div className="rounded-2xl border border-border p-4 bg-muted/10 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">{isPartyBooking ? "Sector 1: Ticket plan" : "Sector 1: Trip plan"}</p>
                    <Badge variant="outline">Core</Badge>
                  </div>
                  <Input value={boatName} readOnly />
                  {isPartyBooking ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Event date</span>
                        <span className="font-semibold text-foreground">
                          {resolvedPartyEventDate
                            ? (boat?.partyEventDate
                                ? format(parseISO(boat.partyEventDate), "EEEE, d MMM yyyy")
                                : resolvedPartyEventDate)
                            : "Not set"}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Start time</span>
                        <span className="font-semibold text-foreground">{resolvedPartyEventTime || "Not set"}</span>
                      </div>
                    </div>
                  ) : null}
                  {isPartyBooking ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-foreground space-y-2">
                      <p className="font-semibold">Ticket-based party booking</p>
                      <p className="text-muted-foreground">
                        Choose your guest list. Your ticket price stays tied to the party booking, not fuel or skipper options.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                        <div className="rounded-xl bg-background border border-amber-200 p-3">
                          <p className="text-xs text-muted-foreground">Ticket price</p>
                          <p className="font-semibold text-foreground">{ticketPricePerPerson > 0 ? formatEuroAmount(ticketPricePerPerson) : "Contact for price"}</p>
                        </div>
                        <div className="rounded-xl bg-background border border-amber-200 p-3">
                          <p className="text-xs text-muted-foreground">Tickets</p>
                          <p className="font-semibold text-foreground">{ticketQuantity}</p>
                        </div>
                        <div className="rounded-xl bg-background border border-amber-200 p-3">
                          <p className="text-xs text-muted-foreground">Total</p>
                          <p className="font-semibold text-foreground">{ticketPricePerPerson > 0 ? formatEuroAmount(ticketSubtotal) : "Contact for price"}</p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {isLoadingPartyTickets
                          ? "Checking remaining tickets..."
                          : ticketMaxPeople > 0
                            ? `${ticketsRemaining} ticket${ticketsRemaining === 1 ? "" : "s"} left before your selection${ticketQuantity > 0 ? `, ${Math.max(ticketsRemaining - ticketQuantity, 0)} left after you buy ${ticketQuantity}` : ""}.`
                            : "Ticket capacity is on request."}
                      </p>
                    </div>
                  ) : null}
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-foreground">{isPartyBooking ? "Choose your ticket quantity" : "Choose your trip"}</p>
                    {isPartyBooking ? (
                      <div className="rounded-2xl border border-border p-4 bg-background space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">Party tickets</p>
                            <p className="text-xs text-muted-foreground">Add more tickets to grow the guest list.</p>
                          </div>
                          <Badge variant="outline">
                            {isLoadingPartyTickets
                              ? "Checking"
                              : ticketMaxPeople > 0
                                ? `${ticketsRemaining} left`
                                : "Ticketed"}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-[auto,1fr,auto] items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setGuestCount((current) => Math.max(1, current - 1))}
                            disabled={guestLimit <= 0 || ticketQuantity <= 1}
                            className="h-10 w-10 rounded-xl border border-border hover:border-aegean flex items-center justify-center text-base font-semibold transition-colors"
                            aria-label="Remove ticket"
                          >
                            −
                          </button>
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">Tickets</p>
                            <p className="text-2xl font-heading font-bold text-foreground tabular-nums">{ticketQuantity}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setGuestCount((current) => Math.min(Math.max(guestLimit, 0), current + 1))}
                            disabled={guestLimit <= 0 || ticketQuantity >= guestLimit}
                            className="h-10 w-10 rounded-xl border border-border hover:border-aegean flex items-center justify-center text-base font-semibold transition-colors"
                            aria-label="Add ticket"
                          >
                            +
                          </button>
                        </div>
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-center justify-between gap-3 text-sm">
                          <span className="text-muted-foreground">{ticketPricePerPerson > 0 ? `€${ticketPricePerPerson.toFixed(ticketPricePerPerson % 1 === 0 ? 0 : 2)} × ${ticketQuantity}` : "Ticket total"}</span>
                          <span className="font-semibold text-foreground">{ticketPricePerPerson > 0 ? formatEuroAmount(ticketSubtotal) : "Contact for price"}</span>
                        </div>

                        {boat?.partyTiers && Array.isArray(boat.partyTiers) && boat.partyTiers.length > 0 ? (
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-foreground">Party tier (optional)</p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {boat.partyTiers.map((tier) => (
                                <button
                                  key={tier.name}
                                  type="button"
                                  onClick={() => setSelectedPartyTier(selectedPartyTier === tier.name ? null : tier.name)}
                                  className={`rounded-lg border p-3 text-sm font-medium transition-all ${
                                    selectedPartyTier === tier.name
                                      ? "border-amber-500 bg-amber-100 text-amber-900"
                                      : "border-amber-200 bg-amber-50 text-foreground hover:border-amber-400"
                                  }`}
                                >
                                  <div>{tier.name}</div>
                                  <div className="text-xs opacity-75">€{tier.price.toFixed(tier.price % 1 === 0 ? 0 : 2)}</div>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <p className="text-xs text-muted-foreground">
                          {ticketMaxPeople > 0
                            ? `After this selection: ${Math.max(ticketsRemaining - ticketQuantity, 0)} ticket${Math.max(ticketsRemaining - ticketQuantity, 0) === 1 ? "" : "s"} left.`
                            : "Ticket inventory is managed by the owner."}
                        </p>
                      </div>
                    ) : boatPackages.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {boatPackages.map((pkg) => (
                          <button
                            key={pkg.id}
                            type="button"
                            onClick={() => {
                              setSelectedPackageId(pkg.id);
                              setFuelLitres([Math.max(24, pkg.hours * 8)]);
                            }}
                            className={`rounded-2xl border p-4 text-left transition-all ${
                              selectedPackageId === pkg.id
                                ? "border-aegean bg-aegean/5 shadow-card"
                                : "border-border hover:border-aegean/40"
                            }`}
                          >
                            <p className="font-semibold text-foreground">{pkg.name}</p>
                            <p className="text-sm text-muted-foreground">{pkg.hours} hours</p>
                            {isPartyBooking ? <p className="text-xs text-muted-foreground mt-1">Ticketed party package</p> : null}
                            {pkg.description ? (
                              <p className="text-xs text-muted-foreground mt-2">{pkg.description}</p>
                            ) : null}
                            <p className="text-sm text-aegean mt-2">€{pkg.price}</p>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        This boat has no predefined trip durations yet. Pricing will use the standard daily rate.
                      </p>
                    )}
                  </div>
                </div>

                {!isPartyBooking ? (
                <div className="rounded-2xl border border-border p-4 bg-muted/10 space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">{isPartyBooking ? "Sector 2: Party date &amp; boarding time" : "Sector 2: Trip date &amp; departure"}</p>
                      <p className="text-xs text-muted-foreground">{isPartyBooking ? (resolvedPartyEventDate && resolvedPartyEventTime ? `Event date: ${resolvedPartyEventDate}. Boarding opens at ${resolvedPartyEventTime} and guests can arrive after that time.` : "The owner still needs to set the original party date and boarding time.") : "Pick your trip day, a free departure time, and how many guests join."}</p>
                    </div>
                    <Badge variant="outline">Schedule</Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-5 items-start">
                    { !isPartyBooking ? (
                      <div className="space-y-5">
                        {/* Quick date shortcuts */}
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs text-muted-foreground shrink-0">Jump to a good option:</p>
                          {([
                            { label: "Next available", date: nextAvailableDate },
                            {
                              label: "This weekend",
                              date: (() => {
                                const today = startOfDay(new Date());
                                for (let offset = 1; offset <= 14; offset++) {
                                  const d = addDays(today, offset);
                                  if (isWeekend(d) && !unavailableDates.some((u) => isSameDay(u, d))) return d;
                                }
                                return undefined;
                              })(),
                            },
                            {
                              label: "+7 days",
                              date: (() => {
                                const d = addDays(startOfDay(new Date()), 7);
                                return unavailableDates.some((u) => isSameDay(u, d)) ? undefined : d;
                              })(),
                            },
                            { label: "+14 days", date: addDays(startOfDay(new Date()), 14) },
                          ] as Array<{ label: string; date: Date | undefined }>).map(({ label, date }) => (
                            <button
                              key={label}
                              type="button"
                              disabled={!date}
                              onClick={() => {
                                if (date) {
                                  setSelectedDate(date);
                                  setHasDateIntent(true);
                                }
                              }}
                              className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-aegean hover:text-aegean disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              {label}
                              {date ? <span className="ml-1 opacity-60">({format(date, "d MMM")})</span> : null}
                            </button>
                          ))}
                        </div>

                        {/* Calendar with visual unavailability */}
                        <div className="rounded-3xl border border-border p-3 md:p-4 bg-muted/20 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="space-y-0.5">
                              <p className="text-sm font-medium text-foreground">Pick date</p>
                              <p className="text-xs text-muted-foreground">
                                {nextAvailableDate ? `Soonest available: ${format(nextAvailableDate, "d MMM")}` : "Chat with the owner if your date looks blocked."}
                              </p>
                            </div>
                            <p className="hidden md:block text-[11px] text-muted-foreground text-right">
                              Grey dates are in the past, red are already booked.
                            </p>
                          </div>
                          <div className="relative">
                            {isCalendarLoading && (
                              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/40 rounded-2xl">
                                <div className="h-8 w-8 border-2 border-aegean border-t-transparent rounded-full animate-spin" />
                              </div>
                            )}
                            <div className="overflow-x-auto pb-1">
                              <div className="min-w-[340px] w-full flex justify-center">
                                <Calendar
                                  mode="single"
                                  selected={selectedDate}
                                  onSelect={(date) => {
                                    setSelectedDate(date);
                                    if (date) {
                                      setHasDateIntent(true);
                                    }
                                  }}
                                  disabled={(date) =>
                                    date < startOfDay(new Date()) ||
                                    unavailableDates.some((blocked) => isSameDay(blocked, date))
                                  }
                                  modifiers={{ unavailable: unavailableDates }}
                                  modifiersClassNames={{
                                    unavailable:
                                      "!bg-destructive/10 !text-destructive !border-destructive/40 line-through !opacity-90 cursor-not-allowed",
                                  }}
                                  className="rounded-2xl border border-border bg-background w-[340px] max-w-full"
                                />
                              </div>
                            </div>
                          </div>
                          {/* Legend */}
                          <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1 text-xs text-muted-foreground border-t border-border">
                            <span className="flex items-center gap-1.5 pt-2">
                              <span className="inline-block h-3 w-3 rounded-full bg-primary" />
                              Selected
                            </span>
                            <span className="flex items-center gap-1.5 pt-2">
                              <span className="inline-block h-3 w-3 rounded-full bg-accent border border-border" />
                              Today
                            </span>
                            <span className="flex items-center gap-1.5 pt-2 text-destructive/80">
                              <span className="inline-block h-3 w-3 rounded-full bg-destructive/15 border border-destructive/30" />
                              {boat ? `${(boat.owner.name || "Owner").split(' ')[0]} unavailable` : "Owner unavailable"}
                            </span>
                            <span className="flex items-center gap-1.5 pt-2 opacity-50">
                              <span className="inline-block h-3 w-3 rounded-full bg-muted border border-border" />
                              Past dates
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-3xl border border-amber-200 p-4 bg-amber-50 space-y-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">Event date</p>
                          <p className="text-xs text-muted-foreground">This party uses a fixed event date set by the owner.</p>
                        </div>
                        <div className="rounded-2xl border border-amber-100 bg-background p-3">
                          {resolvedPartyEventDate ? (
                            <p className="text-sm font-semibold text-foreground">{boat?.partyEventDate ? format(parseISO(boat.partyEventDate), "EEEE, d MMM yyyy") : resolvedPartyEventDate}</p>
                          ) : (
                            <p className="text-sm text-muted-foreground">No event date provided. Contact the owner for the exact date.</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Departure time chips + guest stepper */}
                    <div className="rounded-3xl border border-border p-4 bg-muted/20 space-y-5">
                      {isPartyBooking ? (
                        <div className="space-y-3">
                          <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-aegean" />
                            Party start time
                          </p>
                          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-1.5">
                            <p className="text-lg font-semibold text-foreground">From {resolvedPartyEventTime || "Not set"}</p>
                            <p className="text-xs text-muted-foreground">
                              Boarding opens at this time. Guests can arrive after the start and board whenever they want.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-aegean" />
                            Departure time
                          </p>
                          {sortedDepartureTimes.length > 0 ? (
                            <div className="space-y-2.5">
                              {recommendedDepartureTimes.length > 0 ? (
                                <div className="space-y-1.5">
                                  <p className="text-[11px] font-medium uppercase tracking-wide text-aegean">Recommended</p>
                                  <div className="grid grid-cols-3 gap-1.5">
                                    {recommendedDepartureTimes.map((slot) => (
                                      <button
                                        key={`recommended-${slot}`}
                                        type="button"
                                        disabled={!selectedDate || !availableDepartureTimes.includes(slot)}
                                        onClick={() => setDepartureTime(slot)}
                                        className={`text-xs rounded-xl border py-2 transition-colors ${
                                          departureTime === slot
                                            ? "border-aegean bg-aegean/10 text-aegean font-semibold"
                                            : selectedDate && availableDepartureTimes.includes(slot)
                                              ? "border-border hover:border-aegean/50 text-muted-foreground hover:text-foreground"
                                              : "border-border text-muted-foreground/40 cursor-not-allowed"
                                        }`}
                                      >
                                        {slot} ★
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ) : null}

                              {otherDepartureTimes.length > 0 ? (
                                <div className="space-y-1.5">
                                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Other times</p>
                                  <div className="grid grid-cols-3 gap-1.5">
                                    {otherDepartureTimes.map((slot) => (
                                      <button
                                        key={`other-${slot}`}
                                        type="button"
                                        disabled={!selectedDate || !availableDepartureTimes.includes(slot)}
                                        onClick={() => setDepartureTime(slot)}
                                        className={`text-xs rounded-xl border py-2 transition-colors ${
                                          departureTime === slot
                                            ? "border-aegean bg-aegean/10 text-aegean font-semibold"
                                            : selectedDate && availableDepartureTimes.includes(slot)
                                              ? "border-border hover:border-aegean/50 text-muted-foreground hover:text-foreground"
                                              : "border-border text-muted-foreground/40 cursor-not-allowed"
                                        }`}
                                      >
                                        {slot}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="grid grid-cols-3 gap-1.5">
                              {["07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00"].map((slot) => (
                                <button
                                  key={slot}
                                  type="button"
                                  disabled
                                  className="text-xs rounded-xl border border-border py-2 text-muted-foreground/40 cursor-not-allowed"
                                >
                                  {slot}
                                </button>
                              ))}
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {isLoadingDepartureTimes
                              ? "Checking free departure windows…"
                              : !selectedDate
                                ? "Choose a date first to see which departure times are free."
                                : availableDepartureTimes.length > 0
                                  ? `Free starts for ${selectedPackage.hours}h trip: ${availableDepartureTimes.length}`
                                  : "No valid slots for this date and package—try another day or package length."}
                          </p>
                          {liveAvailabilityNotice ? (
                            <p className="text-xs text-aegean">
                              Live availability updated just now. Times shown are refreshed in real time.
                            </p>
                          ) : null}
                          {departureRecommendations[0]?.reasons?.[0] ? (
                            <p className="text-xs text-aegean">
                              Suggested start: {departureRecommendations[0].departureTime} ({departureRecommendations[0].reasons[0]}).
                            </p>
                          ) : null}
                          {selectedPackage.hours === 5 ? (
                            <p className="text-xs text-aegean">
                              Tip: half-day slots fill quickly—pick an available time now to secure your trip.
                            </p>
                          ) : null}
                        </div>
                      )}

                      <div className="space-y-2.5">
                        <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-aegean" />
                          {isPartyBooking ? "Tickets / guests" : "Guests"}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setGuestCount((c) => Math.max(1, c - 1))}
                            className="h-9 w-9 rounded-xl border border-border hover:border-aegean flex items-center justify-center text-base font-semibold transition-colors"
                            aria-label="Remove guest"
                          >
                            −
                          </button>
                          <span className="w-8 text-center font-semibold tabular-nums text-foreground">{guestCount}</span>
                          <button
                            type="button"
                            onClick={() => setGuestCount((c) => Math.min(guestLimit, c + 1))}
                            className="h-9 w-9 rounded-xl border border-border hover:border-aegean flex items-center justify-center text-base font-semibold transition-colors"
                            aria-label="Add guest"
                          >
                            +
                          </button>
                          <span className="text-xs text-muted-foreground">/ {guestLimit} max</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Summary bar */}
                  <div className={`rounded-2xl border p-4 transition-all duration-300 ${
                    selectedDate ? "border-aegean/30 bg-aegean/5" : "border-dashed border-border bg-muted/20"
                  }`}>
                    {selectedDate ? (
                      <div className="flex flex-wrap gap-x-6 gap-y-3 items-center">
                        <div className="flex items-center gap-2">
                          <CalendarCheck2 className="h-4 w-4 text-aegean shrink-0" />
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Date</p>
                            <p className="text-sm font-semibold text-foreground">{format(selectedDate, "EEEE, d MMM yyyy")}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-aegean shrink-0" />
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Departure</p>
                            <p className="text-sm font-semibold text-foreground">
                              {isPartyBooking
                                ? `From ${resolvedPartyEventTime || "Not set"} · boarding open after start`
                                : departureTime
                                  ? `${departureTime} · ${boat?.departureMarina ?? "marina"}`
                                  : "Select a departure time"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-aegean shrink-0" />
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Guests</p>
                            {isPartyBooking ? <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Tickets</p> : null}
                            <p className="text-sm font-semibold text-foreground">{guestCount}</p>
                          </div>
                        </div>
                        {!isPartyBooking && departureTime ? (
                          <div className="flex items-center gap-2 sm:ml-auto">
                            <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Est. return</p>
                              <p className="text-sm font-semibold text-foreground">
                                {(() => {
                                  const [h, m] = departureTime.split(":").map(Number);
                                  const dep = new Date(selectedDate);
                                  dep.setHours(h, m, 0, 0);
                                  return format(addHours(dep, bookingDurationHours), "HH:mm");
                                })()}
                              </p>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-1">Choose a date and departure time above to see your schedule</p>
                    )}
                  </div>
                </div>
                ) : null}
                </>
                ) : null}

                {bookingStep === 2 && !isPartyBooking ? (
                <div className="rounded-2xl border border-border p-4 bg-muted/10 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">{isPartyBooking ? "Sector 3: Guest details" : "Sector 3: Customer details"}</p>
                    <Badge variant="outline">Identity</Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input placeholder="Full name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
                    <Input type="email" placeholder="Email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} />
                  </div>
                  {!sessionUser ? (
                    <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3">
                      <p className="text-sm font-medium text-foreground">Fast checkout sign-in</p>
                      <p className="text-xs text-muted-foreground">Use email only or continue with Google in one tap.</p>
                      <Button type="button" variant="outline" className="w-full" onClick={handleGoogleFastSignIn}>
                        <LogIn className="h-4 w-4 mr-2" />
                        Continue with Google
                      </Button>
                    </div>
                  ) : null}
                </div>
                ) : null}

                {bookingStep === 2 || isPartyBooking ? (
                <div className="rounded-2xl border border-border p-4 bg-muted/10 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">{isPartyBooking ? "Sector 4: Party setup" : "Sector 4: Experience and add-ons"}</p>
                    <Badge variant="outline">{isPartyBooking ? "Party" : "Custom"}</Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {isPartyBooking ? (
                      <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 md:col-span-2">
                        <p className="text-sm font-medium text-foreground flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-aegean" />
                          Party booking setup
                        </p>
                        <p className="text-sm text-muted-foreground">
                          This booking uses ticket pricing instead of fuel and skipper controls. The guest count below becomes your ticket list for check-in.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                          <div className="rounded-xl border border-amber-200 bg-background p-3">
                            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Ticket price</p>
                            <p className="text-lg font-semibold text-foreground">{ticketPricePerPerson > 0 ? formatEuroAmount(ticketPricePerPerson) : "Contact for price"}</p>
                          </div>
                          <div className="rounded-xl border border-amber-200 bg-background p-3">
                            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Max people</p>
                            <p className="text-lg font-semibold text-foreground">{ticketMaxPeople > 0 ? `${ticketMaxPeople}` : "On request"}</p>
                          </div>
                          <div className="rounded-xl border border-amber-200 bg-background p-3">
                            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Current tickets</p>
                            <p className="text-lg font-semibold text-foreground">{guestCount}</p>
                          </div>
                        </div>
                      </div>
                    ) : showFuelEstimate ? (
                    <div className="space-y-3 rounded-2xl border border-aegean/20 bg-aegean/5 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-foreground flex items-center gap-2">
                          <Fuel className="h-4 w-4 text-aegean" />
                          Fuel estimate
                        </p>
                        <p className="text-sm font-semibold text-foreground">{fuelLitres[0]} L</p>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {[Math.max(20, suggestedFuelLitres - 12), suggestedFuelLitres, Math.min(120, suggestedFuelLitres + 12)].map((litres) => (
                          <Button
                            key={`fuel-${litres}`}
                            type="button"
                            variant={fuelLitres[0] === litres ? "default" : "outline"}
                            className="h-8 text-xs"
                            onClick={() => setFuelLitres([litres])}
                          >
                            {litres}L
                          </Button>
                        ))}
                      </div>

                      <Slider
                        value={fuelLitres}
                        min={10}
                        max={120}
                        step={2}
                        onValueChange={setFuelLitres}
                      />

                      <div className="rounded-xl border border-border bg-background p-3">
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Estimated fuel cost</p>
                        <p className="text-lg font-semibold text-foreground">€{fuelCost}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Live rate: €{oilPricePerLitre.toFixed(2)}/L. Adjust based on route and sea conditions.
                        </p>
                      </div>
                    </div>
                    ) : (
                      <div className="rounded-2xl border border-border p-4 bg-muted/30 text-sm text-muted-foreground">
                        Fuel estimate is included in skipper-led trips and is not shown separately.
                      </div>
                    )}

                    {isPartyBooking ? (
                      <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-foreground">Party rules</p>
                            <p className="text-xs text-muted-foreground">Keep music, drinks, and guest list aligned before checkout.</p>
                          </div>
                        </div>
                        <div className="rounded-xl border border-amber-200 bg-background p-3 text-sm text-muted-foreground space-y-1">
                          <p className="font-medium text-foreground">What changes here</p>
                          <p>• No fuel calculator</p>
                          <p>• No skipper toggle</p>
                          <p>• Guest count is treated as ticket count</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4 rounded-2xl border border-border p-4 bg-muted/30">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-foreground">Include skipper</p>
                            <p className="text-xs text-muted-foreground">
                              {boat?.skipperRequired
                                ? "Required by this boat owner"
                                : "Professional captain for smoother routing"}
                            </p>
                          </div>
                          <Switch checked={includeSkipper} onCheckedChange={setIncludeSkipper} disabled={boat?.skipperRequired} />
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-foreground">Flexible cancellation</p>
                            <p className="text-xs text-muted-foreground">Extra protection if weather or timing shifts</p>
                          </div>
                          <Switch checked={includeFlexibleCancellation} onCheckedChange={setIncludeFlexibleCancellation} />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <p className="text-sm font-medium text-foreground flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-aegean" />
                      {isPartyBooking ? "Party upgrades" : "Owner upgrades"}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {ownerUpgrades.map((extra) => {
                        const selected = selectedExtras.includes(extra.id);

                        return (
                          <button
                            key={extra.id}
                            type="button"
                            onClick={() => toggleExtra(extra.id)}
                            className={`rounded-2xl border p-4 text-left transition-all ${
                              selected
                                ? "border-aegean bg-aegean/5 shadow-card"
                                : "border-border hover:border-aegean/40"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-medium text-foreground">{extra.label}</p>
                              <span className="text-sm text-aegean">+€{extra.price}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {ownerUpgrades.length === 0 ? (
                      <p className="text-xs text-muted-foreground rounded-xl border border-dashed border-border p-3">
                        {isPartyBooking ? "No party upgrades added for this boat yet." : "No owner upgrades added for this boat yet."}
                      </p>
                    ) : null}
                  </div>

                  <Textarea placeholder="Special requests (optional)" value={specialRequests} onChange={(event) => setSpecialRequests(event.target.value)} />
                </div>
                ) : null}

                {bookingStep === 3 && !isPartyBooking ? (
                  <div className="rounded-2xl border border-border p-4 bg-muted/10 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground">{isPartyBooking ? "Sector 5: Ticket payment" : "Sector 5: Payment"}</p>
                      <Badge variant="outline">Card via Stripe</Badge>
                    </div>

                    <div className="space-y-3">
                      <p className="text-sm font-medium text-foreground">How much do you want to pay now?</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setPaymentPlan("deposit")}
                          className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                            paymentPlan === "deposit"
                              ? "border-aegean bg-aegean/10 text-aegean"
                              : "border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          30% deposit (card)
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentPlan("full")}
                          className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                            paymentPlan === "full"
                              ? "border-aegean bg-aegean/10 text-aegean"
                              : "border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          Pay full now (card)
                        </button>
                      </div>
                    </div>

                    {/* Voucher input removed */}

                    <div className="rounded-2xl border border-aegean/30 bg-aegean/5 p-3 space-y-1.5">
                      <p className="text-sm font-medium text-foreground">Card payment via Stripe</p>
                      <p className="text-xs text-muted-foreground">
                        You will be redirected to secure Stripe Checkout to pay by card (including Apple Pay / Google Pay where available).
                      </p>
                    </div>

                    {pricing.flashSaleDiscount > 0 ? (
                      <div className="rounded-2xl border border-emerald-400/30 bg-emerald-50 p-3">
                        <p className="text-sm font-medium text-foreground">Last-minute flash sale applied</p>
                        <p className="text-xs text-muted-foreground">You saved €{pricing.flashSaleDiscount} because this departure is still unbooked within 24 hours.</p>
                      </div>
                    ) : null}

                    <div className="rounded-xl border border-aegean/30 bg-aegean/5 p-3">
                      <p className="text-xs text-muted-foreground">Due now</p>
                      <p className="text-lg font-semibold text-foreground">€{amountDueNow}</p>
                      <p className="text-xs text-muted-foreground">
                        {isPartyBooking
                          ? `Ticket flow locked for ${guestCount} guests${ticketMaxPeople > 0 ? ` of ${ticketMaxPeople} max` : ""}.`
                          : paymentPlan === "deposit"
                            ? `Remaining at harbor (card or cash): €${Math.max(estimatedTotal - depositAmount, 0)}`
                            : "No remaining balance at harbor — full amount is paid online by card."}
                      </p>
                    </div>
                  </div>
                ) : null}

                {bookingStep === 4 && !isPartyBooking ? (
                  <div className="rounded-2xl border border-border p-4 bg-muted/10 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground">{isPartyBooking ? "Sector 6: Review ticket booking" : "Sector 6: Review and confirm"}</p>
                      <Badge variant="outline">Final step</Badge>
                    </div>

                    <div className="rounded-2xl border border-border bg-background p-4 space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Boat</span>
                        <span className="text-foreground font-medium">{boatName}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Package</span>
                        <span className="text-foreground font-medium">{selectedPackage.name}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Date</span>
                        <span className="text-foreground font-medium">{selectedDate ? format(selectedDate, "d MMM yyyy") : "Pick a date"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Departure</span>
                        <span className="text-foreground font-medium">{departureTime}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Guests</span>
                        <span className="text-foreground font-medium">{guestCount}</span>
                      </div>
                      {isPartyBooking ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Ticket price</span>
                          <span className="text-foreground font-medium">{ticketPricePerPerson > 0 ? formatEuroAmount(ticketPricePerPerson) : "Contact for price"}</span>
                        </div>
                      ) : null}
                      {pricing.flashSaleDiscount > 0 ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Flash sale</span>
                          <span className="text-emerald-600 font-medium">-€{pricing.flashSaleDiscount}</span>
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Due now</span>
                        <span className="text-foreground font-semibold">€{amountDueNow}</span>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Review your trip details and payment on the right panel, then click confirm.
                    </p>
                  </div>
                ) : null}

                {!isPartyBooking ? (
                  <div className="flex items-center justify-between gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setBookingStep((current) => (current > 1 ? ((current - 1) as 1 | 2 | 3 | 4) : current))}
                      disabled={bookingStep === 1}
                    >
                      Back
                    </Button>

                    {bookingStep === 1 ? (
                      <Button type="button" onClick={() => setBookingStep(2)} disabled={!canContinueStep1} className="bg-gradient-accent text-accent-foreground">
                        Continue
                      </Button>
                    ) : null}
                    {bookingStep === 2 ? (
                      <Button type="button" onClick={() => setBookingStep(3)} disabled={!canContinueStep2} className="bg-gradient-accent text-accent-foreground">
                        Continue
                      </Button>
                    ) : null}
                    {bookingStep === 3 && !isPartyBooking ? (
                      <Button type="button" onClick={() => setBookingStep(4)} disabled={!canContinueStep3} className="bg-gradient-accent text-accent-foreground">
                        Continue
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {boat ? (
              <Card className="shadow-card h-fit lg:col-span-1 lg:sticky lg:top-24">
                <CardHeader>
                    <CardTitle>{isPartyBooking ? "Ticket summary" : "Payment summary"}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl border border-border bg-muted/10 p-4 space-y-2">
                    <p className="text-sm font-semibold text-foreground">{isPartyBooking ? "Step 1: Review ticket cost" : "Step 1: Review trip cost"}</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between"><span className="text-muted-foreground">{isPartyBooking ? "Tickets" : selectedPackage.name}</span><span className="text-foreground">{isPartyBooking ? ticketQuantity : `€${basePackagePrice}`}</span></div>
                      {isPartyBooking ? (
                        <>
                          <div className="flex items-center justify-between"><span className="text-muted-foreground">Unit price</span><span className="text-foreground">{ticketPricePerPerson > 0 ? formatEuroAmount(ticketPricePerPerson) : "Contact"}</span></div>
                          <div className="flex items-center justify-between"><span className="text-muted-foreground">Total</span><span className="text-foreground">{ticketPricePerPerson > 0 ? formatEuroAmount(ticketSubtotal) : "Contact"}</span></div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center justify-between"><span className="text-muted-foreground">Fuel ({fuelLitres[0]}L)</span><span className="text-foreground">€{fuelCost}</span></div>
                          <div className="flex items-center justify-between"><span className="text-muted-foreground">Skipper</span><span className="text-foreground">€{skipperCost}</span></div>
                          <div className="flex items-center justify-between"><span className="text-muted-foreground">Guest experience uplift</span><span className="text-foreground">€{guestExperienceFee}</span></div>
                          <div className="flex items-center justify-between"><span className="text-muted-foreground">Flexible cancellation</span><span className="text-foreground">€{flexibleCancellationCost}</span></div>
                          <div className="flex items-center justify-between"><span className="text-muted-foreground">Sea routing fee</span><span className="text-foreground">€{crazySeaRoutingFee}</span></div>
                        </>
                      )}
                      <div className="flex items-center justify-between"><span className="text-muted-foreground">Add-ons</span><span className="text-foreground">€{extrasCost}</span></div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-muted/10 p-4">
                    {isPartyBooking ? (
                      <>
                        <p className="text-sm font-semibold text-foreground">Step 2: Start date and time</p>
                        <div className="space-y-2 pt-2 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">Start date</span>
                            <span className="text-foreground font-medium">{boat?.partyEventDate ? format(parseISO(boat.partyEventDate), "d MMM yyyy") : resolvedPartyEventDate || "Not set"}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">Start time</span>
                            <span className="text-foreground font-medium">{resolvedPartyEventTime || "Not set"}</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-foreground">Step 2: Estimated total</p>
                        <p className="text-sm text-muted-foreground">Estimated total</p>
                        <p className="text-3xl font-heading font-bold text-foreground">€{estimatedTotal}</p>
                      </>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">Payments are processed securely via Stripe Checkout.</p>

                  <div className="rounded-2xl border border-border bg-muted/10 p-4 space-y-2 text-sm">
                    <p className="text-sm font-semibold text-foreground">{isPartyBooking ? "Step 3: Ticket snapshot" : "Step 4: Booking snapshot"}</p>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Boat</span>
                      <span className="text-foreground font-medium">{boatName}</span>
                    </div>
                    {isPartyBooking ? (
                      <>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Start date</span>
                          <span className="text-foreground font-medium">{boat?.partyEventDate ? format(parseISO(boat.partyEventDate), "d MMM yyyy") : resolvedPartyEventDate || "Not set"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Start time</span>
                          <span className="text-foreground font-medium">{resolvedPartyEventTime || "Not set"}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Day</span>
                          <span className="text-foreground font-medium">{selectedDate ? format(selectedDate, "d MMM yyyy") : "Pick a date"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Departure</span>
                          <span className="text-foreground font-medium">{departureTime || "Select time"}</span>
                        </div>
                      </>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Payment method</span>
                      <span className="text-foreground font-medium">Card via Stripe Checkout</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Payment plan</span>
                      <span className="text-foreground font-medium">
                        {isPartyBooking
                          ? "Ticket booking"
                          : paymentPlan === "deposit"
                            ? "30% deposit"
                            : paymentPlan === "full"
                              ? "Pay full now"
                              : "Select plan"}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-aegean" />
                    Secure checkout and verified owner
                  </p>

                  {bookingStep === finalBookingStep ? <p className="text-xs text-muted-foreground">{isPartyBooking ? "Step 5: Confirm ticket booking workflow." : "Step 8: Confirm and send booking workflow."}</p> : null}
                  {bookingStep === finalBookingStep ? (
                    <Button className="w-full bg-gradient-accent text-accent-foreground gap-2" onClick={handleConfirmBooking} disabled={isConfirming}>
                      {isConfirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                      {isConfirming ? "Creating secure checkout..." : `Confirm booking (€${amountDueNow} now)`}
                    </Button>
                  ) : null}
                  <Button asChild variant="outline" className="w-full">
                    <Link to={boatProfileLink}>Back to boat profile</Link>
                  </Button>

                  {workflowResult ? (
                    <div className="rounded-2xl border border-aegean/30 bg-aegean/5 p-4 space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 rounded-full bg-aegean/15 p-2 text-aegean">
                          <CalendarCheck2 className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">Booking workflow completed</p>
                          <p className="text-sm text-muted-foreground">Reference {workflowResult.booking.id}</p>
                        </div>
                      </div>

                      <div className="space-y-3 text-sm">
                        <div className="rounded-2xl border border-border bg-background p-3">
                          <p className="font-medium text-foreground">Owner notification</p>
                          <p className="text-muted-foreground mt-1">{workflowResult.ownerNotification.subject}</p>
                          <p className="text-xs text-muted-foreground mt-2">Queued to {workflowResult.ownerNotification.ownerEmail}</p>
                        </div>

                        {workflowResult.customerEmail ? (
                          <div className="rounded-2xl border border-border bg-background p-3">
                            <div className="flex items-center gap-2">
                              <Mail className="h-4 w-4 text-aegean" />
                              <p className="font-medium text-foreground">Customer confirmation email</p>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">To: {workflowResult.customerEmail.toEmail}</p>
                            <p className="text-xs text-muted-foreground">Subject: {workflowResult.customerEmail.subject}</p>
                            <pre className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground font-sans">{workflowResult.customerEmail.body}</pre>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-border bg-background p-3 space-y-1">
                            <p className="font-medium text-foreground">In-app confirmation</p>
                            <p className="text-xs text-muted-foreground">
                              Email queue skipped for Google sign-in booking. Confirmation is available in your profile and booking record.
                            </p>
                          </div>
                        )}

                        <Button asChild variant="outline" className="w-full">
                          <Link
                            to={`/post-trip-review?bookingId=${encodeURIComponent(workflowResult.booking.id)}&boatRef=${encodeURIComponent(boat?.publicSlug || (boat ? buildBoatPublicSlug(boat) : workflowResult.booking.boatId))}&boat=${encodeURIComponent(workflowResult.booking.boatName)}`}
                          >
                            Post trip review
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {boat ? (
              <div className="space-y-6 lg:col-span-2">
                <Card className="shadow-card h-fit">
                  <CardHeader>
                    <CardTitle>Meet your host</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-12 w-12 border border-border">
                        <AvatarFallback className="bg-aegean/10 text-aegean font-semibold">
                          {(boat.owner.name || "Owner")
                            .split(" ")
                            .map((part) => part[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-foreground">{boat.owner.name || "Owner"}</p>
                          {boat.owner.isSuperhost ? <Badge className="bg-aegean text-primary-foreground">Guest favorite</Badge> : null}
                        </div>
                        <p className="text-sm text-muted-foreground">{boat.owner.title || "Boat Owner"}</p>
                      </div>
                    </div>
                    {boat.owner.bio ? <p className="text-sm text-muted-foreground">{boat.owner.bio}</p> : null}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center text-sm">
                      <div className="rounded-2xl border border-border p-3">
                        <p className="text-xs text-muted-foreground">Trips</p>
                        <p className="font-semibold text-foreground">{boat.owner.tripsHosted}</p>
                      </div>
                      <div className="rounded-2xl border border-border p-3">
                        <p className="text-xs text-muted-foreground">Response</p>
                        <p className="font-semibold text-foreground">{boat.owner.responseRate}%</p>
                      </div>
                      <div className="rounded-2xl border border-border p-3">
                        <p className="text-xs text-muted-foreground">Rating</p>
                        <p className="font-semibold text-foreground flex items-center justify-center gap-1"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{boat.rating}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="relative z-0 shadow-card h-fit overflow-hidden">
                  <div className="relative z-0 aspect-[4/3] border-b border-border overflow-hidden">
                    <BoatLocationMap
                      points={[
                        {
                          id: boat.id,
                          name: boat.name,
                          query: boat.mapQuery,
                          subtitle: `${boat.departureMarina} • ${boat.location}`,
                        },
                      ]}
                      selectedPointId={boat.id}
                      emptyLabel="Meeting point map is unavailable."
                      loadingLabel="Loading meeting point map…"
                      heightClassName="h-full"
                    />
                  </div>
                  <CardHeader>
                    <CardTitle>Meeting point</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="font-medium text-foreground">{boat.departureMarina}</p>
                      <p className="text-sm text-muted-foreground">{boat.location}, Greece</p>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      <Button asChild className="bg-gradient-accent text-accent-foreground">
                        <a href={googleDirectionsUrl} target="_blank" rel="noreferrer">
                          <Navigation className="mr-2 h-4 w-4" />
                          Open directions
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Booking;
