type RequestJsonOptions = {
  body?: BodyInit | null;
  headers?: HeadersInit;
  method?: string;
};

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/$/, "");

const uniqueStrings = (values: string[]) => Array.from(new Set(values.filter((value) => value.length > 0)));

const extractErrorMessage = (payload: unknown, fallback: string) => {
  if (payload && typeof payload === "object" && "error" in payload && typeof (payload as { error?: unknown }).error === "string") {
    return (payload as { error: string }).error;
  }

  return fallback;
};

const shouldRetryEndpoint = (status: number, message: string) => {
  const normalized = message.toLowerCase();
  return (
    status === 404 ||
    status === 405 ||
    normalized.includes("not configured") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("fetch failed") ||
    normalized.includes("network") ||
    normalized.includes("cannot post") ||
    normalized.includes("not found") ||
    normalized.includes("function not found") ||
    normalized.includes("service unavailable") ||
    normalized.includes("bad gateway") ||
    normalized.includes("gateway timeout")
  );
};

const buildEndpointCandidates = (relativePath: string, apiBaseUrl?: string, netlifyFunctionPath?: string) => {
  const candidates: string[] = [];
  const normalizedBase = normalizeBaseUrl(apiBaseUrl ?? "");

  if (normalizedBase) {
    candidates.push(`${normalizedBase}${relativePath}`);
  }

  candidates.push(relativePath);

  if (netlifyFunctionPath) {
    candidates.push(netlifyFunctionPath.startsWith("/") ? netlifyFunctionPath : `/${netlifyFunctionPath}`);
  }

  return uniqueStrings(candidates);
};

export const resolveStripeCheckoutEndpoints = (apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").trim()) =>
  buildEndpointCandidates("/api/stripe/create-checkout", apiBaseUrl, "/.netlify/functions/create-checkout");

export const resolveBookingLookupEndpoints = (apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").trim()) =>
  buildEndpointCandidates("/api/bookings/by-stripe-session", apiBaseUrl);

export const resolveBoatsSectorEndpoints = (sector: string, apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").trim(), netlifyFunctionPath?: string) =>
  buildEndpointCandidates(`/api/boats/${sector}`, apiBaseUrl, netlifyFunctionPath);

export const resolveBoatImageSignEndpoints = (apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").trim()) =>
  buildEndpointCandidates("/api/storage/boat-images/sign", apiBaseUrl);

export const resolveDestinationImageSignEndpoints = (apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").trim()) =>
  buildEndpointCandidates("/api/storage/destination-images/sign", apiBaseUrl);

const buildQueryString = (params?: Record<string, string | number | undefined | null>) => {
  if (!params) return "";
  const parts: string[] = [];
  for (const key of Object.keys(params)) {
    const v = params[key as keyof typeof params];
    if (v === undefined || v === null) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
};

export const fetchBoatsSector = async <T>(sector: string, params?: Record<string, string | number | undefined | null>) : Promise<T> => {
  const endpoints = resolveBoatsSectorEndpoints(sector);
  const qs = buildQueryString(params);
  const endpointsWithQs = endpoints.map((e) => `${e}${qs}`);
  return fetchJsonFromEndpoints<T>(endpointsWithQs, { method: "GET" });
};

export const fetchJsonFromEndpoints = async <T>(
  endpoints: string[],
  options: RequestJsonOptions,
): Promise<T> => {
  let lastError: Error | null = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, options);
      const rawBody = await response.text();
      let parsedBody: unknown = null;

      if (rawBody) {
        try {
          parsedBody = JSON.parse(rawBody);
        } catch {
          parsedBody = null;
        }
      }

      if (response.ok) {
        return parsedBody as T;
      }

      const message = extractErrorMessage(
        parsedBody,
        rawBody.trim() || `Request failed with status ${response.status}`,
      );
      lastError = new Error(message);

      if (!shouldRetryEndpoint(response.status, message)) {
        break;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Request failed");
    }
  }

  throw lastError ?? new Error("Request failed");
};
