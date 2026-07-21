import { supabase, type DatabaseTables } from "@/lib/supabase";
import { withRetry } from "@/lib/retry";

export interface OwnerApplicationInput {
  // Personal
  phone: string;
  companyName: string;
  // Experience
  operatingArea: string;
  yearsExperience: string;
  licenseNumber: string;
  boatTypes: string[];
  // Fleet plans
  boatCount: string;
  operatingSeason: string;
  // Online presence
  website: string;
  // Payout readiness
  bankAccountHolder: string;
  iban: string;
  bankName: string;
  stripeAccountId: string;
  // Notes
  notes: string;
}

export interface OwnerApplicationRecord {
  id: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  ownerName: string;
  ownerEmail: string;
  notes: string;
}

const getSignedInSession = async () => {
  const {
    data: { session },
  } = await withRetry(() => supabase.auth.getSession(), { retries: 1, initialDelayMs: 220 });

  if (!session?.user) {
    throw new Error("You must be signed in to apply as an owner");
  }

  return session;
};

type OwnerApplicationSelectedRow = Pick<
  DatabaseTables["owner_applications"]["Row"],
  "id" | "status" | "submitted_at" | "owner_name" | "owner_email" | "notes"
>;

const mapApplication = (row: OwnerApplicationSelectedRow): OwnerApplicationRecord => ({
  id: row.id,
  status: row.status,
  submittedAt: row.submitted_at,
  ownerName: row.owner_name,
  ownerEmail: row.owner_email ?? "",
  notes: row.notes ?? "",
});

export const getMyOwnerApplication = async (): Promise<OwnerApplicationRecord | null> => {
  const session = await getSignedInSession();

  const { data, error } = await withRetry(
    () =>
      supabase
        .from("owner_applications")
        .select("id, status, submitted_at, owner_name, owner_email, notes")
        .eq("type", "owner_verification")
        .eq("applicant_user_id", session.user.id)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    { retries: 1, initialDelayMs: 220 },
  );

  if (error) {
    throw new Error(error.message || "Failed to load owner application");
  }

  return data ? mapApplication(data) : null;
};

export const submitOwnerApplication = async (input: OwnerApplicationInput): Promise<OwnerApplicationRecord> => {
  const session = await getSignedInSession();

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id, name, email, is_owner, owner_title, owner_bio")
    .eq("id", session.user.id)
    .single();

  if (profileError || !profile) {
    throw new Error(profileError?.message || "Failed to load your profile");
  }

  if (profile.is_owner) {
    throw new Error("Your account is already approved as an owner");
  }

  const existingApplication = await getMyOwnerApplication();
  if (existingApplication?.status === "pending") {
    throw new Error("You already have a pending owner application");
  }

  // Best-effort: hydrate owner profile fields from the rich onboarding form
  // so company name & website surface on boats and fleet pages.
  try {
    const trimmedCompany = input.companyName.trim();
    const hasExistingTitle = Boolean(profile.owner_title && String(profile.owner_title).trim());
    const hasExistingBio = Boolean(profile.owner_bio && String(profile.owner_bio).trim());

    const nextTitle = !hasExistingTitle && trimmedCompany ? trimmedCompany : null;

    const bioLines: string[] = [];
    if (!hasExistingBio) {
      const area = input.operatingArea.trim();
      const years = input.yearsExperience.trim();
      const types = input.boatTypes.length > 0 ? input.boatTypes.join(", ") : "";
      const fleet = input.boatCount.trim();
      const season = input.operatingSeason.trim();
      const website = input.website.trim();

      if (trimmedCompany) bioLines.push(`Company: ${trimmedCompany}`);
      if (area) bioLines.push(`Operating area: ${area}`);
      if (years) bioLines.push(`Experience: ${years}`);
      if (types) bioLines.push(`Boat types: ${types}`);
      if (fleet) bioLines.push(`Boats planned to list: ${fleet}`);
      if (season) bioLines.push(`Season: ${season}`);
      if (website) bioLines.push(`Website / social: ${website}`);
    }

    const nextBio = !hasExistingBio && bioLines.length > 0 ? bioLines.join("\n") : null;

    if (nextTitle || nextBio) {
      await supabase
        .from("users")
        .update({
          ...(nextTitle ? { owner_title: nextTitle } : {}),
          ...(nextBio ? { owner_bio: nextBio } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id);
    }
  } catch {
    // Profile enrichment is best-effort and should never block the application.
  }

  const notes = [
    `Phone: ${input.phone.trim()}`,
    input.companyName.trim() ? `Company: ${input.companyName.trim()}` : null,
    `Operating area: ${input.operatingArea.trim()}`,
    `Years of experience: ${input.yearsExperience.trim()}`,
    input.licenseNumber.trim() ? `License / certification: ${input.licenseNumber.trim()}` : null,
    `Boat types: ${input.boatTypes.length > 0 ? input.boatTypes.join(", ") : "Not specified"}`,
    `Boats to list: ${input.boatCount.trim()}`,
    `Operating season: ${input.operatingSeason.trim()}`,
    `Bank account holder: ${input.bankAccountHolder.trim()}`,
    `IBAN: ${input.iban.trim()}`,
    input.bankName.trim() ? `Bank name: ${input.bankName.trim()}` : null,
    input.stripeAccountId.trim() ? `Stripe account id: ${input.stripeAccountId.trim()}` : null,
    input.website.trim() ? `Website / social: ${input.website.trim()}` : null,
    `Notes: ${input.notes.trim() || "No extra notes provided."}`,
  ]
    .filter(Boolean)
    .join("\n");

  const { data, error } = await supabase
    .from("owner_applications")
    .insert({
      type: "owner_verification",
      applicant_user_id: profile.id,
      owner_name: profile.name,
      owner_email: profile.email,
      title: `Owner onboarding request for ${profile.name}`,
      notes,
      status: "pending",
    })
    .select("id, status, submitted_at, owner_name, owner_email, notes")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to submit owner application");
  }

  return mapApplication(data);
};