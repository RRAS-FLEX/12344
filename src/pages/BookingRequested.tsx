import { Link, useSearchParams } from "react-router-dom";
import { PhoneCall } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const BookingRequested = () => {
  const [searchParams] = useSearchParams();
  const boat = searchParams.get("boat") ?? "this boat";
  const date = searchParams.get("date") ?? "";
  const departure = searchParams.get("departure") ?? "";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-20 pb-12">
        <section className="container mx-auto px-4 max-w-3xl">
          <Card className="shadow-card-hover">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PhoneCall className="h-5 w-5 text-aegean" />
                Request sent
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                We've received your booking request. No payment has been taken — an admin will call the owner to confirm availability, then email you the details.
              </p>
              <p className="text-sm text-foreground">
                Boat: <strong>{boat}</strong>
                {date ? <> • Date: <strong>{date}</strong></> : null}
                {departure ? <> • Departure: <strong>{departure}</strong></> : null}
              </p>

              <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-2">
                <p className="text-sm font-medium text-foreground">What happens next</p>
                <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                  <li>An admin phones the owner to confirm this slot is open.</li>
                  <li>If confirmed, you'll receive an email with your booking details.</li>
                  <li>If not, we'll check other options and follow up.</li>
                </ul>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <Button asChild>
                  <Link to="/boats">Browse other boats</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/">Back to home</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default BookingRequested;
