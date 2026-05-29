import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

export default function BoatOwnerAgreement() {
  const { tl } = useLanguage();

  return (
    <div className="min-h-screen bg-gradient-ocean py-4 sm:py-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <Link to="/">
          <Button variant="outline" className="mb-6">← {tl('Back to Home', 'Επιστροφή στην αρχική')}</Button>
        </Link>

        <div className="bg-white rounded-xl shadow-card p-6 sm:p-8 space-y-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-ocean mb-2">{tl('Boat Owner Agreement', 'Συμφωνία Ιδιοκτήτη Σκάφους')}</h1>
            <p className="text-sm text-gray-500">{tl('Last updated: March 2026', 'Τελευταία ενημέρωση: Μάρτιος 2026')}</p>
          </div>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">1. Overview</h2>
            <p className="text-gray-700 leading-relaxed">
              This Boat Owner Agreement ("Agreement") establishes the terms and conditions under which boat owners ("Owner") may list and rent their vessels through the Nautiplex platform ("Platform") to customers ("Renter" or "Guest").
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">2. Owner Eligibility</h2>
            <p className="text-gray-700 leading-relaxed">
              To list a boat on Nautiplex, you must:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Be at least 21 years old</li>
              <li>Have legal proof of boat ownership or authorization to rent the vessel</li>
              <li>Possess all required boating licenses and permits</li>
              <li>Comply with all local maritime laws and regulations</li>
              <li>Maintain comprehensive boat insurance covering rental activities</li>
              <li>Provide accurate and truthful information in your boat listing</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">3. Boat Listing Requirements</h2>
            <p className="text-gray-700 leading-relaxed">
              All boats listed on the Platform must:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Be in safe, clean, and seaworthy condition</li>
              <li>Meet all local maritime safety standards</li>
              <li>Have current safety certifications and maintenance records</li>
              <li>Be equipped with required safety equipment (life jackets, fire extinguishers, first aid kits, etc.)</li>
              <li>Have clear, accurate photos and detailed description</li>
              <li>Disclose all known defects or limitations</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">4. Pricing and Payments</h2>
            <p className="text-gray-700 leading-relaxed">
              <strong>Revenue Split:</strong> Nautiplex retains 20% of the booking price as a service fee. You will receive 80% of the rented amount minus any applicable taxes and processing fees.
            </p>
            <p className="text-gray-700 leading-relaxed mt-4">
              Payments are processed through our secure payment system and transferred to your linked bank account within 5-10 business days after each booking completion.
            </p>
            <p className="text-gray-700 leading-relaxed mt-4">
              You are responsible for setting competitive pricing, managing discounts, and defining your own cancellation policy within the guidelines set by Nautiplex.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">5. Booking Management and Cancellation</h2>
            <p className="text-gray-700 leading-relaxed">
              As an owner, you are responsible for:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Managing your availability calendar</li>
              <li>Confirming or declining booking requests in a timely manner</li>
              <li>Communicating clearly with renters through the Platform</li>
              <li>Only canceling bookings with valid reason (emergencies, safety concerns, etc.)</li>
              <li>Providing at least 48 hours notice for owner-initiated cancellations</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              Cancellations requested outside of the cancellation window may result in financial penalties or suspension from the platform.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">6. Guest Safety and Liability</h2>
            <p className="text-gray-700 leading-relaxed">
              As the boat owner, you are responsible for ensuring:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Your boat is safe and suitable for the intended rental period</li>
              <li>Renters are provided with clear safety instructions</li>
              <li>All required safety equipment is present and functional</li>
              <li>Your insurance coverage is adequate and includes rental activities</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              <strong>Liability:</strong> You assume all liability for injuries, damages, or losses that occur during rental periods. Nautiplex is not responsible for damages to your boat, injuries to renters, or property loss during rentals.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">7. Insurance Requirements</h2>
            <p className="text-gray-700 leading-relaxed">
              You must maintain comprehensive boat insurance that explicitly covers rental activities. Insurance must include:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Hull and machinery coverage</li>
              <li>Liability coverage (minimum 1,000,000 EUR)</li>
              <li>Coverage for damage caused by renters</li>
              <li>Third-party injury coverage</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              Nautiplex reserves the right to request proof of insurance. Operating a boat on the Platform without adequate insurance may result in immediate suspension.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">8. Damage, Maintenance, and Loss</h2>
            <p className="text-gray-700 leading-relaxed">
              Renters are responsible for damages caused by negligence or misuse. As the owner, you should:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Document the boat's condition before each rental with photos/video</li>
              <li>Request security deposits from renters (amount determined by you)</li>
              <li>Report damages or issues immediately through the Platform</li>
              <li>File claims with the renter's insurance or through Nautiplex's dispute resolution process</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              Nautiplex does not act as an intermediary for damage claims but provides tools to facilitate dispute resolution.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">9. Rating and Review Guidelines</h2>
            <p className="text-gray-700 leading-relaxed">
              Renters may leave reviews of your boat and service. You must:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Accept ratings and reviews in good faith</li>
              <li>Respond professionally to feedback and complaints</li>
              <li>Not solicit false reviews or sabotage competitor listings</li>
              <li>Maintain a professional communication standard with renters</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              Owners with sustained low ratings may be removed from the Platform at Nautiplex's discretion.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">10. Suspension and Termination</h2>
            <p className="text-gray-700 leading-relaxed">
              Nautiplex may suspend or terminate your listing if you:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Violate the terms of this Agreement</li>
              <li>Operate a boat that does not meet safety standards</li>
              <li>Fail to maintain required insurance</li>
              <li>Engage in fraudulent activity or misrepresentation</li>
              <li>Repeatedly cancel bookings without valid reason</li>
              <li>Breach guest safety or privacy</li>
              <li>Receive sustained complaints from renters</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              In cases of immediate safety risk, Nautiplex may suspend your listing without warning.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">11. Disputes and Mediation</h2>
            <p className="text-gray-700 leading-relaxed">
              Any disputes between you and a renter should be resolved through the Platform's messaging system. If direct resolution is not possible, Nautiplex offers a mediation service. Both parties agree to attempt mediation before pursuing legal action.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">12. Changes to This Agreement</h2>
            <p className="text-gray-700 leading-relaxed">
              Nautiplex may modify this Agreement at any time. We will provide 30 days' notice of material changes. Continued use of the Platform signifies acceptance of updated terms.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">13. Contact Us</h2>
            <p className="text-gray-700 leading-relaxed">
              For questions about this Boat Owner Agreement or to report issues, please contact our Owner Support team:
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-gray-700">Email: owners@nautiplex.com</p>
              <p className="text-gray-700 mt-2">Phone: Available through your owner dashboard</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

