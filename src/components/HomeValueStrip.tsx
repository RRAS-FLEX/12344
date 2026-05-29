import { BadgeCheck, Compass, Shield, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";

const cards = [
  {
    icon: BadgeCheck,
    enTitle: "Verified boats only",
    elTitle: "Μόνο επαληθευμένα σκάφη",
    enText: "All listings are quality-checked before they appear.",
    elText: "Κάθε καταχώριση ελέγχεται πριν εμφανιστεί.",
  },
  {
    icon: Shield,
    enTitle: "Clear pricing",
    elTitle: "Ξεκάθαρη τιμολόγηση",
    enText: "Package totals and add-ons are visible before checkout.",
    elText: "Σύνολο πακέτου και πρόσθετα εμφανίζονται πριν το checkout.",
  },
  {
    icon: Compass,
    enTitle: "Better route fit",
    elTitle: "Καλύτερη επιλογή διαδρομής",
    enText: "Filter by island, capacity, and trip style to book faster.",
    elText: "Φίλτραρε ανά νησί, χωρητικότητα και στυλ εκδρομής για γρηγορότερη κράτηση.",
  },
  {
    icon: Sparkles,
    enTitle: "Owner-first support",
    elTitle: "Υποστήριξη για ιδιοκτήτες",
    enText: "Owners get better visibility, dashboards, and booking tools.",
    elText: "Οι ιδιοκτήτες έχουν καλύτερη προβολή, dashboard και εργαλεία κρατήσεων.",
  },
] as const;

const HomeValueStrip = () => {
  const { tl } = useLanguage();

  return (
    <section className="py-10 md:py-12 bg-muted/30 border-y border-border">
      <div className="container mx-auto px-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <p className="text-sm font-semibold text-foreground">
            {tl("Why travelers and owners pick Nautiplex", "Γιατί ταξιδιώτες και ιδιοκτήτες επιλέγουν Nautiplex")}
          </p>
          <Link to="/about" className="text-sm font-medium text-aegean hover:text-turquoise transition-colors">
            {tl("See how Nautiplex works →", "Δες πώς λειτουργεί το Nautiplex →")}
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card, index) => (
            <motion.div
              key={card.enTitle}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.05 }}
              className="rounded-2xl border border-border bg-card p-4 shadow-card"
            >
              <div className="h-10 w-10 rounded-xl bg-aegean/10 text-aegean flex items-center justify-center mb-3">
                <card.icon className="h-5 w-5" />
              </div>
              <p className="font-semibold text-foreground mb-1">{tl(card.enTitle, card.elTitle)}</p>
              <p className="text-sm text-muted-foreground">{tl(card.enText, card.elText)}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HomeValueStrip;

