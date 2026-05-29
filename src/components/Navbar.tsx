import { useEffect, useState } from "react";
import { Menu, X, ChevronDown, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import NautiplexLogo from "./NautiplexLogo";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import AuthDialog from "./AuthDialog";
import { signOut } from "@/lib/auth-hybrid";
import type { AuthUser } from "@/lib/auth-hybrid";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLanguage } from "@/contexts/LanguageContext";
import { getUserAvatarUrl } from "@/lib/profile-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const { user: currentUser } = useCurrentUser();
  const { t, tl } = useLanguage();
  const navigate = useNavigate();

  useEffect(() => {
    setAuthUser(currentUser ?? null);
  }, [currentUser]);

  useEffect(() => {
    if (!authUser?.id) {
      setAvatarUrl(null);
      return;
    }

    let cancelled = false;
    const loadAvatar = async () => {
      try {
        const url = await getUserAvatarUrl(authUser.id);
        if (!cancelled) {
          setAvatarUrl(url);
        }
      } catch {
        if (!cancelled) {
          setAvatarUrl(null);
        }
      }
    };

    loadAvatar();
    return () => {
      cancelled = true;
    };
  }, [authUser?.id]);

  const handleAuthenticated = async (_user: AuthUser) => {
    // Full reload so all auth-dependent state refreshes cleanly
    window.location.href = "/portal";
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setAuthUser(null);
      setMobileOpen(false);
      navigate("/");
    } catch (error) {
      console.error("Sign out failed:", error);
    }
  };

  const handleBecomeOwner = async () => {
    navigate("/become-owner");
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-card/90 backdrop-blur-xl border-b border-border shadow-[0_6px_24px_hsl(var(--ocean)_/_0.08)]">
      <div className="w-full max-w-10xl mx-auto flex items-center justify-between h-16 px-4">
        <NautiplexLogo />

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-6">
          <>
            <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              {t("nav.home")}
            </Link>
            <Link to="/boats" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              {t("nav.boats")}
            </Link>
            <Link to="/boats-map" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              {tl("Map", "Χάρτης")}
            </Link>
            <Link to="/destinations" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              {t("nav.destinations")}
            </Link>
            <Link to="/about" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              {t("nav.about")}
            </Link>
          </>
          {authUser ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="rounded-full pl-2 pr-3 gap-2 max-w-[220px]">
                  <Avatar className="h-6 w-6 border border-border">
                    {avatarUrl ? <AvatarImage src={avatarUrl} alt={authUser.name} /> : null}
                    <AvatarFallback className="text-[10px] font-semibold">
                      {authUser.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase() || "US"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">{authUser.name}</span>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>{authUser.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <>
                  <DropdownMenuItem asChild>
                    <Link to="/profile">
                      {t("nav.profile")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/history">{t("nav.history")}</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/favorites">{t("nav.favorites")}</Link>
                  </DropdownMenuItem>
                  {!authUser.isOwner && (
                    <DropdownMenuItem onClick={handleBecomeOwner}>
                      {t("nav.becomeOwner")}
                    </DropdownMenuItem>
                  )}
                </>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/settings">{t("nav.settings")}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/privacy-policy">{t("nav.privacySecurity")}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/about">{t("nav.helpSupport")}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/report">{tl("Report issue", "Αναφορά προβλήματος")}</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>{t("nav.signOut")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button size="sm" className="bg-gradient-accent text-accent-foreground rounded-full px-5" onClick={() => setAuthOpen(true)}>
              {t("nav.signIn")}
            </Button>
          )}
        </div>

        {/* Mobile Actions */}
        <div className="md:hidden flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full" aria-label={tl("Profile menu", "Μενού προφίλ")}>
                {authUser ? (
                  <Avatar className="h-7 w-7 border border-border">
                    {avatarUrl ? <AvatarImage src={avatarUrl} alt={authUser.name} /> : null}
                    <AvatarFallback className="text-[10px] font-semibold">
                      {authUser.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase() || "US"}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <User className="h-5 w-5" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {authUser ? (
                <>
                  <DropdownMenuLabel>{authUser.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/profile">{t("nav.profile")}</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/history">{t("nav.history")}</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/favorites">{t("nav.favorites")}</Link>
                  </DropdownMenuItem>
                  {!authUser.isOwner ? (
                    <DropdownMenuItem onClick={handleBecomeOwner}>{t("nav.becomeOwner")}</DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>{t("nav.signOut")}</DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem onClick={() => setAuthOpen(true)}>
                  {t("nav.signIn")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            className="p-2"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={tl("Toggle menu", "Εναλλαγή μενού")}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-card border-b border-border overflow-hidden"
          >
            <div className="p-4 space-y-4">
              <div className="flex flex-col gap-3">
                <>
                  <Link to="/" className="text-sm text-muted-foreground py-2" onClick={() => setMobileOpen(false)}>{t("nav.home")}</Link>
                  <Link to="/boats" className="text-sm text-muted-foreground py-2" onClick={() => setMobileOpen(false)}>{t("nav.boats")}</Link>
                  <Link to="/boats-map" className="text-sm text-muted-foreground py-2" onClick={() => setMobileOpen(false)}>{tl("Map", "Χάρτης")}</Link>
                  <Link to="/destinations" className="text-sm text-muted-foreground py-2" onClick={() => setMobileOpen(false)}>{t("nav.destinations")}</Link>
                  <Link to="/about" className="text-sm text-muted-foreground py-2" onClick={() => setMobileOpen(false)}>{t("nav.about")}</Link>
                </>
              </div>
              {authUser ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full rounded-full justify-between">
                      {t("nav.accountMenu")}
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    <DropdownMenuLabel>{authUser.email}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <>
                      <DropdownMenuItem asChild>
                        <Link to="/profile" onClick={() => setMobileOpen(false)}>
                          {t("nav.profile")}
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/history" onClick={() => setMobileOpen(false)}>
                          {t("nav.history")}
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/favorites" onClick={() => setMobileOpen(false)}>
                          {t("nav.favorites")}
                        </Link>
                      </DropdownMenuItem>
                      {!authUser.isOwner && (
                        <DropdownMenuItem onClick={() => { handleBecomeOwner(); setMobileOpen(false); }}>
                          {t("nav.becomeOwner")}
                        </DropdownMenuItem>
                      )}
                    </>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/settings" onClick={() => setMobileOpen(false)}>{t("nav.settings")}</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/privacy-policy" onClick={() => setMobileOpen(false)}>{t("nav.privacySecurity")}</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/about" onClick={() => setMobileOpen(false)}>{t("nav.helpSupport")}</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/report" onClick={() => setMobileOpen(false)}>{tl("Report issue", "Αναφορά προβλήματος")}</Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut}>{t("nav.signOut")}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button className="w-full bg-gradient-accent text-accent-foreground rounded-full" onClick={() => setAuthOpen(true)}>
                  {t("nav.signIn")}
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        onAuthenticated={handleAuthenticated}
      />
    </nav>
  );
};

export default Navbar;

