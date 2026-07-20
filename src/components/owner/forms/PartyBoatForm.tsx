import { useEffect, useRef, useState } from "react";
import { UploadCloud, X, Loader2 } from "lucide-react";
import { Button } from "../../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Checkbox } from "../../ui/checkbox";
import { Textarea } from "../../ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import {
  addOwnerBoat,
  updateOwnerBoat,
  listBoatExtras,
  listBoatPackages,
  saveBoatExtras,
  saveBoatPackages,
  OwnerBoat,
} from "../../../lib/owner-dashboard";
import { getBoatLocations, formatBoatLocationLabel, type BoatLocation } from "@/lib/boat-locations";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";

interface PartyBoatFormProps {
  onClose: () => void;
  boat?: OwnerBoat;
  onSubmit?: () => void;
}

interface TicketType {
  id: string;
  name: string;
  price: number;
  description: string;
  benefits: string[];
  discount?: number;
  discountType?: "fixed" | "percentage";
}

const PARTY_TYPE_OPTIONS = ["Party Boat", "Watersports Charter"];
const PARTY_AMENITIES = [
  "Dance Floor",
  "Sound System",
  "Lighting",
  "Bar Setup",
  "Catering Ready",
  "WiFi",
  "Bathroom",
  "Private Area",
  "Sunbathing Deck",
  "BBQ Area",
];

const COMMON_BENEFITS = [
  "Premium Food & Drinks",
  "VIP Seating",
  "Exclusive DJ Access",
  "Photography Service",
  "Early Access",
  "Guest Spot on Stage",
  "Champagne Upgrade",
  "Private Table",
];

