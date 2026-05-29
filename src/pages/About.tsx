import { useEffect, useState } from "react";
import { Anchor, HeartHandshake, ShieldCheck, Waves, Compass, CalendarClock } from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ImpactStatsSkeleton } from "@/components/loading/LoadingUI";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/lib/supabase";

const values = [
  {
    icon: ShieldCheck,
    title: { en: "Trust & Safety", el: "Εμπιστοσύνη & Ασφάλεια" },
    description: {
      en: "We prioritize verified owners, clear listing standards, and transparent booking details.",
      el: "Δίνουμε προτεραιότητα σε επαληθευμένους ιδιοκτήτες, σαφή standards καταχώρισης και διαφανείς λεπτομέρειες κράτησης.",
    },
  },
  {
    icon: Waves,
    title: { en: "Sea-First Experiences", el: "Εμπειρίες με επίκεντρο τη Θάλασσα" },
    description: {
      en: "Every product decision is designed to make sea trips easier to plan and enjoy.",
      el: "Κάθε απόφαση προϊόντος σχεδιάζεται ώστε τα θαλάσσια ταξίδια να οργανώνονται και να απολαμβάνονται πιο εύκολα.",
    },
  },
  {
    icon: HeartHandshake,
    title: { en: "Owner Partnership", el: "Συνεργασία με Ιδιοκτήτες" },
    description: {
      en: "We help local owners grow with fair visibility and practical fleet tools.",
      el: "Βοηθάμε τους τοπικούς ιδιοκτήτες να αναπτυχθούν με δίκαιη προβολή και πρακτικά εργαλεία στόλου.",
    },
  },
];

type ImpactStat = {
  label: { en: string; el: string };
  value: string;
  icon: typeof Anchor;
};

const faqs = [
  {
    question: {
      en: "How does Nautiplex verify boats and owners?",
      el: "Πώς επαληθεύει το Nautiplex τα σκάφη και τους ιδιοκτήτες;",
    },
    answer: {
      en: "Listings are reviewed before going live, and owner profiles include identity and listing quality checks.",
      el: "Οι καταχωρίσεις ελέγχονται πριν δημοσιευτούν και τα προφίλ ιδιοκτητών περιλαμβάνουν ελέγχους ταυτότητας και ποιότητας καταχώρισης.",
    },
  },
  {
    question: {
      en: "Can I book with or without a skipper?",
      el: "Μπορώ να κάνω κράτηση με ή χωρίς skipper;",
    },
    answer: {
      en: "It depends on the boat listing and local regulations. Each listing clearly indicates skipper requirements.",
      el: "Εξαρτάται από την καταχώριση του σκάφους και τους τοπικούς κανονισμούς. Κάθε καταχώριση δείχνει ξεκάθαρα αν απαιτείται skipper.",
    },
  },
  {
    question: {
      en: "Is Nautiplex focused only on Greece?",
      el: "Το Nautiplex επικεντρώνεται μόνο στην Ελλάδα;",
    },
    answer: {
      en: "Today we focus on Greek destinations to ensure quality. We plan to expand to more Mediterranean regions next.",
      el: "Σήμερα επικεντρωνόμαστε σε ελληνικούς προορισμούς για να διασφαλίζουμε ποιότητα. Σχεδιάζουμε επέκταση και σε άλλες περιοχές της Μεσογείου.",
    },
  },
];

