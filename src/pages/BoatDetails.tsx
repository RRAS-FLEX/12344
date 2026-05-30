import { useEffect, useRef, useState } from "react";
import { useSEO } from "@/hooks/useSEO";
import { useStructuredData } from "@/hooks/useStructuredData";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { format, isSameDay, parseISO } from "date-fns";
import { Check, Flag, Gauge, MapPin, MessageCircle, Navigation, ShieldCheck, Star, Users } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { BoatDetailsPageSkeleton } from "@/components/loading/LoadingUI";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import BoatLocationMap from "@/components/BoatLocationMap";
import { buildBoatPublicSlug, getBoatByPublicReference, getBoatByIdForOwner } from "@/lib/boats";
import type { Boat } from "@/lib/boats";
import { getOwnerBadgesForBoat, type OwnerBadge } from "@/lib/owner-badges";
import { getBoatReviews, getBoatReviewStats, type BoatReview } from "@/lib/reviews";
import { trackBoatViewed, trackBookingStarted } from "@/lib/analytics";
import { useLanguage } from "@/contexts/LanguageContext";
import { withRetry } from "@/lib/retry";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import RatingComparisonPill from "@/components/ratings/RatingComparisonPill";

const BoatDetails = () => {
  const { tl } = useLanguage();
  const { boatRef } = useParams<{ boatRef: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useCurrentUser();
  const [boat, setBoat] = useState<Boat | null>(null);
  const [isBoatLoading, setIsBoatLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedImage, setSelectedImage] = useState(0);
  const [showMobileBookingCta, setShowMobileBookingCta] = useState(true);
  const bookingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    const loadBoat = async () => {
      if (!boatRef) {
        if (!cancelled) {
          setBoat(null);
          setIsBoatLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setBoat(null);
        setSelectedImage(0);
        setIsBoatLoading(true);
      }

      try {
        const isOwnerPreview = searchParams.get("owner-preview") === "1";
        const looksLikeId = !!boatRef && boatRef.length === 36;

        let foundBoat: Boat | null;

        if (isOwnerPreview && looksLikeId && user?.isOwner) {
          // Owner preview path: allow viewing own boat even if payouts are not ready.
          foundBoat = await withRetry(() => getBoatByIdForOwner(boatRef), {
            retries: 2,
            initialDelayMs: 220,
          });
        } else {
          foundBoat = await withRetry(() => getBoatByPublicReference(boatRef), {
            retries: 2,
            initialDelayMs: 220,
          });
        }
        if (!cancelled) {
          setBoat(foundBoat);
          setLoadError("");
          setIsBoatLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          setBoat(null);
          setLoadError(error instanceof Error ? error.message : "Unable to load boat details.");
          setIsBoatLoading(false);
        }
      }
    };

    loadBoat();

    return () => {
      cancelled = true;
    };
  }, [boatRef]);

  const unavailableDates = boat?.availability.unavailableDates.map((date) => parseISO(date)) ?? [];
  const nextAvailableDate = Array.from({ length: 21 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + index);
    return date;
  }).find((date) => !unavailableDates.some((blockedDate) => isSameDay(blockedDate, date)));
  const mapQuery = boat?.mapQuery ?? "";
  const googleDirectionsUrl = boat ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapQuery)}` : "/boats";
  const [boatReviews, setBoatReviews] = useState<BoatReview[]>([]);
  const [reviewStats, setReviewStats] = useState({ total: 0, averageRating: 0 });
  const [selectedReview, setSelectedReview] = useState<BoatReview | null>(null);
  const [ownerBadges, setOwnerBadges] = useState<OwnerBadge[]>([]);
  const isOwnerPreview = searchParams.get("owner-preview") === "1" && Boolean(user?.isOwner);
  const publicBoatRef = boat ? boat.publicSlug || buildBoatPublicSlug(boat) : "";
  const publicBoatUrl = boat ? `https://nautiplex.gr/boats/${publicBoatRef}` : undefined;
  const resolvedTicketMaxPeople = boat ? (boat.ticketMaxPeople > 0 ? boat.ticketMaxPeople : boat.capacity) : 0;
  const resolvedTicketPricePerPerson = boat
    ? (boat.ticketPricePerPerson > 0 ? boat.ticketPricePerPerson : boat.partyReady && boat.capacity > 0 ? boat.pricePerDay / boat.capacity : 0)
    : 0;
  const formatTicketPrice = (value: number) => `€${value.toFixed(value % 1 === 0 ? 0 : 2)}`;

  useEffect(() => {
    if (!boat?.id) {
      setBoatReviews([]);
      setReviewStats({ total: 0, averageRating: 0 });
      setOwnerBadges([]);
      return;
    }

    const loadReviewsAndBadges = async () => {
      const [nextReviews, nextStats, nextBadges] = await Promise.all([
        getBoatReviews(boat.id),
        getBoatReviewStats(boat.id),
        getOwnerBadgesForBoat(boat.id),
      ]);
      setBoatReviews(nextReviews.slice(0, 4));
      setReviewStats(nextStats);
      setOwnerBadges(nextBadges);
    };

    loadReviewsAndBadges();
  }, [boat?.id]);
  const boatStructuredData = boat
    ? {
      "@context": "https://schema.org",
      "@type": "Product",
      name: boat.name,
      image: boat.images.length > 0 ? boat.images : [boat.image],
      description: boat.description,
      brand: {
        "@type": "Brand",
        name: "Nautiplex",
      },
      category: `${boat.type} Boat Rental`,
      sku: boat.id,
      url: publicBoatUrl,
      areaServed: {
        "@type": "Place",
        name: `${boat.location}, Greece`,
      },
      offers: {
        "@type": "Offer",
        priceCurrency: "EUR",
        price: boat.pricePerDay,
        availability: nextAvailableDate ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        url: publicBoatUrl,
      },
      aggregateRating: reviewStats.total
        ? {
          "@type": "AggregateRating",
          ratingValue: reviewStats.averageRating,
          reviewCount: reviewStats.total,
        }
        : undefined,
      review: boatReviews.map((review) => ({
        "@type": "Review",
        author: {
          "@type": "Person",
          name: review.customerName,
        },
        reviewBody: review.comment,
        name: review.title,
        reviewRating: {
          "@type": "Rating",
          ratingValue: review.rating,
          bestRating: 5,
          worstRating: 1,
        },
      })),
    }
    : null;

  useStructuredData(`boat-schema-${boat?.id ?? "unknown"}`, boatStructuredData);

  useSEO({
    title: boat
      ? `${boat.name} — ${boat.type} in ${boat.location} | Nautiplex`
      : "Boat Details | Nautiplex",
    description: boat
      ? `Rent the ${boat.name}, a ${boat.type} in ${boat.location} for €${boat.pricePerDay}/day. Capacity: ${boat.capacity} guests. ${boat.description?.slice(0, 100) ?? "Verified by Nautiplex."}`.trim()
      : "View boat details, availability and book instantly on Nautiplex.",
    canonical: publicBoatUrl,
    ogImage: boat?.image,
    ogType: "article",
    keywords: boat ? `${boat.name}, ${boat.type} rental ${boat.location}, boat hire ${boat.location} Greece` : undefined,
  });

  useEffect(() => {
    if (!boat) {
      return;
    }

    trackBoatViewed({
      id: boat.id,
      name: boat.name,
      type: boat.type,
      location: boat.location,
      pricePerDay: boat.pricePerDay,
    });
  }, [boat]);

  const scrollToBooking = () => {
    bookingRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const bookingElement = bookingRef.current;
    if (!bookingElement) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowMobileBookingCta(!entry.isIntersecting);
      },
      { threshold: 0.35 },
    );

    observer.observe(bookingElement);
    return () => observer.disconnect();
  }, [boat?.id]);

  if (isBoatLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <BoatDetailsPageSkeleton />
        <Footer />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-24 pb-20">
          <div className="container mx-auto px-4 text-center space-y-4">
            <h1 className="text-3xl font-heading font-bold text-foreground">{tl("Could not load boat", "Δεν ήταν δυνατή η φόρτωση σκάφους")}</h1>
            <p className="text-muted-foreground">{loadError}</p>
            <Link to="/boats" className="text-aegean hover:text-turquoise font-medium">{tl("Back to boats →", "Επιστροφή στα σκάφη →")}</Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!boat) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-24 pb-20">
          <div className="container mx-auto px-4 text-center space-y-4">
            <h1 className="text-3xl font-heading font-bold text-foreground">{tl("Boat not found", "Το σκάφος δεν βρέθηκε")}</h1>
            <p className="text-muted-foreground">{tl("This boat may have been removed or the link is incorrect.", "Αυτό το σκάφος μπορεί να έχει αφαιρεθεί ή ο σύνδεσμος να είναι λανθασμένος.")}</p>
            <Link to="/boats" className="text-aegean hover:text-turquoise font-medium">{tl("Back to boats →", "Επιστροφή στα σκάφη →")}</Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Mobile Book Now Button */}
      {showMobileBookingCta && !isOwnerPreview ? (
        <button
          onClick={scrollToBooking}
          className="fixed bottom-4 left-4 right-4 md:hidden z-[1200] py-3 px-4 bg-gradient-accent text-accent-foreground font-semibold rounded-xl shadow-lg hover:opacity-90 transition-opacity"
        >
          {tl("Book Now", "Κράτηση τώρα")}
        </button>
      ) : null}

      <main className="relative z-10 pt-16 pb-20 md:pb-0">
        <section className="py-8 md:py-10 border-b border-border">
          <div className="container mx-auto px-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">{tl("Boat details", "Λεπτομέρειες σκάφους")}</p>
              <h1 className="text-3xl md:text-4xl font-heading font-bold text-foreground">{boat.name}</h1>
            </div>
            <Link to="/boats" className="text-sm font-medium text-aegean hover:text-turquoise">← {tl("Back to all boats", "Επιστροφή σε όλα τα σκάφη")}</Link>
          </div>
        </section>

        <section className="py-10 md:py-12">
          <div className="container mx-auto px-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 overflow-hidden shadow-card-hover">
              <div className="aspect-[16/9] overflow-hidden">
                <img src={boat.images[selectedImage] ?? boat.image} alt={boat.name} className="w-full h-full object-cover" />
              </div>
              <CardContent className="pt-6 space-y-6">
                {boat.images.length > 1 ? (
                  <div className="grid grid-cols-4 gap-3 md:grid-cols-5">
                    {boat.images.map((imageUrl, index) => (
                      <button
                        key={`${boat.id}-image-${index}`}
                        type="button"
                        onClick={() => setSelectedImage(index)}
                        className={`overflow-hidden rounded-2xl border ${selectedImage === index ? "border-aegean" : "border-border"}`}
                      >
                        <img src={imageUrl} alt={`${boat.name} view ${index + 1}`} className="h-20 w-full object-cover" />
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-gradient-accent text-accent-foreground">{boat.type}</Badge>
                  <Badge variant="outline" className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{boat.location}</Badge>
                  <Badge variant="outline" className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{boat.capacity} {tl("guests", "επισκέπτες")}</Badge>
                  <Badge variant="outline" className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{boat.rating}</Badge>
                  {boat.skipperRequired ? <Badge variant="outline">{tl("Skipper required", "Απαιτείται skipper")}</Badge> : null}
                  {boat.partyReady ? <Badge variant="outline">Boat parties</Badge> : null}
                  {/* Voucher feature removed */}
                </div>

                <div className="rounded-3xl border border-border bg-muted/20 p-5 space-y-4">
                  <h2 className="font-heading font-semibold text-lg text-foreground">{tl("Overview", "Επισκόπηση")}</h2>
                  <p className="text-muted-foreground leading-relaxed">{boat.description}</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-2xl border border-border bg-background p-4">
                      <p className="text-xs text-muted-foreground">Length</p>
                      <p className="font-semibold text-foreground">{boat.lengthMeters} m</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-background p-4">
                      <p className="text-xs text-muted-foreground">Built</p>
                      <p className="font-semibold text-foreground">{boat.year}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-background p-4">
                      <p className="text-xs text-muted-foreground">Cruising speed</p>
                      <p className="font-semibold text-foreground flex items-center gap-1"><Gauge className="h-4 w-4 text-aegean" />{boat.cruisingSpeedKnots} kn</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-background p-4">
                      <p className="text-xs text-muted-foreground">Fuel burn</p>
                      <p className="font-semibold text-foreground">{boat.fuelBurnLitresPerHour} L/h</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h2 className="font-heading font-semibold text-lg">{tl("Included amenities", "Παροχές που περιλαμβάνονται")}</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {boat.amenities.map((amenity) => (
                      <div key={amenity} className="text-sm text-foreground flex items-center gap-2">
                        <Check className="h-4 w-4 text-aegean" />
                        {amenity}
                      </div>
                    ))}
                  </div>
                </div>

                {boat.partyReady ? (
                  <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 space-y-3">
                    <h2 className="font-heading font-semibold text-lg text-foreground">Boat party tickets</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-background border border-amber-200 p-3">
                        <p className="text-xs text-muted-foreground">Ticket price</p>
                        <p className="font-semibold text-foreground">
                          {resolvedTicketPricePerPerson > 0 ? formatTicketPrice(resolvedTicketPricePerPerson) : "Contact for price"}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-background border border-amber-200 p-3">
                        <p className="text-xs text-muted-foreground">Max people</p>
                        <p className="font-semibold text-foreground">
                          {resolvedTicketMaxPeople > 0 ? `${resolvedTicketMaxPeople} guests` : "Capacity on request"}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <div className="rounded-2xl bg-background border border-amber-200 p-3">
                        <p className="font-semibold text-foreground">1. Plan the event</p>
                        <p className="text-muted-foreground">Choose guest count, music, drinks, and cruise length.</p>
                      </div>
                      <div className="rounded-2xl bg-background border border-amber-200 p-3">
                        <p className="font-semibold text-foreground">2. Lock the boat</p>
                        <p className="text-muted-foreground">Reserve your date and confirm the booking with the owner.</p>
                      </div>
                      <div className="rounded-2xl bg-background border border-amber-200 p-3">
                        <p className="font-semibold text-foreground">3. Launch smoothly</p>
                        <p className="text-muted-foreground">Confirm the marina, party rules, and departure timing with the owner.</p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Voucher offers removed */}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-border p-4">
                    <p className="text-sm text-muted-foreground">{tl("Departure marina", "Μαρίνα αναχώρησης")}</p>
                    <p className="font-medium text-foreground">{boat.departureMarina}</p>
                    <p className="text-xs text-muted-foreground mt-1">{boat.responseTime}</p>
                  </div>
                  <div className="rounded-2xl border border-border p-4">
                    <p className="text-sm text-muted-foreground flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-aegean" />{tl("Booking policy", "Πολιτική κράτησης")}</p>
                    <p className="font-medium text-foreground">{boat.cancellationPolicy}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className="rounded-3xl border border-border bg-muted/20 p-5 space-y-4">
                    <div className="flex items-start gap-4">
                      <Avatar className="h-14 w-14 border border-border">
                        <AvatarFallback className="bg-aegean/10 text-aegean font-semibold">
                          {(boat.owner.name || "Owner")
                            .split(" ")
                            .map((part) => part[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-heading text-lg font-semibold text-foreground">
                            {tl("Hosted by", "Οικοδεσπότης")} {boat.owner.name || "Owner"}
                          </h2>
                          {boat.owner.isSuperhost ? (
                            <Badge className="bg-aegean text-primary-foreground">
                              {tl("Guest favorite", "Αγαπημένο των επισκεπτών")}
                            </Badge>
                          ) : null}
                          {ownerBadges.map((badge) => (
                            <Badge key={badge.id} variant="outline" className="flex items-center gap-1 text-xs">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              {badge.name}
                            </Badge>
                          ))}
                        </div>
                        <p className="text-sm text-muted-foreground break-words">
                          {boat.owner.title || "Boat Owner"} · {tl("member since", "μέλος από")} {boat.owner.joinedYear}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                      <div className="rounded-2xl border border-border bg-background p-3">
                        <p className="text-muted-foreground text-[11px]">{tl("Trips", "Ταξίδια")}</p>
                        <p className="font-semibold text-foreground">{boat.owner.tripsHosted}</p>
                      </div>
                      <div className="rounded-2xl border border-border bg-background p-3">
                        <p className="text-muted-foreground text-[11px]">{tl("Response", "Απάντηση")}</p>
                        <p className="font-semibold text-foreground">{boat.owner.responseRate}%</p>
                      </div>
                      <div className="rounded-2xl border border-border bg-background p-3">
                        <p className="text-muted-foreground text-[11px]">{tl("Languages", "Γλώσσες")}</p>
                        <p className="font-semibold text-foreground">{(boat.owner.languages || []).length}</p>
                      </div>
                    </div>

                    {boat.owner.bio ? <p className="text-sm text-muted-foreground leading-relaxed">{boat.owner.bio}</p> : null}

                    {boat.owner.languages && boat.owner.languages.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {boat.owner.languages.map((language) => (
                          <Badge key={language} variant="outline" className="text-xs">
                            {language}
                          </Badge>
                        ))}
                      </div>
                    ) : null}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {boat.owner.name && (
                        <Button asChild variant="outline" className="w-full">
                          <Link to={`/boats?owner=${encodeURIComponent(boat.owner.name)}`}>
                            {tl("View all boats by this owner", "Δες όλα τα σκάφη του ιδιοκτήτη")}
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>

                </div>

                <div className="relative z-0 rounded-3xl border border-border overflow-hidden bg-card">
                  <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr]">
                    <div className="relative z-0 border-b xl:border-b-0 xl:border-r border-border overflow-hidden">
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
                        emptyLabel={tl("Pickup point map is unavailable.", "Ο χάρτης σημείου παραλαβής δεν είναι διαθέσιμος.")}
                        loadingLabel={tl("Loading marina map…", "Φόρτωση χάρτη μαρίνας…")}
                        heightClassName="h-[300px]"
                      />
                    </div>
                    <div className="p-5 space-y-4">
                      <div>
                        <p className="text-sm text-muted-foreground">{tl("Pickup point", "Σημείο παραλαβής")}</p>
                        <h2 className="font-heading text-lg font-semibold text-foreground">{boat.departureMarina}</h2>
                        <p className="text-sm text-muted-foreground mt-1">{boat.location}, Greece</p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Pan and zoom the marina directly here, or open directions before heading to the harbor.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <Button asChild className="bg-gradient-accent text-accent-foreground">
                          <a href={googleDirectionsUrl} target="_blank" rel="noreferrer">
                            <Navigation className="mr-2 h-4 w-4" />
                            {tl("Open directions", "Άνοιγμα οδηγιών")}
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>


              </CardContent>
            </Card>

            <div className="flex flex-col gap-6">
              <Card className="shadow-card" ref={bookingRef}>
                <CardHeader>
                  <CardTitle>{tl("Booking summary", "Σύνοψη κράτησης")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{boat.partyReady ? tl("Ticket price", "Τιμή εισιτηρίου") : tl("Starting from", "Από")}</p>
                      <p className="text-3xl font-heading font-bold text-foreground">
                        {boat.partyReady
                          ? `${resolvedTicketPricePerPerson > 0 ? `€${resolvedTicketPricePerPerson.toFixed(resolvedTicketPricePerPerson % 1 === 0 ? 0 : 2)}` : tl("Contact", "Επικοινωνία")}`
                          : `€${boat.pricePerDay}`}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">{boat.partyReady ? tl("per ticket", "ανά εισιτήριο") : tl("per day", "ανά ημέρα")}</p>
                  </div>
                  {isOwnerPreview ? (
                    <p className="text-xs text-muted-foreground">
                      {tl("Booking is disabled in owner preview. Connect payouts and set the boat to active to allow guests to request trips.", "Η κράτηση είναι απενεργοποιημένη στην προεπισκόπηση ιδιοκτήτη. Σύνδεσε πληρωμές και όρισε το σκάφος ως ενεργό για να επιτρέψεις αιτήματα.")}
                    </p>
                  ) : (
                    <Button asChild className="w-full bg-gradient-accent text-accent-foreground">
                      <Link
                        to={`/booking?boatRef=${encodeURIComponent(publicBoatRef)}&boat=${encodeURIComponent(boat.name)}`}
                        onClick={() => trackBookingStarted({ boatId: boat.id, boatName: boat.name, source: "boat_details" })}
                      >
                        {tl("Request Booking", "Αίτημα Κράτησης")}
                      </Link>
                    </Button>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Button asChild variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground">
                      <Link to={`/report?type=boat&target=${encodeURIComponent(boat.name)}&targetRef=${encodeURIComponent(publicBoatRef)}&subject=${encodeURIComponent(`Report boat: ${boat.name}`)}`}>
                        <Flag className="mr-2 h-4 w-4" />{tl("Report this boat", "Αναφορά σκάφους")}
                      </Link>
                    </Button>
                    {boat.owner.name && (
                      <Button asChild variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground">
                        <Link to={`/report?type=owner&target=${encodeURIComponent(boat.owner.name)}&targetRef=${encodeURIComponent(publicBoatRef)}&subject=${encodeURIComponent(`Report owner for ${boat.name}`)}`}>
                          <Flag className="mr-2 h-4 w-4" />{tl("Report this owner", "Αναφορά ιδιοκτήτη")}
                        </Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle>{tl("Guest reviews", "Αξιολογήσεις επισκεπτών")}</CardTitle>
                    <RatingComparisonPill
                      rating={reviewStats.averageRating || boat.rating}
                      reviewCount={reviewStats.total}
                      benchmarkRating={4.6}
                      label="fleet"
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {boatReviews.length > 0 ? (
                    <div className="space-y-3">
                      {boatReviews.map((review) => (
                        <div key={review.id} className="rounded-2xl border border-border p-4">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-foreground">{review.title}</p>
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-muted-foreground">{review.customerName}</p>
                              <div className="flex items-center gap-0.5" aria-label={`Rating ${review.rating} out of 5`}>
                                {[1, 2, 3, 4, 5].map((index) => (
                                  <Star
                                    key={`${review.id}-star-${index}`}
                                    className={`h-3.5 w-3.5 ${index <= review.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedReview(review)}
                            className="mt-1 text-left text-sm text-muted-foreground break-words hover:text-foreground transition-colors"
                          >
                            {review.comment}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{tl("No reviews yet for this boat.", "Δεν υπάρχουν ακόμη αξιολογήσεις για αυτό το σκάφος.")}</p>
                  )}
                </CardContent>
              </Card>

              <Dialog open={Boolean(selectedReview)} onOpenChange={(open) => { if (!open) setSelectedReview(null); }}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{selectedReview?.title ?? tl("Guest review", "Αξιολόγηση επισκέπτη")}</DialogTitle>
                    <DialogDescription>
                      {selectedReview?.customerName}
                    </DialogDescription>
                  </DialogHeader>
                  {selectedReview ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((index) => (
                          <Star
                            key={`selected-review-star-${index}`}
                            className={`h-4 w-4 ${index <= selectedReview.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`}
                          />
                        ))}
                      </div>
                      <p className="text-sm text-muted-foreground break-words">{selectedReview.comment}</p>
                    </div>
                  ) : null}
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default BoatDetails;

