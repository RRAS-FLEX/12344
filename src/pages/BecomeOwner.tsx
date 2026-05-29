import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getMyOwnerApplication, submitOwnerApplication } from "@/lib/owner-applications";
import { useLanguage } from "@/contexts/LanguageContext";

const BOAT_TYPE_OPTIONS = [
  "Speedboat",
  "Sailboat",
  "Yacht",
  "Catamaran",
  "Motorboat",
  "RIB / Inflatable",
  "Fishing boat",
  "Houseboat",
];

const SEASON_OPTIONS = [
  { value: "year_round", label: "Year-round" },
  { value: "summer", label: "Summer only (Jun – Sep)" },
  { value: "spring_summer", label: "Spring & Summer (Apr – Sep)" },
  { value: "custom", label: "Custom / flexible" },
];

const defaultForm = {
  phone: "",
  companyName: "",
  operatingArea: "",
  yearsExperience: "",
  licenseNumber: "",
  boatTypes: [] as string[],
  boatCount: "",
  operatingSeason: "",
  website: "",
  bankAccountHolder: "",
  iban: "",
  bankName: "",
  stripeAccountId: "",
  notes: "",
  agreedToTerms: false,
};

const BecomeOwner = () => {
  const { tl } = useLanguage();
  const { user, isLoading } = useCurrentUser();
  const { toast } = useToast();
  const [form, setForm] = useState(defaultForm);
  const [ownerStep, setOwnerStep] = useState<1 | 2 | 3 | 4>(1);
  const [applicationStatus, setApplicationStatus] = useState<string | null>(null);
    const [hasLoadedApplication, setHasLoadedApplication] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canContinueStep1 = Boolean(form.phone.trim());
  const canContinueStep2 = Boolean(form.operatingArea.trim() && form.yearsExperience.trim());
  const canContinueStep3 = Boolean(
    form.boatCount.trim() &&
    form.operatingSeason ,
  );

  const set = (key: keyof typeof defaultForm) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleBoatType = (type: string) => {
    setForm((prev) => {
      const next = prev.boatTypes.includes(type)
        ? prev.boatTypes.filter((t) => t !== type)
        : [...prev.boatTypes, type];
      return { ...prev, boatTypes: next };
    });
  };

  useEffect(() => {
    if (!user?.id || user.isOwner) return;
    let cancelled = false;
    const load = async () => {
      try {
        const application = await getMyOwnerApplication();
        if (!cancelled) setApplicationStatus(application?.status ?? null);
      } catch {
        // ignore
      } finally {
        if (!cancelled) {
          setHasLoadedApplication(true);
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [user?.id, user?.isOwner]);

  const handleSubmit = async () => {
    if (
      !form.phone.trim() ||
      !form.operatingArea.trim() ||
      !form.yearsExperience.trim() ||
      !form.boatCount.trim() ||
      !form.operatingSeason 
    ) {
      toast({
        title: "Missing required fields",
        description: tl("Fill in phone, operating area, experience, fleet size, season, account holder, and IBAN.", "Συμπλήρωσε τηλέφωνο, περιοχή δραστηριότητας, εμπειρία, μέγεθος στόλου, περίοδο, δικαιούχο λογαριασμού και IBAN."),
        variant: "destructive",
      });
      return;
    }

    if (!form.agreedToTerms) {
      toast({
        title: "Please accept the terms",
        description: tl("You must agree to the Boat Owner Agreement before submitting.", "Πρέπει να αποδεχθείς τη Συμφωνία Ιδιοκτήτη πριν την υποβολή."),
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const application = await submitOwnerApplication({
        phone: form.phone,
        companyName: form.companyName,
        operatingArea: form.operatingArea,
        yearsExperience: form.yearsExperience,
        licenseNumber: form.licenseNumber,
        boatTypes: form.boatTypes,
        boatCount: form.boatCount,
        operatingSeason:
          SEASON_OPTIONS.find((s) => s.value === form.operatingSeason)?.label ??
          form.operatingSeason,
        website: form.website,
        bankAccountHolder: form.bankAccountHolder,
        iban: form.iban,
        bankName: form.bankName,
        stripeAccountId: form.stripeAccountId,
        notes: form.notes,
      });
      setApplicationStatus(application.status);
      toast({
        title: "Application submitted",
        description: tl("Your owner onboarding request is waiting for review.", "Το αίτημα εγγραφής ιδιοκτήτη υποβλήθηκε και αναμένει έλεγχο."),
      });
    } catch (error) {
      toast({
        title: "Submission failed",
        description: error instanceof Error ? error.message : tl("Failed to submit owner application.", "Αποτυχία υποβολής αίτησης ιδιοκτήτη."),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusConfig = {
    pending: {
      icon: <Clock className="h-5 w-5 text-amber-500" />,
      label: "Pending review",
      description: "Your application is being reviewed. We'll notify you by email.",
      color: "bg-amber-50 border-amber-200 text-amber-800",
    },
    approved: {
      icon: <CheckCircle2 className="h-5 w-5 text-emerald-500" />,
      label: "Approved",
      description:
        "Your account has been approved as an owner. Refresh your session if the owner tools are not yet visible.",
      color: "bg-emerald-50 border-emerald-200 text-emerald-800",
    },
    rejected: {
      icon: <XCircle className="h-5 w-5 text-destructive" />,
      label: "Not approved",
      description:
        "Your previous application was not approved. You can update your details and submit again.",
      color: "bg-destructive/5 border-destructive/20 text-destructive",
    },
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-16">
        {/* Header */}
        <section className="border-b border-border bg-muted/30 py-14">
          <div className="container mx-auto px-4 max-w-3xl">
            <p className="text-sm font-medium text-muted-foreground tracking-wide uppercase">
              {tl("Owner onboarding", "Εγγραφή ιδιοκτήτη")}
            </p>
            <h1 className="mt-2 text-4xl font-heading font-bold text-foreground">
              {tl("Apply to list boats on Nautiplex", "Αίτηση για καταχώριση σκαφών στο Nautiplex")}
            </h1>
            <p className="mt-3 text-muted-foreground max-w-xl">
              {tl("Tell us about yourself and your fleet. Our team reviews every application before granting access to the owner dashboard and listing tools.", "Πες μας λίγα λόγια για εσένα και τον στόλο σου. Η ομάδα μας ελέγχει κάθε αίτηση πριν δοθεί πρόσβαση στο dashboard ιδιοκτήτη και στα εργαλεία καταχώρισης.")}
            </p>
          </div>
        </section>

        <section className="py-10">
          <div className="container mx-auto px-4 max-w-3xl space-y-6">
            {!user && !isLoading ? (
              <Card className="shadow-card">
                <CardContent className="pt-6 space-y-4">
                  <p className="text-muted-foreground">
                    Sign in before starting an owner application.
                  </p>
                  <Button asChild className="bg-gradient-accent text-accent-foreground">
                    <Link to="/">Back to home</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : user?.isOwner ? (
              <Card className="shadow-card">
                <CardContent className="pt-6 space-y-4">
                  <p className="font-semibold text-foreground">
                    Your account is already approved as an owner.
                  </p>
                  <Button asChild className="bg-gradient-accent text-accent-foreground">
                    <Link to="/owner-dashboard">Open owner dashboard</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : hasLoadedApplication && applicationStatus === "pending" ? (
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>Application pending review</CardTitle>
                  <CardDescription>
                    We have already received your owner application. Our team is reviewing it now.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className={`flex items-start gap-3 rounded-xl border p-4 ${statusConfig.pending.color}`}>
                    {statusConfig.pending.icon}
                    <div>
                      <p className="font-semibold">{statusConfig.pending.label}</p>
                      <p className="text-sm mt-0.5">{statusConfig.pending.description}</p>
                    </div>
                  </div>
                  <Button asChild variant="outline" className="w-full">
                    <Link to="/">Back to home</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : !hasLoadedApplication ? (
              <Card className="shadow-card">
                <CardContent className="pt-6 space-y-2">
                  <p className="font-semibold text-foreground">Checking your application status…</p>
                  <p className="text-sm text-muted-foreground">
                    Please wait a moment while we verify if you already submitted an owner application.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Status banner */}
                {applicationStatus && applicationStatus in statusConfig && (
                  <div
                    className={`flex items-start gap-3 rounded-xl border p-4 ${
                      statusConfig[applicationStatus as keyof typeof statusConfig].color
                    }`}
                  >
                    {statusConfig[applicationStatus as keyof typeof statusConfig].icon}
                    <div>
                      <p className="font-semibold">
                        {statusConfig[applicationStatus as keyof typeof statusConfig].label}
                      </p>
                      <p className="text-sm mt-0.5">
                        {
                          statusConfig[applicationStatus as keyof typeof statusConfig]
                            .description
                        }
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map((step) => (
                    <div key={step} className="space-y-1">
                      <div className={`h-1 rounded-full ${step <= ownerStep ? "bg-aegean" : "bg-muted"}`} />
                      <p className={`text-xs ${step === ownerStep ? "text-foreground" : "text-muted-foreground"}`}>Step {step}</p>
                    </div>
                  ))}
                </div>

                {/* Section 1 — Personal info */}
                {ownerStep === 1 ? (
                <Card className="shadow-card-hover">
                  <CardHeader>
                    <CardTitle>Personal information</CardTitle>
                    <CardDescription>
                      Your basic contact details. Pre-filled name comes from your account.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="full-name">Full name</Label>
                        <Input
                          id="full-name"
                          value={user?.name ?? ""}
                          readOnly
                          className="bg-muted cursor-not-allowed"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">
                          Phone number <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="phone"
                          type="tel"
                          placeholder="+30 694 000 0000"
                          value={form.phone}
                          onChange={(e) => set("phone")(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company-name">Company / business name (optional)</Label>
                      <Input
                        id="company-name"
                        placeholder="Blue Horizon Charters"
                        value={form.companyName}
                        onChange={(e) => set("companyName")(e.target.value)}
                      />
                    </div>
                  </CardContent>
                </Card>
                ) : null}

                {ownerStep === 1 ? (
                  <div className="flex justify-end">
                    <Button className="bg-gradient-accent text-accent-foreground" onClick={() => setOwnerStep(2)} disabled={!canContinueStep1}>
                      Continue
                    </Button>
                  </div>
                ) : null}

                {/* Section 2 — Experience */}
                {ownerStep === 2 ? (
                <Card className="shadow-card-hover">
                  <CardHeader>
                    <CardTitle>Experience & credentials</CardTitle>
                    <CardDescription>
                      Help us understand your background and qualifications.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="operating-area">
                          Operating area <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="operating-area"
                          placeholder="Thassos, Halkidiki, Athens Riviera"
                          value={form.operatingArea}
                          onChange={(e) => set("operatingArea")(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="years-experience">
                          Years of experience <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="years-experience"
                          placeholder="5 years"
                          value={form.yearsExperience}
                          onChange={(e) => set("yearsExperience")(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="license-number">
                        Captain's license / certification number (recommended)
                      </Label>
                      <Input
                        id="license-number"
                        placeholder="e.g. GMDSS / YM / ICC / Greek Skipper License"
                        value={form.licenseNumber}
                        onChange={(e) => set("licenseNumber")(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Boat types you plan to list</Label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {BOAT_TYPE_OPTIONS.map((type) => {
                          const selected = form.boatTypes.includes(type);
                          return (
                            <button
                              key={type}
                              type="button"
                              onClick={() => toggleBoatType(type)}
                              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                                selected
                                  ? "border-aegean bg-aegean/10 text-aegean font-medium"
                                  : "border-border text-muted-foreground hover:border-aegean/50"
                              }`}
                            >
                              {type}
                            </button>
                          );
                        })}
                      </div>
                      {form.boatTypes.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {form.boatTypes.map((t) => (
                            <Badge key={t} variant="secondary">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
                ) : null}

                {ownerStep === 2 ? (
                  <div className="flex items-center justify-between gap-3">
                    <Button variant="outline" onClick={() => setOwnerStep(1)}>Back</Button>
                    <Button className="bg-gradient-accent text-accent-foreground" onClick={() => setOwnerStep(3)} disabled={!canContinueStep2}>
                      Continue
                    </Button>
                  </div>
                ) : null}

                {/* Section 3 — Fleet plans */}
                {ownerStep === 3 ? (
                <>
                <Card className="shadow-card-hover">
                  <CardHeader>
                    <CardTitle>Fleet plans</CardTitle>
                    <CardDescription>
                      Tell us how many boats you intend to list and when.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="boat-count">
                          Number of boats to list <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="boat-count"
                          placeholder="e.g. 2"
                          value={form.boatCount}
                          onChange={(e) => set("boatCount")(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="operating-season">
                          Operating season <span className="text-destructive">*</span>
                        </Label>
                        <Select value={form.operatingSeason} onValueChange={set("operatingSeason")}>
                          <SelectTrigger id="operating-season">
                            <SelectValue placeholder="Select season…" />
                          </SelectTrigger>
                          <SelectContent>
                            {SEASON_OPTIONS.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Payout details removed; owners will configure payouts later in Stripe Connect flow. */}

                {/* Section 4 — Online presence (optional) */}
                <Card className="shadow-card-hover">
                  <CardHeader>
                    <CardTitle>Online presence (optional)</CardTitle>
                    <CardDescription>
                      Share your website or social profile to help our team learn more about you.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <Label htmlFor="website">Website or Instagram</Label>
                      <Input
                        id="website"
                        type="url"
                        placeholder="https://your-charter.com or @yourhandle"
                        value={form.website}
                        onChange={(e) => set("website")(e.target.value)}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Section 5 — Notes */}
                <Card className="shadow-card-hover">
                  <CardHeader>
                    <CardTitle>Notes for the review team</CardTitle>
                    <CardDescription>
                      Anything else you'd like us to know — crew, special permits, insurance,
                      seasonal offers, etc.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      id="notes"
                      rows={4}
                      placeholder="Tell us anything that wasn't covered above."
                      value={form.notes}
                      onChange={(e) => set("notes")(e.target.value)}
                    />
                  </CardContent>
                </Card>
                </>
                ) : null}

                {ownerStep === 3 ? (
                  <div className="flex items-center justify-between gap-3">
                    <Button variant="outline" onClick={() => setOwnerStep(2)}>Back</Button>
                    <Button className="bg-gradient-accent text-accent-foreground" onClick={() => setOwnerStep(4)} disabled={!canContinueStep3}>
                      Continue
                    </Button>
                  </div>
                ) : null}

                {/* Terms & Submit */}
                {ownerStep === 4 ? (
                <Card className="shadow-card">
                  <CardContent className="pt-6 space-y-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="terms"
                        checked={form.agreedToTerms}
                        onCheckedChange={(checked) =>
                          setForm((prev) => ({ ...prev, agreedToTerms: Boolean(checked) }))
                        }
                      />
                      <Label htmlFor="terms" className="text-sm leading-relaxed cursor-pointer">
                        I have read and agree to the{" "}
                        <Link
                          to="/boat-owner-agreement"
                          target="_blank"
                          className="text-aegean underline underline-offset-2"
                        >
                          Boat Owner Agreement
                        </Link>{" "}
                        and understand that Nautiplex takes a 15% platform commission from bookings.
                      </Label>
                    </div>

                    <Button
                      className="w-full bg-gradient-accent text-accent-foreground"
                      onClick={handleSubmit}
                      disabled={isSubmitting || applicationStatus === "pending"}
                    >
                      {applicationStatus === "pending"
                        ? "Application already pending review"
                        : isSubmitting
                          ? "Submitting…"
                          : "Submit application"}
                    </Button>

                    <Button variant="outline" className="w-full" onClick={() => setOwnerStep(3)}>
                      Back
                    </Button>
                  </CardContent>
                </Card>
                ) : null}
              </>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default BecomeOwner;
