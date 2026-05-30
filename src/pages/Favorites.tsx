import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useFavorites } from "@/hooks/useFavorites";
import { buildBoatDetailsPath } from "@/lib/boats";
import { resolveStorageImage } from "@/lib/storage-public";
import { useLanguage } from "@/contexts/LanguageContext";
import { withRetry } from "@/lib/retry";
import { getBoats } from "@/lib/boats";

type FavoriteBoat = {
  id: string;
  name: string;
  location: string;
  displayPrice: number | null;
  images: string | null;
  rating: number;
};

const Favorites = () => {
  const { language, t } = useLanguage();
  const { favoriteIds, toggleFavorite } = useFavorites();
  const [boats, setBoats] = useState<FavoriteBoat[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  // favoriteIds is an array; join to a stable key so the effect re-runs when it changes
  const favKey = [...favoriteIds].sort().join(",");

  const loadFavorites = async () => {
    if (favoriteIds.length === 0) {
      setBoats([]);
      setLoadError("");
      return;
    }

    setLoading(true);
    setLoadError("");

    try {
      const data = await withRetry(async () => {
        const allBoats = await getBoats();
        return allBoats
          .filter((boat) => favoriteIds.includes(boat.id))
          .map((boat) => ({
            id: boat.id,
            name: boat.name,
            location: boat.location,
            displayPrice: boat.pricePerDay > 0 ? boat.pricePerDay : null,
            images: boat.images.length > 0 ? boat.images[0] : boat.image,
            rating: boat.rating,
          }));
      }, { retries: 2, initialDelayMs: 220 });
      setBoats(data);

      // Clean up any favorite IDs that no longer have a corresponding boat in Supabase
      const validIds = new Set(data.map((boat) => boat.id));
      favoriteIds.forEach((id) => {
        if (!validIds.has(id)) {
          toggleFavorite(id);
        }
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load favorites.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFavorites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favKey]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-24 pb-20">
        <div className="container mx-auto px-4">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <Heart className="h-6 w-6 fill-rose-500 text-rose-500" />
              <h1 className="text-3xl font-heading font-bold text-foreground">{t("favorites.title")}</h1>
            </div>
            <p className="text-muted-foreground">
              {favoriteIds.length === 0
                ? t("favorites.emptyHint")
                : language === "el"
                  ? t("favorites.count", {
                      count: favoriteIds.length,
                      suffix: favoriteIds.length === 1 ? "" : "η",
                      suffix2: favoriteIds.length === 1 ? "ο" : "α",
                    })
                  : t("favorites.count", {
                      count: favoriteIds.length,
                      suffix: favoriteIds.length === 1 ? "" : "s",
                    })}
            </p>
          </div>

          {favoriteIds.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-5 text-center">
              <Heart className="h-16 w-16 text-muted-foreground/20" />
              <p className="text-muted-foreground text-lg">{t("favorites.none")}</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                {t("favorites.noneDesc")}
              </p>
              <Button asChild variant="outline" className="rounded-full">
                <Link to="/boats">{t("favorites.browse")}</Link>
              </Button>
            </div>
          ) : loading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {favoriteIds.map((id) => (
                <div key={id} className="rounded-2xl bg-muted animate-pulse aspect-[4/3]" />
              ))}
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
              <p className="text-lg font-semibold text-foreground">{t("favorites.title")}</p>
              <p className="text-sm text-muted-foreground max-w-md">{loadError}</p>
              <Button variant="outline" onClick={() => void loadFavorites()}>{language === "el" ? "Δοκίμασε ξανά" : "Try again"}</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {boats.map((boat) => (
                <div
                  key={boat.id}
                  className="group bg-card rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-300"
                >
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <img
                      src={resolveStorageImage(boat.images && !/\.\w{2,6}(\?|$)/.test(boat.images) ? `${boat.images}/1.jpg` : (boat.images ?? ""), "boat-images")}
                      alt={boat.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                    <button
                      type="button"
                      aria-label={t("favorites.remove")}
                      onClick={() => toggleFavorite(boat.id)}
                      className="absolute top-3 left-3 rounded-full bg-card/90 backdrop-blur-sm p-1.5 hover:bg-card transition-colors"
                    >
                      <Heart className="h-4 w-4 fill-rose-500 text-rose-500" />
                    </button>
                  </div>
                  <div className="p-4">
                    <h3 className="font-heading font-semibold text-foreground text-lg mb-1">{boat.name}</h3>
                    <p className="text-sm text-muted-foreground mb-3">{boat.location}</p>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-lg font-heading font-bold text-foreground">{boat.displayPrice != null ? `€${boat.displayPrice}` : (language === "el" ? "Επικοινωνία για τιμή" : "Contact for price")}</span>
                        <span className="text-sm text-muted-foreground"> / day</span>
                      </div>
                      <Link
                        to={buildBoatDetailsPath({ id: boat.id, name: boat.name, location: boat.location })}
                        className="text-sm font-medium text-aegean hover:text-turquoise transition-colors"
                      >
                        {t("favorites.viewBoat")}
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Favorites;
