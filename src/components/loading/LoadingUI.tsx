import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

export const RouteTransitionLoader = () => {
  const location = useLocation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    const hideTimer = window.setTimeout(() => setVisible(false), 420);
    return () => {
      window.clearTimeout(hideTimer);
    };
  }, [location.pathname, location.search]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-1 overflow-hidden">
      <div
        className={`h-full bg-gradient-accent transition-all duration-300 ${
          visible ? "w-full opacity-100" : "w-0 opacity-0"
        }`}
      />
    </div>
  );
};

export const BoatsGridSkeleton = ({ count = 6 }: { count?: number }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
    {Array.from({ length: count }).map((_, index) => (
      <div key={`boat-skeleton-${index}`} className="rounded-2xl border border-border bg-card overflow-hidden">
        <Skeleton className="h-48 w-full rounded-none" />
        <div className="p-4 space-y-3">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    ))}
  </div>
);

export const DestinationGridSkeleton = ({ count = 4 }: { count?: number }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
    {Array.from({ length: count }).map((_, index) => (
      <div key={`destination-skeleton-${index}`} className="rounded-2xl border border-border bg-card overflow-hidden">
        <Skeleton className="aspect-[16/9] w-full rounded-none" />
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-6 w-16" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    ))}
  </div>
);

export const BoatDetailsPageSkeleton = () => (
  <div className="min-h-screen bg-background">
    <main className="pt-16 pb-20 md:pb-0">
      <section className="py-8 md:py-10 border-b border-border">
        <div className="container mx-auto px-4 space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-[260px]" />
        </div>
      </section>
      <section className="py-10 md:py-12">
        <div className="container mx-auto px-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-2xl border border-border bg-card overflow-hidden">
            <Skeleton className="aspect-[16/9] w-full rounded-none" />
            <div className="p-6 space-y-4">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={`boat-details-stat-${index}`} className="h-20" />
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-6">
            <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
);

export const ImpactStatsSkeleton = ({ count = 4 }: { count?: number }) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
    {Array.from({ length: count }).map((_, index) => (
      <div key={`impact-stat-skeleton-${index}`} className="rounded-2xl border border-primary-foreground/20 bg-primary-foreground/10 p-4 space-y-2">
        <Skeleton className="h-4 w-4 bg-primary-foreground/30" />
        <Skeleton className="h-8 w-16 bg-primary-foreground/30" />
        <Skeleton className="h-3 w-20 bg-primary-foreground/30" />
      </div>
    ))}
  </div>
);

export const BookingConfirmationSkeleton = () => (
  <div className="space-y-5">
    <Skeleton className="h-4 w-72" />
    <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-10" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="rounded-2xl border border-border p-4 bg-background space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-44" />
      </div>
      <div className="rounded-2xl border border-border p-4 bg-background space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-44" />
      </div>
    </div>
    <div className="rounded-2xl border border-amber-400/40 bg-amber-50 p-4 space-y-2">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-11/12" />
    </div>
    <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-2">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-10/12" />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Skeleton className="h-11 w-full rounded-md" />
      <Skeleton className="h-11 w-full rounded-md" />
    </div>
  </div>
);

export const BoatMapListSkeleton = ({ count = 5 }: { count?: number }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3">
    {Array.from({ length: count }).map((_, index) => (
      <div key={`boat-map-list-${index}`} className="rounded-2xl border border-border p-3">
        <div className="flex items-start gap-3">
          <Skeleton className="h-20 w-24 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

export const NewsArticleSkeleton = () => (
  <div className="min-h-screen bg-background">
    <main className="pt-16 pb-20">
      <section className="py-8 md:py-10 border-b border-border">
        <div className="container mx-auto px-4 max-w-3xl space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-full max-w-xl" />
          <Skeleton className="h-4 w-40" />
        </div>
      </section>
      <section className="py-10 md:py-12">
        <div className="container mx-auto px-4 max-w-3xl space-y-6">
          <Skeleton className="aspect-[16/9] w-full rounded-2xl" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </section>
    </main>
  </div>
);

export const OwnerFleetPageSkeleton = () => (
  <div className="min-h-screen bg-background">
    <main className="pt-16">
      <section className="py-14 border-b border-border bg-muted/20">
        <div className="container mx-auto px-4 space-y-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
      </section>
      <section className="py-10 md:py-12">
        <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={`fleet-skeleton-${index}`} className="rounded-2xl border border-border bg-card overflow-hidden">
              <Skeleton className="h-44 w-full rounded-none" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-9 w-full mt-2" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  </div>
);