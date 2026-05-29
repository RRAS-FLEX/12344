import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSEO } from "@/hooks/useSEO";
import { Compass, LayoutGrid, List, MapPinned, Rows3, Ship, Sparkles, Search } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DestinationGridSkeleton } from "@/components/loading/LoadingUI";
import { getDestinations, type Destination } from "@/lib/destinations";
import { useLanguage } from "@/contexts/LanguageContext";
import { withRetry } from "@/lib/retry";

const DestinationsPage = () => {
  const { tl } = useLanguage();
  useSEO({
    title: "Greek Island Boating Destinations | Nautiplex",
    description: "Explore the best Greek island destinations for boat rentals — Mykonos, Santorini, Thassos, Halkidiki and more. Find your perfect sea escape.",
    canonical: "https://nautiplex.gr/destinations",
    keywords: "Greek island boat destinations, Mykonos boating, Santorini sailing, Thassos boat trip, Halkidiki boat rental",
  });

  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [viewMode, setViewMode] = useState<"compact" | "comfortable" | "detailed">("comfortable");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const loadDestinations = async () => {
    try {
      setIsLoading(true);
      setLoadError("");
      const nextDestinations = await withRetry(() => getDestinations(), { retries: 2, initialDelayMs: 220 });
      setDestinations(nextDestinations);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load destinations.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDestinations();
  }, []);

  const totalBoats = useMemo(
    () => destinations.reduce((sum, destination) => sum + destination.boats, 0),
    [destinations],
  );

  const busiestIslandFleet = useMemo(
    () => destinations.reduce((max, destination) => Math.max(max, destination.boats), 0),
    [destinations],
  );

  const filteredDestinations = useMemo(
    () => {
      const normalized = searchQuery.trim().toLowerCase();
      if (!normalized) return destinations;

      return destinations.filter((destination) => {
        const name = destination.name.toLowerCase();
        const description = (destination.description ?? "").toLowerCase();
        const bestFor = (destination.bestFor ?? "").toLowerCase();
        return (
          name.includes(normalized) ||
          description.includes(normalized) ||
          bestFor.includes(normalized)
        );
      });
    },
    [destinations, searchQuery],
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-16">
        <section className="border-b border-border bg-gradient-ocean py-16 md:py-20">
          <div className="container mx-auto px-4">
            <p className="text-primary-foreground/80 text-sm mb-3">Destination guide</p>
            <h1 className="text-3xl md:text-5xl font-heading font-bold text-primary-foreground mb-4">
              {tl("Discover Greek islands made for boating", "Ανακάλυψε ελληνικά νησιά ιδανικά για θαλάσσιες εξορμήσεις")}
            </h1>
            <p className="text-primary-foreground/70 max-w-2xl">
              {tl("Compare top islands, trip styles, and available fleets before you book.", "Σύγκρινε κορυφαία νησιά, στυλ εκδρομής και διαθέσιμους στόλους πριν κάνεις κράτηση.")}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8">
              <Card className="bg-primary-foreground/10 border-primary-foreground/15 text-primary-foreground">
                <CardContent className="pt-6 flex items-center gap-3">
                  <Ship className="h-5 w-5" />
                  <div>
                    <p className="text-2xl font-heading font-bold">{totalBoats}</p>
                    <p className="text-sm text-primary-foreground/80">{tl("Boats listed", "Καταχωρημένα σκάφη")}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-primary-foreground/10 border-primary-foreground/15 text-primary-foreground">
                <CardContent className="pt-6 flex items-center gap-3">
                  <MapPinned className="h-5 w-5" />
                  <div>
                    <p className="text-2xl font-heading font-bold">{destinations.length}</p>
                    <p className="text-sm text-primary-foreground/80">{tl("Popular islands", "Δημοφιλή νησιά")}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-primary-foreground/10 border-primary-foreground/15 text-primary-foreground">
                <CardContent className="pt-6 flex items-center gap-3">
                  <Sparkles className="h-5 w-5" />
                  <div>
                    <p className="text-2xl font-heading font-bold">{busiestIslandFleet}</p>
                    <p className="text-sm text-primary-foreground/80">{tl("Largest island fleet", "Μεγαλύτερος στόλος νησιού")}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="py-10 md:py-12">
          <div className="container mx-auto px-4 space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2 md:max-w-xs w-full">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 w-full md:w-auto justify-center md:justify-start"
                  onClick={() => setIsSearchOpen((open) => !open)}
                >
                  <Search className="h-4 w-4 text-aegean" />
                  <span className="text-xs md:text-sm">{tl("Search destinations", "Αναζήτηση προορισμών")}</span>
                </Button>
                {isSearchOpen && (
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                      <Input
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder={tl("Search by island or vibe", "Αναζήτηση ανά νησί ή στιλ εκδρομής")}
                        className="pl-9 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 rounded-lg border border-border p-1 self-end md:self-auto">
                <Button
                  size="sm"
                  variant={viewMode === "compact" ? "default" : "ghost"}
                  className="gap-1.5"
                  onClick={() => setViewMode("compact")}
                >
                  <LayoutGrid className="h-4 w-4" />
                  {tl("Compact", "Συμπαγές")}
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === "comfortable" ? "default" : "ghost"}
                  className="gap-1.5"
                  onClick={() => setViewMode("comfortable")}
                >
                  <Rows3 className="h-4 w-4" />
                  {tl("Comfort", "Άνετο")}
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === "detailed" ? "default" : "ghost"}
                  className="gap-1.5"
                  onClick={() => setViewMode("detailed")}
                >
                  <List className="h-4 w-4" />
                  {tl("Detailed", "Αναλυτικό")}
                </Button>
              </div>
            </div>

            <div className={`grid gap-6 ${
              viewMode === "detailed"
                ? "grid-cols-1"
                : viewMode === "compact"
                  ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
                  : "grid-cols-1 md:grid-cols-2"
            }`}>
            {isLoading ? (
              <DestinationGridSkeleton count={4} />
            ) : loadError ? (
              <Card className="md:col-span-2">
                <CardContent className="py-10 text-center space-y-3">
                  <p className="text-lg font-semibold text-foreground">{tl("Could not load destinations", "Δεν φορτώθηκαν οι προορισμοί")}</p>
                  <p className="text-sm text-muted-foreground">{loadError}</p>
                  <Button variant="outline" onClick={loadDestinations}>{tl("Try again", "Δοκίμασε ξανά")}</Button>
                </CardContent>
              </Card>
            ) : filteredDestinations.map((destination) => (
              <Card key={destination.id} id={destination.slug} className="overflow-hidden shadow-card-hover scroll-mt-24">
                <div className="aspect-[16/9] overflow-hidden">
                  <img src={destination.image} alt={destination.name} className="w-full h-full object-cover" />
                </div>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>{destination.name}</CardTitle>
                    <Badge className="bg-gradient-accent text-accent-foreground">{destination.boats} boats</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">{destination.description}</p>
                  {destination.bestFor ? (
                    <p className="text-sm text-foreground">
                      <span className="text-muted-foreground">{tl("Best for:", "Κατάλληλο για:")} </span>
                      {destination.bestFor}
                    </p>
                  ) : null}
                  <Button asChild className="w-full bg-gradient-accent text-accent-foreground">
                    <Link to={`/boats?location=${encodeURIComponent(destination.name)}`}>
                      {tl("Explore boats in", "Δες σκάφη σε")} {destination.name}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
            </div>
          </div>
        </section>

        <section className="pb-12 md:pb-16">
          <div className="container mx-auto px-4">
            <Card>
              <CardContent className="pt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <p className="font-semibold text-foreground">{tl("Need help choosing an island?", "Χρειάζεσαι βοήθεια για επιλογή νησιού;")}</p>
                  <p className="text-sm text-muted-foreground">{tl("Start with your group size and preferred vibe, then filter boats in one click.", "Ξεκίνα με το μέγεθος της ομάδας και το στυλ που προτιμάς, και φιλτράρισε σκάφη με ένα κλικ.")}</p>
                </div>
                <Button asChild variant="outline" className="gap-2">
                  <Link to="/boats">
                    <Compass className="h-4 w-4" />
                    {tl("Browse all boats", "Περιήγηση σε όλα τα σκάφη")}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default DestinationsPage;

