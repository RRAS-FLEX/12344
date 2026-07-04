import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MapPin, Ship, Star } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BoatCard from "@/components/BoatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OwnerFleetPageSkeleton } from "@/components/loading/LoadingUI";
import { getBoatReviewStats } from "@/lib/reviews";
import { getOwnerFleetBySlug } from "@/lib/owners";
import type { Boat, BoatOwner } from "@/lib/boats";
import { useLanguage } from "@/contexts/LanguageContext";
import { withRetry } from "@/lib/retry";

const OwnerFleet = () => {
  const { tl } = useLanguage();
  const { ownerSlug } = useParams<{ ownerSlug: string }>();
  const [ownerName, setOwnerName] = useState("");
  const [owner, setOwner] = useState<BoatOwner | undefined>(undefined);
  const [fleet, setFleet] = useState<Boat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reviewStatsMap, setReviewStatsMap] = useState<Record<string, { total: number; averageRating: number }>>({});

  useEffect(() => {
    let cancelled = false;

    const loadFleet = async () => {
      try {
        setIsLoading(true);
        setLoadError("");
        const { ownerName: n, owner: o, fleet: f } = await withRetry(() => getOwnerFleetBySlug(ownerSlug ?? ""), {
          retries: 2,
          initialDelayMs: 220,
        });

        if (!cancelled) {
          setOwnerName(n);
          setOwner(o);
          setFleet(f);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Unable to load owner fleet.");
          setFleet([]);
          setOwner(undefined);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadFleet();

    return () => {
      cancelled = true;
    };
  }, [ownerSlug]);

  useEffect(() => {
    const loadReviewStats = async () => {
      const statsEntries = await Promise.all(
        fleet.map(async (boat) => [boat.id, await getBoatReviewStats(boat.id)] as const),
      );
      setReviewStatsMap(Object.fromEntries(statsEntries));
    };

    if (fleet.length > 0) {
      loadReviewStats();
    }
  }, [fleet]);

  const aggregateRating = useMemo(() => (
    fleet.reduce((sum, boat) => sum + (reviewStatsMap[boat.id]?.averageRating ?? 0), 0) /
    Math.max(fleet.length, 1)
  ).toFixed(1), [fleet, reviewStatsMap]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <OwnerFleetPageSkeleton />
        <Footer />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-24 pb-16">
          <div className="container mx-auto px-4 text-center space-y-3">
            <h1 className="text-3xl font-heading font-bold text-foreground">{tl("Could not load owner fleet", "Δεν φορτώθηκε ο στόλος ιδιοκτήτη")}</h1>
            <p className="text-muted-foreground">{loadError}</p>
            <Link to="/boats" className="text-aegean hover:text-turquoise">{tl("Back to boats", "Επιστροφή στα σκάφη")}</Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!owner || !fleet.length) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-24 pb-16">
          <div className="container mx-auto px-4 text-center space-y-3">
            <h1 className="text-3xl font-heading font-bold text-foreground">{tl("Owner not found", "Ο ιδιοκτήτης δεν βρέθηκε")}</h1>
            <p className="text-muted-foreground">{tl("The requested owner fleet is not available.", "Ο ζητούμενος στόλος ιδιοκτήτη δεν είναι διαθέσιμος.")}</p>
            <Link to="/boats" className="text-aegean hover:text-turquoise">{tl("Back to boats", "Επιστροφή στα σκάφη")}</Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-16">
        <section className="py-14 border-b border-border bg-muted/20">
          <div className="container mx-auto px-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Owner fleet</p>
                <p className="text-sm text-muted-foreground">{tl("Owner fleet", "Στόλος ιδιοκτήτη")}</p>
                <h1 className="text-4xl font-heading font-bold text-foreground mt-2">{ownerName}</h1>
                <p className="text-muted-foreground mt-2 max-w-2xl">{owner.bio}</p>
              </div>
              <Button asChild variant="outline">
                <Link to="/boats">{tl("Browse all boats", "Περιήγηση σε όλα τα σκάφη")}</Link>
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mt-6">
              <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Fleet boats</p><p className="text-2xl font-heading font-bold">{fleet.length}</p></CardContent></Card>
              <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Trips hosted</p><p className="text-2xl font-heading font-bold">{owner.tripsHosted}</p></CardContent></Card>
              <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Response rate</p><p className="text-2xl font-heading font-bold">{owner.responseRate}%</p></CardContent></Card>
              <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Review avg</p><p className="text-2xl font-heading font-bold">{aggregateRating}</p></CardContent></Card>
            </div>
          </div>
        </section>

        <section className="py-10">
          <div className="container mx-auto px-4 space-y-6">
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Ship className="h-4 w-4 text-aegean" />Fleet for easy owner-based selection</span>
              <span className="flex items-center gap-1"><MapPin className="h-4 w-4 text-aegean" />{Array.from(new Set(fleet.map((boat) => boat.location))).join(", ")}</span>
              <span className="flex items-center gap-1"><Star className="h-4 w-4 text-amber-400 fill-amber-400" />Guest-reviewed boats</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {fleet.map((boat, index) => (
                <div key={boat.id} className="space-y-2">
                  <BoatCard {...boat} index={index} />
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{boat.owner.title}</Badge>
                    <Badge variant="outline">{reviewStatsMap[boat.id]?.total ?? 0} reviews</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default OwnerFleet;
