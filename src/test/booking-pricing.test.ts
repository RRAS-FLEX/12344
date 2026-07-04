import { describe, expect, it, vi, afterEach } from "vitest";
import { resolveBoatVoucherPricing } from "../../server/booking-pricing.mjs";

const toLocalDatePart = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toLocalTimePart = (date: Date) => {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};

afterEach(() => {
  vi.useRealTimers();
});

describe("resolveBoatVoucherPricing", () => {
  it("charges the full base price when flash sale is disabled", () => {
    vi.useFakeTimers();
    const now = new Date(2026, 3, 26, 10, 0, 0);
    vi.setSystemTime(now);
    const departure = new Date(now.getTime() + 6 * 60 * 60 * 1000);

    const result = resolveBoatVoucherPricing({
      baseTotalPrice: 1000,
      bookingDate: toLocalDatePart(departure),
      departureTime: toLocalTimePart(departure),
      flashSaleEnabled: false,
      paymentPlan: "full",
    });

    expect(result.subtotalAfterVoucher).toBe(1000);
    expect(result.flashSaleEligible).toBe(false);
    expect(result.flashSaleDiscount).toBe(0);
    expect(result.discountedTotal).toBe(1000);
    expect(result.depositAmount).toBe(0);
    expect(result.amountDueNow).toBe(1000);
  });

  it("applies the flash sale discount when eligible", () => {
    vi.useFakeTimers();
    const now = new Date(2026, 3, 26, 10, 0, 0);
    vi.setSystemTime(now);
    const departure = new Date(now.getTime() + 6 * 60 * 60 * 1000);

    const result = resolveBoatVoucherPricing({
      baseTotalPrice: 1000,
      bookingDate: toLocalDatePart(departure),
      departureTime: toLocalTimePart(departure),
      flashSaleEnabled: true,
      paymentPlan: "full",
    });

    expect(result.flashSaleEligible).toBe(true);
    expect(result.flashSaleDiscount).toBe(300);
    expect(result.discountedTotal).toBe(700);
    expect(result.amountDueNow).toBe(700);
  });

  it("charges a 30% deposit against the discounted total on the deposit plan", () => {
    vi.useFakeTimers();
    const now = new Date(2026, 3, 26, 10, 0, 0);
    vi.setSystemTime(now);
    const departure = new Date(now.getTime() + 30 * 60 * 60 * 1000);

    const result = resolveBoatVoucherPricing({
      baseTotalPrice: 1000,
      bookingDate: toLocalDatePart(departure),
      departureTime: toLocalTimePart(departure),
      flashSaleEnabled: false,
      paymentPlan: "deposit",
    });

    expect(result.discountedTotal).toBe(1000);
    expect(result.depositAmount).toBe(300);
    expect(result.amountDueNow).toBe(300);
  });

  it("never returns a negative subtotal for a negative base price", () => {
    const result = resolveBoatVoucherPricing({
      baseTotalPrice: -50,
      bookingDate: "2026-05-01",
      departureTime: "10:00",
      flashSaleEnabled: false,
      paymentPlan: "full",
    });

    expect(result.subtotalAfterVoucher).toBe(0);
    expect(result.discountedTotal).toBe(0);
    expect(result.amountDueNow).toBe(0);
  });
});
