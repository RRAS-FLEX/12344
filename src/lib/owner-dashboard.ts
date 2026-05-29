import { supabase } from "./supabase";
import { parseStorageReference, resolveStorageImage } from "./storage-public";
import { uploadBoatImageToStorage } from "./boat-images";

export interface BoatDocument {
  id?: string;
  name: string;
  dataUrl?: string;
  filePath: string;
  fileType: string;
  file?: File | null;
}

export interface OwnerBoat {
  id: string;
  name: string;
  type: string;
  location: string;
  description: string;
  lengthMeters: number;
  year: number;
  cruisingSpeedKnots: number;
  fuelBurnLitresPerHour: number;
  departureMarina: string;
  cancellationPolicy: string;
  responseTime: string;
  mapQuery: string;
  externalCalendarUrl: string;
  flashSaleEnabled: boolean;
  partyReady: boolean;
  partyEventDate?: string | null;
  partyEventTime?: string | null;
  partyTiers?: Array<{ name: string; price: number }>;
  unavailableDates: string[];
  minNoticeHours: number;
  capacity: number;
  pricePerDay: number;
  ticketMaxPeople: number;
  ticketPricePerPerson: number;
  rating: number;
  image: string;
  features: string[];
  skipperRequired: boolean;
  status: "active" | "inactive" | "maintenance";
  bookings: number;
  revenue: number;
  documentsFolder: string;
  documents: BoatDocument[];
}

type OwnerBoatMutation = Omit<OwnerBoat, "id" | "documentsFolder" | "ticketMaxPeople" | "ticketPricePerPerson"> & {
  documentsFolder?: string;
  imageFile?: File | null;
  ticketMaxPeople?: number;
  ticketPricePerPerson?: number;
};

type OwnerBoatUpdateMutation = Partial<OwnerBoat> & {
  imageFile?: File | null;
};

type PartyBoatSectorRow = {
  boat_id?: string | null;
  ticket_max_people?: number | null;
  ticket_price_per_person?: number | null;
  party_event_date?: string | null;
  party_event_time?: string | null;
  party_tiers?: unknown;
};

type WatersportsBoatSectorRow = {
  boat_id?: string | null;
};

export interface OwnerPackage {
  id: string;
  name: string;
  duration: number;
  price: number;
  description: string;
  boatIds: string[];
}

export interface BoatExtra {
  id: string;
  name: string;
  price: number;
}

export interface OwnerCalendarEvent {
  id: string;
  boatId: string;
  date: string;
  type: "booked" | "blocked" | "maintenance";
  guestName?: string;
  bookingId?: string;
  startTime?: string | null;
  endTime?: string | null;
}

export interface OwnerStats {
  listedBoats: number;
  totalBookings: number;
  totalRevenue: number;
  averageRating: string;
}

export interface OwnerBooking {
  id: string;
  boatName: string;
  customerName: string;
  date: string;
  departureTime: string;
  guests: number;
  status: string;
  totalPrice: number;
  endDate?: string | null;
  endTime?: string | null;
}

const normalizeUnavailableDates = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  return raw
    .map((value) => String(value || "").trim())
    .filter((value) => dateRegex.test(value));
};

const getSession = async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    throw new Error("You must be signed in to access owner data");
  }

  return session;
};

const toSafeFileName = (value: string) => value.replace(/[^a-zA-Z0-9._-]+/g, "-");

const stripDataUrl = (value: string | null | undefined) => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:")) return "";
  return trimmed;
};

const toNullableTrimmed = (value: unknown) => {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toTrimmed = (value: unknown) => String(value ?? "").trim();

export const isWatersportsType = (value: unknown) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "watersports" || normalized === "watersports charter";
};

const parsePartyTiers = (value: unknown): Array<{ name: string; price: number }> => {
  if (!value) return [];

  const parsed = typeof value === "string"
    ? (() => {
        try {
          return JSON.parse(value);
        } catch {
          return [];
        }
      })()
    : value;

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((tier) => {
      if (!tier || typeof tier !== "object") return null;
      const name = String((tier as { name?: unknown }).name ?? "").trim();
      const price = Number((tier as { price?: unknown }).price ?? 0);
      if (!name || !Number.isFinite(price) || price < 0) return null;
      return { name, price };
    })
    .filter((tier): tier is { name: string; price: number } => Boolean(tier));
};

const getTodayIsoDate = () => new Date().toISOString().slice(0, 10);

const resolveDocumentUrl = async (filePath: string) => {
  if (!filePath) {
    return "";
  }

  if (/^https?:\/\//i.test(filePath) || /^data:/i.test(filePath)) {
    return filePath;
  }

  const storageRef = parseStorageReference(filePath, "boat-documents");
  if (!storageRef) {
    return filePath;
  }

  const { data, error } = await supabase.storage
    .from(storageRef.bucket)
    .createSignedUrl(storageRef.path, 60 * 60);

  if (error || !data?.signedUrl) {
    return filePath;
  }

  return data.signedUrl;
};

const mapBoatDocument = async (document: any): Promise<BoatDocument> => ({
  id: document.id,
  name: document.name,
  filePath: document.file_path,
  dataUrl: await resolveDocumentUrl(document.file_path),
  fileType: document.file_type ?? "application/octet-stream",
});

const normalizeBoatImagePath = (value: string | null | undefined) => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  if (/\.\w{2,6}(\?|$)/.test(trimmed)) return trimmed;
  return `${trimmed.replace(/\/+$/, "")}/1.jpg`;
};

