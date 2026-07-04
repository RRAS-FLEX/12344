import { useState } from "react";
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
  OwnerBoat,
} from "../../../lib/owner-dashboard";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";

interface WatersportsFormProps {
  onClose: () => void;
  boat?: OwnerBoat;
  onSubmit?: () => void;
}

const WATERSPORTS_TYPE_OPTIONS = ["Paddleboard", "Kayak", "Windsurfing", "Sailboat", "Surfboard"];
const WATERSPORTS_SAFETY = ["Life Jackets", "Safety Brief", "Insurance Included", "Certified Instructor"];

export const WatersportsForm = ({ onClose, boat, onSubmit }: WatersportsFormProps) => {
  const { tl } = useLanguage();
  const { toast } = useToast();
  const isEdit = Boolean(boat);
  const [currentStep, setCurrentStep] = useState(1);

  const [formData, setFormData] = useState({
    name: boat?.name ?? "",
    type: boat?.type ?? "Jet Ski",
    location: boat?.location ?? "Thassos",
    description: boat?.description ?? "",
    departureMarina: boat?.departureMarina ?? "",
    capacity: boat?.capacity ?? 1,
    pricePerHour: (boat?.pricePerDay ?? 0) / 8,
    minRentalHours: 2,
    maxRentalHours: 8,
    mapQuery: boat?.mapQuery ?? "",
    age_requirement: 18,
    license_required: false,
    flashSaleEnabled: boat?.flashSaleEnabled ?? false,
    // voucher fields removed
    image: boat?.image ?? "",
    status: boat?.status ?? "active",
  });

  const [safetyFeatures, setSafetyFeatures] = useState<string[]>(boat?.features ?? ["Life Jackets", "Safety Brief"]);
  const [localImagePreview, setLocalImagePreview] = useState<string>("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleSaveWatersports = async () => {
    if (!formData.name.trim()) {
      toast({
        title: tl("Missing equipment name", "Λείπει όνομα εξοπλισμού"),
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);

      // Calculate pricePerDay as pricePerHour * 8 for consistency
      const pricePerDay = formData.pricePerHour * 8;

      const boatInput = {
        name: formData.name,
        type: formData.type,
        location: formData.location,
        description: formData.description,
        departureMarina: formData.departureMarina,
        capacity: Number(formData.capacity),
        pricePerDay: Math.round(pricePerDay),
        mapQuery: formData.mapQuery,
        flashSaleEnabled: formData.flashSaleEnabled,
        partyReady: false,
        // voucher fields removed
        features: safetyFeatures,
      };

      const boatData = {
        ...boatInput,
        image: formData.image,
        imageFile,
      };

      if (isEdit) {
        await updateOwnerBoat(boat!.id, boatData);
      } else {
        await addOwnerBoat(boatData);
      }

      toast({
        title: tl(
          isEdit ? "Equipment updated" : "Equipment added",
          isEdit ? "Εξοπλισμός ενημερώθηκε" : "Εξοπλισμός προστέθηκε",
        ),
      });

      onSubmit?.();
      onClose();
    } catch (error) {
      toast({
        title: tl("Error saving equipment", "Σφάλμα κατά την αποθήκευση του εξοπλισμού"),
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
              <span>{tl("Add Watersports Equipment - Basics", "Προσθήκη Εξοπλισμού Υδάτινων Σπορ - Βασικά")}</span>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{tl("Equipment name", "Όνομα εξοπλισμού")}</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Jet Ski Rental"
                />
              </div>
              <div className="space-y-2">
                <Label>{tl("Type", "Τύπος")}</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WATERSPORTS_TYPE_OPTIONS.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{tl("Location", "Τοποθεσία")}</Label>
                <Input
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g., Thassos Beach"
                />
              </div>
              <div className="space-y-2">
                <Label>{tl("Rental units available", "Διαθέσιμες μονάδες ενοικίασης")}</Label>
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
                placeholder="Describe your equipment and experience..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>{tl("Rental location/Launch point", "Τοποθεσία ενοικίασης/Σημείο εκκίνησης")}</Label>
              <Input
                value={formData.departureMarina}
                onChange={(e) => setFormData({ ...formData, departureMarina: e.target.value })}
                placeholder="Marina or beach name"
              />
            </div>

            <div className="space-y-2">
              <Label>{tl("Equipment image", "Εικόνα εξοπλισμού")}</Label>
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
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{tl("Add Watersports Equipment - Pricing & Safety", "Προσθήκη Εξοπλισμού - Τιμολόγηση & Ασφάλεια")}</span>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 max-h-[600px] overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{tl("Price per hour (€)", "Τιμή ανά ώρα (€)")}</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={formData.pricePerHour}
                  onChange={(e) => setFormData({ ...formData, pricePerHour: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>{tl("Min rental hours", "Ελάχ. ώρες ενοικίασης")}</Label>
                <Input
                  type="number"
                  value={formData.minRentalHours}
                  onChange={(e) => setFormData({ ...formData, minRentalHours: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>{tl("Max rental hours", "Μέγ. ώρες ενοικίασης")}</Label>
                <Input
                  type="number"
                  value={formData.maxRentalHours}
                  onChange={(e) => setFormData({ ...formData, maxRentalHours: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>{tl("Min age requirement", "Ελάχ. απαίτηση ηλικίας")}</Label>
                <Input
                  type="number"
                  value={formData.age_requirement}
                  onChange={(e) => setFormData({ ...formData, age_requirement: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold">{tl("Safety & Requirements", "Ασφάλεια & Απαιτήσεις")}</h4>
              <div className="space-y-2">
                {WATERSPORTS_SAFETY.map((safety) => (
                  <div key={safety} className="flex items-center gap-2">
                    <Checkbox
                      id={`safety-${safety}`}
                      checked={safetyFeatures.includes(safety)}
                      onCheckedChange={() => {
                        setSafetyFeatures((prev) =>
                          prev.includes(safety) ? prev.filter((s) => s !== safety) : [...prev, safety],
                        );
                      }}
                    />
                    <Label htmlFor={`safety-${safety}`} className="cursor-pointer text-sm">
                      {safety}
                    </Label>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <Checkbox
                  id="license-required"
                  checked={formData.license_required}
                  onCheckedChange={(checked) => setFormData({ ...formData, license_required: checked as boolean })}
                />
                <Label htmlFor="license-required" className="cursor-pointer">
                  {tl("License/Certification required", "Απαιτείται άδεια/Πιστοποίηση")}
                </Label>
              </div>
            </div>

            {/* voucher promotion removed */}

            <div className="flex items-center gap-2">
              <Checkbox
                id="flash-sale"
                checked={formData.flashSaleEnabled}
                onCheckedChange={(checked) => setFormData({ ...formData, flashSaleEnabled: checked as boolean })}
              />
              <Label htmlFor="flash-sale" className="cursor-pointer">
                {tl("Enable flash sales", "Ενεργοποίηση flash sales")}
              </Label>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setCurrentStep(1)}>
                {tl("Back", "Πίσω")}
              </Button>
              <Button
                onClick={handleSaveWatersports}
                disabled={isSubmitting}
                className="gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {tl("Saving...", "Αποθήκευση...")}
                  </>
                ) : (
                  tl("Save Equipment", "Αποθήκευση Εξοπλισμού")
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
