import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Bug,
  Flag,
  LifeBuoy,
  Ship,
  ShieldAlert,
  UserRound,
  Users,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  addReportTicket,
  listReportTickets,
  type ReportSeverity,
  type ReportTicket,
  type ReportType,
} from "@/lib/report-tickets";
import { withRetry } from "@/lib/retry";

const reportTypeMeta: Record<
  ReportType,
  {
    icon: typeof Users;
    title: string;
    description: string;
    targetLabel: string;
    targetPlaceholder: string;
  }
> = {
  customer: {
    icon: Users,
    title: "Customer report",
    description: "Abuse, no-shows, payment disputes, or unsafe behavior from a customer.",
    targetLabel: "Customer",
    targetPlaceholder: "Customer name, email, or booking reference",
  },
  owner: {
    icon: UserRound,
    title: "Owner report",
    description: "Misleading listing details, conduct issues, cancellations, or safety concerns.",
    targetLabel: "Owner",
    targetPlaceholder: "Owner name, email, or boat context",
  },
  boat: {
    icon: Ship,
    title: "Boat report",
    description: "Damage, inaccurate photos, missing equipment, or operational concerns.",
    targetLabel: "Boat",
    targetPlaceholder: "Boat name or public reference",
  },
  website: {
    icon: Bug,
    title: "Website malfunction",
    description: "Broken pages, payment failures, map bugs, crashes, or UI that does not work.",
    targetLabel: "Affected area",
    targetPlaceholder: "Page name or feature, e.g. Booking checkout",
  },
};

const severityOptions: Array<{
  value: ReportSeverity;
  label: string;
  hint: string;
}> = [
  { value: "low", label: "Low", hint: "Minor issue, no booking blocked" },
  { value: "medium", label: "Medium", hint: "Needs review soon" },
  { value: "high", label: "High", hint: "Impacts trip or trust" },
  { value: "critical", label: "Critical", hint: "Safety, fraud, or full blocker" },
];

const getCurrentPageUrl = () => {
  if (typeof window === "undefined") {
    return "";
  }

  return `${window.location.origin}${window.location.pathname}${window.location.search}`;
};