const resolveOwnerBoatImage = (boat: any) => {
  const candidate = normalizeBoatImagePath(boat.images ?? boat.image);
  return resolveStorageImage(candidate, "boat-images", "/placeholder.svg");
};

const uploadBoatDocument = async (basePath: string, document: BoatDocument) => {
  if (!(document.file instanceof File)) {
    return {
      name: document.name,
      file_path: document.filePath || document.dataUrl || "",
      file_type: document.fileType,
    };
  }

  const safeBase = basePath.replace(/^\/+|\/+$/g, "");
  const safeName = toSafeFileName(document.file.name || document.name || "document");
  const objectPath = `${safeBase}/${safeName}`;

  const { error } = await supabase.storage
    .from("boat-documents")
    .upload(objectPath, document.file, {
      upsert: true,
      contentType: document.file.type || document.fileType || "application/octet-stream",
    });

  if (error) {
    throw new Error(error.message || `Failed to upload document ${document.name}`);
  }

  return {
    name: document.name,
    file_path: `boat-documents/${objectPath}`,
    file_type: document.file.type || document.fileType || "application/octet-stream",
  };
};

const mapOwnerBoat = (
  boat: any,
  features: string[],
  documents: BoatDocument[],
  partySector?: PartyBoatSectorRow,
  watersportsSector?: WatersportsBoatSectorRow,
): OwnerBoat => ({
  id: boat.id,
  name: boat.name,
  type: watersportsSector?.boat_id ? "watersports" : boat.type,
  location: boat.location,
  description: boat.description ?? "",
  lengthMeters: Number(boat.length_meters ?? 0),
  year: Number(boat.year ?? 0),
  cruisingSpeedKnots: Number(boat.cruising_speed_knots ?? 0),
  fuelBurnLitresPerHour: Number(boat.fuel_burn_litres_per_hour ?? 0),
  departureMarina: boat.departure_marina ?? boat.location ?? "",
  cancellationPolicy: boat.cancellation_policy ?? "",
  responseTime: boat.response_time ?? "",
  mapQuery: boat.map_query ?? "",
  externalCalendarUrl: boat.external_calendar_url ?? "",
  flashSaleEnabled: Boolean(boat.flash_sale_enabled),
  partyReady: Boolean(partySector?.boat_id),
  partyEventDate: partySector?.party_event_date ?? null,
  partyEventTime: partySector?.party_event_time ?? null,
  partyTiers: parsePartyTiers(partySector?.party_tiers),
  unavailableDates: Array.isArray(boat.unavailable_dates) ? boat.unavailable_dates : [],
  minNoticeHours: Number(boat.min_notice_hours ?? 24),
  capacity: Number(boat.capacity ?? 0),
  pricePerDay: Number(boat.price_per_day ?? 0),
  ticketMaxPeople: Number(partySector?.ticket_max_people ?? boat.capacity ?? 0),
  ticketPricePerPerson: Number(partySector?.ticket_price_per_person ?? 0),
  rating: Number(boat.rating ?? 0),
  image: resolveOwnerBoatImage(boat),
  features,
  skipperRequired: Boolean(boat.skipper_required),
  documents,
  status: boat.status ?? "active",
  bookings: Number(boat.bookings ?? 0),
  revenue: Number(boat.revenue ?? 0),
  documentsFolder: boat.documents_folder ?? "",
});

