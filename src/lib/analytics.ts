type AnalyticsEventName =
  | "page_view"
  | "search_submitted"
  | "boat_viewed"
  | "booking_started"
  | "booking_confirmed"
  | "experiment_exposure"
  | "oil_price_updated";

type AnalyticsPayload = Record<string, string | number | boolean | null | undefined>;

interface AnalyticsEvent {
  name: AnalyticsEventName;
  payload: AnalyticsPayload;
  timestamp: string;
}

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

const ANALYTICS_STORAGE_KEY = "nautiplex_analytics_events";
const ANONYMOUS_ID_KEY = "nautiplex_anonymous_id";

const canUseBrowserStorage = () => typeof window !== "undefined" && typeof localStorage !== "undefined";

const getAnonymousId = () => {
  if (!canUseBrowserStorage()) {
    return "server";
  }

  const existing = localStorage.getItem(ANONYMOUS_ID_KEY);
  if (existing) {
    return existing;
  }

  const generated = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(ANONYMOUS_ID_KEY, generated);
  return generated;
};

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const appendLocalEvent = (event: AnalyticsEvent) => {
  if (!canUseBrowserStorage()) {
    return;
  }

  try {
    const raw = localStorage.getItem(ANALYTICS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as AnalyticsEvent[]) : [];
    const updated = [...parsed, event].slice(-500);
    localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    localStorage.removeItem(ANALYTICS_STORAGE_KEY);
  }
};

const GA4_EVENT_MAP: Partial<Record<AnalyticsEventName, string>> = {
  page_view: "page_view",
  search_submitted: "search",
  boat_viewed: "view_item",
  booking_started: "begin_checkout",
  booking_confirmed: "purchase",
  experiment_exposure: "experiment_impression",
};

const toGa4Payload = (event: AnalyticsEvent): AnalyticsPayload => {
  if (event.name === "search_submitted") {
    return {
      search_term: event.payload.location as string,
      passengers: event.payload.passengers as number,
    };
  }

  if (event.name === "boat_viewed") {
    return {
      currency: "EUR",
      value: event.payload.pricePerDay as number,
      items: JSON.stringify([
        {
          item_id: event.payload.boatId,
          item_name: event.payload.boatName,
          item_category: event.payload.boatType,
          item_location_id: event.payload.location,
          price: event.payload.pricePerDay,
          quantity: 1,
        },
      ]),
    };
  }

  if (event.name === "booking_started") {
    return {
      currency: "EUR",
      items: JSON.stringify([
        {
          item_id: event.payload.boatId,
          item_name: event.payload.boatName,
          quantity: 1,
        },
      ]),
      source: event.payload.source,
    };
  }

  if (event.name === "booking_confirmed") {
    return {
      transaction_id: `booking_${Date.now()}`,
      currency: "EUR",
      value: event.payload.totalPrice as number,
      payment_type: event.payload.paymentMethod as string,
      guests: event.payload.guests as number,
      items: JSON.stringify([
        {
          item_id: event.payload.boatId,
          item_name: event.payload.boatName,
          price: event.payload.totalPrice,
          quantity: 1,
        },
      ]),
    };
  }

  if (event.name === "page_view") {
    return {
      page_title: event.payload.pageTitle as string,
      page_path: event.payload.path as string,
    };
  }

  if (event.name === "oil_price_updated") {
    return {
      oil_price_per_liter: event.payload.oilPricePerLiter as number,
      source: event.payload.source as string,
    };
  }

  return event.payload;
};

export const trackEvent = (name: AnalyticsEventName, payload: AnalyticsPayload = {}) => {
  const event: AnalyticsEvent = {
    name,
    payload: {
      ...payload,
      anonymousId: getAnonymousId(),
      path: typeof window !== "undefined" ? window.location.pathname : "",
    },
    timestamp: new Date().toISOString(),
  };

  appendLocalEvent(event);

  if (typeof window !== "undefined") {
    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push({
      event: name,
      ...event.payload,
      timestamp: event.timestamp,
    });

    const ga4EventName = GA4_EVENT_MAP[name];
    if (ga4EventName) {
      window.dataLayer.push({
        event: ga4EventName,
        ...toGa4Payload(event),
        timestamp: event.timestamp,
      });
    }
  }
};

export const trackPageView = (details: { path: string; pageTitle?: string }) => {
  trackEvent("page_view", {
    path: details.path,
    pageTitle: details.pageTitle ?? (typeof document !== "undefined" ? document.title : "Nautiplex"),
  });
};

export const getExperimentVariant = (experimentKey: string, variants: string[]) => {
  if (!variants.length) {
    return "control";
  }

  if (!canUseBrowserStorage()) {
    return variants[0];
  }

  const storageKey = `nautiplex_exp_${experimentKey}`;
  const existing = localStorage.getItem(storageKey);
  if (existing && variants.includes(existing)) {
    return existing;
  }

  const stableHash = hashString(`${experimentKey}:${getAnonymousId()}`);
  const assigned = variants[stableHash % variants.length];
  localStorage.setItem(storageKey, assigned);
  return assigned;
};

export const trackExperimentExposure = (experimentKey: string, variant: string) => {
  trackEvent("experiment_exposure", {
    experimentKey,
    variant,
  });
};

export const trackSearchSubmitted = (criteria: { location: string; dateTime: string; passengers: number }) => {
  trackEvent("search_submitted", {
    location: criteria.location,
    hasDateTime: Boolean(criteria.dateTime),
    passengers: criteria.passengers,
  });
};

export const trackBoatViewed = (boat: { id: string; name: string; type: string; location: string; pricePerDay: number }) => {
  trackEvent("boat_viewed", {
    boatId: boat.id,
    boatName: boat.name,
    boatType: boat.type,
    location: boat.location,
    pricePerDay: boat.pricePerDay,
  });
};

export const trackBookingStarted = (details: { boatId: string; boatName: string; source: string }) => {
  trackEvent("booking_started", details);
};

export const trackBookingConfirmed = (details: {
  boatId: string;
  boatName: string;
  totalPrice: number;
  guests: number;
  paymentMethod: "stripe" | "card" | "apple_pay" | "google_pay" | "manual";
}) => {
  trackEvent("booking_confirmed", details);
};


