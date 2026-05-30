import { useEffect, useRef, useState } from "react";
import { FileText, Trash2, UploadCloud, X, Loader2 } from "lucide-react";
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
  BoatDocument,
} from "../../../lib/owner-dashboard";
import { getBoatLocations, formatBoatLocationLabel, type BoatLocation } from "@/lib/boat-locations";
import { useToast } from "@/hooks/use-toast";
import BoatLocationPicker from "./BoatLocationPicker";
import { useLanguage } from "@/contexts/LanguageContext";

interface YachtFormProps {
  onClose: () => void;
  boat?: OwnerBoat;
  onSubmit?: () => void;
}

const BOAT_FEATURE_OPTIONS = [
  "WiFi",
  "Bluetooth Sound",
  "Air Conditioning",
  "Kitchen",
  "WC",
  "Shower",
  "Snorkeling Gear",
  "Fishing Gear",
  "Sun Deck",
  "Skipper Included",
  "Life Jackets",
  "Cooler",
];

const YACHT_TYPE_OPTIONS = ["Motor Yacht", "Speed Boat", "Catamaran", "Luxury Yacht", "Sailboat", "Dinghy", "Jet Ski"];
const DOCUMENT_LABELS = ["Registration Certificate", "Insurance Policy", "Skipper License", "Safety Inspection", "Port Authority Permit"];

