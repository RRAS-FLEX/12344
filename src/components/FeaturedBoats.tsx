import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import BoatCard from "./BoatCard";
import { BoatSearchCriteria } from "@/lib/boat-search";
import { getBoats } from "@/lib/boats";
import type { Boat } from "@/lib/boats";
import { getBoatReviewStatsMap } from "@/lib/reviews";
import { getBoatFavoriteCountsMap } from "@/lib/favorites-stats";
import { useLanguage } from "@/contexts/LanguageContext";
import { withRetry } from "@/lib/retry";
import { BoatsGridSkeleton } from "@/components/loading/LoadingUI";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const formatSearchDateTime = (dateTime: string) => {
  const parsed = new Date(dateTime);
  if (Number.isNaN(parsed.getTime())) {
    return dateTime;
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
  }).format(parsed);
};

interface FeaturedBoatsProps {
  searchCriteria: BoatSearchCriteria | null;
}

type HomeSectionId = "rentals" | "watersports" | "parties";

const isWatersportsBoat = (boat: Boat) => boat.type === "watersports";
const isPartyBoat = (boat: Boat) => boat.partyReady === true;
const isRentalBoat = (boat: Boat) => !isWatersportsBoat(boat) && !isPartyBoat(boat);

const FeaturedBoats = ({ searchCriteria }: FeaturedBoatsProps) => {
  const { t, tl } = useLanguage();
  const [reviewCounts, setReviewCounts] = useState<Record<string, number>>({});
  const [favoriteCounts, setFavoriteCounts] = useState<Record<string, number>>({});
  const [allBoats, setAllBoats] = useState<Boat[]>([]);
  const [isBoatsLoading, setIsBoatsLoading] = useState(true);
  const [boatsError, setBoatsError] = useState("");
  const [openSections, setOpenSections] = useState<HomeSectionId[]>(["rentals", "watersports", "parties"]);

  useEffect(() => {
    const loadBoats = async () => {
      try {
        setIsBoatsLoading(true);
        setBoatsError("");
        const data = await withRetry(() => getBoats(), { retries: 2, initialDelayMs: 220 });
        setAllBoats(data);
      } catch (error) {
        setBoatsError(error instanceof Error ? error.message : "Unable to load featured boats.");
      } finally {
        setIsBoatsLoading(false);
      }
    };

    void loadBoats();
  }, []);

  const normalizedLocationFilter = searchCriteria?.location.trim().toLowerCase() ?? "";
  const requiredPassengers = searchCriteria?.passengers ?? 0;
  const serviceType = searchCriteria?.serviceType ?? "all";
  const hasDateFilter = Boolean(searchCriteria?.dateTime);
  const normalizedDateKey = hasDateFilter ? searchCriteria!.dateTime.slice(0, 10) : "";

  const filteredBoats = searchCriteria
    ? allBoats.filter((boat) => {
        const matchesLocation = boat.location.toLowerCase().includes(normalizedLocationFilter);
        const matchesPassengers = boat.capacity >= requiredPassengers;
        const matchesDate = !hasDateFilter
          ? true
          : !boat.availability.unavailableDates.some((date) => date.slice(0, 10) === normalizedDateKey);
        const matchesService = serviceType === "all"
          ? true
          : serviceType === "rental"
            ? isRentalBoat(boat)
            : serviceType === "party"
              ? isPartyBoat(boat)
              : isWatersportsBoat(boat);

        return matchesLocation && matchesPassengers && matchesDate && matchesService;
      })
    : allBoats;
  const promotedBoatIdsKey = filteredBoats.map((boat) => boat.id).join("|");

  useEffect(() => {
    let isActive = true;

    const loadReviewCounts = async () => {
      try {
        const boatIds = filteredBoats.map((boat) => boat.id);
        const [statsMap, favoritesMap] = await Promise.all([
          getBoatReviewStatsMap(boatIds),
          getBoatFavoriteCountsMap(boatIds),
        ]);
        if (isActive) {
          const counts = Object.fromEntries(
            Object.entries(statsMap).map(([boatId, stats]) => [boatId, stats.total]),
          );
          setReviewCounts(counts);
          setFavoriteCounts(favoritesMap);
        }
      } catch {
        if (isActive) {
          setReviewCounts({});
          setFavoriteCounts({});
        }
      }
    };

    loadReviewCounts();

    return () => {
      isActive = false;
    };
    // promotedBoatIdsKey is a stable derived key for filteredBoats; depending on
    // filteredBoats directly would re-run this on every render since it's a new
    // array reference each time, even when its contents haven't changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promotedBoatIdsKey]);

  useEffect(() => {
    if (serviceType === "rental") {
      setOpenSections(["rentals"]);
      return;
    }

    if (serviceType === "party") {
      setOpenSections(["parties"]);
      return;
    }

    if (serviceType === "watersports") {
      setOpenSections(["watersports"]);
      return;
    }

    setOpenSections(["rentals", "watersports", "parties"]);
  }, [serviceType]);

  const sortedFilteredBoats = useMemo(() => {
    const sortByRatingThenFavorites = (a: Boat, b: Boat) => {
      if (b.rating !== a.rating) {
        return b.rating - a.rating;
      }

      const bFavorites = favoriteCounts[b.id] ?? 0;
      const aFavorites = favoriteCounts[a.id] ?? 0;
      if (bFavorites !== aFavorites) {
        return bFavorites - aFavorites;
      }

      const bReviews = reviewCounts[b.id] ?? 0;
      const aReviews = reviewCounts[a.id] ?? 0;
      if (bReviews !== aReviews) {
        return bReviews - aReviews;
      }

      return b.bookings - a.bookings;
    };

    return [...filteredBoats].sort(sortByRatingThenFavorites);
  }, [favoriteCounts, filteredBoats, reviewCounts]);

  const sectionedBoats = useMemo(() => {
    const rentals = sortedFilteredBoats.filter((boat) => isRentalBoat(boat));
    const watersports = sortedFilteredBoats.filter((boat) => isWatersportsBoat(boat));
    const parties = sortedFilteredBoats.filter((boat) => isPartyBoat(boat));

    const allSections = [
      {
        id: "rentals" as HomeSectionId,
        title: tl("Top Rated Boat Rentals", "Κορυφαίες Ενοικιάσεις Σκαφών"),
        subtitle: tl("Best rental boats based on rating", "Τα καλύτερα σκάφη ενοικίασης βάσει αξιολόγησης"),
        boats: rentals.slice(0, 4),
      },
      {
        id: "watersports" as HomeSectionId,
        title: tl("Top Rated Watersports", "Κορυφαία Watersports"),
        subtitle: tl("Best watersports options based on rating", "Οι καλύτερες επιλογές watersports βάσει αξιολόγησης"),
        boats: watersports.slice(0, 4),
      },
      {
        id: "parties" as HomeSectionId,
        title: tl("Top Rated Boat Parties", "Κορυφαία Boat Parties"),
        subtitle: tl("Best party-ready boats based on rating", "Τα καλύτερα party-ready σκάφη βάσει αξιολόγησης"),
        boats: parties.slice(0, 4),
      },
    ];

    if (serviceType === "rental") {
      return allSections.filter((section) => section.id === "rentals");
    }

    if (serviceType === "party") {
      return allSections.filter((section) => section.id === "parties");
    }

    if (serviceType === "watersports") {
      return allSections.filter((section) => section.id === "watersports");
    }

    return allSections;
  }, [serviceType, sortedFilteredBoats, tl]);

  const totalVisibleBoats = sectionedBoats.reduce((sum, section) => sum + section.boats.length, 0);

  return (
    <section id="boats" className="py-20 md:py-28 bg-background">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <p className="inline-flex items-center rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground mb-4">
            {filteredBoats.length} {filteredBoats.length === 1 ? tl("boat", "σκάφος") : tl("boats", "σκάφη")} {tl("ready to book", "έτοιμα για κράτηση")}
          </p>
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-foreground mb-3">
            {t("featured.title")}
          </h2>
          <p className="text-muted-foreground text-lg max-w-md mx-auto">
            {t("featured.subtitle")}
          </p>
          <p className="text-sm text-aegean mt-2">
            {tl("Top picks are ranked by rating first.", "Οι κορυφαίες επιλογές ταξινομούνται πρώτα με βάση την αξιολόγηση.")}
          </p>
          {searchCriteria && (
            <p className="text-sm text-muted-foreground mt-3">
              {t("featured.showing", {
                location: searchCriteria.location,
                dateTime: formatSearchDateTime(searchCriteria.dateTime),
                passengers: searchCriteria.passengers,
              })}
            </p>
          )}

          <div className="mt-4">
            <Link to="/boats" className="text-sm font-medium text-aegean hover:text-turquoise transition-colors">
              {tl("Browse all boats →", "Περιήγηση σε όλα τα σκάφη →")}
            </Link>
          </div>
        </motion.div>

        {isBoatsLoading ? (
          <BoatsGridSkeleton count={6} />
        ) : boatsError ? (
          <div className="text-center space-y-3">
            <p className="text-muted-foreground text-lg">{boatsError}</p>
          </div>
        ) : totalVisibleBoats > 0 ? (
          <Accordion type="multiple" value={openSections} onValueChange={(value) => setOpenSections(value as HomeSectionId[])} className="space-y-4">
            {sectionedBoats.map((section) => (
              section.boats.length > 0 ? (
                <AccordionItem key={section.id} value={section.id} className="border-b border-border/60">
                  <AccordionTrigger className="hover:no-underline py-4">
                    <div className="space-y-1 text-left">
                      <h3 className="text-xl font-semibold text-foreground">{section.title}</h3>
                      <p className="text-sm text-muted-foreground">{section.subtitle} • {section.boats.length}</p>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {section.boats.map((boat, i) => (
                        <BoatCard
                          key={`${section.id}-${boat.id}`}
                          {...boat}
                          index={i}
                          reviewCount={reviewCounts[boat.id] ?? 0}
                          favoriteCount={favoriteCounts[boat.id] ?? 0}
                        />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ) : null
            ))}
          </Accordion>
        ) : (
          <p className="text-center text-muted-foreground text-lg">
            {t("featured.none", { location: searchCriteria?.location ?? "-", passengers: requiredPassengers })}
          </p>
        )}
      </div>
    </section>
  );
};

export default FeaturedBoats;
