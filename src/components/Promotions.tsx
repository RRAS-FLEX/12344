import { Link } from "react-router-dom";
import { Anchor, Users, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";

const Promotions = () => {
  const { tl } = useLanguage();

  return (
    <section className="py-10 md:py-14 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="space-y-6">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-aegean mb-2">{tl("Special Offers", "Ειδικές Προσφορές")}</p>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-foreground">
              {tl("Explore Our Sectors", "Εξερεύνησε τα Τμήματά μας")}
            </h2>
            <p className="text-muted-foreground mt-4">
              {tl(
                "From private rentals to vibrant parties, find the perfect boat experience for your needs.",
                "Από ιδιωτικές ενοικιάσεις έως ζωντανά πάρτι, βρες την τέλεια εμπειρία σκάφους για τις ανάγκες σου."
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Boat Rentals Promotion */}
            <Card className="relative z-0 overflow-hidden shadow-card bg-gradient-to-br from-aegean/5 to-turquoise/5 border-aegean/20 hover:shadow-card-hover transition-shadow">
              <CardContent className="py-10 px-6 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-aegean/15 p-3 text-aegean">
                    <Anchor className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-foreground">{tl("Boat Rentals", "Ενοικιάσεις Σκαφών")}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {tl(
                        "Premium boats for day trips and extended adventures. Perfect for families, couples, and groups.",
                        "Πρωτίστης κατηγορίας σκάφη για ημερήσιες εκδρομές. Ιδανικά για οικογένειες και ομάδες."
                      )}
                    </p>
                  </div>
                </div>
                <Link
                  to="/boats?sector=rentals"
                  className="inline-flex items-center justify-center rounded-full bg-aegean text-primary-foreground px-6 py-2 text-sm font-medium hover:bg-turquoise transition-colors"
                >
                  {tl("Browse rentals", "Δες ενοικιάσεις")} →
                </Link>
              </CardContent>
            </Card>

            {/* Boat Parties Promotion */}
            <Card className="relative z-0 overflow-hidden shadow-card bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200 hover:shadow-card-hover transition-shadow">
              <CardContent className="py-10 px-6 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-amber-600/15 p-3 text-amber-600">
                    <Users className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-foreground">{tl("Boat Parties", "Πάρτι σε Σκάφη")}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {tl(
                        "Unforgettable group experiences with all-inclusive ticket pricing. Host or join the fun.",
                        "Αξέχαστες ομαδικές εμπειρίες με συμπεριλαμβάνεται η τιμή εισιτηρίου. Διοργανώστε ή συμμετάσχετε."
                      )}
                    </p>
                  </div>
                </div>
                <Link
                  to="/boats?sector=parties"
                  className="inline-flex items-center justify-center rounded-full bg-amber-600 text-primary-foreground px-6 py-2 text-sm font-medium hover:bg-orange-600 transition-colors"
                >
                  {tl("Browse parties", "Δες πάρτι")} →
                </Link>
              </CardContent>
            </Card>

            {/* Watersports Promotion */}
            <Card className="relative z-0 overflow-hidden shadow-card bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200 hover:shadow-card-hover transition-shadow md:col-span-2">
              <CardContent className="py-10 px-6 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-emerald-600/15 p-3 text-emerald-600">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-foreground">{tl("Watersports & Adventures", "Θαλάσσια Σπορ & Περιπέτειες")}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {tl(
                        "Jet skis, paddleboards, and water charters. Thrilling activities for adventure seekers and water enthusiasts.",
                        "Jet skis, σανίδες και πακέτα νερού. Συναρπαστικές δραστηριότητες για αναζητητές περιπέτειας."
                      )}
                    </p>
                  </div>
                </div>
                <Link
                  to="/boats?sector=watersports"
                  className="inline-flex items-center justify-center rounded-full bg-emerald-600 text-primary-foreground px-6 py-2 text-sm font-medium hover:bg-teal-600 transition-colors w-fit"
                >
                  {tl("Browse watersports", "Δες θαλάσσια σπορ")} →
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Promotions;
