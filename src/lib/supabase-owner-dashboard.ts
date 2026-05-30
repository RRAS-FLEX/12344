import { supabase } from "./supabase";
import { resolveStorageImage } from "./storage-public";
import { syncBoatSectorRows, isWatersportsType } from "./owner-dashboard";

const sb = supabase as any;

export interface OwnerBoat {
  id: string;
  name: string;
  type: string;
  location: string;
  capacity: number;
  pricePerDay: number;
  rating: number;
  image: string;
  features: string[];
  documents: BoatDocument[];
  status: "active" | "inactive" | "maintenance";
  bookings: number;
  revenue: number;
}

export interface BoatDocument {
  id: string;
  name: string;
  filePath: string;
  fileType: string;
}

export interface OwnerStats {
  listedBoats: number;
  totalBookings: number;
  totalRevenue: number;
}

/**
 * Get all boats for the current owner
 */
export const getOwnerBoats = async (): Promise<OwnerBoat[]> => {
  const {
    data: { session },
  } = await sb.auth.getSession();

  if (!session?.user) {
    return [];
  }

  // Fetch boats
  const { data: boats, error: boatsError } = await sb
    .from("boats")
    .select("*")
    .eq("owner_id", session.user.id);

  if (boatsError || !boats) {
    console.error("Error fetching boats:", boatsError);
    return [];
  }

  // For each boat, fetch features and documents
  const boatsWithDetails = await Promise.all(
    boats.map(async (boat) => {
      const { data: features } = await sb
        .from("boat_features")
        .select("feature")
        .eq("boat_id", boat.id);

      const { data: documents } = await sb
        .from("boat_documents")
        .select("id, name, file_path, file_type")
        .eq("boat_id", boat.id);

      return {
        id: boat.id,
        name: boat.name,
        type: boat.type,
        location: boat.location,
        capacity: boat.capacity,
        pricePerDay: Number(boat.price ?? 0),
        rating: boat.rating ?? 0,
        image: resolveStorageImage(boat.image, "boat-images", "/placeholder.svg"),
        features: features?.map((f) => f.feature) ?? [],
        documents:
          documents?.map((d) => ({
            id: d.id,
            name: d.name,
            filePath: d.file_path,
            fileType: d.file_type,
          })) ?? [],
        status: (boat.status as "active" | "inactive" | "maintenance") ?? "active",
        bookings: boat.bookings ?? 0,
        revenue: boat.revenue ?? 0,
      };
    })
  );

  return boatsWithDetails;
};

/**
 * Add a new boat
 */
export const addOwnerBoat = async (
  boat: Omit<OwnerBoat, "id" | "documents"> & { documents?: BoatDocument[] }
): Promise<OwnerBoat> => {
  const {
    data: { session },
  } = await sb.auth.getSession();

  if (!session?.user) {
    throw new Error("You must be signed in to add a boat");
  }

  // Insert boat
  const { data: newBoat, error: boatError } = await sb
    .from("boats")
    .insert({
      owner_id: session.user.id,
      name: boat.name,
      type: boat.type,
      location: boat.location,
      capacity: boat.capacity,
      price: boat.pricePerDay,
      image: boat.image,
      status: boat.status,
    })
    .select()
    .single();

  if (boatError || !newBoat) {
    throw new Error(boatError?.message || "Failed to create boat");
  }

  try {
    // Sync sector-specific row (party / watersports) based on type
    const isParty = String(newBoat.type ?? "").toLowerCase().includes("party");
    await syncBoatSectorRows(newBoat.id, session.user.id, {
      partyReady: Boolean(isParty),
      type: String(newBoat.type ?? ""),
      name: String(newBoat.name ?? ""),
      location: String(newBoat.location ?? ""),
      description: String(newBoat.description ?? ""),
      departureMarina: String(newBoat.departure_marina ?? ""),
      capacity: Number(newBoat.capacity ?? 0),
      ticketMaxPeople: Number(newBoat.capacity ?? 0),
      ticketPricePerPerson: Number(0),
      partyEventDate: null,
      partyEventTime: null,
      partyTiers: [],
      image: String(newBoat.image ?? ""),
      status: newBoat.status ?? "active",
      mapQuery: newBoat.map_query ?? "",
      flashSaleEnabled: Boolean(newBoat.flash_sale_enabled),
      pricePerDay: Number(newBoat.price ?? 0),
    });
  } catch (err) {
    console.error("Failed to sync sector row after supabase-owner-dashboard insert", err);
  }

  // Insert features
  if (boat.features.length > 0) {
    const featureRows = boat.features.map((feature) => ({
      boat_id: newBoat.id,
      feature,
    }));

    const { error: featuresError } = await sb
      .from("boat_features")
      .insert(featureRows);

    if (featuresError) {
      console.error("Error adding features:", featuresError);
    }
  }

  // Insert documents (if they were passed as base64, you'd upload to storage instead)
  if (boat.documents && boat.documents.length > 0) {
    const docRows = boat.documents.map((doc) => ({
      boat_id: newBoat.id,
      name: doc.name,
      file_path: doc.filePath,
      file_type: doc.fileType,
    }));

    const { error: docsError } = await sb
      .from("boat_documents")
      .insert(docRows);

    if (docsError) {
      console.error("Error adding documents:", docsError);
    }
  }

  return {
    id: newBoat.id,
    name: newBoat.name,
    type: newBoat.type,
    location: newBoat.location,
    capacity: newBoat.capacity,
    pricePerDay: Number(newBoat.price ?? 0),
    rating: newBoat.rating ?? 0,
    image: newBoat.image ?? "",
    features: boat.features,
    documents: boat.documents ?? [],
    status: (newBoat.status as "active" | "inactive" | "maintenance") ?? "active",
    bookings: 0,
    revenue: 0,
  };
};