const BASE_FORM_STEPS = ["Basics", "Specs", "Features", "Documents"];
const createLocalId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `extra-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const YachtForm = ({ onClose, boat, onSubmit }: YachtFormProps) => {
  const { tl } = useLanguage();
  const { toast } = useToast();
  const isEdit = Boolean(boat);
  const formSteps = BASE_FORM_STEPS;
  const docInputRef = useRef<HTMLInputElement>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [locationOptions, setLocationOptions] = useState<BoatLocation[]>([]);

  const [formData, setFormData] = useState({
    locationId: boat?.locationId ?? "",
    name: boat?.name ?? "",
    type: boat?.type ?? "Motor Yacht",
    location: boat?.location ?? "Thassos",
    description: boat?.description ?? "",
    lengthMeters: boat?.lengthMeters ?? 8,
    year: boat?.year ?? new Date().getFullYear(),
    cruisingSpeedKnots: boat?.cruisingSpeedKnots ?? 22,
    fuelBurnLitresPerHour: boat?.fuelBurnLitresPerHour ?? 16,
    departureMarina: boat?.departureMarina ?? "",
    mapQuery: boat?.mapQuery ?? "",
    externalCalendarUrl: boat?.externalCalendarUrl ?? "",
    // voucher fields removed
    unavailableDatesInput: (boat?.unavailableDates ?? []).join(", "),
    minNoticeHours: boat?.minNoticeHours ?? 24,
    capacity: boat?.capacity ?? 4,
    image: boat?.image ?? "",
    skipperRequired: boat?.skipperRequired ?? false,
    status: boat?.status ?? "inactive",
  });

  const [features, setFeatures] = useState<string[]>(boat?.features ?? ["Life Jackets"]);
  const [localImagePreview, setLocalImagePreview] = useState<string>("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [documents, setDocuments] = useState<BoatDocument[]>(boat?.documents ?? []);
  const [extras, setExtras] = useState<Array<{ id: string; name: string; price: number }>>([]);
  const [packages, setPackages] = useState<Array<{ id: string; name: string; duration: number; price: number; description: string }>>([]);
  const [docLabelIndex, setDocLabelIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleSaveBoat = async () => {
    if (!formData.name.trim()) {
      toast({
        title: tl("Missing boat name", "Λείπει όνομα σκάφους"),
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);

      const boatInput = {
        locationId: formData.locationId || null,
        name: formData.name,
        type: formData.type,
        location: formData.location,
        description: formData.description,
        lengthMeters: Number(formData.lengthMeters) || 8,
        year: Number(formData.year),
        cruisingSpeedKnots: Number(formData.cruisingSpeedKnots),
        fuelBurnLitresPerHour: Number(formData.fuelBurnLitresPerHour),
        departureMarina: formData.departureMarina,
        mapQuery: formData.mapQuery,
        externalCalendarUrl: formData.externalCalendarUrl,
        skipperRequired: formData.skipperRequired,
        capacity: Number(formData.capacity),
        partyReady: false,
        // voucher fields removed
        features,
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
        title: tl(isEdit ? "Yacht updated" : "Yacht added", isEdit ? "Γιοτ ενημερώθηκε" : "Γιοτ προστέθηκε"),
      });

      onSubmit?.();
      onClose();
    } catch (error) {
      toast({
        title: tl("Error saving yacht", "Σφάλμα κατά την αποθήκευση του γιοτ"),
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render main steps
  if (currentStep === 1) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{tl("Add Yacht - Basics", "Προσθήκη Γιοτ - Βασικά")}</span>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{tl("Yacht name", "Όνομα γιοτ")}</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Sea Dream"
                />
              </div>
              <div className="space-y-2">
                <Label>{tl("Type", "Τύπος")}</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {YACHT_TYPE_OPTIONS.map((type) => (
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
                <Label>{tl("Capacity (guests)", "Χωρητικότητα (επισκέπτες)")}</Label>
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
                placeholder="Tell guests about your yacht..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>{tl("Yacht image", "Εικόνα γιοτ")}</Label>
              <div className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-foreground transition">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  ref={(el) => {
                    if (el) el.onclick = () => el.click();
                  }}
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
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{tl("Add Yacht - Specifications", "Προσθήκη Γιοτ - Προδιαγραφές")}</span>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{tl("Length (meters)", "Μήκος (μέτρα)")}</Label>
                <Input type="number" value={formData.lengthMeters} onChange={(e) => setFormData({ ...formData, lengthMeters: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>{tl("Build year", "Έτος κατασκευής")}</Label>
                <Input type="number" value={formData.year} onChange={(e) => setFormData({ ...formData, year: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>{tl("Cruising speed (knots)", "Ταχύτητα κρουαζιέρας (κόμβοι)")}</Label>
                <Input type="number" value={formData.cruisingSpeedKnots} onChange={(e) => setFormData({ ...formData, cruisingSpeedKnots: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>{tl("Fuel burn (L/hr)", "Κατανάλωση καυσίμου (L/hr)")}</Label>
                <Input type="number" value={formData.fuelBurnLitresPerHour} onChange={(e) => setFormData({ ...formData, fuelBurnLitresPerHour: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>{tl("Departure marina", "Μαρίνα αναχώρησης")}</Label>
                <Input value={formData.departureMarina} onChange={(e) => setFormData({ ...formData, departureMarina: e.target.value })} placeholder="Marina name" />
              </div>
              <div className="space-y-2">
                <Label>{tl("Min. notice (hours)", "Ελάχ. προειδοποίηση (ώρες)")}</Label>
                <Input type="number" value={formData.minNoticeHours} onChange={(e) => setFormData({ ...formData, minNoticeHours: Number(e.target.value) })} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="skipper-required"
                  checked={formData.skipperRequired}
                  onCheckedChange={(checked) => setFormData({ ...formData, skipperRequired: checked as boolean })}
                />
                <Label htmlFor="skipper-required" className="cursor-pointer">
                  {tl("Skipper required", "Απαιτείται κυβερνήτης")}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="external-calendar"
                  checked={Boolean(formData.externalCalendarUrl)}
                  onCheckedChange={() => setFormData({ ...formData, externalCalendarUrl: "" })}
                />
                <Label htmlFor="external-calendar" className="cursor-pointer">
                  {tl("Use external calendar (iCal)", "Χρήση εξωτερικού ημερολογίου (iCal)")}
                </Label>
              </div>
              {formData.externalCalendarUrl && (
                <Input value={formData.externalCalendarUrl} onChange={(e) => setFormData({ ...formData, externalCalendarUrl: e.target.value })} placeholder="iCal URL" />
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setCurrentStep(1)}>
                {tl("Back", "Πίσω")}
              </Button>
              <Button onClick={() => setCurrentStep(3)}>{tl("Next", "Επόμενο")}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (currentStep === 3) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{tl("Add Yacht - Features", "Προσθήκη Γιοτ - Χαρακτηριστικά")}</span>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 max-h-[600px] overflow-y-auto">
            <div className="space-y-3">
              <h4 className="font-semibold">{tl("Features & Amenities", "Χαρακτηριστικά και Ανέσεις")}</h4>
              <div className="grid grid-cols-2 gap-2">
                {BOAT_FEATURE_OPTIONS.map((feature) => (
                  <div key={feature} className="flex items-center gap-2">
                    <Checkbox
                      id={`feature-${feature}`}
                      checked={features.includes(feature)}
                      onCheckedChange={() => {
                        setFeatures((prev) =>
                          prev.includes(feature) ? prev.filter((f) => f !== feature) : [...prev, feature],
                        );
                      }}
                    />
                    <Label htmlFor={`feature-${feature}`} className="cursor-pointer text-sm">
                      {feature}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              {tl(
                "Pricing, cancellation rules, and flash sales are managed in Packages. Add at least one package before making this boat active.",
                "Η τιμολόγηση, οι κανόνες ακύρωσης και οι flash sales διαχειρίζονται στα Πακέτα. Πρόσθεσε τουλάχιστον ένα πακέτο πριν ενεργοποιήσεις αυτό το σκάφος.",
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setCurrentStep(2)}>
                {tl("Back", "Πίσω")}
              </Button>
              <Button onClick={() => setCurrentStep(4)}>{tl("Next", "Επόμενο")}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (currentStep === 4) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{tl("Add Yacht - Documents", "Προσθήκη Γιοτ - Έγγραφα")}</span>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 max-h-[600px] overflow-y-auto">
            <div className="space-y-3">
              {documents.map((doc, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 border border-border rounded">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 text-sm">{doc.label}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDocuments((d) => d.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setCurrentStep(3)}>
                {tl("Back", "Πίσω")}
              </Button>
              <Button
                onClick={handleSaveBoat}
                disabled={isSubmitting}
                className="gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {tl("Saving...", "Αποθήκευση...")}
                  </>
                ) : (
                  tl("Save Yacht", "Αποθήκευση Γιοτ")
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
