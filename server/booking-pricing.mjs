const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const FLASH_SALE_WINDOW_MS = 24 * 60 * 60 * 1000;
const FLASH_SALE_DISCOUNT_RATE = 0.3;

const isValidTime = (value) => TIME_REGEX.test(String(value ?? ""));

const buildDepartureDateTime = (bookingDate, departureTime) => {
  if (!bookingDate || !isValidTime(departureTime)) {
    return null;
  }

  const departureDateTime = new Date(`${bookingDate}T${departureTime}:00`);
  return Number.isNaN(departureDateTime.getTime()) ? null : departureDateTime;
};

export const resolveBoatVoucherPricing = ({
  baseTotalPrice,
  bookingDate,
  departureTime,
  flashSaleEnabled,
  paymentPlan,
}) => {
  // Vouchers removed: subtotal equals base total and no voucher discount applied.
  const subtotalAfterVoucher = Math.max(baseTotalPrice, 0);

  const departureDateTime = buildDepartureDateTime(bookingDate, departureTime);
  const flashSaleEligible = Boolean(
    flashSaleEnabled &&
      departureDateTime &&
      departureDateTime.getTime() > Date.now() &&
      departureDateTime.getTime() - Date.now() <= FLASH_SALE_WINDOW_MS,
  );

  const flashSaleDiscount = flashSaleEligible
    ? Math.round(subtotalAfterVoucher * FLASH_SALE_DISCOUNT_RATE)
    : 0;
  const discountedTotal = Math.max(subtotalAfterVoucher - flashSaleDiscount, 0);
  const depositAmount = paymentPlan === "deposit" ? Math.round(discountedTotal * 0.3) : 0;
  const amountDueNow = paymentPlan === "deposit" ? depositAmount : discountedTotal;

  return {
    subtotalAfterVoucher,
    flashSaleEligible,
    flashSaleDiscount,
    discountedTotal,
    depositAmount,
    amountDueNow,
  };
};

// Cancellation refund tiers: full refund 48+ hours before the trip, half refund otherwise.
export const calculateRefundTier = ({ hoursUntilTrip, amountPaidCents }) => {
  const refundRatePercent =
    hoursUntilTrip !== null && hoursUntilTrip !== undefined && Number.isFinite(hoursUntilTrip) && hoursUntilTrip >= 48
      ? 100
      : 50;
  const refundAmountCents = Math.max(0, Math.round(Number(amountPaidCents ?? 0) * (refundRatePercent / 100)));

  return { refundRatePercent, refundAmountCents };
};