/**
 * Update an existing boat
 */
export const updateOwnerBoat = async (
  boatId: string,
  updates: Partial<OwnerBoat>
): Promise<void> => {
  const {
    data: { session },
  } = await sb.auth.getSession();

  if (!session?.user) {
    throw new Error("You must be signed in to update a boat");
  }

  // Update boat table
  const { error: updateError } = await sb
    .from("boats")
    .update({
      name: updates.name,
      type: updates.type,
      location: updates.location,
      capacity: updates.capacity,
      price: updates.pricePerDay,
      image: updates.image,
      status: updates.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", boatId)
    .eq("owner_id", session.user.id);

  if (updateError) {
    throw new Error(updateError.message || "Failed to update boat");
  }

  // Update features if provided
  if (updates.features) {
    // Delete old features
    await sb.from("boat_features").delete().eq("boat_id", boatId);

    // Insert new features
    const featureRows = updates.features.map((feature) => ({
      boat_id: boatId,
      feature,
    }));

    if (featureRows.length > 0) {
      const { error: featuresError } = await sb
        .from("boat_features")
        .insert(featureRows);

      if (featuresError) {
        console.error("Error updating features:", featuresError);
      }
    }
  }

  // After updating base boat, ensure sector overlay rows are synced
  try {
    const { data: refreshedBaseBoat } = await sb.from("boats").select("*").eq("id", boatId).maybeSingle();
    if (refreshedBaseBoat) {
      const isParty = String(refreshedBaseBoat.type ?? "").toLowerCase().includes("party");
      await syncBoatSectorRows(boatId, session.user.id, {
        partyReady: Boolean(isParty),
        type: String(refreshedBaseBoat.type ?? ""),
        name: String(refreshedBaseBoat.name ?? ""),
        location: String(refreshedBaseBoat.location ?? ""),
        description: String(refreshedBaseBoat.description ?? ""),
        departureMarina: String(refreshedBaseBoat.departure_marina ?? ""),
        capacity: Number(refreshedBaseBoat.capacity ?? 0),
        ticketMaxPeople: Number(refreshedBaseBoat.capacity ?? 0),
        ticketPricePerPerson: Number(0),
        partyEventDate: null,
        partyEventTime: null,
        partyTiers: [],
        image: String(refreshedBaseBoat.image ?? ""),
        status: refreshedBaseBoat.status ?? "active",
        mapQuery: refreshedBaseBoat.map_query ?? "",
        flashSaleEnabled: Boolean(refreshedBaseBoat.flash_sale_enabled),
        pricePerDay: Number(refreshedBaseBoat.price ?? 0),
      });
    }
  } catch (err) {
    console.error("Failed to sync sector row after supabase-owner-dashboard update", err);
  }
};

/**
 * Delete a boat
 */
export const deleteOwnerBoat = async (boatId: string): Promise<void> => {
  const {
    data: { session },
  } = await sb.auth.getSession();

  if (!session?.user) {
    throw new Error("You must be signed in to delete a boat");
  }

  const { error } = await sb
    .from("boats")
    .delete()
    .eq("id", boatId)
    .eq("owner_id", session.user.id);

  if (error) {
    throw new Error(error.message || "Failed to delete boat");
  }
};

/**
 * Get owner statistics
 */
export const getOwnerStats = async (): Promise<OwnerStats> => {
  const {
    data: { session },
  } = await sb.auth.getSession();

  if (!session?.user) {
    return { listedBoats: 0, totalBookings: 0, totalRevenue: 0 };
  }

  // Get boat count
  const { count: boatCount, error: boatError } = await sb
    .from("boats")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", session.user.id);

  // Get total bookings & revenue
  const { data: bookingData, error: bookingError } = await sb
    .from("bookings")
    .select("total_price")
    .in(
      "boat_id",
      (
        await sb
          .from("boats")
          .select("id")
          .eq("owner_id", session.user.id)
      ).data?.map((b) => b.id) ?? []
    );

  if (boatError || bookingError) {
    console.error("Error fetching stats:", boatError || bookingError);
    return { listedBoats: 0, totalBookings: 0, totalRevenue: 0 };
  }

  const totalRevenue = bookingData?.reduce((sum, b) => sum + (b.total_price ?? 0), 0) ?? 0;
  const totalBookings = bookingData?.length ?? 0;

  return {
    listedBoats: boatCount ?? 0,
    totalBookings,
    totalRevenue,
  };
};
