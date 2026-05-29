import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { getDestinations, type Destination } from "@/lib/destinations";
import { useLanguage } from "@/contexts/LanguageContext";
import { Skeleton } from "@/components/ui/skeleton";

const Destinations = () => {
  const { tl } = useLanguage();
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadDestinations = async () => {
      try {
        const nextDestinations = await getDestinations();
        if (!cancelled) {
          const prioritized = nextDestinations.filter((destination) => destination.boats > 0);
          setDestinations((prioritized.length > 0 ? prioritized : nextDestinations).slice(0, 4));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadDestinations();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section id="destinations" className="py-20 md:py-28 bg-muted">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <p className="inline-flex items-center rounded-full border border-border bg-background/70 px-3 py-1 text-xs text-muted-foreground mb-4">
            {tl("Island picks with real boat availability", "Επιλεγμένοι προορισμοί με πραγματική διαθεσιμότητα σκαφών")}
          </p>
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-foreground mb-3">
            {tl("Popular Destinations", "Δημοφιλείς Προορισμοί")}
          </h2>
          <p className="text-muted-foreground text-lg max-w-md mx-auto">
            {tl("Explore the most stunning coastlines of Greece.", "Ανακάλυψε τις πιο εντυπωσιακές ακτογραμμές της Ελλάδας.")}
          </p>
        </motion.div>

        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={`destination-home-skeleton-${index}`} className="space-y-2">
                <Skeleton className="aspect-[3/4] rounded-2xl" />
                <Skeleton className="h-4 w-2/3 mx-auto" />
              </div>
            ))}
          </div>
        ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {destinations.map((dest, i) => (
            <Link key={dest.id} to={`/destinations#${dest.slug}`}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="group relative aspect-[3/4] rounded-2xl overflow-hidden cursor-pointer"
            >
              <img
                src={dest.image}
                alt={dest.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ocean/80 via-ocean/20 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4">
                <h3 className="text-xl font-heading font-bold text-primary-foreground">
                  {dest.name}
                </h3>
                <p className="text-sm text-primary-foreground/70">{dest.boats} {tl("boats available", "διαθέσιμα σκάφη")}</p>
                <p className="text-xs text-primary-foreground/80 mt-2 line-clamp-2">{dest.description}</p>
                {dest.bestFor ? (
                  <p className="text-[11px] text-primary-foreground/80 mt-1">{tl("Best for", "Ιδανικό για")}: {dest.bestFor}</p>
                ) : null}
              </div>
            </motion.div>
            </Link>
          ))}
        </div>
        )}
      </div>
    </section>
  );
};

export default Destinations;
