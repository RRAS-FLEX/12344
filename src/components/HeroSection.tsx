import { Search, MapPin, Calendar, Users } from "lucide-react";
import { motion } from "framer-motion";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "./ui/button";
import heroImage from "@/assets/hero-boat.jpg";
import { BoatSearchCriteria } from "@/lib/boat-search";
import { getExperimentVariant, trackExperimentExposure, trackSearchSubmitted } from "@/lib/analytics";
import DateTimePicker from "./DateTimePicker";
import { useLanguage } from "@/contexts/LanguageContext";

interface HeroSectionProps {
  onFindBoats: (criteria: BoatSearchCriteria) => void;
}

const supportedLocations = [
  { name: "Thassos", lat: 40.771, lon: 24.707 },
  { name: "Halkidiki", lat: 40.266, lon: 23.287 },
  { name: "Mykonos", lat: 37.4467, lon: 25.3289 },
  { name: "Santorini", lat: 36.3932, lon: 25.4615 },
];

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const calculateDistanceKm = (
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
) => {
  const earthRadius = 6371;
  const dLat = toRadians(toLat - fromLat);
  const dLon = toRadians(toLon - fromLon);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const HeroSection = ({ onFindBoats }: HeroSectionProps) => {
  const { t, tl } = useLanguage();
  const [locationInput, setLocationInput] = useState("");
  const [dateTimeInput, setDateTimeInput] = useState("");
  const [serviceTypeInput, setServiceTypeInput] = useState<"rental" | "party" | "watersports">("rental");
  const [passengersInput, setPassengersInput] = useState("2");
  const [locationStatus, setLocationStatus] = useState<string>("");
  const ctaVariant = useMemo(
    () => getExperimentVariant("hero_search_cta", ["find-boats", "search-now"]),
    [],
  );

  useEffect(() => {
    trackExperimentExposure("hero_search_cta", ctaVariant);
  }, [ctaVariant]);

  const isSearchValid = useMemo(() => {
    const passengersValue = Number(passengersInput);
    return Boolean(locationInput.trim() && dateTimeInput && Number.isInteger(passengersValue) && passengersValue > 0);
  }, [locationInput, dateTimeInput, passengersInput]);

  const submitLocationSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isSearchValid) {
      return;
    }

    const criteria = {
      location: locationInput.trim(),
      dateTime: dateTimeInput,
      passengers: Number(passengersInput),
      serviceType: serviceTypeInput,
    };

    trackSearchSubmitted(criteria);
    onFindBoats(criteria);
  };

  const detectLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus(t("hero.geoUnsupported"));
      return;
    }

    setLocationStatus(t("hero.geoChecking"));
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nearest = supportedLocations
          .map((location) => ({
            ...location,
            distanceKm: calculateDistanceKm(
              position.coords.latitude,
              position.coords.longitude,
              location.lat,
              location.lon,
            ),
          }))
          .sort((a, b) => a.distanceKm - b.distanceKm)[0];

        if (nearest && nearest.distanceKm <= 220) {
          setLocationInput(nearest.name);
          setLocationStatus(t("hero.geoAllowed", { location: nearest.name }));
          return;
        }

        setLocationStatus(t("hero.geoOutside"));
      },
      () => {
        setLocationStatus(t("hero.geoPermission"));
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <section className="relative min-h-[90vh] md:min-h-screen flex items-center overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0">
        <img
          src={heroImage}
          alt="Luxury boat in turquoise Mediterranean waters"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ocean/60 via-ocean/45 to-ocean/75" />
      </div>

      <div className="container relative z-10 mx-auto px-4 pt-24 pb-16 md:pb-20">
        <div>
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="max-w-3xl"
            >
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-heading font-bold text-primary-foreground leading-[1.06] mb-4 drop-shadow-[0_8px_28px_hsl(210_100%_7%_/_0.35)]">
                {t("hero.titleLine1")}
                <br />
                <span className="text-turquoise">{t("hero.titleLine2")}</span>
              </h1>
              <p className="text-lg md:text-xl text-primary-foreground/90 font-body max-w-2xl mb-8">
                {t("hero.subtitle")}
              </p>
            </motion.div>

            {/* Search Bar */}
            <motion.form
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="bg-card/95 backdrop-blur-sm border border-border/70 rounded-2xl shadow-card-hover p-3 md:p-4 max-w-3xl"
              onSubmit={submitLocationSearch}
            >
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/80 border border-border/50">
                  <MapPin className="h-5 w-5 text-aegean shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">{t("hero.location")}</p>
                    <input
                      type="text"
                      placeholder="Thassos, Greece"
                      className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
                      value={locationInput}
                      onChange={(event) => setLocationInput(event.target.value)}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/80 border border-border/50">
                  <Calendar className="h-5 w-5 text-aegean shrink-0" />
                  <div className="w-full min-w-0">
                    <p className="text-xs text-muted-foreground font-medium">{t("hero.date")}</p>
                    <DateTimePicker
                      value={dateTimeInput}
                      onChange={setDateTimeInput}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/80 border border-border/50">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">
                      {tl("Service", "Υπηρεσία")}
                    </p>
                    <select
                      className="bg-transparent text-sm text-foreground outline-none w-full"
                      value={serviceTypeInput}
                      onChange={(event) => setServiceTypeInput(event.target.value as "rental" | "party" | "watersports")}
                    >
                      <option value="rental">{tl("Boat rental", "Ενοικίαση σκάφους")}</option>
                      <option value="party">{tl("Boat party", "Boat party")}</option>
                      <option value="watersports">{tl("Watersports", "Watersports")}</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/80 border border-border/50">
                  <Users className="h-5 w-5 text-aegean shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">{t("hero.passengers")}</p>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
                      value={passengersInput}
                      onChange={(event) => setPassengersInput(event.target.value)}
                    />
                  </div>
                </div>
                <Button type="submit" disabled={!isSearchValid} className="bg-gradient-accent text-accent-foreground rounded-xl h-auto py-3 text-base font-semibold gap-2 shadow-card disabled:opacity-50 disabled:cursor-not-allowed">
                  <Search className="h-5 w-5" />
                  {ctaVariant === "search-now" ? t("hero.searchNow") : t("hero.findBoats")}
                </Button>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1">
                <div className="flex flex-wrap gap-2">
                  {supportedLocations.map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => setLocationInput(item.name)}
                      className="text-xs rounded-full border border-border bg-muted px-3 py-1.5 text-muted-foreground hover:text-foreground"
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={detectLocation}
                  className="text-xs font-medium text-aegean hover:text-turquoise"
                >
                  {t("hero.useMyLocation")}
                </button>
              </div>
              {locationStatus ? <p className="text-xs text-muted-foreground mt-2 px-1">{locationStatus}</p> : null}
            </motion.form>

            <div className="mt-4">
              <Link
                to={`/boats${locationInput.trim() ? `?location=${encodeURIComponent(locationInput.trim())}` : ""}`}
                className="text-primary-foreground/80 text-sm hover:text-primary-foreground"
              >
                {t("hero.advancedFinder")}
              </Link>
            </div>

            {/* Trust Badges */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="flex flex-wrap items-center gap-6 mt-8 text-primary-foreground/60 text-sm"
            >
              <span>{t("hero.verifiedBoats")}</span>
              <span>{t("hero.avgRating")}</span>
              <span>{t("hero.tripsCompleted")}</span>
            </motion.div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
