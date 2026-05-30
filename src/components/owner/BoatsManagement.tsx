import { Edit2, Trash2, Eye } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { getOwnerBoats, deleteOwnerBoat, updateOwnerBoat, OwnerBoat } from "../../lib/owner-dashboard";
import { buildBoatDetailsPath } from "@/lib/boats";
import { useToast } from "@/hooks/use-toast";

interface BoatsManagementProps {
  onAddBoat: () => void;
  onEditBoat: (boat: OwnerBoat) => void;
}

const BoatsManagement = ({ onAddBoat, onEditBoat }: BoatsManagementProps) => {
  const [boats, setBoats] = useState<OwnerBoat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const loadBoats = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);
        const nextBoats = await getOwnerBoats();
        setBoats(nextBoats);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load boats";
        setLoadError(message);
      } finally {
        setIsLoading(false);
      }
    };

    loadBoats();
  }, []);

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this boat?")) {
      await deleteOwnerBoat(id);
      setBoats((currentBoats) => currentBoats.filter((boat) => boat.id !== id));
    }
  };

  const toggleVisibility = async (boat: OwnerBoat) => {
    const nextStatus = boat.status === "active" ? "inactive" : "active";
    try {
      const updated = await updateOwnerBoat(boat.id, { status: nextStatus });
      if (updated) {
        setBoats((currentBoats) =>
          currentBoats.map((b) => (b.id === boat.id ? { ...b, status: nextStatus } : b)),
        );
      }
    } catch (error) {
      toast({
        title: "Could not change boat status",
        description: error instanceof Error ? error.message : "Add at least one package before making this boat active.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Manage Your Boats</CardTitle>
            <Button onClick={onAddBoat} className="bg-gradient-accent text-accent-foreground">
              Add Boat
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {loadError}
            </div>
          ) : null}

          {isLoading ? (
            <div className="grid grid-cols-1 gap-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={`boat-skeleton-${index}`} className="rounded-xl border border-border p-4 space-y-3">
                  <div className="h-5 w-40 rounded bg-muted animate-pulse" />
                  <div className="h-4 w-52 rounded bg-muted/80 animate-pulse" />
                  <div className="h-4 w-32 rounded bg-muted/70 animate-pulse" />
                </div>
              ))}
            </div>
          ) : boats.length > 0 ? (
            <div className="grid grid-cols-1 gap-4">
              {boats.map((boat) => (
                <div
                  key={boat.id}
                  className="rounded-xl border border-border p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div>
                        <img
                          src={boat.image}
                          alt={boat.name}
                          className="h-16 w-16 rounded-lg object-cover"
                        />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{boat.name}</p>
                        <p className="text-sm text-muted-foreground">{boat.type}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {boat.location} • {boat.capacity} guests
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {boat.skipperRequired ? (
                        <Badge variant="outline" className="text-[10px]">
                          Skipper required
                        </Badge>
                      ) : null}
                      {boat.externalCalendarUrl ? (
                        <Badge variant="outline" className="text-[10px]">
                          iCal sync
                        </Badge>
                      ) : null}
                      {boat.flashSaleEnabled ? (
                        <Badge variant="outline" className="text-[10px]">
                          Flash sale
                        </Badge>
                      ) : null}
                      {boat.partyReady ? (
                        <Badge variant="outline" className="text-[10px]">
                          Party ready
                        </Badge>
                      ) : null}
                      {/* Voucher feature removed */}
                      {boat.documents.length > 0 ? (
                        <Badge variant="outline" className="text-[10px]">
                          {boat.documents.length} papers uploaded
                        </Badge>
                      ) : null}
                      {boat.features.slice(0, 3).map((feature, idx) => (
                        <Badge key={idx} variant="outline" className="text-[10px]">
                          {feature}
                        </Badge>
                      ))}
                      {boat.features.length > 3 && (
                        <Badge variant="outline" className="text-[10px]">
                          +{boat.features.length - 3} more
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="text-right space-y-1">
                      <p className="text-sm text-muted-foreground">€{boat.pricePerDay} starting</p>
                      <div className="flex items-center justify-end gap-2">
                        <Badge className={boat.status === "active" ? "bg-emerald-500" : "bg-slate-400"}>
                          {boat.status}
                        </Badge>
                        <Button
                          size="xs" asChild variant="outline"
                          className="text-[11px] px-2 h-6"
                        >
                          <button type="button" onClick={() => toggleVisibility(boat)}>
                            {boat.status === "active" ? "Hide" : "Show"}
                          </button>
                        </Button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        asChild
                      >
                        <Link to={`/boats/${boat.id}?owner-preview=1`}>
                          <Eye className="h-4 w-4" />
                          View
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={() => onEditBoat(boat)}
                      >
                        <Edit2 className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2 text-red-500 hover:text-red-600"
                        onClick={() => handleDelete(boat.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No boats added yet. Start by adding your first boat!</p>
              <Button onClick={onAddBoat} className="bg-gradient-accent text-accent-foreground">
                Add Boat
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {!isLoading && boats.length > 0 && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Boat Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-border p-4">
                <p className="text-sm text-muted-foreground">Total Active Boats</p>
                <p className="text-2xl font-bold text-foreground mt-2">
                  {boats.filter((b) => b.status === "active").length}
                </p>
              </div>
              <div className="rounded-2xl border border-border p-4">
                <p className="text-sm text-muted-foreground">Total Bookings</p>
                <p className="text-2xl font-bold text-foreground mt-2">
                  {boats.reduce((sum, b) => sum + b.bookings, 0)}
                </p>
              </div>
              <div className="rounded-2xl border border-border p-4">
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold text-foreground mt-2">
                  €{boats.reduce((sum, b) => sum + b.revenue, 0).toLocaleString()}
                </p>
              </div>
              <div className="rounded-2xl border border-border p-4">
                <p className="text-sm text-muted-foreground">Average Rating</p>
                <p className="text-2xl font-bold text-foreground mt-2">
                  {boats.length > 0 ? (boats.reduce((sum, b) => sum + b.rating, 0) / boats.length).toFixed(1) : "0.0"}★
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BoatsManagement;