const ReportIssue = () => {
  const { tl } = useLanguage();
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const [searchParams] = useSearchParams();
  const initialType = (searchParams.get("type") as ReportType) || "website";
  const [reportType, setReportType] = useState<ReportType>(
    ["customer", "owner", "boat", "website"].includes(initialType) ? initialType : "website",
  );
  const [targetName, setTargetName] = useState(searchParams.get("target") ?? "");
  const [targetRef, setTargetRef] = useState(searchParams.get("targetRef") ?? "");
  const [reporterName, setReporterName] = useState(user?.name ?? "");
  const [reporterEmail, setReporterEmail] = useState(user?.email ?? "");
  const [subject, setSubject] = useState(searchParams.get("subject") ?? "");
  const [severity, setSeverity] = useState<ReportSeverity>("medium");
  const [pageUrl, setPageUrl] = useState(searchParams.get("pageUrl") ?? getCurrentPageUrl());
  const [message, setMessage] = useState("");
  const [recentReports, setRecentReports] = useState<ReportTicket[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);
  const [recentReportsError, setRecentReportsError] = useState("");

  useEffect(() => {
    if (user?.name && !reporterName) {
      setReporterName(user.name);
    }
    if (user?.email && !reporterEmail) {
      setReporterEmail(user.email);
    }
  }, [reporterEmail, reporterName, user?.email, user?.name]);

  useEffect(() => {
    if (reportType !== "website" && pageUrl === getCurrentPageUrl()) {
      setPageUrl("");
    }
    if (reportType === "website" && !pageUrl) {
      setPageUrl(searchParams.get("pageUrl") ?? getCurrentPageUrl());
    }
  }, [pageUrl, reportType, searchParams]);

  const loadRecentReports = async () => {
    if (!reporterEmail.trim()) {
      setRecentReports([]);
      setRecentReportsError("");
      return;
    }

    try {
      setIsLoadingRecent(true);
      setRecentReportsError("");
      const nextReports = await withRetry(
        () => listReportTickets({ reporterEmail: reporterEmail.trim().toLowerCase(), limit: 5 }),
        { retries: 2, initialDelayMs: 220 },
      );
      setRecentReports(nextReports);
    } catch (error) {
      setRecentReportsError(error instanceof Error ? error.message : "Unable to load recent reports.");
    } finally {
      setIsLoadingRecent(false);
    }
  };

  useEffect(() => {
    void loadRecentReports();
  }, [reporterEmail]);

  const typeMeta = useMemo(() => reportTypeMeta[reportType], [reportType]);
  const ActiveIcon = typeMeta.icon;

  const canSubmit =
    reporterName.trim() &&
    reporterEmail.trim() &&
    subject.trim() &&
    message.trim() &&
    (reportType === "website" ? true : targetName.trim());

  const submitReport = async () => {
    if (!canSubmit) {
      toast({
        title: "Missing report details",
        description: tl(
          "Fill in the required fields before sending the report.",
          "Συμπλήρωσε τα απαιτούμενα πεδία πριν στείλεις την αναφορά.",
        ),
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const created = await addReportTicket({
        reportType,
        subject: subject.trim(),
        targetName: reportType === "website" ? targetName.trim() || "Nautiplex webpage" : targetName.trim(),
        targetRef: targetRef.trim() || null,
        reporterName: reporterName.trim(),
        reporterEmail: reporterEmail.trim().toLowerCase(),
        severity,
        message: message.trim(),
        pageUrl: pageUrl.trim() || null,
        metadata: {
          userRole: user?.isOwner ? "owner" : user ? "customer" : "guest",
          browser: typeof navigator === "undefined" ? "" : navigator.userAgent,
        },
      });

      setMessage("");
      setSubject("");
      if (reportType === "website") {
        setTargetName("");
      }
      setRecentReports((current) => [created, ...current].slice(0, 5));
      toast({
        title: "Report submitted",
        description: tl(
          "Your report is now in the Nautiplex support workflow.",
          "Η αναφορά σου μπήκε τώρα στη ροή υποστήριξης του Nautiplex.",
        ),
      });
    } catch (error) {
      toast({
        title: "Report failed",
        description: error instanceof Error ? error.message : "Unable to submit this report.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-16">
        <section className="py-14 border-b border-border bg-gradient-ocean">
          <div className="container mx-auto px-4">
            <p className="text-primary-foreground/80 text-sm">Safety & support</p>
            <h1 className="text-3xl md:text-4xl font-heading font-bold text-primary-foreground mt-2">
              {tl("Report an issue", "Αναφορά προβλήματος")}
            </h1>
            <p className="text-primary-foreground/70 max-w-2xl mt-3">
              {tl(
                "Use one workflow to report customers, owners, boats, or website malfunctions. Add enough context so support can act fast.",
                "Χρησιμοποίησε μία ροή για να αναφέρεις πελάτες, ιδιοκτήτες, σκάφη ή δυσλειτουργίες της ιστοσελίδας. Πρόσθεσε αρκετό context ώστε η υποστήριξη να δράσει γρήγορα.",
              )}
            </p>
          </div>
        </section>

        <section className="py-10 md:py-12">
          <div className="container mx-auto px-4 grid grid-cols-1 xl:grid-cols-[1.4fr_0.8fr] gap-6">
            <div className="space-y-6">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>{tl("Choose report type", "Επίλεξε τύπο αναφοράς")}</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(Object.entries(reportTypeMeta) as Array<[ReportType, typeof reportTypeMeta[ReportType]]>).map(([type, meta]) => {
                    const Icon = meta.icon;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setReportType(type)}
                        className={`rounded-2xl border p-4 text-left transition-colors ${
                          reportType === type
                            ? "border-aegean bg-aegean/5 shadow-card"
                            : "border-border hover:border-aegean/40"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="rounded-xl bg-aegean/10 p-2 text-aegean">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="space-y-1">
                            <p className="font-semibold text-foreground">{meta.title}</p>
                            <p className="text-sm text-muted-foreground">{meta.description}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </CardContent>
              </Card>

              <Card className="shadow-card-hover">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Flag className="h-5 w-5 text-aegean" />
                    {tl("Submit report", "Υποβολή αναφοράς")}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {typeMeta.description}
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      placeholder={tl("Your full name", "Το ονοματεπώνυμό σου")}
                      value={reporterName}
                      onChange={(event) => setReporterName(event.target.value)}
                    />
                    <Input
                      type="email"
                      placeholder={tl("Your email", "Το email σου")}
                      value={reporterEmail}
                      onChange={(event) => setReporterEmail(event.target.value)}
                    />
                  </div>

                  <Input
                    placeholder={tl("Short subject", "Σύντομος τίτλος")}
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                  />

                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">{tl("Severity", "Σοβαρότητα")}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {severityOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setSeverity(option.value)}
                          className={`rounded-xl border p-3 text-left transition-colors ${
                            severity === option.value
                              ? "border-aegean bg-aegean/5"
                              : "border-border hover:border-aegean/40"
                          }`}
                        >
                          <p className="font-medium text-foreground">{option.label}</p>
                          <p className="text-xs text-muted-foreground mt-1">{option.hint}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <Textarea
                    placeholder={tl(
                      "Describe exactly what happened, who was affected, and what support should review.",
                      "Περιέγραψε ακριβώς τι συνέβη, ποιος επηρεάστηκε και τι πρέπει να ελέγξει η υποστήριξη.",
                    )}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    className="min-h-[150px]"
                  />

                  {reportType === "website" ? (
                    <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-foreground flex items-center gap-2">
                          <Bug className="h-4 w-4 text-aegean" />
                          {tl("Affected page / context", "Σελίδα / context που επηρεάζεται")}
                        </p>
                        <Badge variant="outline">Auto-captured</Badge>
                      </div>
                      <Input
                        placeholder={tl("URL or area of the app", "URL ή περιοχή της εφαρμογής")}
                        value={pageUrl}
                        onChange={(event) => setPageUrl(event.target.value)}
                      />
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-border bg-muted/10 p-4 space-y-2">
                      <p className="text-sm font-medium text-foreground flex items-center gap-2">
                        <ActiveIcon className="h-4 w-4 text-aegean" />
                        {typeMeta.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {typeMeta.targetPlaceholder}
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
                        <Input
                          placeholder={typeMeta.targetLabel}
                          value={targetName}
                          onChange={(event) => setTargetName(event.target.value)}
                        />
                        <Input
                          placeholder={tl("Reference (optional)", "Αναφορά / κωδικός (προαιρετικό)")}
                          value={targetRef}
                          onChange={(event) => setTargetRef(event.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      className="bg-gradient-accent text-accent-foreground"
                      onClick={submitReport}
                      disabled={!canSubmit || isSubmitting}
                    >
                      {isSubmitting ? tl("Submitting…", "Υποβολή…") : tl("Submit report", "Υποβολή αναφοράς")}
                    </Button>
                    <Button asChild variant="outline">
                      <Link to="/about">{tl("Open help center", "Άνοιγμα help center")}</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5 text-aegean" />
                    {tl("What happens next", "Τι γίνεται μετά")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <div className="rounded-xl border border-border p-3">
                    <p className="font-medium text-foreground">1. Intake</p>
                    <p className="mt-1">Support receives the report with your category, severity, and context.</p>
                  </div>
                  <div className="rounded-xl border border-border p-3">
                    <p className="font-medium text-foreground">2. Triage</p>
                    <p className="mt-1">Safety, trust, and booking blockers are prioritized before general issues.</p>
                  </div>
                  <div className="rounded-xl border border-border p-3">
                    <p className="font-medium text-foreground">3. Resolution</p>
                    <p className="mt-1">Nautiplex support can follow up by email, review data, and escalate if needed.</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LifeBuoy className="h-5 w-5 text-aegean" />
                    {tl("Recent reports", "Πρόσφατες αναφορές")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {isLoadingRecent ? (
                    <p className="text-sm text-muted-foreground">{tl("Loading recent reports…", "Φόρτωση πρόσφατων αναφορών…")}</p>
                  ) : recentReportsError ? (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">{recentReportsError}</p>
                      <Button variant="outline" size="sm" onClick={() => void loadRecentReports()}>{tl("Try again", "Δοκίμασε ξανά")}</Button>
                    </div>
                  ) : recentReports.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {tl("No reports from this email yet.", "Δεν υπάρχουν ακόμη αναφορές για αυτό το email.")}
                    </p>
                  ) : (
                    recentReports.map((report) => (
                      <div key={report.id} className="rounded-xl border border-border p-4 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-foreground break-words">{report.subject}</p>
                          <Badge variant="outline">{report.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          {report.reportType} · {report.severity}
                        </p>
                        <p className="text-sm text-muted-foreground break-words">{report.targetName}</p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-card bg-muted/30">
                <CardContent className="pt-6 space-y-3 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-aegean" />
                    {tl("For urgent safety issues", "Για επείγοντα ζητήματα ασφάλειας")}
                  </p>
                  <p>
                    {tl(
                      "If someone is in immediate danger, contact local emergency services first, then submit the report here.",
                      "Αν κάποιος βρίσκεται σε άμεσο κίνδυνο, επικοινώνησε πρώτα με τις τοπικές υπηρεσίες έκτακτης ανάγκης και μετά υπέβαλε την αναφορά εδώ.",
                    )}
                  </p>
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

export default ReportIssue;
