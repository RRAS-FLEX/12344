import NautiplexLogo from "./NautiplexLogo";
import { Link } from "react-router-dom";
import { Instagram, Facebook, Twitter, Music2 } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-card border-t border-border py-12">
      <div className="w-full max-w-10xl mx-auto px-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <NautiplexLogo />
            <p className="text-sm text-muted-foreground mt-3 max-w-xs">
              The Mediterranean's marketplace for boat rentals and sea experiences.
            </p>
          </div>
          <div>
            <h4 className="font-heading font-semibold text-foreground mb-3 text-sm">Explore</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/boats" className="hover:text-foreground transition-colors">Browse Boats</Link></li>
              <li><Link to="/destinations" className="hover:text-foreground transition-colors">Destinations</Link></li>
              <li><a href="/#how-it-works" className="hover:text-foreground transition-colors">How It Works</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-heading font-semibold text-foreground mb-3 text-sm">For Owners</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/become-owner" className="hover:text-foreground transition-colors">Become an Owner</Link></li>
              <li><Link to="/owner-profile" className="hover:text-foreground transition-colors">Owner Profile</Link></li>
              <li><Link to="/owner-dashboard" className="hover:text-foreground transition-colors">Owner Dashboard</Link></li>
              <li><a href="/#" className="hover:text-foreground transition-colors">Pricing</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-heading font-semibold text-foreground mb-3 text-sm">Company</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/history" className="hover:text-foreground transition-colors">History</Link></li>
              <li><Link to="/news" className="hover:text-foreground transition-colors">News</Link></li>
              <li><Link to="/about" className="hover:text-foreground transition-colors">About</Link></li>
              <li><Link to="/settings" className="hover:text-foreground transition-colors">Settings</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-heading font-semibold text-foreground mb-3 text-sm">Legal</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/privacy-policy" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
              <li><Link to="/terms-of-service" className="hover:text-foreground transition-colors">Terms of Service</Link></li>
              <li><Link to="/cookie-policy" className="hover:text-foreground transition-colors">Cookie Policy</Link></li>
              <li><Link to="/refund-policy" className="hover:text-foreground transition-colors">Refund Policy</Link></li>
              <li><Link to="/boat-owner-agreement" className="hover:text-foreground transition-colors">Boat Owner Agreement</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border mt-10 pt-6 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <p>© 2026 Nautiplex. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <a
              href="https://instagram.com/nautiplex"
              target="_blank"
              rel="noreferrer"
              aria-label="Nautiplex on Instagram"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Instagram className="h-4 w-4" />
            </a>
            <a
              href="https://tiktok.com/@nautiplex"
              target="_blank"
              rel="noreferrer"
              aria-label="Nautiplex on TikTok"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Music2 className="h-4 w-4" />
            </a>
            <a
              href="https://facebook.com/nautiplex"
              target="_blank"
              rel="noreferrer"
              aria-label="Nautiplex on Facebook"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Facebook className="h-4 w-4" />
            </a>
            <a
              href="https://twitter.com/nautiplex"
              target="_blank"
              rel="noreferrer"
              aria-label="Nautiplex on X (Twitter)"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Twitter className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

