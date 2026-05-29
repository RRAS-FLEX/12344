import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MapPin, Navigation, Users } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import BoatLocationMap from "@/components/BoatLocationMap";
import { BoatMapListSkeleton } from "@/components/loading/LoadingUI";
import { useSEO } from "@/hooks/useSEO";
import { buildBoatDetailsPath, getBoats } from "@/lib/boats";
import type { Boat } from "@/lib/boats";
import { useLanguage } from "@/contexts/LanguageContext";
import { withRetry } from "@/lib/retry";

const BoatsMap = () => {
  const { tl } = useLanguage();
  const [searchParams] = useSearchParams();
  const [boats, setBoats] = useState<Boat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [locationFilter, setLocationFilter] = useState(searchParams.get("location") ?? "");
  const [selectedBoatId, setSelectedBoatId] = useState<string>("");

  useSEO({
    title: "Boat Map View | Nautiplex",
    description: "Explore boat pickup locations on the map and open each listing to continue booking in Nautiplex.",
    canonical: "https://nautiplex.gr/boats-map",
    keywords: "boat map Greece, marina map, boat pickup points, nautiplex boats map",
  });

  const loadBoats = async () => {
    try {
      setIsLoading(true);
      setLoadError("");
      const data = await withRetry(() => getBoats(), { retries: 2, initialDelayMs: 220 });
      setBoats(data);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load map boats.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBoats();
  }, []);

  const visibleBoats = useMemo(() => {
    const normalized = locationFilter.trim().toLowerCase();
    if (!normalized) return boats;
    return boats.filter((boat) => {
      return (
        boat.location.toLowerCase().includes(normalized) ||
        boat.departureMarina.toLowerCase().includes(normalized) ||
        boat.mapQuery.toLowerCase().includes(normalized)
      );
    });
  }, [boats, locationFilter]);

  useEffect(() => {
    if (visibleBoats.length === 0) {
      setSelectedBoatId("");
      return;
    }

    if (!visibleBoats.some((boat) => boat.id === selectedBoatId)) {
      setSelectedBoatId(visibleBoats[0].id);
    }
  }, [visibleBoats, selectedBoatId]);

  const selectedBoat = visibleBoats.find((boat) => boat.id === selectedBoatId) ?? null;
  const mapPoints = visibleBoats.map((boat) => ({
    id: boat.id,
    name: boat.name,
    query: boat.mapQuery,
    subtitle: `${boat.departureMarina} • ${boat.location}`,
    type: boat.type,
    capacity: boat.capacity,
    pricePerDay: boat.pricePerDay,
    rating: boat.rating,
    ctaLabel: tl("Go to boat view", "Μετάβαση στη σελίδα σκάφους"),
    ctaHref: buildBoatDetailsPath(boat),
  }));
  const selectedMapQuery = selectedBoat?.mapQuery ?? "Greece";
  const selectedDirectionsUrl = selectedBoat
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(selectedMapQuery)}`
    : "https://www.google.com/maps";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-16 pb-20">
        <section className="border-b border-border bg-gradient-ocean py-14 md:py-16">
          <div className="container mx-auto px-4 space-y-4">
            <p className="text-primary-foreground/80 text-sm">{tl("Map view", "Προβολή χάρτη")}</p>
            <h1 className="text-3xl md:text-4xl font-heading font-bold text-primary-foreground">
              {tl("See where each boat departs", "Δες από πού αναχωρεί κάθε σκάφος")}
            </h1>
            <p className="text-primary-foreground/75 max-w-2xl">
              {tl("Pick a boat card to focus the map, then open the boat page and continue to booking.", "Επίλεξε κάρτα σκάφους για εστίαση στον χάρτη και έπειτα άνοιξε τη σελίδα σκάφους για να συνεχίσεις στην κράτηση.")}
            </p>
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3">
              <Input
                value={locationFilter}
                onChange={(event) => setLocationFilter(event.target.value)}
                placeholder={tl("Filter by location or marina", "Φιλτράρισμα ανά τοποθεσία ή μαρίνα")}
                className="w-full sm:max-w-xs bg-primary-foreground"
              />
              <Button asChild variant="outline" className="w-full sm:w-auto bg-primary-foreground">
                <Link to="/boats">{tl("Back to boats list", "Επιστροφή στη λίστα σκαφών")}</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="py-8 md:py-10">
          <div className="container mx-auto px-4 grid grid-cols-1 xl:grid-cols-12 gap-6">
            <Card className="xl:col-span-7 overflow-hidden shadow-card-hover xl:sticky xl:top-24 h-fit">
              <div className="border-b border-border">
                <BoatLocationMap
                  points={mapPoints}
                  selectedPointId={selectedBoatId}
                  onSelectPoint={setSelectedBoatId}
                  emptyLabel={tl("No boat locations available for this filter.", "Δεν υπάρχουν διαθέσιμες τοποθεσίες για αυτό το φίλτρο.")}
                  loadingLabel={tl("Loading interactive map…", "Φόρτωση διαδραστικού χάρτη…")}
                  heightClassName="h-[340px] md:h-[500px]"
                />
              </div>
              <CardContent className="p-5 space-y-4">
                {selectedBoat ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-gradient-accent text-accent-foreground">{selectedBoat.type}</Badge>
                      <Badge variant="outline" className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {selectedBoat.location}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{tl("Selected pickup point", "Επιλεγμένο σημείο παραλαβής")}</p>
                      <h2 className="text-xl font-heading font-semibold text-foreground">{selectedBoat.departureMarina}</h2>
                      <p className="text-sm text-muted-foreground mt-1">{tl("Touch-friendly map with live pan and zoom.", "Χάρτης φιλικός για αφή με κανονικό pan και zoom.")}</p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="rounded-xl border border-border bg-muted/20 px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">{tl("Boat", "Σκάφος")}</p>
                        <p className="text-sm font-medium text-foreground truncate">{selectedBoat.name}</p>
                      </div>
                      <div className="rounded-xl border border-border bg-muted/20 px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">{tl("Guests", "Επισκέπτες")}</p>
                        <p className="text-sm font-medium text-foreground">{selectedBoat.capacity}</p>
                      </div>
                      <div className="rounded-xl border border-border bg-muted/20 px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">{tl("Price/day", "Τιμή/ημέρα")}</p>
                        <p className="text-sm font-medium text-foreground">€{selectedBoat.pricePerDay}</p>
                      </div>
                      <div className="rounded-xl border border-border bg-muted/20 px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">{tl("Rating", "Βαθμολογία")}</p>
                        <p className="text-sm font-medium text-foreground">{selectedBoat.rating.toFixed(1)}</p>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button asChild className="w-full sm:w-auto bg-gradient-accent text-accent-foreground">
                        <Link to={buildBoatDetailsPath(selectedBoat)}>{tl("Go to boat view", "Μετάβαση στη σελίδα σκάφους")}</Link>
                      </Button>
                      <Button asChild variant="outline" className="w-full sm:w-auto">
                        <a href={selectedDirectionsUrl} target="_blank" rel="noreferrer">
                          <Navigation className="mr-2 h-4 w-4" />
                          {tl("Open directions", "Άνοιγμα οδηγιών")}
                        </a>
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">{tl("Select a boat card to preview location on the map.", "Επίλεξε κάρτα σκάφους για προεπισκόπηση θέσης στον χάρτη.")}</p>
                )}
              </CardContent>
            </Card>

            <Card className="xl:col-span-5 shadow-card">
              <CardHeader>
                <CardTitle>
                  {tl("Boat location cards", "Κάρτες τοποθεσίας σκαφών")} ({visibleBoats.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3 xl:max-h-[620px] xl:overflow-auto">
                {isLoading ? (
                  <BoatMapListSkeleton count={5} />
                ) : loadError ? (
                  <div className="rounded-2xl border border-border p-4 space-y-3 text-center">
                    <p className="text-sm font-medium text-foreground">{tl("Could not load boats", "Δεν φορτώθηκαν τα σκάφη")}</p>
                    <p className="text-xs text-muted-foreground">{loadError}</p>
                    <Button variant="outline" onClick={loadBoats}>{tl("Retry", "Επανάληψη")}</Button>
                  </div>
                ) : visibleBoats.length > 0 ? (
                  visibleBoats.map((boat) => {
                    const isSelected = boat.id === selectedBoatId;
                    return (
                      <button
                        key={boat.id}
                        type="button"
                        onClick={() => setSelectedBoatId(boat.id)}
                        className={`w-full text-left rounded-2xl border p-3 transition-colors ${isSelected ? "border-aegean bg-aegean/5 shadow-card" : "border-border hover:border-aegean/60"}`}
                      >
                        <div className="flex items-start gap-3">
                          <img src={boat.image} alt={boat.name} className="h-20 w-24 rounded-xl object-cover" loading="lazy" />
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="font-semibold text-foreground truncate">{boat.name}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {boat.departureMarina}
                            </p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Users className="h-3.5 w-3.5" />
                              {boat.capacity} {tl("guests", "επισκέπτες")} • €{boat.pricePerDay}/{tl("day", "ημέρα")}
                            </p>
                            <Link
                              to={buildBoatDetailsPath(boat)}
                              className="inline-block text-xs font-medium text-aegean hover:text-turquoise"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {tl("View boat page →", "Προβολή σελίδας σκάφους →")}
                            </Link>
                          </div>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">{tl("No boats match this location filter.", "Δεν υπάρχουν σκάφη με αυτό το φίλτρο τοποθεσίας.")}</p>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default BoatsMap;

