import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarCheck2,
  Camera,
  Flag,
  Loader2,
  Pencil,
  Plus,
  MapPin,
  Ship,
  Star,
  Wallet,
} from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import AddBoatModal from "../components/owner/AddBoatModal";
import { getOwnerBoats, getOwnerStats, OwnerBoat } from "../lib/dashboard-hybrid";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { useLanguage } from "@/contexts/LanguageContext";
import { withRetry } from "@/lib/retry";
import { supabase } from "@/lib/supabase";
import { OwnerFleetPageSkeleton } from "@/components/loading/LoadingUI";
import { useToast } from "@/hooks/use-toast";
import { getUserAvatarUrl, uploadUserAvatar } from "@/lib/profile-avatar";
import { Skeleton } from "@/components/ui/skeleton";

interface StripeConnectStatus {
  isReady: boolean;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

const OwnerProfile = () => {
  const { tl } = useLanguage();
  const { user } = useCurrentUser();
  const { toast } = useToast();

  const [showAddBoat, setShowAddBoat] = useState(false);
  const [editingBoat, setEditingBoat] = useState<OwnerBoat | null>(null);
  const [ownerBoats, setOwnerBoats] = useState<OwnerBoat[]>([]);
  const [ownerStatsData, setOwnerStatsData] = useState({
    listedBoats: 0,
    totalBookings: 0,
    totalRevenue: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState(user?.name ?? "");
  const [profilePhone, setProfilePhone] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [stripeStatus, setStripeStatus] = useState<StripeConnectStatus | null>(null);
  const [isStripeStatusLoading, setIsStripeStatusLoading] = useState(true);
  const payoutsReady = Boolean(stripeStatus?.isReady);

  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  // Load owner stats and boats
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        setLoadError("");

        const [boatsData, statsData] = await Promise.all([
          withRetry(() => getOwnerBoats(), { retries: 2, initialDelayMs: 220 }),
          withRetry(() => getOwnerStats(), { retries: 2, initialDelayMs: 220 }),
        ]);

        setOwnerBoats(boatsData);
        setOwnerStatsData(statsData);
      } catch (error) {
        console.error("Failed to load owner data:", error);
        setLoadError(error instanceof Error ? error.message : "Unable to load owner data.");
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // Load the owner's phone number (not part of the AuthUser hook, kept local to this page).
  useEffect(() => {
    if (!user?.id) return;

    const loadPhone = async () => {
      const { data } = await supabase.from("users").select("phone").eq("id", user.id).maybeSingle();
      setProfilePhone(data?.phone ?? "");
    };

    loadPhone();
  }, [user?.id]);

  // Keep profile name in sync with user
  useEffect(() => {
    setProfileName(user?.name ?? "");
  }, [user?.name]);

  // Load avatar from Supabase storage
  useEffect(() => {
    if (!user?.id) {
      setAvatarUrl(null);
      return;
    }

    let cancelled = false;

    const loadAvatar = async () => {
      try {
        const url = await getUserAvatarUrl(user.id);
        if (!cancelled) {
          setAvatarUrl(url);
        }
      } catch {
        if (!cancelled) {
          setAvatarUrl(null);
        }
      }
    };

    void loadAvatar();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Load Stripe Connect status for profile visibility banner
  useEffect(() => {
    const loadStripeStatus = async () => {
      try {
        setIsStripeStatusLoading(true);
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const apiBaseUrl = import.meta.env?.VITE_API_BASE_URL?.trim?.() ?? "";
        const base = apiBaseUrl ? apiBaseUrl.replace(/\/$/, "") : "";
        const statusUrl = `${base}/api/stripe/connect/status`;

        const response = await fetch(statusUrl, {
          method: "GET",
          headers: {
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
        });

        if (!response.ok) return;
        const json = await response.json();
        setStripeStatus(json);
      } catch (error) {
        console.error("Failed to load Stripe Connect status (profile)", error);
      } finally {
        setIsStripeStatusLoading(false);
      }
    };

    void loadStripeStatus();
  }, []);

  const handleAvatarFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";

    if (!file || !user?.id) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please choose an image file.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      toast({
        title: "Image too large",
        description: "Please upload an image up to 8MB.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsUploadingAvatar(true);
      const nextAvatarUrl = await uploadUserAvatar(user.id, file);
      setAvatarUrl(nextAvatarUrl);
      toast({
        title: "Profile photo updated",
        description: "Your avatar is now saved in Supabase Storage.",
      });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload avatar.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const refreshBoats = async () => {
    try {
      const boatsData = await withRetry(() => getOwnerBoats(), { retries: 2, initialDelayMs: 220 });
      const statsData = await withRetry(() => getOwnerStats(), { retries: 2, initialDelayMs: 220 });
      setOwnerBoats(boatsData);
      setOwnerStatsData(statsData);
      setLoadError("");
    } catch (error) {
      console.error("Failed to refresh boats:", error);
      setLoadError(error instanceof Error ? error.message : "Unable to refresh owner data.");
    }
  };

  const handleCloseAdd = () => {
    setShowAddBoat(false);
    void refreshBoats();
  };

  const handleCloseEdit = () => {
    setEditingBoat(null);
    void refreshBoats();
  };

  const handleSaveProfile = async () => {
    const trimmedName = profileName.trim();

    if (!user?.id || !trimmedName) {
      toast({
        title: "Name is required",
        description: "Please provide your full name.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSavingProfile(true);

      const { error } = await supabase
        .from("users")
        .update({ name: trimmedName, phone: profilePhone.trim() || null, updated_at: new Date().toISOString() })
        .eq("id", user.id);

      if (error) {
        throw new Error(error.message || "Failed to update profile");
      }

      await supabase.auth.updateUser({
        data: {
          name: trimmedName,
        },
      });

      setIsEditingProfile(false);
      toast({
        title: "Profile updated",
        description: "Your profile details were saved.",
      });

      window.location.reload();
    } catch (error) {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Could not update your profile.",
        variant: "destructive",
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <OwnerFleetPageSkeleton />
        <Footer />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-24 pb-16">
          <div className="container mx-auto px-4 text-center space-y-3">
            <h1 className="text-3xl font-heading font-bold text-foreground">
              {tl("Could not load owner area", "Δεν φορτώθηκε η περιοχή ιδιοκτήτη")}
            </h1>
            <p className="text-muted-foreground">{loadError}</p>
            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={() => window.location.reload()}>
                {tl("Reload page", "Ανανέωση σελίδας")}
              </Button>
              <Button variant="outline" onClick={() => void refreshBoats()}>
                {tl("Try again", "Δοκίμασε ξανά")}
              </Button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-16">
        <section className="py-12 md:py-16 border-b border-border bg-muted/40">
          <div className="container mx-auto px-4">
            <div className="mb-5">
              {isStripeStatusLoading ? (
                <div className="max-w-2xl rounded-lg border border-border bg-background/70 px-3 py-2 shadow-sm">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-56" />
                    <Skeleton className="h-3 w-72" />
                  </div>
                </div>
              ) : stripeStatus && payoutsReady ? (
                <div className="max-w-2xl rounded-lg border border-emerald-500/60 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 shadow-sm">
                  <p className="font-medium">
                    {tl(
                      "Your owner profile is visible to travelers.",
                      "Το προφίλ ιδιοκτήτη είναι ορατό στους ταξιδιώτες.",
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-emerald-900/80">
                    {tl(
                      "Stripe payouts are connected and ready.",
                      "Οι πληρωμές Stripe είναι συνδεδεμένες και έτοιμες.",
                    )}
                  </p>
                </div>
              ) : null}
              {stripeStatus && !payoutsReady ? (
                <div className="mt-3 max-w-2xl rounded-lg border border-amber-400/60 bg-amber-50/90 px-3 py-2 text-sm text-amber-900 shadow-sm">
                  <p className="font-medium">
                    {tl(
                      "Your owner profile is currently hidden.",
                      "Το προφίλ ιδιοκτήτη είναι προς το παρόν κρυφό.",
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-amber-900/80">
                    {tl(
                      "Connect Stripe payouts and set at least one boat to Active to make it visible.",
                      "Σύνδεσε τις πληρωμές Stripe και όρισε τουλάχιστον ένα σκάφος σε Ενεργό για να γίνει ορατό.",
                    )}
                  </p>
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              <Card className="lg:col-span-2 shadow-card-hover">
                <CardContent className="pt-6">
                  <div className="flex flex-col md:flex-row md:items-center gap-5">
                    <div className="space-y-2">
                      <Avatar className="h-20 w-20 border border-border">
                        {avatarUrl ? (
                          <AvatarImage src={avatarUrl} alt={user?.name ?? "Owner avatar"} />
                        ) : null}
                        <AvatarFallback className="text-xl font-semibold">
                          {user?.name
                            ?.split(" ")
                            .map((p) => p[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase() ?? "OW"}
                        </AvatarFallback>
                      </Avatar>
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarFileChange}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        disabled={isUploadingAvatar || !user?.id}
                        onClick={() => avatarInputRef.current?.click()}
                      >
                        <Camera className="h-4 w-4" />
                        {isUploadingAvatar ? "Uploading..." : "Add photo"}
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {isEditingProfile ? (
                          <input
                            value={profileName}
                            onChange={(event) => setProfileName(event.target.value)}
                            className="h-10 w-full max-w-sm rounded-md border border-border bg-background px-3 text-2xl md:text-3xl font-heading font-bold text-foreground"
                            placeholder="Your full name"
                          />
                        ) : (
                          <h1 className="text-2xl md:text-3xl font-heading font-bold text-foreground">
                            {user?.name ?? "Owner"}
                          </h1>
                        )}
                        <Badge className="bg-gradient-accent text-accent-foreground">
                          {tl("Verified Owner", "Επαληθευμένος Ιδιοκτήτης")}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground max-w-2xl">
                        {user?.email ?? "Manage your boats and bookings from the owner dashboard."}
                      </p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                        <MapPin className="h-4 w-4 text-aegean" />
                        Based in Thassos, Greece
                      </p>
                      {isEditingProfile ? (
                        <input
                          value={profilePhone}
                          onChange={(event) => setProfilePhone(event.target.value)}
                          className="h-10 w-full max-w-sm rounded-md border border-border bg-background px-3 text-sm text-foreground"
                          placeholder={tl("Phone number (so we can reach you about bookings)", "Τηλέφωνο (για επικοινωνία σχετικά με κρατήσεις)")}
                        />
                      ) : profilePhone ? (
                        <p className="text-sm text-muted-foreground">{profilePhone}</p>
                      ) : null}
                      {isEditingProfile ? (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <Button
                            type="button"
                            size="sm"
                            className="bg-gradient-accent text-accent-foreground"
                            onClick={handleSaveProfile}
                            disabled={isSavingProfile}
                          >
                            {isSavingProfile ? (
                              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                            ) : null}
                            Save profile
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setIsEditingProfile(false);
                              setProfileName(user?.name ?? "");
                            }}
                            disabled={isSavingProfile}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="text-lg">
                    {tl("Profile Actions", "Ενέργειες Προφίλ")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => setIsEditingProfile(true)}
                    disabled={!user?.id}
                  >
                    <Pencil className="h-4 w-4" />
                    {tl("Edit Profile", "Επεξεργασία Προφίλ")}
                  </Button>
                  <Button
                    asChild
                    className="w-full bg-gradient-accent text-accent-foreground gap-2 shadow-sm"
                  >
                    <Link to="/owner-dashboard">
                      {tl("Open Owner Dashboard", "Άνοιγμα Πίνακα Ιδιοκτήτη")}
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full">
                    <Link to="/history">
                      {tl("View trip history", "Ιστορικό εκδρομών")}
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => setShowAddBoat(true)}
                  >
                    <Plus className="h-4 w-4" />
                    {tl("Add Another Boat", "Προσθήκη Νέου Σκάφους")}
                  </Button>
                  <Button asChild variant="outline" className="w-full gap-2">
                    <Link to="/report?type=customer">
                      <Flag className="h-4 w-4" />
                      {tl("Report a customer", "Αναφορά πελάτη")}
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="ghost"
                    className="w-full gap-2 justify-start text-muted-foreground hover:text-foreground"
                  >
                    <Link to="/report?type=website">
                      <Flag className="h-4 w-4" />
                      {tl("Report a website issue", "Αναφορά προβλήματος ιστοσελίδας")}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="py-10 md:py-12">
          <div className="container mx-auto px-4 space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="shadow-card">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-3">
                    <CalendarCheck2 className="h-5 w-5 text-aegean" />
                    <Badge variant="outline" className="text-[10px]">
                      Live
                    </Badge>
                  </div>
                  <p className="text-2xl font-heading font-bold text-foreground">
                    {ownerStatsData.totalBookings}
                  </p>
                  <p className="text-sm text-muted-foreground">Total Bookings</p>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-3">
                    <Star className="h-5 w-5 text-aegean" />
                    <Badge variant="outline" className="text-[10px]">
                      Live
                    </Badge>
                  </div>
                  <p className="text-2xl font-heading font-bold text-foreground">
                    {ownerBoats.length > 0
                      ? (
                          ownerBoats.reduce(
                            (sum, boat) => sum + Number(boat.rating || 0),
                            0,
                          ) / ownerBoats.length
                        ).toFixed(1)
                      : "0.0"}
                  </p>
                  <p className="text-sm text-muted-foreground">Average Rating</p>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-3">
                    <Wallet className="h-5 w-5 text-aegean" />
                    <Badge variant="outline" className="text-[10px]">
                      Live
                    </Badge>
                  </div>
                  <p className="text-2xl font-heading font-bold text-foreground">
                    €{ownerStatsData.totalRevenue.toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-3">
                    <Ship className="h-5 w-5 text-aegean" />
                    <Badge variant="outline" className="text-[10px]">
                      Live
                    </Badge>
                  </div>
                  <p className="text-2xl font-heading font-bold text-foreground">
                    {ownerStatsData.listedBoats}
                  </p>
                  <p className="text-sm text-muted-foreground">Listed Boats</p>
                </CardContent>
              </Card>
            </div>

            <Card className="shadow-card bg-muted/30">
              <CardHeader>
                <CardTitle className="text-xl">Owner Growth Ideas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>
                  • Add at least 5 feature toggles per boat to increase booking
                  confidence.
                </p>
                <p>
                  • Create 3 packages (3h, 6h, full-day) and assign them to every
                  active boat.
                </p>
                <p>
                  • Upload real photos from your boat to improve conversion over
                  placeholder images.
                </p>
              </CardContent>
            </Card>

            <div className="text-center">
              <Link
                to="/boats"
                className="text-aegean hover:text-turquoise transition-colors font-medium"
              >
                Browse customer-facing boats page →
              </Link>
            </div>
          </div>
        </section>
      </main>

      {showAddBoat && <AddBoatModal onClose={handleCloseAdd} />}
      {editingBoat && (
        <AddBoatModal boat={editingBoat} onClose={handleCloseEdit} />
      )}

      <Footer />
    </div>
  );
};

export default OwnerProfile;
