import {
  Facebook,
  Instagram,
  LucideIcon,
  Music2,
  Twitter,
} from "lucide-react";
import { motion } from "framer-motion";

const socials = [
  {
    name: "Instagram",
    href: "https://instagram.com/nautiplex",
    icon: Instagram,
    iconClass: "text-[#F56040]",
  },
  {
    name: "TikTok",
    href: "https://tiktok.com/@nautiplex",
    icon: Music2,
    iconClass: "text-white",
  },
  {
    name: "Facebook",
    href: "https://facebook.com/nautiplex",
    icon: Facebook,
    iconClass: "text-[#1877F2]",
  },
  {
    name: "X",
    href: "https://twitter.com/nautiplex",
    icon: Twitter,
    iconClass: "text-white",
  },
];

type SocialItem = (typeof socials)[number];

const HomeSocialPromoDrawer = () => {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="rounded-2xl border border-border bg-card p-5 md:p-6 shadow-card"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-aegean">Social</p>
          <h3 className="text-xl font-semibold text-foreground">Follow Nautiplex for flash deals and live boat drops</h3>
          <p className="text-sm text-muted-foreground">Get last-minute availability, watersports offers, and event routes first.</p>
        </div>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          variants={{
            hidden: { opacity: 0 },
            show: { opacity: 1, transition: { staggerChildren: 0.05 } },
          }}
          className="flex flex-wrap gap-2"
        >
          {socials.map((channel: SocialItem) => {
            const Icon = channel.icon as LucideIcon;

            return (
              <motion.a
                key={channel.name}
                href={channel.href}
                target="_blank"
                rel="noreferrer"
                aria-label={`Nautiplex on ${channel.name}`}
                title={channel.name}
                variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
                whileHover={{ y: -2, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <Icon className={`h-4 w-4 transition ${channel.iconClass}`} />
                <span>{channel.name}</span>
              </motion.a>
            );
          })}
        </motion.div>
      </div>
    </motion.section>
  );
};

export default HomeSocialPromoDrawer;