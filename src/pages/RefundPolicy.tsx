import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

export default function RefundPolicy() {
  const { tl } = useLanguage();

  return (
    <div className="min-h-screen bg-gradient-ocean py-4 sm:py-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <Link to="/">
          <Button variant="outline" className="mb-6">← {tl('Back to Home', 'Επιστροφή στην αρχική')}</Button>
        </Link>

        <div className="bg-white rounded-xl shadow-card p-6 sm:p-8 space-y-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-ocean mb-2">{tl('Refund Policy', 'Πολιτική Επιστροφών')}</h1>
            <p className="text-sm text-gray-500">{tl('Last updated: March 2026', 'Τελευταία ενημέρωση: Μάρτιος 2026')}</p>
          </div>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">1. Overview</h2>
            <p className="text-gray-700 leading-relaxed">
              At Nautiplex, we want you to be completely satisfied with your boat rental experience. This Refund Policy outlines the terms and conditions for refunds, cancellations, and modifications to your booking.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">2. Cancellation Policy</h2>
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <h3 className="font-semibold text-emerald-900 mb-2">75+ Days Before Departure</h3>
                <p className="text-gray-700">100% refund of the booking amount minus a 5% administrative fee.</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">30-75 Days Before Departure</h3>
                <p className="text-gray-700">50% refund of the booking amount.</p>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <h3 className="font-semibold text-orange-900 mb-2">Less Than 30 Days Before Departure</h3>
                <p className="text-gray-700">No refund available. However, you may modify your booking dates if available.</p>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">3. How to Request a Refund</h2>
            <p className="text-gray-700 leading-relaxed">
              To request a refund, please:
            </p>
            <ol className="list-decimal list-inside space-y-2 text-gray-700">
              <li>Go to your booking confirmation</li>
              <li>Select "Request Cancellation" from the options menu</li>
              <li>Provide a reason for cancellation (optional)</li>
              <li>Confirm your cancellation request</li>
            </ol>
            <p className="text-gray-700 leading-relaxed mt-4">
              You will receive a confirmation email with your refund details and timeline.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">4. Refund Processing Timeline</h2>
            <p className="text-gray-700 leading-relaxed">
              Approved refunds will be processed within 5-10 business days from the date of cancellation. The refund will be returned to your original payment method. Please allow additional time for your bank or payment provider to reflect the credit.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">5. Modification of Booking</h2>
            <p className="text-gray-700 leading-relaxed">
              If you need to modify your booking dates, you may do so at no additional charge if the new dates are available. If the new dates result in a higher price, you will be charged the difference. If the new dates result in a lower price, the difference will be credited to your account.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">6. Non-Refundable Fees</h2>
            <p className="text-gray-700 leading-relaxed">
              The following fees are non-refundable:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Nautiplex service fees (platform maintenance and support)</li>
              <li>Insurance upgrades (unless otherwise agreed by the boat owner)</li>
              <li>Third-party payment processing fees</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">7. Owner Cancellation</h2>
            <p className="text-gray-700 leading-relaxed">
              In the rare event that a boat owner cancels your booking, you will receive a 100% refund regardless of the cancellation window. Additionally, you will be offered a 10% discount on your next booking as a gesture of goodwill.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">8. Disputes and Chargebacks</h2>
            <p className="text-gray-700 leading-relaxed">
              If you initiate a chargeback with your bank or payment provider, Nautiplex reserves the right to suspend your account and pursue legal action. We encourage all disputes to be resolved through our customer support team first.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">9. Exceptional Circumstances</h2>
            <p className="text-gray-700 leading-relaxed">
              In exceptional circumstances such as severe weather, natural disasters, or government travel restrictions, Nautiplex may provide full refunds or rebooking options outside of the standard cancellation policy. Please contact customer support for assistance.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">10. Contact Us</h2>
            <p className="text-gray-700 leading-relaxed">
              If you have questions about this Refund Policy or need to request a refund, please contact us at:
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-gray-700">Email: support@nautiplex.com</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

