import { describe, expect, it } from "vitest";
import { calculateRefundTier } from "../../server/booking-pricing.mjs";

describe("calculateRefundTier", () => {
  it("gives a full refund when 48 or more hours remain before the trip", () => {
    const result = calculateRefundTier({ hoursUntilTrip: 48, amountPaidCents: 10000 });
    expect(result.refundRatePercent).toBe(100);
    expect(result.refundAmountCents).toBe(10000);
  });

  it("gives a full refund with plenty of notice", () => {
    const result = calculateRefundTier({ hoursUntilTrip: 96, amountPaidCents: 5000 });
    expect(result.refundRatePercent).toBe(100);
    expect(result.refundAmountCents).toBe(5000);
  });

  it("gives a half refund when fewer than 48 hours remain", () => {
    const result = calculateRefundTier({ hoursUntilTrip: 47.9, amountPaidCents: 10000 });
    expect(result.refundRatePercent).toBe(50);
    expect(result.refundAmountCents).toBe(5000);
  });

  it("gives a half refund for a trip that already started", () => {
    const result = calculateRefundTier({ hoursUntilTrip: -5, amountPaidCents: 10000 });
    expect(result.refundRatePercent).toBe(50);
    expect(result.refundAmountCents).toBe(5000);
  });

  it("treats a missing trip date as the half-refund tier", () => {
    const result = calculateRefundTier({ hoursUntilTrip: null, amountPaidCents: 10000 });
    expect(result.refundRatePercent).toBe(50);
    expect(result.refundAmountCents).toBe(5000);
  });

  it("never returns a negative refund amount", () => {
    const result = calculateRefundTier({ hoursUntilTrip: 48, amountPaidCents: 0 });
    expect(result.refundAmountCents).toBe(0);
  });

  it("rounds the refund amount to the nearest cent", () => {
    const result = calculateRefundTier({ hoursUntilTrip: 10, amountPaidCents: 9999 });
    expect(result.refundRatePercent).toBe(50);
    expect(result.refundAmountCents).toBe(Math.round(9999 * 0.5));
  });
});
