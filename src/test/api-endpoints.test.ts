import { describe, expect, it } from "vitest";

import { resolveBookingLookupEndpoints, resolveStripeCheckoutEndpoints } from "@/lib/api-endpoints";

describe("api endpoint resolution", () => {
  it("prefers the configured api base before local and netlify fallbacks", () => {
    expect(resolveStripeCheckoutEndpoints("https://api.example.com/")).toEqual([
      "https://api.example.com/api/stripe/create-checkout",
      "/api/stripe/create-checkout",
      "/.netlify/functions/create-checkout",
    ]);
  });

  it("keeps booking lookup on the api route and local proxy fallback", () => {
    expect(resolveBookingLookupEndpoints("https://api.example.com")).toEqual([
      "https://api.example.com/api/bookings/by-stripe-session",
      "/api/bookings/by-stripe-session",
    ]);
  });
});