export const getOwnerBoats = async (): Promise<OwnerBoat[]> => {
  const session = await getSession();
  const boatsTable = (supabase as any).from("boats");
  const featuresTable = (supabase as any).from("boat_features");
  const documentsTable = (supabase as any).from("boat_documents");
  const partyBoatsTable = (supabase as any).from("party_boats");
  const watersportsBoatsTable = (supabase as any).from("watersports_boats");

  const { data: boats, error } = await boatsTable
    .select("*")
    .eq("owner_id", session.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Failed to load owner boats");
  }

  const boatRows = Array.isArray(boats) ? boats : [];
  const boatIds = boatRows.map((boat) => boat.id).filter(Boolean);

  const [partyResult, watersportsResult] = await Promise.all([
    boatIds.length > 0
      ? partyBoatsTable
          .select("boat_id, ticket_max_people, ticket_price_per_person, party_event_date, party_event_time, party_tiers")
          .in("boat_id", boatIds)
      : Promise.resolve({ data: [], error: null }),
    boatIds.length > 0
      ? watersportsBoatsTable
          .select("boat_id")
          .in("boat_id", boatIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const partyByBoatId = new Map<string, PartyBoatSectorRow>();
  if (!partyResult.error && Array.isArray(partyResult.data)) {
    for (const row of partyResult.data as PartyBoatSectorRow[]) {
      const key = String(row.boat_id ?? "").trim();
      if (key) partyByBoatId.set(key, row);
    }
  }

  const watersportsByBoatId = new Map<string, WatersportsBoatSectorRow>();
  if (!watersportsResult.error && Array.isArray(watersportsResult.data)) {
    for (const row of watersportsResult.data as WatersportsBoatSectorRow[]) {
      const key = String(row.boat_id ?? "").trim();
      if (key) watersportsByBoatId.set(key, row);
    }
  }

  return Promise.all(
    boatRows.map(async (boat) => {
      const [{ data: featureRows }, { data: documentRows }] = await Promise.all([
        featuresTable.select("feature").eq("boat_id", boat.id),
        documentsTable.select("id, name, file_path, file_type").eq("boat_id", boat.id),
      ]);

      const resolvedDocuments = Array.isArray(documentRows)
        ? await Promise.all(documentRows.map(mapBoatDocument))
        : [];

      return mapOwnerBoat(
        boat,
        Array.isArray(featureRows) ? featureRows.map((feature: any) => feature.feature) : [],
        resolvedDocuments,
        partyByBoatId.get(boat.id),
        watersportsByBoatId.get(boat.id),
      );
    }),
  );
};

export const syncBoatSectorRows = async (
  boatId: string,
  ownerId: string,
  payload: {
    partyReady: boolean;
    type: string;
    name: string;
    location: string;
    description: string;
    departureMarina: string;
    capacity: number;
    ticketMaxPeople: number;
    ticketPricePerPerson: number;
    partyEventDate?: string | null;
    partyEventTime?: string | null;
    partyTiers?: Array<{ name: string; price: number }>;
    image?: string;
    status?: string;
    mapQuery?: string;
    flashSaleEnabled?: boolean;
    pricePerDay?: number;
  },
) => {
  const partyBoatsTable = (supabase as any).from("party_boats");
  const watersportsBoatsTable = (supabase as any).from("watersports_boats");

  if (payload.partyReady) {
    try {
      console.debug("syncBoatSectorRows: upserting party_boats for", boatId, { partyEventDate: payload.partyEventDate, partyEventTime: payload.partyEventTime });
      const { error } = await partyBoatsTable.upsert({
      boat_id: boatId,
      owner_id: ownerId,
      name: payload.name,
      location: payload.location,
      description: payload.description,
      departure_marina: payload.departureMarina,
      capacity: payload.capacity,
      ticket_max_people: payload.ticketMaxPeople,
      ticket_price_per_person: payload.ticketPricePerPerson,
      party_tiers: Array.isArray(payload.partyTiers) ? payload.partyTiers : null,
      party_event_date: payload.partyEventDate ?? null,
      party_event_time: payload.partyEventTime ?? null,
      images: stripDataUrl(payload.image),
      status: payload.status ?? "active",
      map_query: payload.mapQuery ?? "",
      flash_sale_enabled: Boolean(payload.flashSaleEnabled),
      updated_at: new Date().toISOString(),
    }, { onConflict: "boat_id" });
      if (error) {
        console.error("syncBoatSectorRows: party_boats upsert error", error);
        throw new Error(error.message || "Failed to sync party sector row");
      }
      console.debug("syncBoatSectorRows: party_boats upsert OK", boatId);
    } catch (err) {
      console.error("syncBoatSectorRows: unexpected error during party_boats upsert", err);
      throw err;
    }
  } else {
    try {
      console.debug("syncBoatSectorRows: deleting party_boats for", boatId);
      const { error } = await partyBoatsTable.delete().eq("boat_id", boatId).eq("owner_id", ownerId);
      if (error) {
        console.error("syncBoatSectorRows: party_boats delete error", error);
        throw new Error(error.message || "Failed to delete party sector row");
      }
      console.debug("syncBoatSectorRows: party_boats delete OK", boatId);
    } catch (err) {
      console.error("syncBoatSectorRows: unexpected error during party_boats delete", err);
      throw err;
    }
  }

  if (isWatersportsType(payload.type)) {
    const { error } = await watersportsBoatsTable.upsert({
      boat_id: boatId,
      owner_id: ownerId,
      name: payload.name,
      location: payload.location,
      description: payload.description,
      departure_marina: payload.departureMarina,
      capacity: payload.capacity,
      price_per_day: Number(payload.pricePerDay ?? 0),
      images: stripDataUrl(payload.image),
      status: payload.status ?? "active",
      map_query: payload.mapQuery ?? "",
      flash_sale_enabled: Boolean(payload.flashSaleEnabled),
      updated_at: new Date().toISOString(),
    }, { onConflict: "boat_id" });

    if (error) {
      throw new Error(error.message || "Failed to sync watersports sector row");
    }
  } else {
    await watersportsBoatsTable.delete().eq("boat_id", boatId).eq("owner_id", ownerId);
  }
};

export const addOwnerBoat = async (boat: OwnerBoatMutation): Promise<OwnerBoat> => {
  const session = await getSession();
  const boatsTable = (supabase as any).from("boats");
  const featuresTable = (supabase as any).from("boat_features");
  const documentsTable = (supabase as any).from("boat_documents");
  const safeFeatures = Array.isArray(boat.features) ? boat.features : [];
  const safeDocuments = Array.isArray(boat.documents) ? boat.documents : [];

  const { data: insertedBoat, error } = await boatsTable
    .insert({
      owner_id: session.user.id,
      name: boat.name,
      description: boat.description,
      type: isWatersportsType(boat.type) ? "rental" : boat.type,
      location: boat.location,
      length_meters: boat.lengthMeters,
      year: boat.year,
      cruising_speed_knots: boat.cruisingSpeedKnots,
      fuel_burn_litres_per_hour: boat.fuelBurnLitresPerHour,
      departure_marina: boat.departureMarina,
      cancellation_policy: boat.cancellationPolicy,
      response_time: boat.responseTime,
      map_query: boat.mapQuery,
      external_calendar_url: toNullableTrimmed(boat.externalCalendarUrl),
      flash_sale_enabled: Boolean(boat.flashSaleEnabled),
      // voucher fields removed
      unavailable_dates: normalizeUnavailableDates(boat.unavailableDates),
      min_notice_hours: boat.minNoticeHours,
      capacity: boat.capacity,
      price_per_day: boat.pricePerDay,
      rating: boat.rating,
      images: stripDataUrl(boat.image),
      skipper_required: boat.skipperRequired,
      documents_folder: "",
      status: boat.status,
      bookings: boat.bookings,
      revenue: boat.revenue,
    })
    .select()
    .single();

  if (error || !insertedBoat) {
    // Surface full Supabase error context so callers (and logs) can see
    // which column/value caused database errors such as SQLSTATE 22007.
    const details = (error as any)?.details || "";
    const hint = (error as any)?.hint || "";
    const code = (error as any)?.code || "";
    const parts = [error?.message, details, hint, code && `code=${code}`].filter(Boolean);
    throw new Error(parts.join(" | ") || "Failed to add boat");
  }

  const imageBoatKey = String(insertedBoat.id);
  const documentsFolderPath = `${session.user.id}/${imageBoatKey}`;
  const documentsFolder = `boat-documents/${documentsFolderPath}`;

  let primaryImagePath = stripDataUrl(boat.image);
  if (boat.imageFile instanceof File) {
    primaryImagePath = await uploadBoatImageToStorage(boat.imageFile, session.user.id, imageBoatKey);
  }

  await boatsTable
    .update({
      images: primaryImagePath,
      documents_folder: documentsFolder,
      updated_at: getTodayIsoDate(),
    })
    .eq("id", insertedBoat.id)
    .eq("owner_id", session.user.id);

  await syncBoatSectorRows(insertedBoat.id, session.user.id, {
    partyReady: Boolean(boat.partyReady),
    type: String(boat.type ?? ""),
    name: String(boat.name ?? ""),
    location: String(boat.location ?? ""),
    description: String(boat.description ?? ""),
    departureMarina: String(boat.departureMarina ?? ""),
    capacity: Number(boat.capacity ?? 0),
    ticketMaxPeople: Number(boat.ticketMaxPeople ?? boat.capacity ?? 0),
    ticketPricePerPerson: Number(boat.ticketPricePerPerson ?? 0),
    partyEventDate: boat.partyEventDate ?? null,
    partyEventTime: boat.partyEventTime ?? null,
    partyTiers: Array.isArray((boat as any).partyTiers) ? (boat as any).partyTiers : [],
    image: primaryImagePath,
    status: boat.status,
    mapQuery: boat.mapQuery,
    flashSaleEnabled: Boolean(boat.flashSaleEnabled),
    pricePerDay: Number(boat.pricePerDay ?? 0),
  });

  if (safeFeatures.length > 0) {
    await featuresTable.insert(
      safeFeatures.map((feature) => ({
        boat_id: insertedBoat.id,
        feature,
      })),
    );
  }

  if (safeDocuments.length > 0) {
    const uploadedDocuments = await Promise.all(
      safeDocuments.map((document) => uploadBoatDocument(documentsFolderPath, document)),
    );

    await documentsTable.insert(
      uploadedDocuments.map((document) => ({
        boat_id: insertedBoat.id,
        name: document.name,
        file_path: document.file_path,
        file_type: document.file_type,
      })),
    );
  }

  return {
    ...boat,
    id: insertedBoat.id,
    ticketMaxPeople: boat.ticketMaxPeople,
    ticketPricePerPerson: boat.ticketPricePerPerson,
    skipperRequired: boat.skipperRequired,
    documentsFolder,
    image: resolveStorageImage(normalizeBoatImagePath(primaryImagePath), "boat-images", "/placeholder.svg"),
    documents: safeDocuments.map((document) => ({
      ...document,
      filePath: document.filePath || document.dataUrl || "",
      dataUrl: document.dataUrl || document.filePath,
    })),
  };
};

export const updateOwnerBoat = async (boatId: string, updates: OwnerBoatUpdateMutation): Promise<OwnerBoat | null> => {
  const session = await getSession();
  const boatsTable = (supabase as any).from("boats");
  const featuresTable = (supabase as any).from("boat_features");
  const documentsTable = (supabase as any).from("boat_documents");

  const { data: existingBoat, error: existingError } = await boatsTable
    .select("name, created_at, documents_folder, images")
    .eq("id", boatId)
    .eq("owner_id", session.user.id)
    .single();

  if (existingError) {
    throw new Error(existingError.message || "Failed to load boat for update");
  }

  let documentsFolderPath: string | null = null;
  if (existingBoat?.documents_folder) {
    const parsed = parseStorageReference(existingBoat.documents_folder, "boat-documents");
    if (parsed) {
      documentsFolderPath = parsed.path;
    }
  }
  if (!documentsFolderPath) {
    documentsFolderPath = `${session.user.id}/${boatId}`;
  }

  const boatUpdates: Record<string, unknown> = {
    updated_at: getTodayIsoDate(),
  };

  if (updates.name !== undefined) boatUpdates.name = updates.name;
  if (updates.type !== undefined) boatUpdates.type = isWatersportsType(updates.type) ? "rental" : updates.type;
  if (updates.location !== undefined) boatUpdates.location = updates.location;
  if (updates.description !== undefined) boatUpdates.description = updates.description;
  if (updates.lengthMeters !== undefined) boatUpdates.length_meters = updates.lengthMeters;
  if (updates.year !== undefined) boatUpdates.year = updates.year;
  if (updates.cruisingSpeedKnots !== undefined) boatUpdates.cruising_speed_knots = updates.cruisingSpeedKnots;
  if (updates.fuelBurnLitresPerHour !== undefined) boatUpdates.fuel_burn_litres_per_hour = updates.fuelBurnLitresPerHour;
  if (updates.departureMarina !== undefined) boatUpdates.departure_marina = updates.departureMarina;
  if (updates.cancellationPolicy !== undefined) boatUpdates.cancellation_policy = updates.cancellationPolicy;
  if (updates.responseTime !== undefined) boatUpdates.response_time = updates.responseTime;
  if (updates.mapQuery !== undefined) boatUpdates.map_query = updates.mapQuery;
  if (updates.externalCalendarUrl !== undefined) boatUpdates.external_calendar_url = toNullableTrimmed(updates.externalCalendarUrl);
  if (updates.flashSaleEnabled !== undefined) boatUpdates.flash_sale_enabled = updates.flashSaleEnabled;
  // voucher fields removed
  if (updates.unavailableDates !== undefined) {
    boatUpdates.unavailable_dates = normalizeUnavailableDates(updates.unavailableDates);
  }
  if (updates.minNoticeHours !== undefined) boatUpdates.min_notice_hours = updates.minNoticeHours;
  if (updates.capacity !== undefined) boatUpdates.capacity = updates.capacity;
  if (updates.pricePerDay !== undefined) boatUpdates.price_per_day = updates.pricePerDay;
  if (updates.rating !== undefined) boatUpdates.rating = updates.rating;
  if (updates.image !== undefined) boatUpdates.images = stripDataUrl(updates.image as string);
  if (updates.skipperRequired !== undefined) boatUpdates.skipper_required = updates.skipperRequired;
  if (updates.status !== undefined) boatUpdates.status = updates.status;
  if (updates.bookings !== undefined) boatUpdates.bookings = updates.bookings;
  if (updates.revenue !== undefined) boatUpdates.revenue = updates.revenue;

  const { error } = await boatsTable.update(boatUpdates).eq("id", boatId).eq("owner_id", session.user.id);

  if (error) {
    const details = (error as any)?.details || "";
    const hint = (error as any)?.hint || "";
    const code = (error as any)?.code || "";
    const parts = [error.message, details, hint, code && `code=${code}`].filter(Boolean);
    throw new Error(parts.join(" | ") || "Failed to update boat");
  }

  if (updates.imageFile instanceof File) {
    const uploadedPath = await uploadBoatImageToStorage(updates.imageFile, session.user.id, boatId);
    const { error: imageUpdateError } = await boatsTable
      .update({ images: uploadedPath, updated_at: getTodayIsoDate() })
      .eq("id", boatId)
      .eq("owner_id", session.user.id);

    if (imageUpdateError) {
      const details = (imageUpdateError as any)?.details || "";
      const hint = (imageUpdateError as any)?.hint || "";
      const code = (imageUpdateError as any)?.code || "";
      const parts = [imageUpdateError.message, details, hint, code && `code=${code}`].filter(Boolean);
      throw new Error(parts.join(" | ") || "Failed to save uploaded boat image");
    }
  }

  const partyBoatsTable = (supabase as any).from("party_boats");
  const { data: existingPartySector } = await partyBoatsTable
    .select("boat_id, party_tiers")
    .eq("boat_id", boatId)
    .eq("owner_id", session.user.id)
    .maybeSingle();

  const { data: refreshedBaseBoat } = await boatsTable
    .select("*")
    .eq("id", boatId)
    .eq("owner_id", session.user.id)
    .maybeSingle();

  if (refreshedBaseBoat) {
    await syncBoatSectorRows(boatId, session.user.id, {
      partyReady: Boolean(updates.partyReady ?? existingPartySector?.boat_id),
      type: String(updates.type ?? refreshedBaseBoat.type ?? ""),
      name: String(updates.name ?? refreshedBaseBoat.name ?? ""),
      location: String(updates.location ?? refreshedBaseBoat.location ?? ""),
      description: String(updates.description ?? refreshedBaseBoat.description ?? ""),
      departureMarina: String(updates.departureMarina ?? refreshedBaseBoat.departure_marina ?? ""),
      capacity: Number(updates.capacity ?? refreshedBaseBoat.capacity ?? 0),
      ticketMaxPeople: Number(updates.ticketMaxPeople ?? refreshedBaseBoat.capacity ?? 0),
      ticketPricePerPerson: Number(updates.ticketPricePerPerson ?? 0),
      partyEventDate: updates.partyEventDate ?? null,
      partyEventTime: updates.partyEventTime ?? null,
      partyTiers: Array.isArray((updates as any).partyTiers)
        ? (updates as any).partyTiers
        : parsePartyTiers(existingPartySector?.party_tiers),
      image: String(updates.image ?? refreshedBaseBoat.images ?? refreshedBaseBoat.image ?? ""),
      status: updates.status ?? refreshedBaseBoat.status,
      mapQuery: updates.mapQuery ?? refreshedBaseBoat.map_query,
      flashSaleEnabled: Boolean(updates.flashSaleEnabled ?? refreshedBaseBoat.flash_sale_enabled),
      pricePerDay: Number(updates.pricePerDay ?? refreshedBaseBoat.price_per_day ?? 0),
    });
  }

  if (updates.features) {
    await featuresTable.delete().eq("boat_id", boatId);
    if (updates.features.length > 0) {
      await featuresTable.insert(
        updates.features.map((feature) => ({
          boat_id: boatId,
          feature,
        })),
      );
    }
  }

  if (updates.documents) {
    await documentsTable.delete().eq("boat_id", boatId);
    if (updates.documents.length > 0) {
      const uploadedDocuments = await Promise.all(
        updates.documents.map((document) => uploadBoatDocument(documentsFolderPath!, document)),
      );

      await documentsTable.insert(
        uploadedDocuments.map((document) => ({
          boat_id: boatId,
          name: document.name,
          file_path: document.file_path,
          file_type: document.file_type,
        })),
      );

      await boatsTable
        .update({ documents_folder: `boat-documents/${documentsFolderPath}`, updated_at: new Date().toISOString() })
        .eq("id", boatId)
        .eq("owner_id", session.user.id);
    }
  }

  const refreshedBoats = await getOwnerBoats();
  return refreshedBoats.find((boat) => boat.id === boatId) ?? null;
};

export const deleteOwnerBoat = async (boatId: string): Promise<boolean> => {
  const session = await getSession();
  const { error } = await (supabase as any).from("boats").delete().eq("id", boatId).eq("owner_id", session.user.id);
  if (error) {
    throw new Error(error.message || "Failed to delete boat");
  }
  return true;
};

export const getOwnerPackages = async (): Promise<OwnerPackage[]> => {
  const session = await getSession();
  const packagesTable = (supabase as any).from("owner_packages");
  const packageBoatsTable = (supabase as any).from("owner_package_boats");

  const { data: packageRows, error } = await packagesTable
    .select("*")
    .eq("owner_id", session.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Failed to load packages");
  }

  const packages = Array.isArray(packageRows) ? packageRows : [];
  if (packages.length === 0) {
    return [];
  }

  const { data: packageBoatRows } = await packageBoatsTable
    .select("package_id, boat_id")
    .in("package_id", packages.map((pkg: any) => pkg.id));

  return packages.map((pkg: any) => ({
    id: pkg.id,
    name: pkg.name,
    duration: Number(pkg.duration_hours ?? 0),
    price: Number(pkg.price ?? 0),
    description: pkg.description ?? "",
    boatIds: Array.isArray(packageBoatRows)
      ? packageBoatRows
          .filter((row: any) => row.package_id === pkg.id)
          .map((row: any) => row.boat_id)
      : [],
  }));
};

const BOAT_EXTRA_MARKER = "[boat-extra]";

export const listBoatPackages = async (
  boatId: string,
): Promise<Array<{ id: string; name: string; duration: number; price: number; description: string }>> => {
  const session = await getSession();
  const packageBoatsTable = (supabase as any).from("owner_package_boats");

  const { data, error } = await packageBoatsTable
    .select("owner_packages(id, owner_id, name, duration_hours, price, description)")
    .eq("boat_id", boatId)
    .eq("owner_packages.owner_id", session.user.id);

  if (error) {
    throw new Error(error.message || "Failed to load boat packages");
  }

  const rows = Array.isArray(data) ? data : [];

  const corePackages = rows
    .map((row: any) => row.owner_packages)
    .filter((pkg: any) =>
      pkg && (!pkg.description || !String(pkg.description).includes(BOAT_EXTRA_MARKER)),
    )
    .map((pkg: any) => ({
      id: String(pkg.id),
      name: String(pkg.name ?? "Package"),
      duration: Number(pkg.duration_hours ?? 0),
      price: Number(pkg.price ?? 0),
      description: pkg.description ?? "",
    }))
    .filter((pkg) => pkg.duration > 0 && pkg.price > 0);

  return corePackages;
};

export const listBoatExtras = async (boatId: string): Promise<BoatExtra[]> => {
  const session = await getSession();
  const extrasTable = (supabase as any).from("owner_extras");
  const extraBoatsTable = (supabase as any).from("owner_extra_boats");

  const { data, error } = await extraBoatsTable
    .select("extra_id, owner_extras!inner(id, owner_id, name, price, description)")
    .eq("boat_id", boatId)
    .eq("owner_extras.owner_id", session.user.id);

  if (error) {
    throw new Error(error.message || "Failed to load boat extras");
  }

  return Array.isArray(data)
    ? data.map((row: any) => ({
        id: row.owner_extras.id,
        name: row.owner_extras.name,
        price: Number(row.owner_extras.price ?? 0),
      }))
    : [];
};

export const saveBoatExtras = async (
  boatId: string,
  extras: Array<{ name: string; price: number }>,
): Promise<void> => {
  const session = await getSession();
  const extrasTable = (supabase as any).from("owner_extras");
  const extraBoatsTable = (supabase as any).from("owner_extra_boats");

  const sanitizedExtras = extras
    .map((extra) => ({
      name: toTrimmed(extra.name),
      price: Number(extra.price) || 0,
    }))
    .filter((extra) => extra.name.length > 0);

  // Clear existing extras for this boat
  const { data: existingLinks } = await extraBoatsTable
    .select("extra_id")
    .eq("boat_id", boatId);

  const existingExtraIds = Array.isArray(existingLinks)
    ? existingLinks.map((row: any) => row.extra_id)
    : [];

  if (existingExtraIds.length > 0) {
    await extraBoatsTable
      .delete()
      .eq("boat_id", boatId);

    await extrasTable
      .delete()
      .eq("owner_id", session.user.id)
      .in("id", existingExtraIds);
  }

  if (sanitizedExtras.length === 0) {
    return;
  }

  const { data: insertedExtras, error: insertExtrasError } = await extrasTable
    .insert(
      sanitizedExtras.map((extra) => ({
        owner_id: session.user.id,
        name: extra.name,
        price: extra.price,
        description: `${BOAT_EXTRA_MARKER} Added from boat form`,
      })),
    )
    .select("id");

  if (insertExtrasError || !Array.isArray(insertedExtras)) {
    throw new Error(insertExtrasError?.message || "Failed to save boat extras");
  }

  const { error: linkError } = await extraBoatsTable.insert(
    insertedExtras.map((extra: any) => ({
      extra_id: extra.id,
      boat_id: boatId,
    })),
  );

  if (linkError) {
    throw new Error(linkError.message || "Failed to link boat extras");
  }
};

export const saveBoatPackages = async (
  boatId: string,
  packages: Array<{ name: string; duration: number; price: number; description?: string }>,
): Promise<void> => {
  const session = await getSession();
  const packagesTable = (supabase as any).from("owner_packages");
  const packageBoatsTable = (supabase as any).from("owner_package_boats");

  const BOAT_EXTRA_MARKER = "[boat-extra]";

  const sanitized = packages
    .map((pkg) => ({
      name: toTrimmed(pkg.name),
      duration: Number(pkg.duration) || 0,
      price: Number(pkg.price) || 0,
      description: toTrimmed(pkg.description),
    }))
    .filter((pkg) => pkg.name.length > 0 && pkg.duration > 0 && pkg.price > 0);

  const { data: existingLinks } = await packageBoatsTable
    .select("package_id, owner_packages!inner(id, owner_id, description)")
    .eq("boat_id", boatId)
    .eq("owner_packages.owner_id", session.user.id);

  const existingCorePackageIds = Array.isArray(existingLinks)
    ? existingLinks
        .filter((row: any) => {
          const desc = row.owner_packages?.description;
          return typeof desc !== "string" || !desc.includes(BOAT_EXTRA_MARKER);
        })
        .map((row: any) => row.package_id)
    : [];

  if (existingCorePackageIds.length > 0) {
    await packageBoatsTable
      .delete()
      .eq("boat_id", boatId)
      .in("package_id", existingCorePackageIds);

    await packagesTable
      .delete()
      .eq("owner_id", session.user.id)
      .in("id", existingCorePackageIds);
  }

  if (sanitized.length === 0) {
    return;
  }

  const { data: insertedPackages, error: insertPackagesError } = await packagesTable
    .insert(
      sanitized.map((pkg) => ({
        owner_id: session.user.id,
        name: pkg.name,
        duration_hours: pkg.duration,
        price: pkg.price,
        description: pkg.description,
      })),
    )
    .select("id");

  if (insertPackagesError || !Array.isArray(insertedPackages)) {
    throw new Error(insertPackagesError?.message || "Failed to save boat packages");
  }

  const { error: linkError } = await packageBoatsTable.insert(
    insertedPackages.map((pkg: any) => ({
      package_id: pkg.id,
      boat_id: boatId,
    })),
  );

  if (linkError) {
    throw new Error(linkError.message || "Failed to link boat packages");
  }
};

export const addOwnerPackage = async (pkg: Omit<OwnerPackage, "id">): Promise<OwnerPackage> => {
  const session = await getSession();
  const packagesTable = (supabase as any).from("owner_packages");
  const packageBoatsTable = (supabase as any).from("owner_package_boats");

  const { data, error } = await packagesTable
    .insert({
      owner_id: session.user.id,
      name: pkg.name,
      duration_hours: pkg.duration,
      price: pkg.price,
      description: pkg.description,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to add package");
  }

  if (pkg.boatIds.length > 0) {
    await packageBoatsTable.insert(
      pkg.boatIds.map((boatId) => ({
        package_id: data.id,
        boat_id: boatId,
      })),
    );
  }

  return { ...pkg, id: data.id };
};

export const updateOwnerPackage = async (id: string, updates: Partial<OwnerPackage>): Promise<OwnerPackage | null> => {
  const session = await getSession();
  const packagesTable = (supabase as any).from("owner_packages");
  const packageBoatsTable = (supabase as any).from("owner_package_boats");

  const packageUpdates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.name !== undefined) packageUpdates.name = updates.name;
  if (updates.duration !== undefined) packageUpdates.duration_hours = updates.duration;
  if (updates.price !== undefined) packageUpdates.price = updates.price;
  if (updates.description !== undefined) packageUpdates.description = updates.description;

  const { error } = await packagesTable.update(packageUpdates).eq("id", id).eq("owner_id", session.user.id);
  if (error) {
    throw new Error(error.message || "Failed to update package");
  }

  if (updates.boatIds) {
    await packageBoatsTable.delete().eq("package_id", id);
    if (updates.boatIds.length > 0) {
      await packageBoatsTable.insert(
        updates.boatIds.map((boatId) => ({
          package_id: id,
          boat_id: boatId,
        })),
      );
    }
  }

  const refreshedPackages = await getOwnerPackages();
  return refreshedPackages.find((pkg) => pkg.id === id) ?? null;
};

export const deleteOwnerPackage = async (id: string): Promise<boolean> => {
  const session = await getSession();
  await (supabase as any).from("owner_package_boats").delete().eq("package_id", id);
  const { error } = await (supabase as any).from("owner_packages").delete().eq("id", id).eq("owner_id", session.user.id);
  if (error) {
    throw new Error(error.message || "Failed to delete package");
  }
  return true;
};

export const getOwnerCalendarEvents = async (boatId?: string): Promise<OwnerCalendarEvent[]> => {
  if (!boatId) {
    return [];
  }

  await getSession();

  const { data, error } = await (supabase as any)
    .from("calendar_events")
    .select("id, boat_id, title, event_type, description, booking_id, start_time, end_time")
    .eq("boat_id", boatId)
    .order("start_time", { ascending: true });

  if (error) {
    throw new Error(error.message || "Failed to load calendar events");
  }

  const rows = Array.isArray(data) ? data : [];
  return rows.map((row: any): OwnerCalendarEvent => ({
    id: row.id,
    boatId: row.boat_id,
    // Derive a local YYYY-MM-DD date string from start_time
    date: row.start_time ? new Date(row.start_time).toISOString().slice(0, 10) : "",
    // Prefer structured event_type, fall back to title; default to "blocked" if unknown
    type: ((typeof row.event_type === "string" && ["booked", "blocked", "maintenance"].includes(row.event_type))
      ? row.event_type
      : (typeof row.title === "string" && ["booked", "blocked", "maintenance"].includes(row.title)
          ? row.title
          : "blocked")) as OwnerCalendarEvent["type"],
    guestName: row.description ?? undefined,
    bookingId: row.booking_id ?? undefined,
    startTime: row.start_time ?? null,
    endTime: row.end_time ?? null,
  }));
};

export const addCalendarEvent = async (event: Omit<OwnerCalendarEvent, "id">): Promise<OwnerCalendarEvent> => {
  const session = await getSession();

  if (!event.boatId) {
    throw new Error("Cannot create calendar event without a boatId");
  }

  const startIso = event.startTime
    ? new Date(`${event.date}T${event.startTime}:00`).toISOString()
    : new Date(`${event.date}T00:00:00`).toISOString();
  const endIso = event.endTime
    ? new Date(`${event.date}T${event.endTime}:00`).toISOString()
    : null;

  const { data, error } = await (supabase as any)
    .from("calendar_events")
    .insert({
      user_id: session.user.id,
      boat_id: event.boatId,
      title: event.type,
      event_type: event.type,
      description: event.guestName ?? null,
      location: null,
      start_time: startIso,
      end_time: endIso,
      all_day: false,
      timezone: null,
      booking_id: event.bookingId ?? null,
    })
    .select("id, boat_id, title, booking_id, start_time, end_time")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to create calendar event");
  }

  return {
    id: data.id,
    boatId: data.boat_id,
    date: data.start_time ? new Date(data.start_time).toISOString().slice(0, 10) : event.date,
    type: (typeof data.title === "string" && ["booked", "blocked", "maintenance"].includes(data.title))
      ? (data.title as OwnerCalendarEvent["type"])
      : event.type,
    guestName: event.guestName,
    bookingId: data.booking_id ?? undefined,
    startTime: data.start_time ?? null,
    endTime: data.end_time ?? null,
  };
};

export const deleteCalendarEvent = async (id: string): Promise<boolean> => {
  const session = await getSession();

  // Fetch event to enforce that only blocked/maintenance can be deleted here
  const { data: row, error: fetchError } = await (supabase as any)
    .from("calendar_events")
    .select("id, event_type, user_id")
    .eq("id", id)
    .eq("user_id", session.user.id)
    .single();

  if (fetchError || !row) {
    throw new Error(fetchError?.message || "Calendar event not found or not owned by this user");
  }

  if (row.event_type === "booked") {
    throw new Error("Booked events are managed via bookings. Change or cancel the booking instead.");
  }

  const { error } = await (supabase as any)
    .from("calendar_events")
    .delete()
    .eq("id", id)
    .eq("user_id", session.user.id);

  if (error) {
    throw new Error(error.message || "Failed to delete calendar event");
  }

  return true;
};

export const getOwnerStats = async (): Promise<OwnerStats> => {
  const boats = await getOwnerBoats();
  const totalBookings = boats.reduce((sum, boat) => sum + boat.bookings, 0);
  const totalRevenue = boats.reduce((sum, boat) => sum + boat.revenue, 0);
  const averageRating = boats.length > 0
    ? (boats.reduce((sum, boat) => sum + boat.rating, 0) / boats.length).toFixed(1)
    : "0.0";

  return {
    listedBoats: boats.length,
    totalBookings,
    totalRevenue,
    averageRating,
  };
};

export const getOwnerBookings = async (): Promise<OwnerBooking[]> => {
  const session = await getSession();

  const { data, error } = await (supabase as any)
    .from("bookings")
    .select(
      "id, boat_id, boat_name, customer_name, start_date, end_date, departure_time, end_time, guests, status, total_price, boats!inner(owner_id, name)",
    )
    .eq("boats.owner_id", session.user.id)
    .order("start_date", { ascending: false })
    .limit(80);

  if (error) {
    throw new Error(error.message || "Failed to load owner bookings");
  }

  const rows = Array.isArray(data) ? data : [];
  return rows.map((row: any): OwnerBooking => ({
    id: String(row.id),
    boatName: String(row.boat_name || row.boats?.name || "Boat"),
    customerName: String(row.customer_name || "Guest"),
    date: String(row.start_date || ""),
    departureTime: String(row.departure_time || ""),
    guests: Number(row.guests ?? 0),
    status: String(row.status || "confirmed"),
    totalPrice: Number(row.total_price ?? 0),
    endDate: row.end_date ? String(row.end_date) : null,
    endTime: row.end_time ? String(row.end_time) : null,
  }));
};

export const updateOwnerBookingStatus = async (bookingId: string, status: string): Promise<void> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const apiBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL?.trim?.() ?? "";
  const base = apiBaseUrl ? apiBaseUrl.replace(/\/$/, "") : "";
  const url = `${base}/api/owner/bookings/${encodeURIComponent(bookingId)}/status`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to update booking status");
  }
};
