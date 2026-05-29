export interface MapCoordinates {
  lat: number;
  lng: number;
}

export interface ReverseGeocodeResult {
  address: string;
  city: string;
}

const MAP_CACHE_KEY = "nautiplex:map-geocode-cache:v1";

const DEFAULT_GREECE_COORDINATES: MapCoordinates = {
  lat: 38.4,
  lng: 24.2,
};

const PRESET_COORDINATES: Array<{ keywords: string[]; coordinates: MapCoordinates }> = [
  {
    keywords: ["thassos", "limenas", "skala potamias", "skala prinos"],
    coordinates: { lat: 40.7796, lng: 24.7092 },
  },
  {
    keywords: ["halkidiki", "sani", "nikiti", "vourvourou"],
    coordinates: { lat: 40.2663, lng: 23.387 },
  },
  {
    keywords: ["mykonos", "tourlos", "ornos"],
    coordinates: { lat: 37.4467, lng: 25.3289 },
  },
  {
    keywords: ["santorini", "vlychada", "ammoudi"],
    coordinates: { lat: 36.3932, lng: 25.4615 },
  },
  {
    keywords: ["greece"],
    coordinates: DEFAULT_GREECE_COORDINATES,
  },
];

const isBrowser = typeof window !== "undefined";
const memoryCache = new Map<string, MapCoordinates>();

const normalizeQuery = (value: string) => value.trim().toLowerCase();

const readStoredCache = () => {
  if (!isBrowser) {
    return {} as Record<string, MapCoordinates>;
  }

  try {
    const raw = window.localStorage.getItem(MAP_CACHE_KEY);
    if (!raw) {
      return {} as Record<string, MapCoordinates>;
    }

    const parsed = JSON.parse(raw) as Record<string, MapCoordinates>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {} as Record<string, MapCoordinates>;
  }
};

const writeStoredCache = (cache: Record<string, MapCoordinates>) => {
  if (!isBrowser) {
    return;
  }

  try {
    window.localStorage.setItem(MAP_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore quota or storage errors.
  }
};

const cacheCoordinates = (query: string, coordinates: MapCoordinates) => {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) {
    return coordinates;
  }

  memoryCache.set(normalizedQuery, coordinates);

  if (isBrowser) {
    const nextCache = readStoredCache();
    nextCache[normalizedQuery] = coordinates;
    writeStoredCache(nextCache);
  }

  return coordinates;
};

const getCachedCoordinates = (query: string) => {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) {
    return null;
  }

  const inMemory = memoryCache.get(normalizedQuery);
  if (inMemory) {
    return inMemory;
  }

  const stored = readStoredCache()[normalizedQuery];
  if (stored) {
    memoryCache.set(normalizedQuery, stored);
    return stored;
  }

  return null;
};

const getPresetCoordinates = (query: string) => {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) {
    return DEFAULT_GREECE_COORDINATES;
  }

  return PRESET_COORDINATES.find((item) => item.keywords.some((keyword) => normalizedQuery.includes(keyword)))?.coordinates ?? null;
};

export const getDefaultMapCoordinates = () => DEFAULT_GREECE_COORDINATES;

export const buildOpenStreetMapUrl = (query: string) => {
  const normalizedQuery = query.trim();
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(normalizedQuery || "Greece")}`;
};

export const reverseGeocodeCoordinates = async (coords: MapCoordinates): Promise<ReverseGeocodeResult> => {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(String(coords.lat))}&lon=${encodeURIComponent(String(coords.lng))}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Reverse geocoding request failed");
    }

    const data = (await response.json()) as {
      display_name?: string;
      address?: { city?: string; town?: string; village?: string; hamlet?: string; suburb?: string; state?: string; country?: string };
    };

    const address = (data.display_name || "").trim();
    const addressParts = data.address || {};
    const city =
      addressParts.city ||
      addressParts.town ||
      addressParts.village ||
      addressParts.hamlet ||
      addressParts.suburb ||
      addressParts.state ||
      addressParts.country ||
      "";

    return {
      address,
      city: city.trim(),
    };
  } catch {
    return {
      address: "",
      city: "",
    };
  }
};

export const resolveMapCoordinates = async (query: string): Promise<MapCoordinates> => {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) {
    return DEFAULT_GREECE_COORDINATES;
  }

  const cached = getCachedCoordinates(normalizedQuery);
  if (cached) {
    return cached;
  }

  const presetFallback = getPresetCoordinates(normalizedQuery);

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=gr&q=${encodeURIComponent(normalizedQuery)}`,
      {
        headers: {
          Accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      throw new Error("Geocoding request failed");
    }

    const results = (await response.json()) as Array<{ lat?: string; lon?: string }>;
    const firstResult = results[0];
    const lat = Number(firstResult?.lat);
    const lng = Number(firstResult?.lon);

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return cacheCoordinates(normalizedQuery, { lat, lng });
    }
  } catch {
    // Fall back to known island coordinates.
  }

  return cacheCoordinates(normalizedQuery, presetFallback ?? DEFAULT_GREECE_COORDINATES);
};
