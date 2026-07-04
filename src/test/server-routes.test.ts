import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("dotenv", () => ({
  default: { config: () => ({}) },
  config: () => ({}),
}));

const ORIGINAL_ENV = { ...process.env };

beforeAll(() => {
  process.env.SUPABASE_URL = "https://test-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.STRIPE_SECRET_KEY = "sk_test_fake_key_for_route_tests";
  process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_fake_key_for_route_tests";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_fake_secret_for_route_tests";
});

afterAll(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("server/index.mjs routes", () => {
  it("GET /api/health returns ok", async () => {
    const { default: app } = await import("../../server/index.mjs");
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it("POST /api/stripe/webhook without a signature header is rejected", async () => {
    const { default: app } = await import("../../server/index.mjs");
    const response = await request(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ type: "checkout.session.completed" }));

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/signature/i);
  });

  it("POST /api/stripe/webhook with an invalid signature is rejected", async () => {
    const { default: app } = await import("../../server/index.mjs");
    const response = await request(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "t=1,v1=not-a-real-signature")
      .send(JSON.stringify({ type: "checkout.session.completed" }));

    expect(response.status).toBe(400);
  });

  it("POST /api/stripe/create-checkout rejects an empty request body", async () => {
    const { default: app } = await import("../../server/index.mjs");
    const response = await request(app)
      .post("/api/stripe/create-checkout")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid request body");
  });

  it("POST /api/stripe/create-checkout rejects an invalid payment plan", async () => {
    const { default: app } = await import("../../server/index.mjs");
    const response = await request(app)
      .post("/api/stripe/create-checkout")
      .send({
        boatId: "11111111-1111-1111-1111-111111111111",
        customerEmail: "customer@example.com",
        bookingDate: "2026-08-01",
        departureTime: "10:00",
        packageHours: 4,
        totalPrice: 500,
        paymentPlan: "not-a-real-plan",
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid request body");
  });
});
