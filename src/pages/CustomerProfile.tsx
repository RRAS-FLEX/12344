import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, Camera, Compass, Flag, Heart, Loader2, MapPin, Pencil, Ship, Star } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { getUserAvatarUrl, uploadUserAvatar } from "@/lib/profile-avatar";

const CustomerProfile = () => {
  const { tl } = useLanguage();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const [bookings, setBookings] = useState<
    Array<{ id: string; boat_name: string | null; start_date: string; status: string }>
  >([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState(user?.name ?? "");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setProfileName(user?.name ?? "");
  }, [user?.name]);

  useEffect(() => {
    const loadBookings = async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from("bookings")
        .select("id, boat_name, start_date, status")
        .eq("customer_id", user.id)
        .order("start_date", { ascending: false });

      setBookings(Array.isArray(data) ? data : []);
    };

    loadBookings();
  }, [user?.id]);

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
      } catch (error) {
        if (!cancelled) {
          setAvatarUrl(null);
        }
      }
    };

    loadAvatar();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

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
        .update({ name: trimmedName, updated_at: new Date().toISOString() })
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

  const completedTrips = bookings.filter((b) => b.status === "completed").length;
  const upcomingTrips = bookings.filter((b) => new Date(b.start_date).getTime() >= new Date().setHours(0, 0, 0, 0));

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-16">
        <section className="py-12 md:py-16 border-b border-border bg-muted/40">
          <div className="container mx-auto px-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 shadow-card-hover">
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row md:items-center gap-5">
                  <div className="space-y-2">
                  <Avatar className="h-20 w-20 border border-border">
                    {avatarUrl ? <AvatarImage src={avatarUrl} alt={user?.name ?? "Customer avatar"} /> : null}
                    <AvatarFallback className="text-xl font-semibold">
                      {user?.name?.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase() ?? "CU"}
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
                        <h1 className="text-2xl md:text-3xl font-heading font-bold text-foreground">{user?.name ?? "Customer"}</h1>
                      )}
                      <Badge className="bg-gradient-accent text-accent-foreground">{tl("Verified Customer", "Επαληθευμένος Πελάτης")}</Badge>
                    </div>
                    <p className="text-muted-foreground max-w-2xl">
                      {user?.email ?? "Manage your trips and profile from this page."}
                    </p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-aegean" />
                      Based in Athens, Greece
                    </p>
                    {isEditingProfile ? (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Button
                          type="button"
                          size="sm"
                          className="bg-gradient-accent text-accent-foreground"
                          onClick={handleSaveProfile}
                          disabled={isSavingProfile}
                        >
                          {isSavingProfile ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
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
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  className="w-full bg-gradient-accent text-accent-foreground gap-2"
                  onClick={() => setIsEditingProfile(true)}
                  disabled={!user?.id}
                >
                  <Pencil className="h-4 w-4" />
                  {tl("Edit Profile", "Επεξεργασία Προφίλ")}
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/history">{tl("Manage Bookings", "Διαχείριση Κρατήσεων")}</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/favorites">{tl("Saved Boats", "Αποθηκευμένα Σκάφη")}</Link>
                </Button>
                <Button asChild variant="outline" className="w-full gap-2">
                  <Link to="/report?type=owner">
                    <Flag className="h-4 w-4" />
                    {tl("Report an owner", "Αναφορά ιδιοκτήτη")}
                  </Link>
                </Button>
                <Button asChild variant="ghost" className="w-full gap-2 justify-start text-muted-foreground hover:text-foreground">
                  <Link to="/report?type=website">
                    <Flag className="h-4 w-4" />
                    {tl("Report a website issue", "Αναφορά προβλήματος ιστοσελίδας")}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="py-10 md:py-12">
          <div className="container mx-auto px-4 space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="shadow-card">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-3">
                    <Ship className="h-5 w-5 text-aegean" />
                    <Badge variant="outline" className="text-[10px]">Live</Badge>
                  </div>
                  <p className="text-2xl font-heading font-bold text-foreground">{completedTrips}</p>
                  <p className="text-sm text-muted-foreground">{tl("Trips Completed", "Ολοκληρωμένες Εκδρομές")}</p>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-3">
                    <Heart className="h-5 w-5 text-aegean" />
                    <Badge variant="outline" className="text-[10px]">Live</Badge>
                  </div>
                  <p className="text-2xl font-heading font-bold text-foreground">0</p>
                  <p className="text-sm text-muted-foreground">{tl("Saved Boats", "Αποθηκευμένα Σκάφη")}</p>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-3">
                    <CalendarClock className="h-5 w-5 text-aegean" />
                    <Badge variant="outline" className="text-[10px]">Live</Badge>
                  </div>
                  <p className="text-2xl font-heading font-bold text-foreground">{upcomingTrips.length}</p>
                  <p className="text-sm text-muted-foreground">{tl("Upcoming Trips", "Επερχόμενες Εκδρομές")}</p>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-3">
                    <Star className="h-5 w-5 text-aegean" />
                    <Badge variant="outline" className="text-[10px]">Live</Badge>
                  </div>
                  <p className="text-2xl font-heading font-bold text-foreground">{completedTrips}</p>
                  <p className="text-sm text-muted-foreground">{tl("Trips Eligible for Review", "Εκδρομές για Αξιολόγηση")}</p>
                </CardContent>
              </Card>
            </div>

            <Card className="shadow-card-hover">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-xl">{tl("Upcoming Trips", "Επερχόμενες Εκδρομές")}</CardTitle>
                <Button asChild variant="outline" size="sm" className="gap-2">
                  <Link to="/boats">
                    <Compass className="h-4 w-4" />
                    {tl("Explore More Boats", "Δες Περισσότερα Σκάφη")}
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {upcomingTrips.map((trip) => (
                  <div key={trip.id} className="rounded-xl border border-border p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{trip.boat_name ?? "Boat"}</p>
                      <p className="text-sm text-muted-foreground">{new Date(trip.start_date).toLocaleString()}</p>
                    </div>
                    <Badge variant="outline" className="capitalize">{trip.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default CustomerProfile;
