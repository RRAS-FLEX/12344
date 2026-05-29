import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Mail, MessageSquare, PhoneCall, Send } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { buildBoatDetailsPath, getBoatByPublicReference } from "@/lib/boats";
import type { Boat } from "@/lib/boats";
import { useLanguage } from "@/contexts/LanguageContext";

const ContactOwner = () => {
  const { tl } = useLanguage();
  const [searchParams] = useSearchParams();
  const boatReference = searchParams.get("boatRef") ?? searchParams.get("boatId");
  const boatNameFromQuery = searchParams.get("boat") ?? "the selected boat";
  const [boat, setBoat] = useState<Boat | null>(null);

  useEffect(() => {
    if (boatReference) getBoatByPublicReference(boatReference).then(setBoat);
  }, [boatReference]);

  const boatName = boat?.name ?? boatNameFromQuery;
  const returnLink = boat ? buildBoatDetailsPath(boat) : "/boats";
  const phoneNumber = "+302100000000";
  const ownerMessage = encodeURIComponent(
    `Hi, I am interested in ${boatName}. Could you share availability and trip options?`,
  );
  const whatsappLink = `https://wa.me/${phoneNumber.replace(/\D/g, "")}?text=${ownerMessage}`;
  const viberLink = `viber://chat?number=${encodeURIComponent(phoneNumber)}`;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-16">
        <section className="border-b border-border bg-gradient-ocean py-14 md:py-18">
          <div className="container mx-auto px-4">
            <p className="text-primary-foreground/80 text-sm mb-2">Owner contact</p>
            <h1 className="text-3xl md:text-5xl font-heading font-bold text-primary-foreground mb-4">
              {tl("Contact the owner directly", "Επικοινώνησε απευθείας με τον ιδιοκτήτη")}
            </h1>
            <p className="text-primary-foreground/70 max-w-2xl">
              {tl("Ask questions about availability, route options, and trip details for", "Κάνε ερωτήσεις για διαθεσιμότητα, διαδρομές και λεπτομέρειες ταξιδιού για")} {boatName}.
            </p>
          </div>
        </section>

        <section className="py-10 md:py-12">
          <div className="container mx-auto px-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 shadow-card-hover">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-aegean" />
                  {tl("Send message", "Αποστολή μηνύματος")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input placeholder={tl("Your full name", "Το ονοματεπώνυμό σου")} />
                  <Input placeholder={tl("Your email", "Το email σου")} type="email" />
                </div>
                <Input value={boatName} readOnly />
                <Textarea placeholder={tl("Hi! I'd like to know if this boat is available for a sunset trip next week...", "Γεια σας! Θα ήθελα να μάθω αν αυτό το σκάφος είναι διαθέσιμο για sunset εκδρομή την επόμενη εβδομάδα...")} />
                <Button className="bg-gradient-accent text-accent-foreground gap-2">
                  <Send className="h-4 w-4" />
                  {tl("Send to owner", "Αποστολή στον ιδιοκτήτη")}
                </Button>
              </CardContent>
            </Card>

            <Card className="shadow-card h-fit">
              <CardHeader>
                <CardTitle>{tl("Other ways to reach owner", "Άλλοι τρόποι επικοινωνίας")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">{boat?.owner.name ?? "Nautiplex host team"}</p>
                <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-aegean" />owner@nautiplex.com</p>
                <p className="flex items-center gap-2"><PhoneCall className="h-4 w-4 text-aegean" />{phoneNumber}</p>
                <div className="grid grid-cols-1 gap-3">
                  <Button asChild className="w-full bg-[#25D366] text-white hover:bg-[#25D366]/90">
                    <a href={whatsappLink} target="_blank" rel="noreferrer">{tl("WhatsApp Owner", "WhatsApp ιδιοκτήτη")}</a>
                  </Button>
                  <Button asChild variant="outline" className="w-full border-[#7360F2] text-[#5b4bc4] hover:bg-[#7360F2]/10 hover:text-[#5b4bc4]">
                    <a href={viberLink}>{tl("Message on Viber", "Μήνυμα στο Viber")}</a>
                  </Button>
                </div>
                <Button asChild variant="outline" className="w-full">
                  <Link to={returnLink}>{tl("Back to boat profile", "Επιστροφή στο προφίλ σκάφους")}</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default ContactOwner;

