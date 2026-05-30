import { useEffect, useMemo, useState } from "react";
import { Menu, X, ChevronDown, User, Bell, CheckCheck } from "lucide-react";
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
  getInAppNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  type InAppNotification,
  type InAppNotificationKind,
} from "@/lib/notifications";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [isNotificationsLoading, setIsNotificationsLoading] = useState(false);
  const [desktopNotificationsOpen, setDesktopNotificationsOpen] = useState(false);
  const [mobileNotificationsOpen, setMobileNotificationsOpen] = useState(false);
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

  useEffect(() => {
    if (!authUser?.id) {
      setNotifications([]);
      return;
    }

    let cancelled = false;

    const loadNotifications = async () => {
      try {
        setIsNotificationsLoading(true);
        const items = await getInAppNotifications(authUser);
        if (!cancelled) {
          setNotifications(items);
        }
      } catch {
        if (!cancelled) {
          setNotifications([]);
        }
      } finally {
        if (!cancelled) {
          setIsNotificationsLoading(false);
        }
      }
    };

    loadNotifications();
    const refreshId = window.setInterval(loadNotifications, 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(refreshId);
    };
  }, [authUser?.id, authUser?.email, authUser?.isOwner]);

  const unreadCount = notifications.filter((item) => !item.isRead).length;

  const groupedNotifications = useMemo(() => {
    const today = new Date();
    const isSameDay = (dateValue: string) => {
      const date = new Date(dateValue);
      return (
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate()
      );
    };

    const todayItems = notifications.filter((item) => isSameDay(item.createdAt));
    const earlierItems = notifications.filter((item) => !isSameDay(item.createdAt));

    return [
      { label: tl("Today", "Σήμερα"), items: todayItems },
      { label: tl("Earlier", "Νωρίτερα"), items: earlierItems },
    ].filter((group) => group.items.length > 0);
  }, [notifications, tl]);

  const formatNotificationTime = (dateValue: string) =>
    new Date(dateValue).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const notificationActionLabel = (notification: InAppNotification) => {
    if (notification.category === "sale") {
      return tl("View sale details", "Δες λεπτομέρειες πώλησης");
    }

    return tl("View booking details", "Δες λεπτομέρειες κράτησης");
  };

  const kindLabel = (kind: InAppNotificationKind) => {
    switch (kind) {
      case "booking-confirmed":
        return tl("Booking", "Κράτηση");
      case "booking-pending":
        return tl("Pending", "Σε εκκρεμότητα");
      case "booking-cancelled":
        return tl("Cancelled", "Ακυρώθηκε");
      case "payment":
        return tl("Payment", "Πληρωμή");
      case "owner-workflow":
        return tl("Owner workflow", "Ροή ιδιοκτήτη");
      case "owner-alert":
        return tl("Alert", "Ειδοποίηση");
      default:
        return tl("System", "Σύστημα");
    }
  };

  const kindBadgeClassName = (kind: InAppNotificationKind) => {
    switch (kind) {
      case "booking-cancelled":
      case "owner-alert":
        return "bg-rose-500/10 text-rose-700 border border-rose-200";
      case "booking-pending":
        return "bg-amber-500/10 text-amber-700 border border-amber-200";
      case "owner-workflow":
        return "bg-indigo-500/10 text-indigo-700 border border-indigo-200";
      default:
        return "bg-aegean/10 text-aegean border border-aegean/20";
    }
  };

  const handleNotificationClick = (notificationId: string) => {
    if (!authUser?.id) return;
    markNotificationAsRead(authUser.id, notificationId);
    setNotifications((current) =>
      current.map((item) =>
        item.id === notificationId
          ? {
              ...item,
              isRead: true,
            }
          : item,
      ),
    );
    setDesktopNotificationsOpen(false);
    setMobileNotificationsOpen(false);
  };

  const handleMarkAllNotificationsAsRead = () => {
    if (!authUser?.id || notifications.length === 0) return;
    markAllNotificationsAsRead(authUser.id, notifications.map((item) => item.id));
    setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
  };

  const handleAuthenticated = async (_user: AuthUser) => {
    // Full reload so all auth-dependent state refreshes cleanly
    window.location.href = "/portal";
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setAuthUser(null);
      setNotifications([]);
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
            <div className="flex items-center gap-2">
              <Popover open={desktopNotificationsOpen} onOpenChange={setDesktopNotificationsOpen}>
                <PopoverTrigger asChild>
                  <Button size="icon" variant="outline" className="relative rounded-full" aria-label={tl("Notifications", "Ειδοποιήσεις")}>
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 ? (
                      <span className="absolute -right-1 -top-1 min-w-[18px] h-[18px] rounded-full bg-aegean px-1 text-[10px] text-white flex items-center justify-center">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    ) : null}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[360px] p-0">
                  <div className="p-3 border-b border-border flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{tl("Notifications", "Ειδοποιήσεις")}</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2"
                      onClick={handleMarkAllNotificationsAsRead}
                      disabled={notifications.length === 0}
                    >
                      <CheckCheck className="h-4 w-4 mr-1" />
                      {tl("Mark all", "Όλα ως διαβασμένα")}
                    </Button>
                  </div>
                  <div className="max-h-[360px] overflow-y-auto">
                    {isNotificationsLoading ? (
                      <p className="p-4 text-sm text-muted-foreground">{tl("Loading notifications...", "Φόρτωση ειδοποιήσεων...")}</p>
                    ) : notifications.length === 0 ? (
                      <p className="p-4 text-sm text-muted-foreground">{tl("No notifications yet.", "Δεν υπάρχουν ειδοποιήσεις ακόμη.")}</p>
                    ) : (
                      groupedNotifications.map((group) => (
                        <div key={group.label} className="border-b border-border/70 last:border-b-0">
                          <p className="px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/30">{group.label}</p>
                          {group.items.map((notification) => (
                            <Link
                              key={notification.id}
                              to={notification.href}
                              onClick={() => handleNotificationClick(notification.id)}
                              className={`block p-3.5 border-t border-border/60 hover:bg-muted/40 transition-colors ${notification.isRead ? "" : "bg-aegean/5"}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-medium text-foreground leading-snug">{notification.title}</p>
                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${kindBadgeClassName(notification.kind)}`}>
                                  {kindLabel(notification.kind)}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1.5 leading-snug">{notification.message}</p>
                              <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                                <p className="text-muted-foreground">{formatNotificationTime(notification.createdAt)}</p>
                                <span className="font-medium text-aegean">
                                  {notificationActionLabel(notification)} →
                                </span>
                              </div>
                            </Link>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                  <div className="p-3 border-t border-border">
                    <Button asChild variant="outline" className="w-full" onClick={() => setDesktopNotificationsOpen(false)}>
                      <Link to="/history">{tl("Open history workflow", "Άνοιγμα ροής ιστορικού")}</Link>
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>

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
            </div>
          ) : (
            <Button size="sm" className="bg-gradient-accent text-accent-foreground rounded-full px-5" onClick={() => setAuthOpen(true)}>
              {t("nav.signIn")}
            </Button>
          )}
        </div>

        {/* Mobile Actions */}
        <div className="md:hidden flex items-center gap-1">
          {authUser ? (
            <Popover open={mobileNotificationsOpen} onOpenChange={setMobileNotificationsOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full relative" aria-label={tl("Notifications", "Ειδοποιήσεις")}>
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 ? (
                    <span className="absolute -right-0.5 -top-0.5 min-w-[16px] h-[16px] rounded-full bg-aegean px-1 text-[9px] text-white flex items-center justify-center">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  ) : null}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[320px] p-0">
                <div className="p-3 border-b border-border flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{tl("Notifications", "Ειδοποιήσεις")}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2"
                    onClick={handleMarkAllNotificationsAsRead}
                    disabled={notifications.length === 0}
                  >
                    <CheckCheck className="h-4 w-4 mr-1" />
                    {tl("Mark all", "Όλα ως διαβασμένα")}
                  </Button>
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  {isNotificationsLoading ? (
                    <p className="p-4 text-sm text-muted-foreground">{tl("Loading notifications...", "Φόρτωση ειδοποιήσεων...")}</p>
                  ) : notifications.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">{tl("No notifications yet.", "Δεν υπάρχουν ειδοποιήσεις ακόμη.")}</p>
                  ) : (
                    groupedNotifications.map((group) => (
                      <div key={group.label} className="border-b border-border/70 last:border-b-0">
                        <p className="px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/30">{group.label}</p>
                        {group.items.map((notification) => (
                          <Link
                            key={notification.id}
                            to={notification.href}
                            onClick={() => handleNotificationClick(notification.id)}
                            className={`block p-3.5 border-t border-border/60 hover:bg-muted/40 transition-colors ${notification.isRead ? "" : "bg-aegean/5"}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium text-foreground leading-snug">{notification.title}</p>
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${kindBadgeClassName(notification.kind)}`}>
                                {kindLabel(notification.kind)}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1.5 leading-snug">{notification.message}</p>
                            <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                              <p className="text-muted-foreground">{formatNotificationTime(notification.createdAt)}</p>
                              <span className="font-medium text-aegean">
                                {notificationActionLabel(notification)} →
                              </span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    ))
                  )}
                </div>
                <div className="p-3 border-t border-border">
                  <Button asChild variant="outline" className="w-full" onClick={() => setMobileNotificationsOpen(false)}>
                    <Link to="/history">{tl("Open history workflow", "Άνοιγμα ροής ιστορικού")}</Link>
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          ) : null}

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

