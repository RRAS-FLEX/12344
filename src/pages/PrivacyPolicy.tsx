import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

export default function PrivacyPolicy() {
  const { tl } = useLanguage();

  return (
    <div className="min-h-screen bg-gradient-ocean py-4 sm:py-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <Link to="/">
          <Button variant="outline" className="mb-6">← {tl('Back to Home', 'Επιστροφή στην αρχική')}</Button>
        </Link>

        <div className="bg-white rounded-xl shadow-card p-6 sm:p-8 space-y-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-ocean mb-2">{tl('Privacy Policy', 'Πολιτική Απορρήτου')}</h1>
            <p className="text-sm text-gray-500">{tl('Last updated: March 2026', 'Τελευταία ενημέρωση: Μάρτιος 2026')}</p>
          </div>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">1. Introduction</h2>
            <p className="text-gray-700 leading-relaxed">
              Nautiplex ("we", "us", "our", or "Company") operates the Nautiplex platform. This page informs you of our policies regarding the collection, use, and disclosure of personal data when you use our Service and the choices you have associated with that data.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">2. Information Collection and Use</h2>
            <p className="text-gray-700 leading-relaxed">
              We collect several different types of information for various purposes to provide and improve our Service to you.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-ocean">Types of Data Collected:</h3>
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                <li><strong>Account Information:</strong> Email address, name, phone number, boat details (for owners)</li>
                <li><strong>Location Data:</strong> GPS coordinates (with permission) to calculate distance to boats</li>
                <li><strong>Booking Information:</strong> Dates, times, boat selections, payment details</li>
                <li><strong>Communication Data:</strong> Messages sent via our in-app chat system</li>
                <li><strong>Usage Data:</strong> Pages visited, time spent, devices used, browser type</li>
              </ul>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">3. Use of Data</h2>
            <p className="text-gray-700 leading-relaxed">
              Nautiplex uses the collected data for various purposes:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>To provide and maintain our Service</li>
              <li>To notify you about changes to our Service</li>
              <li>To allow you to participate in interactive features of our Service</li>
              <li>To provide customer support</li>
              <li>To gather analysis or valuable information to improve our Service</li>
              <li>To monitor the usage of our Service</li>
              <li>To detect, prevent and address technical issues</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">4. Security of Data</h2>
            <p className="text-gray-700 leading-relaxed">
              The security of your data is important to us but remember that no method of transmission over the Internet or method of electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your personal data, we cannot guarantee its absolute security.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">5. Changes to This Privacy Policy</h2>
            <p className="text-gray-700 leading-relaxed">
              We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date at the top of this Privacy Policy.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">6. Contact Us</h2>
            <p className="text-gray-700 leading-relaxed">
              If you have any questions about this Privacy Policy, please contact us at:
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-gray-700">Email: privacy@nautiplex.com</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

