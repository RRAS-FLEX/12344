import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

export default function TermsOfService() {
  const { tl } = useLanguage();

  return (
    <div className="min-h-screen bg-gradient-ocean py-4 sm:py-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <Link to="/">
          <Button variant="outline" className="mb-6">← {tl('Back to Home', 'Επιστροφή στην αρχική')}</Button>
        </Link>

        <div className="bg-white rounded-xl shadow-card p-6 sm:p-8 space-y-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-ocean mb-2">{tl('Terms of Service', 'Όροι Χρήσης')}</h1>
            <p className="text-sm text-gray-500">{tl('Last updated: March 2026', 'Τελευταία ενημέρωση: Μάρτιος 2026')}</p>
          </div>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">1. Agreement to Terms</h2>
            <p className="text-gray-700 leading-relaxed">
              By accessing and using the Nautiplex platform, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">2. Use License</h2>
            <p className="text-gray-700 leading-relaxed">
              Permission is granted to temporarily download one copy of the materials (information or software) on Nautiplex's platform for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Modify or copy the materials</li>
              <li>Use the materials for any commercial purpose or for any public display</li>
              <li>Attempt to decompile or reverse engineer any software contained on the platform</li>
              <li>Remove any copyright or other proprietary notations from the materials</li>
              <li>Transfer the materials to another person or "mirror" the materials on any other server</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">3. Disclaimer</h2>
            <p className="text-gray-700 leading-relaxed">
              The materials on Nautiplex's platform are provided on an 'as is' basis. Nautiplex makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">4. Limitations</h2>
            <p className="text-gray-700 leading-relaxed">
              In no event shall Nautiplex or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on Nautiplex's platform, even if Nautiplex or an authorized representative has been notified orally or in writing of the possibility of such damage.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">5. Accuracy of Materials</h2>
            <p className="text-gray-700 leading-relaxed">
              The materials appearing on Nautiplex's platform could include technical, typographical, or photographic errors. Nautiplex does not warrant that any of the materials on its platform are accurate, complete, or current. Nautiplex may make changes to the materials contained on its platform at any time without notice.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">6. Links</h2>
            <p className="text-gray-700 leading-relaxed">
              Nautiplex has not reviewed all of the sites linked to its platform and is not responsible for the contents of any such linked site. The inclusion of any link does not imply endorsement by Nautiplex of the site. Use of any such linked website is at the user's own risk.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">7. Modifications</h2>
            <p className="text-gray-700 leading-relaxed">
              Nautiplex may revise these terms of service for its platform at any time without notice. By using this platform, you are agreeing to be bound by the then current version of these terms of service.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">8. Governing Law</h2>
            <p className="text-gray-700 leading-relaxed">
              These terms and conditions are governed by and construed in accordance with the laws of Greece, and you irrevocably submit to the exclusive jurisdiction of the courts in that location.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-ocean">9. Contact Us</h2>
            <p className="text-gray-700 leading-relaxed">
              If you have any questions about these Terms of Service, please contact us at:
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-gray-700">Email: legal@nautiplex.com</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