const createLocalId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `extra-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const PartyBoatForm = ({ onClose, boat, onSubmit }: PartyBoatFormProps) => {
  const { tl } = useLanguage();
  const { toast } = useToast();
  const isEdit = Boolean(boat);
  const [currentStep, setCurrentStep] = useState(1);
  const activeBoatIdRef = useRef<string | null>(boat?.id ?? null);
  const [planType, setPlanType] = useState<"basic" | "custom">(boat?.partyTiers ? "custom" : "basic");
  const [locationOptions, setLocationOptions] = useState<BoatLocation[]>([]);

  const [formData, setFormData] = useState({
    locationId: boat?.locationId ?? "",
    name: boat?.name ?? "",
    type: boat?.type ?? "Party Boat",
    location: boat?.location ?? "Thassos",
    description: boat?.description ?? "",
    departureMarina: boat?.departureMarina ?? "",
    capacity: boat?.capacity ?? 20,
    pricePerEvent: boat?.ticketPricePerPerson ?? 120,
    maxEventHours: 8,
    eventSetupTime: 1,
    mapQuery: boat?.mapQuery ?? "",
    image: boat?.image ?? "",
    status: boat?.status ?? "active",
    partyEventDate: boat?.partyEventDate ?? "",
    partyEventTime: boat?.partyEventTime ?? "10:00",
  });

  const [amenities, setAmenities] = useState<string[]>(boat?.features ?? []);
  const [localImagePreview, setLocalImagePreview] = useState<string>("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [extras, setExtras] = useState<Array<{ id: string; name: string; price: number }>>([]);
  const [packages, setPackages] = useState<Array<{ id: string; name: string; duration: number; price: number; description: string }>>([]);
  
  // Custom plan ticket types
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>(
    boat?.partyTiers && Array.isArray(boat.partyTiers)
      ? boat.partyTiers.map((tier) => ({
          id: createLocalId(),
          name: tier.name,
          price: tier.price,
          description: "",
          benefits: [],
          discount: 0,
          discountType: "fixed",
        }))
      : []
  );
  
  // Form for adding new ticket type
  const [newTicketType, setNewTicketType] = useState<Partial<TicketType>>({
    name: "",
    price: 0,
    description: "",
    benefits: [],
    discount: 0,
    discountType: "fixed",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const ticketPricePerPerson = Number(formData.pricePerEvent);
  const eventTotalValue = ticketPricePerPerson * Math.max(1, Number(formData.capacity) || 1);

  useEffect(() => {
    if (!boat?.id || activeBoatIdRef.current === boat.id) {
      return;
    }

    activeBoatIdRef.current = boat.id;
    setCurrentStep(1);
    setPlanType(boat.partyTiers && boat.partyTiers.length > 0 ? "custom" : "basic");
    setFormData({
      locationId: boat?.locationId ?? "",
      name: boat?.name ?? "",
      type: boat?.type ?? "Party Boat",
      location: boat?.location ?? "Thassos",
      description: boat?.description ?? "",
      departureMarina: boat?.departureMarina ?? "",
      capacity: boat?.capacity ?? 20,
      pricePerEvent: boat?.ticketPricePerPerson ?? 120,
      maxEventHours: 8,
      eventSetupTime: 1,
      mapQuery: boat?.mapQuery ?? "",
      image: boat?.image ?? "",
      status: boat?.status ?? "active",
      partyEventDate: boat?.partyEventDate ?? "",
      partyEventTime: boat?.partyEventTime ?? "",
    });
    setAmenities(boat?.features ?? []);
    setLocalImagePreview("");
    setImageFile(null);
    setTicketTypes(
      boat?.partyTiers && Array.isArray(boat.partyTiers)
        ? boat.partyTiers.map((tier) => ({
            id: createLocalId(),
            name: tier.name,
            price: tier.price,
            description: "",
            benefits: [],
            discount: 0,
            discountType: "fixed",
          }))
        : [],
    );
    setNewTicketType({
      name: "",
      price: 0,
      description: "",
      benefits: [],
      discount: 0,
      discountType: "fixed",
    });
  }, [boat]);

  useEffect(() => {
    let cancelled = false;

    const loadLocations = async () => {
      const options = await getBoatLocations();
      if (cancelled) return;
      setLocationOptions(options);

      if (!formData.locationId && options.length > 0) {
        const first = options[0];
        setFormData((current) => ({
          ...current,
          locationId: first.id,
          location: first.location,
          departureMarina: first.name,
          mapQuery: first.mapQuery || formatBoatLocationLabel(first),
        }));
      }
    };

    void loadLocations();

    return () => {
      cancelled = true;
    };
    // Load location options once on mount; formData.locationId is only read here
    // to avoid overwriting an existing selection, not to re-trigger the fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadExtrasAndPackages = async () => {
      if (!boat?.id) {
        setExtras([]);
        setPackages([]);
        return;
      }

      try {
        const [nextExtras, nextPackages] = await Promise.all([
          listBoatExtras(boat.id),
          listBoatPackages(boat.id),
        ]);
        if (!cancelled) {
          setExtras(nextExtras.map((extra) => ({ ...extra, id: extra.id || createLocalId() })));
          setPackages(
            nextPackages.map((pkg) => ({
              ...pkg,
              id: pkg.id || createLocalId(),
            })),
          );
        }
      } catch {
        if (!cancelled) {
          setExtras([]);
          setPackages([]);
        }
      }
    };

    loadExtrasAndPackages();

    return () => {
      cancelled = true;
    };
  }, [boat?.id]);

  const compressImageFile = async (file: File): Promise<File> => {
    try {
      if (typeof window === "undefined" || typeof document === "undefined") return file;
      if (!file.type.startsWith("image/")) return file;
      if (file.size <= 800_000) return file;

      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      return await new Promise<File>((resolve) => {
        img.onload = () => {
          URL.revokeObjectURL(objectUrl);

          const maxWidth = 1600;
          const maxHeight = 1600;
          let width = img.width;
          let height = img.height;

          const scale = Math.min(maxWidth / width, maxHeight / height, 1);
          width = Math.round(width * scale);
          height = Math.round(height * scale);

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(file);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                resolve(file);
                return;
              }

              const optimized = new File([blob], file.name, {
                type: blob.type || file.type,
                lastModified: Date.now(),
              });

              resolve(optimized);
            },
            "image/jpeg",
            0.8,
          );
        };

        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          resolve(file);
        };

        img.src = objectUrl;
      });
    } catch {
      return file;
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const compressedFile = await compressImageFile(file);
    setImageFile(compressedFile);

    const reader = new FileReader();
    reader.onload = (event) => {
      setLocalImagePreview(event.target?.result as string);
    };
    reader.readAsDataURL(compressedFile);
  };

  const handleSavePartyBoat = async () => {
    if (!formData.name.trim()) {
      toast({
        title: tl("Missing event name", "Λείπει όνομα εκδήλωσης"),
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);

      // Convert ticket types to party tiers format
      const partyTiers = planType === "custom" && ticketTypes.length > 0
        ? ticketTypes.map((tier) => ({
            name: tier.name,
            price: tier.price,
          }))
        : [];

      const boatInput = {
        locationId: formData.locationId || null,
        name: formData.name,
        type: formData.type,
        location: formData.location,
        description: formData.description,
        departureMarina: formData.departureMarina,
        capacity: Number(formData.capacity),
        pricePerDay: Number.isFinite(eventTotalValue) ? Number(eventTotalValue.toFixed(2)) : 0,
        ticketMaxPeople: Number(formData.capacity),
        ticketPricePerPerson: Number.isFinite(ticketPricePerPerson) ? Number(ticketPricePerPerson.toFixed(2)) : 0,
        mapQuery: formData.mapQuery,
        partyReady: true,
        partyEventDate: formData.partyEventDate || null,
        partyEventTime: formData.partyEventTime || null,
        partyTiers: partyTiers.length > 0 ? partyTiers : null,
        // Store custom ticket details as JSON in description or metadata
        features: amenities,
      };

      const boatData = {
        ...boatInput,
        image: formData.image,
        imageFile,
      };

      const savedBoat = isEdit
        ? await updateOwnerBoat(boat!.id, boatData)
        : await addOwnerBoat(boatData);

      if (extras.length > 0) {
        await saveBoatExtras(savedBoat.id, extras);
      }
      if (packages.length > 0) {
        await saveBoatPackages(savedBoat.id, packages);
      }

      toast({
        title: tl(isEdit ? "Party boat updated" : "Party boat added", isEdit ? "Σκάφος πάρτι ενημερώθηκε" : "Σκάφος πάρτι προστέθηκε"),
      });

      onSubmit?.();
      onClose();
    } catch (error) {
      toast({
        title: tl("Error saving party boat", "Σφάλμα κατά την αποθήκευση του σκάφους πάρτι"),
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (currentStep === 1) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{tl("Add Party Boat - Basics", "Προσθήκη Σκάφους Πάρτι - Βασικά")}</span>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{tl("Event name", "Όνομα εκδήλωσης")}</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Sunset Party Boat"
                />
              </div>
              <div className="space-y-2">
                <Label>{tl("Type", "Τύπος")}</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PARTY_TYPE_OPTIONS.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{tl("Location", "Τοποθεσία")}</Label>
                <Select
                  value={formData.locationId || undefined}
                  onValueChange={(value) => {
                    const selected = locationOptions.find((item) => item.id === value);
                    if (!selected) return;
                    setFormData({
                      ...formData,
                      locationId: selected.id,
                      location: selected.location,
                      departureMarina: selected.name,
                      mapQuery: selected.mapQuery || formatBoatLocationLabel(selected),
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={tl("Select location", "Επίλεξε τοποθεσία")} />
                  </SelectTrigger>
                  <SelectContent>
                    {locationOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {formatBoatLocationLabel(option)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{tl("Max guests", "Μέγ. επισκέπτες")}</Label>
                <Input
                  type="number"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{tl("Description", "Περιγραφή")}</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe your party boat experience..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>{tl("Event image", "Εικόνα εκδήλωσης")}</Label>
              <div className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-foreground transition">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  id="image-upload"
                />
                <label htmlFor="image-upload" className="cursor-pointer block">
                  {localImagePreview ? (
                    <img src={localImagePreview} alt="Preview" className="h-32 w-32 object-cover rounded mx-auto" />
                  ) : (
                    <>
                      <UploadCloud className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm">{tl("Click to upload", "Κάντε κλικ για μεταφόρτωση")}</p>
                    </>
                  )}
                </label>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={onClose}>
                {tl("Cancel", "Ακύρωση")}
              </Button>
              <Button onClick={() => setCurrentStep(2)}>{tl("Next", "Επόμενο")}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (currentStep === 2) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
        <Card className="w-full max-w-4xl">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{tl("Party Boat - Pricing & Details", "Σκάφος Πάρτι - Τιμές & Λεπτομέρειες")}</span>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 max-h-[700px] overflow-y-auto">
            {/* Event Date & Time */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{tl("Event date", "Ημερομηνία εκδήλωσης")}</Label>
                <Input
                  type="date"
                  value={formData.partyEventDate}
                  onChange={(e) => setFormData({ ...formData, partyEventDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{tl("Event start time", "Ώρα έναρξης")}</Label>
                <Input
                  type="time"
                  value={formData.partyEventTime}
                  onChange={(e) => setFormData({ ...formData, partyEventTime: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{tl("Cancellation policy (days)", "Πολιτική ακύρωσης (ημέρες)")}</Label>
                <Input
                  type="number"
                  value={formData.cancelPolicy}
                  onChange={(e) => setFormData({ ...formData, cancelPolicy: Number(e.target.value) })}
                />
              </div>
            </div>

            {/* Plan Type Toggle */}
            <div className="border-t pt-6 space-y-4">
              <h3 className="font-semibold text-lg">{tl("Ticket Plan Type", "Τύπος Πλάνου Εισιτηρίων")}</h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPlanType("basic")}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    planType === "basic"
                      ? "border-amber-500 bg-amber-50"
                      : "border-border hover:border-amber-200"
                  }`}
                >
                  <p className="font-semibold text-sm">{tl("Basic Plan", "Βασικό Πλάνο")}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {tl("Single ticket type", "Ένας τύπος εισιτηρίου")}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setPlanType("custom")}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    planType === "custom"
                      ? "border-purple-500 bg-purple-50"
                      : "border-border hover:border-purple-200"
                  }`}
                >
                  <p className="font-semibold text-sm">{tl("Custom Plan", "Προσαρμοσμένο Πλάνο")}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {tl("Multiple tiers with perks", "Πολλαπλά επίπεδα με πλεονεκτήματα")}
                  </p>
                </button>
              </div>
            </div>

            {/* Basic Plan */}
            {planType === "basic" && (
              <div className="border rounded-lg p-4 bg-amber-50 space-y-4">
                <h4 className="font-semibold">{tl("Ticket Pricing", "Τιμολόγηση Εισιτηρίων")}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{tl("Price per ticket (€)", "Τιμή ανά εισιτήριο (€)")}</Label>
                    <Input
                      type="number"
                      value={formData.pricePerEvent}
                      onChange={(e) => setFormData({ ...formData, pricePerEvent: Number(e.target.value) })}
                      min="0"
                      step="5"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{tl("Total event value (€)", "Συνολική αξία εκδήλωσης (€)")}</Label>
                    <Input value={eventTotalValue.toFixed(2)} readOnly className="bg-background" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {tl("All guests pay the same price", "Όλοι οι επισκέπτες πληρώνουν την ίδια τιμή")}
                </p>
              </div>
            )}

            {/* Custom Plan */}
            {planType === "custom" && (
              <div className="border rounded-lg p-4 bg-purple-50 space-y-4">
                <h4 className="font-semibold">{tl("Custom Ticket Tiers", "Προσαρμοσμένα Επίπεδα Εισιτηρίων")}</h4>
                
                {/* Existing ticket types */}
                {ticketTypes.length > 0 && (
                  <div className="space-y-3">
                    {ticketTypes.map((ticket, idx) => (
                      <div key={ticket.id} className="bg-white p-4 rounded-lg border border-purple-200 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 space-y-2">
                            <p className="font-semibold text-sm">{ticket.name}</p>
                            <p className="text-sm text-muted-foreground">{ticket.description}</p>
                            <div className="flex gap-2 flex-wrap">
                              {ticket.benefits.map((benefit) => (
                                <span key={benefit} className="text-xs bg-purple-100 text-purple-900 px-2 py-1 rounded">
                                  {benefit}
                                </span>
                              ))}
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setTicketTypes(ticketTypes.filter((_, i) => i !== idx))}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex gap-3 text-sm">
                          <div>
                            <p className="text-muted-foreground">{tl("Price", "Τιμή")}</p>
                            <p className="font-semibold">€{ticket.price.toFixed(2)}</p>
                          </div>
                          {ticket.discount && ticket.discount > 0 && (
                            <div>
                              <p className="text-muted-foreground">
                                {tl("Discount", "Έκπτωση")} ({ticket.discountType === "percentage" ? "%" : "€"})
                              </p>
                              <p className="font-semibold text-red-600">{ticket.discount}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Form to add new ticket type */}
                <div className="bg-white p-4 rounded-lg border-2 border-dashed border-purple-200 space-y-3">
                  <p className="font-semibold text-sm">{tl("Add New Ticket Tier", "Προσθήκη Νέου Επιπέδου Εισιτηρίου")}</p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">{tl("Tier name", "Όνομα επιπέδου")}</Label>
                      <Input
                        placeholder={tl("e.g., VIP, Premium", "π.χ., VIP, Premium")}
                        value={newTicketType.name || ""}
                        onChange={(e) => setNewTicketType({ ...newTicketType, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{tl("Price (€)", "Τιμή (€)")}</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={newTicketType.price || 0}
                        onChange={(e) => setNewTicketType({ ...newTicketType, price: Number(e.target.value) })}
                        min="0"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">{tl("Description", "Περιγραφή")}</Label>
                    <Input
                      placeholder={tl("e.g., Includes premium drinks", "π.χ., Περιλαμβάνει ποτά premium")}
                      value={newTicketType.description || ""}
                      onChange={(e) => setNewTicketType({ ...newTicketType, description: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium">{tl("Included Benefits", "Περιλαμβανόμενα Πλεονεκτήματα")}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {COMMON_BENEFITS.map((benefit) => (
                        <label key={benefit} className="flex items-center gap-2 text-xs cursor-pointer">
                          <Checkbox
                            checked={(newTicketType.benefits || []).includes(benefit)}
                            onCheckedChange={() => {
                              setNewTicketType({
                                ...newTicketType,
                                benefits: (newTicketType.benefits || []).includes(benefit)
                                  ? (newTicketType.benefits || []).filter((b) => b !== benefit)
                                  : [...(newTicketType.benefits || []), benefit],
                              });
                            }}
                          />
                          {benefit}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">{tl("Discount", "Έκπτωση")}</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={newTicketType.discount || 0}
                        onChange={(e) => setNewTicketType({ ...newTicketType, discount: Number(e.target.value) })}
                        min="0"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{tl("Discount type", "Τύπος έκπτωσης")}</Label>
                      <Select
                        value={newTicketType.discountType || "fixed"}
                        onValueChange={(v) => setNewTicketType({ ...newTicketType, discountType: v as "fixed" | "percentage" })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed">{tl("Fixed (€)", "Σταθερά (€)")}</SelectItem>
                          <SelectItem value="percentage">{tl("Percentage (%)", "Ποσοστό (%)")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => {
                      if (newTicketType.name && newTicketType.price !== undefined && newTicketType.price > 0) {
                        setTicketTypes([
                          ...ticketTypes,
                          {
                            id: createLocalId(),
                            name: newTicketType.name,
                            price: Number(newTicketType.price),
                            description: newTicketType.description || "",
                            benefits: newTicketType.benefits || [],
                            discount: newTicketType.discount || 0,
                            discountType: newTicketType.discountType || "fixed",
                          },
                        ]);
                        setNewTicketType({ name: "", price: 0, description: "", benefits: [], discount: 0, discountType: "fixed" });
                      } else {
                        toast({ title: tl("Fill all required fields", "Συμπληρώστε όλα τα απαιτούμενα πεδία"), variant: "destructive" });
                      }
                    }}
                  >
                    {tl("Add Tier", "Προσθήκη Επιπέδου")}
                  </Button>
                </div>
              </div>
            )}

            {/* Party Amenities */}
            <div className="space-y-3">
              <h4 className="font-semibold">{tl("Party Amenities", "Ανέσεις Πάρτι")}</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {PARTY_AMENITIES.map((amenity) => (
                  <div key={amenity} className="flex items-center gap-2">
                    <Checkbox
                      id={`amenity-${amenity}`}
                      checked={amenities.includes(amenity)}
                      onCheckedChange={() => {
                        setAmenities((prev) =>
                          prev.includes(amenity) ? prev.filter((a) => a !== amenity) : [...prev, amenity],
                        );
                      }}
                    />
                    <Label htmlFor={`amenity-${amenity}`} className="cursor-pointer text-sm">
                      {amenity}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Navigation */}
            <div className="flex gap-2 justify-end pt-4 border-t">
              <Button variant="outline" onClick={() => setCurrentStep(1)}>
                {tl("Back", "Πίσω")}
              </Button>
              <Button
                onClick={handleSavePartyBoat}
                disabled={isSubmitting || (planType === "custom" && ticketTypes.length === 0)}
                className="gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {tl("Saving...", "Αποθήκευση...")}
                  </>
                ) : (
                  tl("Save Party Boat", "Αποθήκευση Σκάφους Πάρτι")
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
};
