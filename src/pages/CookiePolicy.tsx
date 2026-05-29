import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

export default function CookiePolicy() {
  const { tl } = useLanguage();

  return (
    <div className="min-h-screen bg-gradient-ocean py-4 sm:py-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <Link to="/">
          <Button variant="outline" className="mb-6">← {tl('Back to Home', 'Επιστροφή στην αρχική')}</Button>
        </Link>

        <div className="bg-white rounded-xl shadow-card p-6 sm:p-8 space-y-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-ocean mb-2">{tl('Cookie Policy', 'Πολιτική Cookies')}</h1>
            <p className="text-sm text-gray-500">{tl('Last updated: March 2026', 'Τελευταία ενημέρωση: Μάρτιος 2026')}</p>
          </div>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">1. What Are Cookies?</h2>
            <p className="text-gray-700 leading-relaxed">
              Cookies are small pieces of data stored on your device that help us remember information about you and enhance your browsing experience. Nautiplex uses cookies and similar tracking technologies to provide, maintain, protect and improve our services.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">2. Types of Cookies We Use</h2>
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-ocean mb-2">Essential Cookies</h3>
                <p className="text-gray-700">
                  These cookies are necessary for the platform to function properly. They enable core functionality such as user authentication, session management, and data persistence (e.g., remembering your bookings and chat history).
                </p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-ocean mb-2">Performance & Analytics Cookies</h3>
                <p className="text-gray-700">
                  These cookies help us understand how you use our platform by collecting anonymous usage data such as pages visited, click patterns, and session duration.
                </p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-ocean mb-2">Preference Cookies</h3>
                <p className="text-gray-700">
                  These cookies remember your preferences and settings to personalize your experience, such as language preference or location settings.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">3. Local Storage Usage</h2>
            <p className="text-gray-700 leading-relaxed">
              Nautiplex uses browser Local Storage to store information on your device, including:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Authentication tokens and user session data</li>
              <li>Booking information and history</li>
              <li>Chat messages and conversations</li>
              <li>User preferences and settings</li>
              <li>Review ratings and feedback</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              This data is stored securely in your browser and is not shared with third parties unless you explicitly authorize it.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">4. Third-Party Cookies</h2>
            <p className="text-gray-700 leading-relaxed">
              Nautiplex may use third-party services for analytics, payments (Stripe), and customer support. These services may place their own cookies on your device. We recommend reviewing their privacy policies:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Stripe: stripe.com/privacy</li>
              <li>Third-party analytics providers</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">5. Managing Cookies</h2>
            <p className="text-gray-700 leading-relaxed">
              You can control and manage cookies in your browser settings. However, please note that disabling essential cookies may affect the functionality of our platform.
            </p>
            <p className="text-gray-700 leading-relaxed mt-4">
              To manage cookies:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li><strong>Chrome:</strong> Settings → Privacy and Security → Cookies and other site data</li>
              <li><strong>Firefox:</strong> Preferences → Privacy & Security → Cookies and Site Data</li>
              <li><strong>Safari:</strong> Preferences → Privacy → Cookies and website data</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">6. Changes to This Cookie Policy</h2>
            <p className="text-gray-700 leading-relaxed">
              We may update this Cookie Policy from time to time. Any changes will be posted on this page with an updated "Last updated" date.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">7. Contact Us</h2>
            <p className="text-gray-700 leading-relaxed">
              If you have questions about this Cookie Policy, please contact us at:
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

