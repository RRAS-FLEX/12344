import { supabasePublic } from "@/lib/supabase";
import { fetchJsonFromEndpoints, resolveDestinationImageSignEndpoints } from "@/lib/api-endpoints";
import { parseStorageReference, resolveStorageImage } from "@/lib/storage-public";
import { isPublicBoatStatus } from "@/lib/boats";

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

const DESTINATIONS_CACHE_KEY = "nautiplex:destinations-cache:v3";
const DESTINATIONS_CACHE_TTL_MS = 10 * 60 * 1000;
const DESTINATIONS_CACHE_MAX_STALE_MS = 24 * 60 * 60 * 1000;

const isBrowser = typeof window !== "undefined";

type DestinationsCachePayload = {
  updatedAt: number;
  destinations: Destination[];
};

let destinationsInMemory: DestinationsCachePayload | null = null;
let destinationsInFlight: Promise<Destination[]> | null = null;

const hasFileExtension = (value: string) => /\.\w{2,6}(\?|$)/.test(value);

const toSignableDestinationImagePath = (value: string): string | null => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;

  const normalized = hasFileExtension(trimmed)
    ? trimmed
    : trimmed.replace(/\/+$/, "");

  const parsed = parseStorageReference(normalized, "destination-images");
  if (!parsed || parsed.bucket !== "destination-images" || !parsed.path) {
    return null;
  }

  return parsed.path;
};

const fetchSignedDestinationImageUrls = async (paths: string[]): Promise<Map<string, string>> => {
  const uniquePaths = Array.from(new Set(paths.map((path) => toSignableDestinationImagePath(path)).filter(Boolean))) as string[];
  if (uniquePaths.length === 0) {
    return new Map();
  }

  try {
    const payload = await fetchJsonFromEndpoints<{ urls?: Record<string, string> }>(
      resolveDestinationImageSignEndpoints(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paths: uniquePaths,
          expiresIn: 3600,
        }),
      },
    );

    const map = new Map<string, string>();
    for (const [path, signedUrl] of Object.entries(payload?.urls ?? {})) {
      if (typeof signedUrl === "string" && signedUrl.trim()) {
        map.set(path, signedUrl);
      }
    }

    return map;
  } catch {
    return new Map();
  }
};

const resolveDestinationImageWithSignedUrl = (
  candidate: string,
  fallback: string,
  signedImageUrls?: Map<string, string>,
): string => {
  const signPath = toSignableDestinationImagePath(candidate);
  if (signPath) {
    const signedUrl = signedImageUrls?.get(signPath);
    if (signedUrl) return signedUrl;

    if (hasFileExtension(signPath)) {
      const folderPathNoSlash = signPath.replace(/\/[^/]+$/, "");
      const folderPathWithSlash = `${folderPathNoSlash}/`;
      const folderSignedUrl =
        signedImageUrls?.get(folderPathNoSlash) ||
        signedImageUrls?.get(folderPathWithSlash);
      if (folderSignedUrl) return folderSignedUrl;
    }
  }

  return resolveStorageImage(candidate, "destination-images", fallback);
};

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
      supabasePublic
      .from("destinations")
      .select("id, slug, name, images, boats, description, best_for"),
      supabasePublic
        .from("boats")
        .select("location, status"),
    ]);

    if (error || !Array.isArray(data) || data.length === 0) {
      throw new Error(error?.message || "No destinations returned");
    }

    const activeBoatLocations = Array.isArray(boatRows)
      ? boatRows
          .filter((row: { status?: string | null }) => isPublicBoatStatus(row?.status))
          .map((row: { location?: string | null }) => normalizeLocation(String(row?.location ?? "")))
          .filter(Boolean)
      : [];

    const destinationImagePaths = [...data].map((destination) => {
      const rawImages: string = destination.images?.trim() ?? "";
      return rawImages && !/\.\w{2,5}$/.test(rawImages)
        ? `${rawImages}/1.jpg`
        : rawImages;
    });
    const signedImageUrls = await fetchSignedDestinationImageUrls(destinationImagePaths);

    return [...data]
      .sort((a, b) => String(a?.name ?? "").localeCompare(String(b?.name ?? "")))
      .map((destination) => {
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
        image: resolveDestinationImageWithSignedUrl(resolvedImagePath, fallbackImage, signedImageUrls),
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

