import { supabase } from "@/lib/supabase";
import { resolveStorageImage } from "@/lib/storage-public";

const placeholderDestinationImage = "/placeholder.svg";

export interface Destination {
  id: string;
  slug: string;
  name: string;
  image: string;
  boats: number;
  description: string;
  bestFor: string;
}

const DESTINATIONS_CACHE_KEY = "nautiplex:destinations-cache:v2";
const DESTINATIONS_CACHE_TTL_MS = 10 * 60 * 1000;
const DESTINATIONS_CACHE_MAX_STALE_MS = 24 * 60 * 60 * 1000;

const isBrowser = typeof window !== "undefined";

type DestinationsCachePayload = {
  updatedAt: number;
  destinations: Destination[];
};

let destinationsInMemory: DestinationsCachePayload | null = null;
let destinationsInFlight: Promise<Destination[]> | null = null;

const isFresh = (updatedAt: number, ttlMs: number) => Date.now() - updatedAt <= ttlMs;

const readCachedDestinations = (): DestinationsCachePayload | null => {
  if (!isBrowser) return null;
  try {
    const raw = window.localStorage.getItem(DESTINATIONS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return {
        updatedAt: 0,
        destinations: parsed as Destination[],
      };
    }

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      Array.isArray((parsed as DestinationsCachePayload).destinations)
    ) {
      return parsed as DestinationsCachePayload;
    }

    return null;
  } catch {
    return null;
  }
};

const writeCachedDestinations = (destinationsToCache: Destination[]) => {
  if (!isBrowser) return;
  try {
    const payload: DestinationsCachePayload = {
      updatedAt: Date.now(),
      destinations: destinationsToCache,
    };
    window.localStorage.setItem(DESTINATIONS_CACHE_KEY, JSON.stringify(payload));
    destinationsInMemory = payload;
  } catch {
    // Ignore cache write failures.
  }
};

const fallbackDestinations: Destination[] = [
  {
    id: "thassos",
    slug: "thassos",
    name: "Thassos",
    image: resolveStorageImage("thassos/cover.jpg", "destination-images", placeholderDestinationImage),
    boats: 0,
    description: "Crystal-clear bays, pine-lined coast, and relaxed island pacing.",
    bestFor: "",
  },
  {
    id: "halkidiki",
    slug: "halkidiki",
    name: "Halkidiki",
    image: resolveStorageImage("halkidiki/cover.jpg", "destination-images", placeholderDestinationImage),
    boats: 0,
    description: "Long beaches and scenic peninsulas with calm summer waters.",
    bestFor: "",
  },
  {
    id: "mykonos",
    slug: "mykonos",
    name: "Mykonos",
    image: resolveStorageImage("mykonos/cover.jpg", "destination-images", placeholderDestinationImage),
    boats: 0,
    description: "Vibrant beach culture and iconic sunset routes to nearby islands.",
    bestFor: "",
  },
  {
    id: "santorini",
    slug: "santorini",
    name: "Santorini",
    image: resolveStorageImage("santorini/cover.jpg", "destination-images", placeholderDestinationImage),
    boats: 0,
    description: "Volcanic cliffs, dramatic caldera views, and signature sunset sailings.",
    bestFor: "",
  },
];

const normalizeLocation = (value: string) =>
  String(value ?? "")
    .toLowerCase()
    .trim();

export const getDestinations = async (): Promise<Destination[]> => {
  if (destinationsInMemory && isFresh(destinationsInMemory.updatedAt, DESTINATIONS_CACHE_TTL_MS)) {
    return destinationsInMemory.destinations;
  }

  const cached = readCachedDestinations();
  if (cached && isFresh(cached.updatedAt, DESTINATIONS_CACHE_TTL_MS) && cached.destinations.length > 0) {
    destinationsInMemory = cached;
    return cached.destinations;
  }

  if (destinationsInFlight) {
    return destinationsInFlight;
  }

  const fetchOnce = async (): Promise<Destination[]> => {
    const [{ data, error }, { data: boatRows }] = await Promise.all([
      (supabase as any)
      .from("destinations")
      .select("id, slug, name, images, boats, description, best_for"),
      (supabase as any)
        .from("boats")
        .select("location, status"),
    ]);

    if (error || !Array.isArray(data) || data.length === 0) {
      throw new Error(error?.message || "No destinations returned");
    }

    const activeBoatLocations = Array.isArray(boatRows)
      ? boatRows
          .filter((row: { status?: string | null }) => {
            const status = String(row?.status ?? "").trim().toLowerCase();
            return !["inactive", "maintenance", "archived", "draft"].includes(status);
          })
          .map((row: { location?: string | null }) => normalizeLocation(String(row?.location ?? "")))
          .filter(Boolean)
      : [];

    return [...data]
      .sort((a: any, b: any) => String(a?.name ?? "").localeCompare(String(b?.name ?? "")))
      .map((destination: any) => {
      const fallbackImage = fallbackDestinations.find((item) => item.slug === destination.slug)?.image ?? placeholderDestinationImage;
      const rawImages: string = destination.images?.trim() ?? "";
      const resolvedImagePath = rawImages && !/\.\w{2,5}$/.test(rawImages)
        ? `${rawImages}/1.jpg`
        : rawImages;

      const destinationName = String(destination.name ?? "");
      const normalizedDestinationName = normalizeLocation(destinationName);
      const computedBoatCount = normalizedDestinationName
        ? activeBoatLocations.reduce((total, location) => {
            return location.includes(normalizedDestinationName) || normalizedDestinationName.includes(location)
              ? total + 1
              : total;
          }, 0)
        : 0;

      return {
        id: destination.id,
        slug: destination.slug ?? String(destination.name ?? "destination").toLowerCase(),
        name: destinationName,
        image: resolveStorageImage(resolvedImagePath, "destination-images", fallbackImage),
        boats: computedBoatCount,
        description: destination.description ?? "",
        bestFor: destination.best_for ?? "",
      };
    });
  };

  destinationsInFlight = (async () => {
    try {
      const loadedDestinations = await fetchOnce();
      writeCachedDestinations(loadedDestinations);
      return loadedDestinations;
    } catch {
      if (cached && cached.destinations.length > 0 && isFresh(cached.updatedAt, DESTINATIONS_CACHE_MAX_STALE_MS)) {
        destinationsInMemory = cached;
        return cached.destinations;
      }

      if (destinationsInMemory?.destinations?.length) {
        return destinationsInMemory.destinations;
      }
      // If Supabase has no destinations and there's no warm cache, return an empty list
      // instead of hard-coded fallback data.
      return [];
    } finally {
      destinationsInFlight = null;
    }
  })();

  return destinationsInFlight;
};

