export interface ClientTelemetryEvent {
  id: string;
  type: "render-error" | "fetch-error" | "runtime-warning";
  message: string;
  source?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  pathname: string;
}

const TELEMETRY_KEY = "nautiplex:client-telemetry:v1";
const MAX_EVENTS = 150;

const isBrowser = typeof window !== "undefined";

const createEventId = () =>
  `telem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const readTelemetry = (): ClientTelemetryEvent[] => {
  if (!isBrowser) return [];

  try {
    const raw = window.localStorage.getItem(TELEMETRY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeTelemetry = (events: ClientTelemetryEvent[]) => {
  if (!isBrowser) return;
  try {
    window.localStorage.setItem(TELEMETRY_KEY, JSON.stringify(events.slice(0, MAX_EVENTS)));
  } catch {
    // Ignore storage write failures.
  }
};

export const logClientTelemetry = (input: {
  type: ClientTelemetryEvent["type"];
  message: string;
  source?: string;
  metadata?: Record<string, unknown>;
}) => {
  const event: ClientTelemetryEvent = {
    id: createEventId(),
    type: input.type,
    message: input.message,
    source: input.source,
    metadata: input.metadata,
    createdAt: new Date().toISOString(),
    pathname: isBrowser ? window.location.pathname : "",
  };

  const current = readTelemetry();
  writeTelemetry([event, ...current]);

  if (import.meta.env.DEV) {
    console.warn("[Telemetry]", event.type, event.source ?? "unknown", event.message, event.metadata ?? {});
  }
};

export const getRecentClientTelemetry = (limit = 20): ClientTelemetryEvent[] => {
  const events = readTelemetry();
  return events.slice(0, Math.max(1, limit));
};

export const clearClientTelemetry = () => {
  if (!isBrowser) return;
  window.localStorage.removeItem(TELEMETRY_KEY);
};

