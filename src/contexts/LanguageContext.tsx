import { createContext, useContext, useMemo, type ReactNode } from "react";

type Language = "en" | "el";

type TranslationDictionary = Record<string, string>;

type TranslationMap = Record<Language, TranslationDictionary>;

const translations: TranslationMap = {
  en: {
    "nav.home": "Home",
    "nav.boats": "Boats",
    "nav.destinations": "Destinations",
    "nav.about": "About",
    "nav.favorites": "Favorites",
    "nav.signIn": "Login",
    "nav.profile": "Profile",
    "nav.history": "History",
    "nav.becomeOwner": "Become an Owner",
    "nav.ownerMode": "Owner Mode",
    "nav.settings": "Settings",
    "nav.privacySecurity": "Privacy & Security",
    "nav.helpSupport": "Help & Support",
    "nav.signOut": "Sign Out",
    "nav.accountMenu": "Account Menu",
    "nav.language": "Language",

    "hero.titleLine1": "Discover Boats.",
    "hero.titleLine2": "Explore the Sea.",
    "hero.subtitle": "Find and book boats instantly for your perfect island adventure in the Greek Mediterranean.",
    "hero.location": "Location",
    "hero.date": "Date",
    "hero.passengers": "Passengers",
    "hero.searchNow": "Search Now",
    "hero.findBoats": "Find Boats",
    "hero.useMyLocation": "Use my location",
    "hero.advancedFinder": "Open advanced boat finder →",
    "hero.verifiedBoats": "🛡️ Verified boats",
    "hero.avgRating": "⭐ 4.9 average rating",
    "hero.tripsCompleted": "🌊 500+ trips completed",
    "hero.geoUnsupported": "Geolocation is not supported in this browser.",
    "hero.geoChecking": "Checking nearby supported destinations...",
    "hero.geoAllowed": "Location allowed: closest supported pickup is {location}.",
    "hero.geoOutside": "Your current location is outside our supported pickup islands.",
    "hero.geoPermission": "Unable to read your location permission.",

    "featured.title": "Featured Boats",
    "featured.subtitle": "Hand-picked boats from verified owners across Greek islands, prioritized by real review quality.",
    "featured.showing": "Showing results for {location} on {dateTime} for {passengers} passengers.",
    "featured.loading": "Loading featured boats…",
    "featured.none": "No boats found for {location} with capacity for {passengers} passengers.",

    "how.title": "How Nautiplex Works",
    "how.subtitle": "From search to boarding, the whole booking flow is optimized for speed, trust, and clear decisions.",
    "how.badge.owners": "Verified owners",
    "how.badge.pricing": "Transparent pricing",
    "how.badge.fast": "Fast booking",
    "how.step": "Step {step}",
    "how.step1.title": "Find a Boat",
    "how.step1.desc": "Search by island, date and passengers. Smart filters surface the best boats first.",
    "how.step2.title": "Book in Seconds",
    "how.step2.desc": "Pick a package, confirm details and secure your date with instant checkout.",
    "how.step3.title": "Enjoy the Sea",
    "how.step3.desc": "Meet your owner, board on time and enjoy a premium sea day across Greek islands.",

    "ownerCta.title": "Own a Boat? Start earning with Nautiplex.",
    "ownerCta.subtitle": "Join hundreds of boat owners already earning with Nautiplex across Greek islands.",
    "ownerCta.benefit1": "Reach tourists before they arrive",
    "ownerCta.benefit2": "Receive online bookings & deposits",
    "ownerCta.benefit3": "Manage your calendar easily",
    "ownerCta.cta": "List Your Boat",

    "favorites.title": "My Favorites",
    "favorites.emptyHint": "Tap the heart on any boat to save it here.",
    "favorites.count": "{count} boat{suffix} saved",
    "favorites.none": "No favorites yet.",
    "favorites.noneDesc": "Browse boats and tap the heart icon to add them here.",
    "favorites.browse": "Browse Boats",
    "favorites.remove": "Remove from favorites",
    "favorites.viewBoat": "View Boat →",
    "favorites.loading": "Loading favorites..."
  },
  el: {
    "nav.home": "Αρχική",
    "nav.boats": "Σκάφη",
    "nav.destinations": "Προορισμοί",
    "nav.about": "Σχετικά",
    "nav.favorites": "Αγαπημένα",
    "nav.signIn": "Σύνδεση",
    "nav.profile": "Προφίλ",
    "nav.history": "Ιστορικό",
    "nav.becomeOwner": "Γίνε Ιδιοκτήτης",
    "nav.ownerMode": "Λειτουργία Ιδιοκτήτη",
    "nav.settings": "Ρυθμίσεις",
    "nav.privacySecurity": "Απόρρητο & Ασφάλεια",
    "nav.helpSupport": "Βοήθεια & Υποστήριξη",
    "nav.signOut": "Αποσύνδεση",
    "nav.accountMenu": "Μενού Λογαριασμού",
    "nav.language": "Γλώσσα",

    "hero.titleLine1": "Ανακάλυψε Σκάφη.",
    "hero.titleLine2": "Εξερεύνησε τη Θάλασσα.",
    "hero.subtitle": "Βρες και κράτησε σκάφη άμεσα για την ιδανική σου νησιωτική εμπειρία στο ελληνικό Αιγαίο.",
    "hero.location": "Τοποθεσία",
    "hero.date": "Ημερομηνία",
    "hero.passengers": "Επιβάτες",
    "hero.searchNow": "Αναζήτηση Τώρα",
    "hero.findBoats": "Βρες Σκάφη",
    "hero.useMyLocation": "Χρήση τοποθεσίας μου",
    "hero.advancedFinder": "Άνοιγμα προηγμένης αναζήτησης σκαφών →",
    "hero.verifiedBoats": "🛡️ Επαληθευμένα σκάφη",
    "hero.avgRating": "⭐ 4.9 μέση βαθμολογία",
    "hero.tripsCompleted": "🌊 500+ ολοκληρωμένες εκδρομές",
    "hero.geoUnsupported": "Η γεωεντοπισμός δεν υποστηρίζεται σε αυτόν τον browser.",
    "hero.geoChecking": "Έλεγχος κοντινών υποστηριζόμενων προορισμών...",
    "hero.geoAllowed": "Η τοποθεσία επιτρέπεται: ο κοντινότερος υποστηριζόμενος προορισμός είναι {location}.",
    "hero.geoOutside": "Η τρέχουσα τοποθεσία σου είναι εκτός των υποστηριζόμενων νησιών παραλαβής.",
    "hero.geoPermission": "Δεν ήταν δυνατή η πρόσβαση στην άδεια τοποθεσίας.",

    "featured.title": "Προτεινόμενα Σκάφη",
    "featured.subtitle": "Επιλεγμένα σκάφη από επαληθευμένους ιδιοκτήτες στα ελληνικά νησιά, με προτεραιότητα στην ποιότητα κριτικών.",
    "featured.showing": "Αποτελέσματα για {location} στις {dateTime} για {passengers} επιβάτες.",
    "featured.loading": "Φόρτωση προτεινόμενων σκαφών…",
    "featured.none": "Δεν βρέθηκαν σκάφη για {location} με χωρητικότητα για {passengers} επιβάτες.",

    "how.title": "Πώς λειτουργεί το Nautiplex",
    "how.subtitle": "Από την αναζήτηση μέχρι την επιβίβαση, όλη η ροή κράτησης είναι βελτιστοποιημένη για ταχύτητα, εμπιστοσύνη και καθαρές επιλογές.",
    "how.badge.owners": "Επαληθευμένοι ιδιοκτήτες",
    "how.badge.pricing": "Διαφανείς τιμές",
    "how.badge.fast": "Γρήγορη κράτηση",
    "how.step": "Βήμα {step}",
    "how.step1.title": "Βρες ένα Σκάφος",
    "how.step1.desc": "Αναζήτησε ανά νησί, ημερομηνία και επιβάτες. Έξυπνα φίλτρα εμφανίζουν πρώτα τα καλύτερα σκάφη.",
    "how.step2.title": "Κράτηση σε Δευτερόλεπτα",
    "how.step2.desc": "Επίλεξε πακέτο, επιβεβαίωσε στοιχεία και κλείσε την ημερομηνία σου με άμεσο checkout.",
    "how.step3.title": "Απόλαυσε τη Θάλασσα",
    "how.step3.desc": "Συνάντησε τον ιδιοκτήτη, επιβιβάσου στην ώρα σου και απόλαυσε μια premium μέρα στη θάλασσα.",

    "ownerCta.title": "Έχεις σκάφος; Ξεκίνα να κερδίζεις με το Nautiplex.",
    "ownerCta.subtitle": "Γίνε μέλος εκατοντάδων ιδιοκτητών που ήδη κερδίζουν με το Nautiplex στα ελληνικά νησιά.",
    "ownerCta.benefit1": "Προσέγγισε τουρίστες πριν φτάσουν",
    "ownerCta.benefit2": "Δέξου online κρατήσεις και προκαταβολές",
    "ownerCta.benefit3": "Διαχειρίσου εύκολα το ημερολόγιό σου",
    "ownerCta.cta": "Καταχώρησε το Σκάφος σου",

    "favorites.title": "Τα Αγαπημένα μου",
    "favorites.emptyHint": "Πάτησε την καρδιά σε οποιοδήποτε σκάφος για να το αποθηκεύσεις εδώ.",
    "favorites.count": "{count} σκάφος{suffix} αποθηκευμέν{suffix2}",
    "favorites.none": "Δεν υπάρχουν αγαπημένα ακόμα.",
    "favorites.noneDesc": "Περιηγήσου στα σκάφη και πάτησε το εικονίδιο καρδιάς για προσθήκη.",
    "favorites.browse": "Περιήγηση Σκαφών",
    "favorites.remove": "Αφαίρεση από αγαπημένα",
    "favorites.viewBoat": "Προβολή Σκάφους →",
    "favorites.loading": "Φόρτωση αγαπημένων..."
  },
};

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  tl: (english: string, greek: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: "en",
  setLanguage: () => undefined,
  t: (key: string) => key,
  tl: (english: string) => english,
});

const interpolate = (template: string, params?: Record<string, string | number>) => {
  if (!params) return template;
  return Object.entries(params).reduce(
    (acc, [paramKey, value]) => acc.replace(new RegExp(`\\{${paramKey}\\}`, "g"), String(value)),
    template,
  );
};

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const value = useMemo<LanguageContextValue>(() => ({
    language: "en",
    setLanguage: () => undefined,
    t: (key, params) => {
      const fallback = translations.en[key] ?? key;
      return interpolate(fallback, params);
    },
    tl: (english) => english,
  }), []);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => useContext(LanguageContext);
