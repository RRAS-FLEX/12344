import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { RoutingDataProvider } from "@/contexts/RoutingDataContext";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Navbar from "@/components/Navbar";
import AppErrorBoundary from "@/components/AppErrorBoundary";
import { RouteTransitionLoader } from "@/components/loading/LoadingUI";
import ConnectionStatusBanner from "@/components/ConnectionStatusBanner";
import { trackPageView } from "@/lib/analytics";
import { isGoogleClientIdUsable, sanitizeGoogleClientId } from "@/lib/google-oauth";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const Index = lazy(() => import("./pages/Index.tsx"));
const Boats = lazy(() => import("./pages/Boats.tsx"));
const BoatsMap = lazy(() => import("./pages/BoatsMap.tsx"));
const BoatDetails = lazy(() => import("./pages/BoatDetails.tsx"));
const DestinationsPage = lazy(() => import("./pages/DestinationsPage.tsx"));
const News = lazy(() => import("./pages/News.tsx"));
const NewsArticle = lazy(() => import("./pages/NewsArticle.tsx"));
const About = lazy(() => import("./pages/About.tsx"));
const OwnerProfile = lazy(() => import("./pages/OwnerProfile.tsx"));
const OwnerDashboard = lazy(() => import("./pages/OwnerDashboard.tsx"));
const CustomerProfile = lazy(() => import("./pages/CustomerProfile.tsx"));
const ContactOwner = lazy(() => import("./pages/ContactOwner.tsx"));
const Booking = lazy(() => import("./pages/Booking.tsx"));
const BookingClosed = lazy(() => import("./pages/BookingClosed.tsx"));
const BookingRequested = lazy(() => import("./pages/BookingRequested.tsx"));
const BookingConfirmed = lazy(() => import("./pages/BookingConfirmed.tsx"));
const Chat = lazy(() => import("./pages/Chat.tsx"));
const History = lazy(() => import("./pages/History.tsx"));
const OwnerFleet = lazy(() => import("./pages/OwnerFleet.tsx"));
const BecomeOwner = lazy(() => import("./pages/BecomeOwner.tsx"));
const Favorites = lazy(() => import("./pages/Favorites.tsx"));
const Settings = lazy(() => import("./pages/Settings.tsx"));
const PostTripReview = lazy(() => import("./pages/PostTripReview.tsx"));
const BusinessPromotions = lazy(() => import("./pages/BusinessPromotions.tsx"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy.tsx"));
const TermsOfService = lazy(() => import("./pages/TermsOfService.tsx"));
const CookiePolicy = lazy(() => import("./pages/CookiePolicy.tsx"));
const RefundPolicy = lazy(() => import("./pages/RefundPolicy.tsx"));
const BoatOwnerAgreement = lazy(() => import("./pages/BoatOwnerAgreement.tsx"));
const ReportIssue = lazy(() => import("./pages/ReportIssue.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const queryClient = new QueryClient();
const googleClientId = sanitizeGoogleClientId(import.meta.env.VITE_GOOGLE_CLIENT_ID);
const hasUsableGoogleClientId = isGoogleClientIdUsable(googleClientId);

const RouteAnalyticsTracker = () => {
  const location = useLocation();

  useEffect(() => {
    const pathWithQuery = `${location.pathname}${location.search}`;
    trackPageView({
      path: pathWithQuery,
      pageTitle: document.title,
    });
  }, [location.pathname, location.search]);

  return null;
};

const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
};

const RoleLoadingScreen = () => (
  <div className="min-h-screen bg-background">
    <Navbar />
    <main className="pt-24">
      <div className="container mx-auto px-4">
        <p className="text-sm text-muted-foreground">Checking account role...</p>
      </div>
    </main>
  </div>
);

const RoutePageFallback = () => (
  <div className="min-h-screen bg-background">
    <Navbar />
    <main className="pt-24">
      <div className="container mx-auto px-4">
        <p className="text-sm text-muted-foreground">Loading page…</p>
      </div>
    </main>
  </div>
);

type ResolvedRole = "visitor" | "customer" | "owner";

const useResolvedRole = () => {
  const { user, isLoading } = useCurrentUser();
  const [role, setRole] = useState<ResolvedRole>("visitor");
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const resolveRole = async () => {
      if (isLoading) {
        if (!cancelled) {
          setIsRoleLoading(true);
        }
        return;
      }

      if (!user) {
        if (!cancelled) {
          setRole("visitor");
          setIsRoleLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setRole(user.isOwner ? "owner" : "customer");
        setIsRoleLoading(false);
      }
    };

    resolveRole();

    return () => {
      cancelled = true;
    };
  }, [isLoading, user]);

  return { role, isRoleLoading };
};

const RoleRouter = () => {
  const { role, isRoleLoading } = useResolvedRole();

  if (isRoleLoading) {
    return <RoleLoadingScreen />;
  }

  if (role === "owner") {
    return <OwnerProfile />;
  }

  if (role === "customer") {
    return <CustomerProfile />;
  }

  return <Index />;
};

const CustomerRoute = ({ children }: { children: JSX.Element }) => {
  const { role, isRoleLoading } = useResolvedRole();

  if (isRoleLoading) {
    return <RoleLoadingScreen />;
  }

  if (role === "visitor") {
    return <Navigate to="/" replace />;
  }

  return children;
};

const OwnerRoute = ({ children }: { children: JSX.Element }) => {
  const { role, isRoleLoading } = useResolvedRole();

  if (isRoleLoading) {
    return <RoleLoadingScreen />;
  }

  if (role === "visitor") {
    return <Navigate to="/" replace />;
  }

  if (role !== "owner") {
    return <Navigate to="/customer-profile" replace />;
  }

  return children;
};

const AppRoutes = () => (
  <BrowserRouter future={{ v7_relativeSplatPath: true }}>
    <RouteTransitionLoader />
    <ConnectionStatusBanner />
    <RouteAnalyticsTracker />
    <ScrollToTop />
    <RoutingDataProvider>
      <Suspense fallback={<RoutePageFallback />}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/boats" element={<Boats />} />
          <Route path="/boats-map" element={<BoatsMap />} />
          <Route path="/boats/:boatRef" element={<BoatDetails />} />
          <Route path="/destinations" element={<DestinationsPage />} />
          <Route path="/news" element={<News />} />
          <Route path="/news/:slug" element={<NewsArticle />} />
          <Route path="/about" element={<About />} />
          <Route path="/owner-profile" element={<OwnerRoute><OwnerProfile /></OwnerRoute>} />
          <Route path="/owner-dashboard" element={<OwnerRoute><OwnerDashboard /></OwnerRoute>} />
          <Route path="/owners/:ownerSlug" element={<OwnerFleet />} />
          <Route path="/portal" element={<RoleRouter />} />
          <Route path="/profile" element={<RoleRouter />} />
          <Route path="/admin" element={<Navigate to="/portal" replace />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/customer-profile" element={<CustomerRoute><CustomerProfile /></CustomerRoute>} />
          <Route path="/history" element={<History />} />
          <Route path="/contact-owner" element={<ContactOwner />} />
          <Route path="/booking" element={<Booking />} />
          <Route path="/booking-closed" element={<BookingClosed />} />
          <Route path="/booking-requested" element={<BookingRequested />} />
          <Route path="/booking-confirmed" element={<BookingConfirmed />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/become-owner" element={<BecomeOwner />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/post-trip-review" element={<PostTripReview />} />
          <Route path="/business-promotions" element={<BusinessPromotions />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/report" element={<ReportIssue />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
          <Route path="/cookie-policy" element={<CookiePolicy />} />
          <Route path="/refund-policy" element={<RefundPolicy />} />
          <Route path="/boat-owner-agreement" element={<BoatOwnerAgreement />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </RoutingDataProvider>
  </BrowserRouter>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <LanguageProvider>
        <AuthProvider>
          <AppErrorBoundary>
            {hasUsableGoogleClientId ? (
              <GoogleOAuthProvider clientId={googleClientId}>
                <AppRoutes />
              </GoogleOAuthProvider>
            ) : (
              <AppRoutes />
            )}
          </AppErrorBoundary>
        </AuthProvider>
      </LanguageProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
