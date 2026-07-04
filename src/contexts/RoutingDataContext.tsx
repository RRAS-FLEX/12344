/**
 * RoutingDataContext — pass rich data across route navigations without
 * encoding everything into the URL. Works alongside React Router's
 * useNavigate / Link; simply call navigateWithData() instead.
 *
 * Example (sender):
 *   const { navigateWithData } = useRoutingData();
 *   navigateWithData("/chat", { boat, bookingId: "xyz" });
 *
 * Example (receiver):
 *   const { consumeData } = useRoutingData();
 *   const { boat } = consumeData<{ boat: Boat }>();
 */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";

type AnyRecord = Record<string, unknown>;

interface RoutingDataContextValue {
  /**
   * Navigate to `path` and stash `data` so the receiving page can pick it
   * up with `consumeData()`. Standard React Router options (replace, state,
   * relative) are forwarded.
   */
  navigateWithData: <T extends AnyRecord>(
    path: string,
    data: T,
    opts?: { replace?: boolean }
  ) => void;

  /**
   * Read and clear the last stashed payload. Returns the payload typed as
   * T, or null if nothing was stashed. Call once per navigation; data is
   * cleared after the first read so it doesn't linger.
   */
  consumeData: <T extends AnyRecord>() => T | null;

  /**
   * Peek at the current payload without clearing it. Useful inside render
   * to conditionally show pre-loaded content before consuming.
   */
  peekData: <T extends AnyRecord>() => T | null;
}

const RoutingDataContext = createContext<RoutingDataContextValue | null>(null);

export const RoutingDataProvider = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const stashRef = useRef<AnyRecord | null>(null);

  const navigateWithData = useCallback(
    <T extends AnyRecord>(
      path: string,
      data: T,
      opts?: { replace?: boolean }
    ) => {
      stashRef.current = data;
      navigate(path, { replace: opts?.replace ?? false });
    },
    [navigate]
  );

  const consumeData = useCallback(<T extends AnyRecord>(): T | null => {
    const value = stashRef.current as T | null;
    stashRef.current = null;
    return value;
  }, []);

  const peekData = useCallback(
    <T extends AnyRecord>(): T | null => stashRef.current as T | null,
    []
  );

  return (
    <RoutingDataContext.Provider value={{ navigateWithData, consumeData, peekData }}>
      {children}
    </RoutingDataContext.Provider>
  );
};

/** Hook to use the routing-data context from any component inside the router. */
// Co-locating the hook with its Provider is intentional; splitting it out would only
// churn imports across many consumers for a dev-only Fast Refresh optimization.
// eslint-disable-next-line react-refresh/only-export-components
export const useRoutingData = (): RoutingDataContextValue => {
  const ctx = useContext(RoutingDataContext);
  if (!ctx) {
    throw new Error("useRoutingData must be used inside <RoutingDataProvider>.");
  }
  return ctx;
};