const About = () => {
  const { tl } = useLanguage();
  const [boatsListed, setBoatsListed] = useState<number | null>(null);
  const [destinationsCount, setDestinationsCount] = useState<number | null>(null);
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactTopic, setContactTopic] = useState("general");
  const [contactMessage, setContactMessage] = useState("");
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);
  const [contactSuccess, setContactSuccess] = useState<string | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadStats = async () => {
      try {
        setIsStatsLoading(true);
        const [{ count: boats }, { count: dests }, { data: ratingRows }] = await Promise.all([
          supabase
            .from("boats")
            .select("id", { count: "exact", head: true })
            .eq("status", "active"),
          supabase
            .from("destinations")
            .select("id", { count: "exact", head: true }),
          supabase
            .from("boats")
            .select("rating")
            .not("rating", "is", null),
        ]);

        if (cancelled) return;

        setBoatsListed(typeof boats === "number" ? boats : 0);
        setDestinationsCount(typeof dests === "number" ? dests : 0);

        if (Array.isArray(ratingRows) && ratingRows.length > 0) {
          const sum = ratingRows.reduce((total, row: any) => total + Number(row.rating ?? 0), 0);
          const avg = sum / ratingRows.length;
          setAverageRating(Number.isFinite(avg) ? parseFloat(avg.toFixed(1)) : null);
        } else {
          setAverageRating(null);
        }
      } catch {
        if (!cancelled) {
          setBoatsListed(null);
          setDestinationsCount(null);
          setAverageRating(null);
        }
      } finally {
        if (!cancelled) {
          setIsStatsLoading(false);
        }
      }
    };

    loadStats();

    return () => {
      cancelled = true;
    };
  }, []);
  useSEO({
    title: "About Nautiplex — Greece's Trusted Boat Rental Platform",
    description: "Learn how Nautiplex connects travelers with verified boat owners across the Greek islands. Our mission: make sea experiences accessible, safe, and unforgettable.",
    canonical: "https://nautiplex.gr/about",
    keywords: "about Nautiplex, boat rental platform Greece, trusted boat owners, Greek sea experiences",
  });

  const handleSubmitContact = async (event: React.FormEvent) => {
    event.preventDefault();

    const name = contactName.trim();
    const email = contactEmail.trim();
    const message = contactMessage.trim();

    if (!name || !email || !message) {
      setContactError("Please fill in your name, email, and message.");
      setContactSuccess(null);
      return;
    }

    try {
      setIsSubmittingContact(true);
      setContactError(null);
      setContactSuccess(null);

      const response = await fetch("/api/contact-messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          topic: contactTopic,
          message,
          pageUrl: typeof window !== "undefined" ? window.location.href : null,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null as any);
        const errorMessage = payload?.error || "Failed to send your message. Please try again later.";
        throw new Error(errorMessage);
      }

      setContactSuccess("Thanks for reaching out. We'll get back to you soon.");
      setContactName("");
      setContactEmail("");
      setContactTopic("general");
      setContactMessage("");
    } catch (error) {
      setContactError(error instanceof Error ? error.message : "Failed to send your message. Please try again.");
      setContactSuccess(null);
    } finally {
      setIsSubmittingContact(false);
    }
  };

  const impactStats: ImpactStat[] = [
    {
      label: { en: "Boats listed", el: "Καταχωρημένα σκάφη" },
      value: boatsListed !== null ? String(boatsListed) : "—",
      icon: Anchor,
    },
    {
      label: { en: "Greek destinations", el: "Ελληνικοί προορισμοί" },
      value: destinationsCount !== null ? String(destinationsCount) : "—",
      icon: Compass,
    },
    {
      label: { en: "Average rating", el: "Μέση βαθμολογία" },
      value: averageRating !== null ? averageRating.toFixed(1) : "—",
      icon: Waves,
    },
    {
      label: { en: "Faster booking flow", el: "Ταχύτερη κράτηση" },
      value: "~2 min",
      icon: CalendarClock,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-16">
        <section className="border-b border-border bg-gradient-ocean py-16 md:py-20">
          <div className="container mx-auto px-4">
            <p className="text-primary-foreground/80 text-sm mb-3">{tl("About Nautiplex", "Σχετικά με το Nautiplex")}</p>
            <h1 className="text-4xl md:text-5xl font-heading font-bold text-primary-foreground mb-4">
              {tl("Building the easiest way to book sea experiences", "Χτίζουμε τον πιο εύκολο τρόπο κράτησης θαλάσσιων εμπειριών")}
            </h1>
            <p className="text-primary-foreground/70">
              {tl(
                "Nautiplex connects travelers and trusted boat owners with a booking experience built around clarity, speed, and confidence.",
                "Το Nautiplex συνδέει ταξιδιώτες και αξιόπιστους ιδιοκτήτες σκαφών με εμπειρία κράτησης βασισμένη στη σαφήνεια, την ταχύτητα και την εμπιστοσύνη.",
              )}
            </p>

            {isStatsLoading ? (
              <ImpactStatsSkeleton />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
                {impactStats.map((item) => (
                  <div key={item.label.en} className="rounded-2xl border border-primary-foreground/20 bg-primary-foreground/10 p-4">
                    <item.icon className="h-4 w-4 text-primary-foreground/80 mb-2" />
                    <p className="text-2xl font-heading font-bold text-primary-foreground">{item.value}</p>
                    <p className="text-xs text-primary-foreground/75">{tl(item.label.en, item.label.el)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="py-10 md:py-12">
          <div className="container mx-auto px-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 shadow-card-hover">
              <CardHeader>
                <CardTitle>{tl("Our Mission", "Η Αποστολή μας")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-muted-foreground">
                <p>
                  {tl(
                    "We created Nautiplex to simplify sea travel planning for customers and create dependable demand for local boat owners.",
                    "Δημιουργήσαμε το Nautiplex για να απλοποιήσουμε τον σχεδιασμό θαλάσσιων ταξιδιών για πελάτες και να δημιουργήσουμε σταθερή ζήτηση για τοπικούς ιδιοκτήτες.",
                  )}
                </p>
                <p>
                  {tl(
                    "Our platform reduces booking friction with practical filters, clear listings, and profile-led trust signals so users can choose faster.",
                    "Η πλατφόρμα μας μειώνει τη δυσκολία κράτησης με πρακτικά φίλτρα, σαφείς καταχωρίσεις και σήματα εμπιστοσύνης ώστε οι χρήστες να αποφασίζουν πιο γρήγορα.",
                  )}
                </p>
                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <p className="text-sm text-foreground font-medium mb-1">{tl("What we optimize", "Τι βελτιστοποιούμε")}</p>
                  <p className="text-sm">{tl("High-intent demand matching, trusted owner visibility, and clearer package choices based on real booking performance.", "Στοχευμένη αντιστοίχιση ζήτησης, αξιόπιστη προβολή ιδιοκτητών και πιο ξεκάθαρες επιλογές πακέτων βάσει πραγματικής απόδοσης κρατήσεων.")}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>{tl("At a Glance", "Με μια Ματιά")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                  <Anchor className="h-4 w-4 text-aegean" />
                  {tl(
                    boatsListed !== null ? `${boatsListed} boats listed` : "Boats listed",
                    boatsListed !== null ? `${boatsListed} καταχωρημένα σκάφη` : "Καταχωρημένα σκάφη",
                  )}
                </p>
                <p className="flex items-center gap-2">
                  <Anchor className="h-4 w-4 text-aegean" />
                  {tl(
                    destinationsCount !== null ? `${destinationsCount} key destinations` : "Key destinations",
                    destinationsCount !== null ? `${destinationsCount} βασικοί προορισμοί` : "Βασικοί προορισμοί",
                  )}
                </p>
                <p className="flex items-center gap-2">
                  <Anchor className="h-4 w-4 text-aegean" />
                  {tl(
                    averageRating !== null ? `${averageRating.toFixed(1)}+ avg trip rating` : "Avg trip rating",
                    averageRating !== null ? `${averageRating.toFixed(1)}+ μέση βαθμολογία εκδρομών` : "Μέση βαθμολογία εκδρομών",
                  )}
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="pb-10 md:pb-12">
          <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-6">
            {values.map((value) => (
              <Card key={value.title.en} className="shadow-card">
                <CardContent className="pt-6 space-y-3">
                  <value.icon className="h-6 w-6 text-aegean" />
                  <h3 className="text-lg font-heading font-semibold text-foreground">{tl(value.title.en, value.title.el)}</h3>
                  <p className="text-sm text-muted-foreground">{tl(value.description.en, value.description.el)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="pb-14 md:pb-20">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
              <Card className="shadow-card-hover h-full flex flex-col">
                <CardHeader>
                  <CardTitle>{tl("Contact Nautiplex", "Επικοινωνία με την Nautiplex")}</CardTitle>
                </CardHeader>
                <CardContent className="flex-1">
                  <form className="space-y-4" onSubmit={handleSubmitContact}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-foreground" htmlFor="contact-name">
                        {tl("Your name", "Το όνομά σου")}
                      </label>
                      <input
                        id="contact-name"
                        type="text"
                        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
                        placeholder={tl("Captain Maria", "Καπετάν Μαρία")}
                        value={contactName}
                        onChange={(event) => setContactName(event.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-foreground" htmlFor="contact-email">
                        {tl("Email", "Email")}
                      </label>
                      <input
                        id="contact-email"
                        type="email"
                        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
                        placeholder={tl("you@nautiplex.com", "you@nautiplex.com")}
                        value={contactEmail}
                        onChange={(event) => setContactEmail(event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground" htmlFor="contact-topic">
                      {tl("Reason", "Λόγος επικοινωνίας")}
                    </label>
                    <select
                      id="contact-topic"
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
                      value={contactTopic}
                      onChange={(event) => setContactTopic(event.target.value)}
                    >
                      <option value="general">{tl("General question", "Γενική ερώτηση")}</option>
                      <option value="owner">{tl("Boat owner interest", "Ενδιαφέρον ιδιοκτήτη σκάφους")}</option>
                      <option value="partnership">{tl("Partnership or business", "Συνεργασία ή business")}</option>
                      <option value="support">{tl("Booking or payment support", "Υποστήριξη κράτησης ή πληρωμής")}</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground" htmlFor="contact-message">
                      {tl("Message", "Μήνυμα")}
                    </label>
                    <textarea
                      id="contact-message"
                      className="min-h-[120px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                      placeholder={tl("Share a bit about how we can help you.", "Πες μας λίγα λόγια για το πώς μπορούμε να βοηθήσουμε.")}
                      value={contactMessage}
                      onChange={(event) => setContactMessage(event.target.value)}
                    />
                  </div>

                  {contactError ? (
                    <p className="text-sm text-destructive">{contactError}</p>
                  ) : null}
                  {contactSuccess ? (
                    <p className="text-sm text-emerald-600">{contactSuccess}</p>
                  ) : null}

                  <button
                    type="submit"
                    className="inline-flex items-center justify-center rounded-md bg-gradient-accent px-4 py-2 text-sm font-medium text-accent-foreground shadow-sm disabled:opacity-60"
                    disabled={isSubmittingContact}
                  >
                    {isSubmittingContact ? tl("Sending...", "Αποστολή...") : tl("Send message", "Αποστολή μηνύματος")}
                  </button>
                </form>
              </CardContent>
            </Card>

            <Card className="shadow-card h-full flex flex-col">
              <CardHeader>
                <CardTitle>{tl("Frequently Asked Questions", "Συχνές Ερωτήσεις")}</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <Accordion type="single" collapsible>
                  {faqs.map((faq, index) => (
                    <AccordionItem value={`item-${index}`} key={faq.question.en}>
                      <AccordionTrigger>{tl(faq.question.en, faq.question.el)}</AccordionTrigger>
                      <AccordionContent>{tl(faq.answer.en, faq.answer.el)}</AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default About;

