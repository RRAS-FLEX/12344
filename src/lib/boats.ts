import { supabase } from "./supabase";
import { fetchJsonFromEndpoints, resolveBoatImageSignEndpoints } from "./api-endpoints";
import { parseStorageReference, resolveStorageImage } from "./storage-public";

export interface BoatOwner {
	name: string;
	title: string;
	joinedYear: number;
	tripsHosted: number;
	responseRate: number;
	bio: string;
	languages: string[];
	isSuperhost: boolean;
}

export interface Boat {
	id: string;
	publicSlug: string;
	image: string;
	images: string[];
	name: string;
	type: string;
	lengthMeters: number;
	year: number;
	cruisingSpeedKnots: number;
	fuelBurnLitresPerHour: number;
	capacity: number;
	location: string;
	departureMarina: string;
	pricePerDay: number;
	ticketMaxPeople: number;
	ticketPricePerPerson: number;
	rating: number;
	description: string;
	amenities: string[];
	cancellationPolicy: string;
	responseTime: string;
	owner: BoatOwner;
	availability: {
		unavailableDates: string[];
		minNoticeHours: number;
	};
	mapQuery: string;
	externalCalendarUrl: string;
	flashSaleEnabled: boolean;
	partyReady: boolean;
	partyEventDate?: string | null;
	partyEventTime?: string | null;
	partyTiers?: Array<{ name: string; price: number }>;
	skipperRequired: boolean;
	bookings: number;
	revenue: number;
}

type BoatFeatureRow = {
	feature?: string | null;
};

type BoatUserRow = {
	name?: string | null;
	owner_title?: string | null;
	owner_bio?: string | null;
	owner_languages?: string[] | null;
	is_superhost?: boolean | null;
	response_rate?: number | null;
	created_at?: string | null;
	stripe_payouts_ready?: boolean | null;
};

type BoatRow = {
	id: string;
	name: string;
	location: string;
	type?: string | null;
	length_meters?: number | null;
	year?: number | null;
	cruising_speed_knots?: number | null;
	fuel_burn_litres_per_hour?: number | null;
	capacity?: number | null;
	departure_marina?: string | null;
	price_per_day?: number | null;
	rating?: number | null;
	description?: string | null;
	cancellation_policy?: string | null;
	response_time?: string | null;
	unavailable_dates?: string[] | null;
	min_notice_hours?: number | null;
	map_query?: string | null;
	external_calendar_url?: string | null;
	flash_sale_enabled?: boolean | null;
	skipper_required?: boolean | null;
	bookings?: number | null;
	revenue?: number | null;
	status?: string | null;
	images?: string[] | string | null;
	image?: string | null;
	boat_features?: BoatFeatureRow[] | null;
	users?: BoatUserRow | null;
	owner?: BoatUserRow | null;
};

type PackagePriceRow = {
	boat_id?: string | null;
	owner_packages?: {
		price?: number | null;
	} | null;
};

type PartyBoatRow = {
	boat_id?: string | null;
	id?: string | null;
	owner_id?: string | null;
	name?: string | null;
	location?: string | null;
	description?: string | null;
	departure_marina?: string | null;
	capacity?: number | null;
	ticket_max_people?: number | null;
	ticket_price_per_person?: number | null;
	party_tiers?: unknown;
	party_event_date?: string | null;
	party_event_time?: string | null;
	images?: string | null;
	status?: string | null;
	map_query?: string | null;
	flash_sale_enabled?: boolean | null;
	owner?: BoatUserRow | null;
	users?: BoatUserRow | null;
};

type WatersportsBoatRow = {
	boat_id?: string | null;
};

const BOATS_CACHE_KEY = "nautiplex:boats-cache:v6";
const BOATS_CACHE_TTL_MS = 5 * 60 * 1000;
const BOATS_CACHE_MAX_STALE_MS = 24 * 60 * 60 * 1000;

const isBrowser = typeof window !== "undefined";

type BoatsCachePayload = {
	updatedAt: number;
	boats: Boat[];
};

let boatsInMemory: BoatsCachePayload | null = null;
let boatsInFlight: Promise<Boat[]> | null = null;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isFresh = (updatedAt: number, ttlMs: number) => Date.now() - updatedAt <= ttlMs;

const readCachedBoats = (): BoatsCachePayload | null => {
	if (!isBrowser) return null;
	try {
		const raw = window.localStorage.getItem(BOATS_CACHE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);

		if (Array.isArray(parsed)) {
			return {
				updatedAt: 0,
				boats: parsed as Boat[],
			};
		}

		if (
			typeof parsed === "object" &&
			parsed !== null &&
			Array.isArray((parsed as BoatsCachePayload).boats)
		) {
			return parsed as BoatsCachePayload;
		}

		return null;
	} catch {
		return null;
	}
};

const writeCachedBoats = (boats: Boat[]) => {
	if (!isBrowser) return;
	try {
		const payload: BoatsCachePayload = {
			updatedAt: Date.now(),
			boats,
		};
		window.localStorage.setItem(BOATS_CACHE_KEY, JSON.stringify(payload));
		boatsInMemory = payload;
	} catch {
		// Ignore cache write failures.
	}
};

const slugifySegment = (value: string) =>
	value
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/-{2,}/g, "-");

const shortBoatToken = (id: string) => {
	let hash = 5381;
	for (const char of id) {
		hash = (hash * 33) ^ char.charCodeAt(0);
	}
	return Math.abs(hash >>> 0).toString(36).slice(0, 6);
};

export const buildBoatPublicSlug = (boatLike: { id: string; name: string; location: string }) => {
	const base = [slugifySegment(boatLike.name), slugifySegment(boatLike.location)]
		.filter(Boolean)
		.join("-");
	return `${base || "boat"}-${shortBoatToken(boatLike.id)}`;
};

export const buildBoatDetailsPath = (boatLike: { id: string; name: string; location: string; publicSlug?: string }) =>
	`/boats/${boatLike.publicSlug || buildBoatPublicSlug(boatLike)}`;

export const isBoatReferenceMatch = (boat: Pick<Boat, "id" | "publicSlug" | "name" | "location">, reference: string) => {
	const normalizedReference = String(reference ?? "").trim();
	if (!normalizedReference) return false;
	return (
		boat.id === normalizedReference ||
		boat.publicSlug === normalizedReference ||
		buildBoatPublicSlug(boat) === normalizedReference
	);
};

const hasFileExtension = (value: string) => /\.\w{2,6}(\?|$)/.test(value);

const normalizeImageCandidate = (value: string): string => {
	const trimmed = value.trim();
	if (!trimmed) return "";

	if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
		try {
			const parsed = JSON.parse(trimmed);
			if (Array.isArray(parsed) && parsed.length > 0) {
				return normalizeImageCandidate(String(parsed[0] ?? ""));
			}
		} catch {
			// Continue to additional parsers.
		}
	}

	if (trimmed.includes(",")) {
		const first = trimmed
			.split(",")
			.map((part) => part.trim())
			.find(Boolean);
		if (first) {
			return normalizeImageCandidate(first);
		}
	}

	return trimmed;
};

const getBoatImageCandidates = (row: BoatRow): string[] => {
	const rawImages = row.images;
	const legacyImage = row.image;

	if (Array.isArray(rawImages)) {
		const candidates = rawImages
			.map((value) => normalizeImageCandidate(String(value ?? "")))
			.filter(Boolean);
		if (candidates.length > 0) return candidates;
	}

	if (typeof rawImages === "string" && rawImages.trim()) {
		const candidate = normalizeImageCandidate(rawImages);
		if (candidate) return [candidate];
	}

	if (typeof legacyImage === "string" && legacyImage.trim()) {
		const candidate = normalizeImageCandidate(legacyImage);
		if (candidate) return [candidate];
	}

	return [];
};

const toSignableBoatImagePath = (value: string): string | null => {
	const trimmed = String(value ?? "").trim();
	if (!trimmed) return null;

	const normalized = hasFileExtension(trimmed)
		? trimmed
		: trimmed.replace(/\/+$/, "");

	const parsed = parseStorageReference(normalized, "boat-images");
	if (!parsed || parsed.bucket !== "boat-images" || !parsed.path) {
		return null;
	}

	return parsed.path;
};

const getBoatImageSignPaths = (row: BoatRow): string[] => {
	const imageCandidates = getBoatImageCandidates(row);
	if (imageCandidates.length === 0) {
		return [];
	}

	return imageCandidates
		.map((candidate) => toSignableBoatImagePath(candidate))
		.filter((path): path is string => Boolean(path));
};

const fetchSignedBoatImageUrls = async (rows: BoatRow[]): Promise<Map<string, string>> => {
	const uniquePaths = Array.from(new Set(rows.flatMap((row) => getBoatImageSignPaths(row))));
	if (uniquePaths.length === 0) {
		return new Map();
	}

	try {
		const payload = await fetchJsonFromEndpoints<{ urls?: Record<string, string> }>(
			resolveBoatImageSignEndpoints(),
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					paths: uniquePaths,
					expiresIn: 3600,
				}),
			},
		);

		const map = new Map<string, string>();
		for (const [path, signedUrl] of Object.entries(payload?.urls ?? {})) {
			if (typeof signedUrl === "string" && signedUrl.trim()) {
				map.set(path, signedUrl);
			}
		}

		return map;
	} catch {
		return new Map();
	}
};

const resolveBoatImages = (row: BoatRow, signedImageUrls?: Map<string, string>): string[] => {
	const imageCandidates = getBoatImageCandidates(row);
	if (imageCandidates.length === 0) {
		return [];
	}

	const resolveCandidate = (candidate: string) => {
		const signPath = toSignableBoatImagePath(candidate);
		if (signPath) {
			const signedUrl = signedImageUrls?.get(signPath);
			if (signedUrl) return signedUrl;

			if (hasFileExtension(signPath)) {
				const folderPathNoSlash = signPath.replace(/\/[^/]+$/, "");
				const folderPathWithSlash = `${folderPathNoSlash}/`;
				const folderSignedUrl =
					signedImageUrls?.get(folderPathNoSlash) ||
					signedImageUrls?.get(folderPathWithSlash);
				if (folderSignedUrl) return folderSignedUrl;
			}
		}

		return resolveStorageImage(candidate, "boat-images", candidate);
	};

	const firstCandidate = imageCandidates[0];
	if (!hasFileExtension(firstCandidate)) {
		const normalized = `${firstCandidate.replace(/\/+$/, "")}/1.jpg`;
		return [resolveCandidate(normalized)].filter(Boolean);
	}

	return imageCandidates.map((candidate) => resolveCandidate(candidate));
};

const parsePartyTiers = (value: unknown): Array<{ name: string; price: number }> | undefined => {
	if (!value) return undefined;
	const parsed = typeof value === "string" ? (() => {
		try {
			return JSON.parse(value);
		} catch {
			return null;
		}
	})() : value;

	if (!Array.isArray(parsed)) return undefined;

	const tiers = parsed
		.map((tier) => {
			if (!tier || typeof tier !== "object") return null;
			const rawName = (tier as { name?: unknown }).name;
			const rawPrice = (tier as { price?: unknown }).price;
			const name = String(rawName ?? "").trim();
			const price = Number(rawPrice ?? 0);
			if (!name || !Number.isFinite(price) || price < 0) return null;
			return { name, price };
		})
		.filter((tier): tier is { name: string; price: number } => Boolean(tier));

	return tiers.length > 0 ? tiers : undefined;
};

const mapRow = (
	row: BoatRow,
	sector: { party?: PartyBoatRow; watersports?: WatersportsBoatRow },
	options?: { ignorePayoutsCheck?: boolean; signedImageUrls?: Map<string, string>; packagePriceByBoatId?: Map<string, number> },
): Boat => {
	const resolvedImages = resolveBoatImages(row, options?.signedImageUrls);
	
	// Use the aliased 'owner' relationship if available, fallback to 'users' for backward compatibility
	const ownerData = row.owner || row.users;
	
	// Ensure we have owner data - use the owner relationship if available
	const ownerName = ownerData?.name?.trim() || "Owner";
	const ownerTitle = (ownerData?.owner_title?.trim() as string | undefined) || "Boat Owner";
	const ownerBio = (ownerData?.owner_bio?.trim() as string | undefined) || "";
	const ownerLanguages = Array.isArray(ownerData?.owner_languages) && ownerData.owner_languages.length > 0 
		? ownerData.owner_languages 
		: ["English"];
	const ownerIsSuperhost = Boolean(ownerData?.is_superhost);
	const ownerResponseRate = Math.min(100, Math.max(0, Number(ownerData?.response_rate ?? 95)));
	const ownerJoinedYear = ownerData?.created_at 
		? new Date(ownerData.created_at).getFullYear() 
		: new Date().getFullYear();
	const ownerPayoutsReady = ownerData?.stripe_payouts_ready !== false;

	// Hide boats from owners who have not completed Stripe payouts for
	// public/visitor contexts. Owner previews can bypass this via options.
	if (!ownerPayoutsReady && !options?.ignorePayoutsCheck) {
		throw new Error("Owner payouts not ready");
	}

	const party = sector.party;
	const watersports = sector.watersports;
	const isPartyBoat = Boolean(party?.boat_id);
	const isWatersportsBoat = Boolean(watersports?.boat_id);
	const packagePrice = options?.packagePriceByBoatId?.get(row.id) ?? 0;
	const partyTicketMax = Number(party?.ticket_max_people ?? row.capacity ?? 0);
	const partyTicketPrice = Number(party?.ticket_price_per_person ?? 0);
	const parsedPartyTiers = parsePartyTiers(party?.party_tiers);

	return {
	id: row.id,
	publicSlug: buildBoatPublicSlug({ id: row.id, name: row.name, location: row.location }),
	images: resolvedImages,
	image: resolvedImages[0] ?? "/placeholder.svg",
	name: row.name,
	type: isWatersportsBoat ? "watersports" : (row.type ?? "rental"),
	lengthMeters: Number(row.length_meters ?? 0),
	year: Number(row.year ?? 0),
	cruisingSpeedKnots: Number(row.cruising_speed_knots ?? 0),
	fuelBurnLitresPerHour: Number(row.fuel_burn_litres_per_hour ?? 0),
	capacity: Number(row.capacity),
	location: row.location,
	departureMarina: row.departure_marina ?? row.location,
	pricePerDay: Number.isFinite(packagePrice) ? packagePrice : 0,
	ticketMaxPeople: isPartyBoat ? partyTicketMax : Number(row.capacity ?? 0),
	ticketPricePerPerson: isPartyBoat ? partyTicketPrice : 0,
	rating: Number(row.rating ?? 0),
	description: row.description ?? "",
	amenities: (row.boat_features ?? [])
		.map((featureRow) => featureRow.feature)
		.filter((feature): feature is string => Boolean(feature)),
	cancellationPolicy: row.cancellation_policy ?? "Contact owner for details",
	responseTime: row.response_time ?? "",
	owner: {
		name: ownerName,
		title: ownerTitle,
		joinedYear: ownerJoinedYear,
		tripsHosted: Number(row.bookings ?? 0),
		responseRate: ownerResponseRate,
		bio: ownerBio,
		languages: ownerLanguages,
		isSuperhost: ownerIsSuperhost,
	},
	availability: {
		unavailableDates: Array.isArray(row.unavailable_dates) ? row.unavailable_dates : [],
		minNoticeHours: Number(row.min_notice_hours ?? 24),
	},
	mapQuery: row.map_query ?? `${row.location}, Greece`,
	externalCalendarUrl: row.external_calendar_url ?? "",
	flashSaleEnabled: Boolean(row.flash_sale_enabled),
	partyReady: isPartyBoat,
	partyEventDate: isPartyBoat ? (party?.party_event_date ?? null) : null,
	partyEventTime: isPartyBoat ? (party?.party_event_time ?? null) : null,
	partyTiers: isPartyBoat ? parsedPartyTiers : undefined,
	// Voucher fields removed
	skipperRequired: Boolean(row.skipper_required),
	bookings: Number(row.bookings ?? 0),
	revenue: Number(row.revenue ?? 0),
	};
};

const BOAT_SELECT =
	"*, boat_features(feature), owner:owner_id(id, name, created_at, owner_title, owner_bio, owner_languages, is_superhost, response_rate, stripe_payouts_ready)";
const BOAT_SELECT_FALLBACK =
	"id, name, type, location, capacity, rating, images, image, bookings, status, created_at, owner:owner_id(id, name, created_at, stripe_payouts_ready), boat_features(feature)";
const BOAT_SELECT_MINIMAL =
	"id, name, type, location, capacity, rating, images, image, skipper_required, bookings, revenue, status, created_at";

export const isPublicBoatStatus = (status: unknown): boolean => {
	const normalized = String(status ?? "").trim().toLowerCase();
	if (!normalized) return true;
	return !["inactive", "maintenance", "archived", "draft"].includes(normalized);
};

const queryBoats = (selectClause: string) =>
	supabase.from("boats").select(selectClause);

const loadSectorMaps = async (boatIds: string[]) => {
	const partyByBoatId = new Map<string, PartyBoatRow>();
	const watersportsByBoatId = new Map<string, WatersportsBoatRow>();

	if (boatIds.length === 0) {
		return { partyByBoatId, watersportsByBoatId };
	}

	const [partyResult, watersportsResult] = await Promise.all([
		supabase
			.from("party_boats")
			.select("boat_id, ticket_max_people, ticket_price_per_person, party_tiers, party_event_date, party_event_time")
			.in("boat_id", boatIds),
		supabase
			.from("watersports_boats")
			.select("boat_id")
			.in("boat_id", boatIds),
	]);

	if (!partyResult.error && Array.isArray(partyResult.data)) {
		for (const partyRow of partyResult.data as unknown as PartyBoatRow[]) {
			const key = String(partyRow.boat_id ?? "").trim();
			if (key) partyByBoatId.set(key, partyRow);
		}
	}

	if (!watersportsResult.error && Array.isArray(watersportsResult.data)) {
		for (const wsRow of watersportsResult.data as unknown as WatersportsBoatRow[]) {
			const key = String(wsRow.boat_id ?? "").trim();
			if (key) watersportsByBoatId.set(key, wsRow);
		}
	}

	return { partyByBoatId, watersportsByBoatId };
};

const loadPartyBoats = async (boatIds?: string[]) => {
	const partyBoatsTable = supabase.from("party_boats");
	const selectWithBoatId =
		"boat_id, id, owner_id, name, location, description, departure_marina, capacity, ticket_max_people, ticket_price_per_person, party_tiers, party_event_date, party_event_time, images, status, map_query, flash_sale_enabled, owner:owner_id(id, name, created_at, owner_title, owner_bio, owner_languages, is_superhost, response_rate, stripe_payouts_ready)";
	const selectIdOnly =
		"id, owner_id, name, location, description, departure_marina, capacity, ticket_max_people, ticket_price_per_person, party_tiers, party_event_date, party_event_time, images, status, map_query, flash_sale_enabled, owner:owner_id(id, name, created_at, owner_title, owner_bio, owner_languages, is_superhost, response_rate, stripe_payouts_ready)";

	const queryWithBoatId = partyBoatsTable.select(selectWithBoatId);
	const withBoatId = boatIds && boatIds.length > 0 ? await queryWithBoatId.in("boat_id", boatIds) : await queryWithBoatId;
	if (!withBoatId.error && Array.isArray(withBoatId.data)) {
		return withBoatId.data as unknown as PartyBoatRow[];
	}

	const queryIdOnly = partyBoatsTable.select(selectIdOnly);
	const idOnly = boatIds && boatIds.length > 0 ? await queryIdOnly.in("id", boatIds) : await queryIdOnly;
	if (idOnly.error || !Array.isArray(idOnly.data)) {
		return [] as PartyBoatRow[];
	}

	return idOnly.data as unknown as PartyBoatRow[];
};

const partyBoatImageRows = (partyRows: PartyBoatRow[]): BoatRow[] =>
	partyRows.map((partyRow) => ({
		id: String(partyRow.boat_id ?? partyRow.id ?? "").trim() || String(partyRow.id ?? "").trim(),
		name: String(partyRow.name ?? "Party Boat"),
		location: String(partyRow.location ?? ""),
		images: partyRow.images ?? null,
		image: partyRow.images ?? null,
	}));

const mapPartyBoatRow = (
	partyRow: PartyBoatRow,
	options?: { ignorePayoutsCheck?: boolean; signedImageUrls?: Map<string, string> },
): Boat => {
	const boatId = String(partyRow.boat_id ?? partyRow.id ?? "").trim();
	const syntheticRow: BoatRow = {
		id: boatId,
		name: String(partyRow.name ?? "Party Boat"),
		location: String(partyRow.location ?? ""),
		type: "Party Boat",
		capacity: Number(partyRow.capacity ?? partyRow.ticket_max_people ?? 0),
		departure_marina: String(partyRow.departure_marina ?? partyRow.name ?? ""),
		rating: 0,
		description: String(partyRow.description ?? ""),
		map_query: String(partyRow.map_query ?? `${partyRow.name ?? "Party Boat"}, ${partyRow.location ?? ""}`),
		flash_sale_enabled: Boolean(partyRow.flash_sale_enabled),
		images: partyRow.images ?? null,
		image: partyRow.images ?? null,
		status: String(partyRow.status ?? "active"),
		boat_features: [],
	};

	const ownerData = partyRow.owner || partyRow.users;
	const ownerName = ownerData?.name?.trim() || "Owner";
	const ownerTitle = (ownerData?.owner_title?.trim() as string | undefined) || "Boat Owner";
	const ownerBio = (ownerData?.owner_bio?.trim() as string | undefined) || "";
	const ownerLanguages = Array.isArray(ownerData?.owner_languages) && ownerData.owner_languages.length > 0
		? ownerData.owner_languages
		: ["English"];
	const ownerIsSuperhost = Boolean(ownerData?.is_superhost);
	const ownerResponseRate = Math.min(100, Math.max(0, Number(ownerData?.response_rate ?? 95)));
	const ownerJoinedYear = ownerData?.created_at ? new Date(ownerData.created_at).getFullYear() : new Date().getFullYear();
	const ownerPayoutsReady = ownerData?.stripe_payouts_ready !== false;

	if (!ownerPayoutsReady && !options?.ignorePayoutsCheck) {
		throw new Error("Owner payouts not ready");
	}

	const partyTicketPrice = Number(partyRow.ticket_price_per_person ?? 0);
	const parsedPartyTiers = parsePartyTiers(partyRow.party_tiers);
	const mapped = mapRow(
		syntheticRow,
		{
			party: {
				boat_id: boatId,
				ticket_max_people: Number(partyRow.ticket_max_people ?? partyRow.capacity ?? 0),
				ticket_price_per_person: partyTicketPrice,
				party_tiers: partyRow.party_tiers,
				party_event_date: partyRow.party_event_date ?? null,
				party_event_time: partyRow.party_event_time ?? null,
			},
			watersports: undefined,
		},
		{
			ignorePayoutsCheck: true,
			signedImageUrls: options?.signedImageUrls,
			packagePriceByBoatId: new Map([[boatId, partyTicketPrice]]),
		},
	);

	return {
		...mapped,
		name: String(partyRow.name ?? mapped.name),
		type: "Party Boat",
		location: String(partyRow.location ?? mapped.location),
		departureMarina: String(partyRow.departure_marina ?? mapped.departureMarina),
		pricePerDay: partyTicketPrice,
		ticketMaxPeople: Number(partyRow.ticket_max_people ?? partyRow.capacity ?? 0),
		ticketPricePerPerson: partyTicketPrice,
		description: String(partyRow.description ?? mapped.description),
		owner: {
			name: ownerName,
			title: ownerTitle,
			joinedYear: ownerJoinedYear,
			tripsHosted: Number(mapped.bookings ?? 0),
			responseRate: ownerResponseRate,
			bio: ownerBio,
			languages: ownerLanguages,
			isSuperhost: ownerIsSuperhost,
		},
		availability: { unavailableDates: [], minNoticeHours: mapped.availability.minNoticeHours },
		mapQuery: String(partyRow.map_query ?? mapped.mapQuery),
		flashSaleEnabled: Boolean(partyRow.flash_sale_enabled),
		partyReady: true,
		partyEventDate: partyRow.party_event_date ?? null,
		partyEventTime: partyRow.party_event_time ?? null,
		partyTiers: parsedPartyTiers,
	};
};

const loadPackagePriceMap = async (boatIds: string[]) => {
	const priceByBoatId = new Map<string, number>();

	if (boatIds.length === 0) {
		return priceByBoatId;
	}

	const { data, error } = await supabase
		.from("owner_package_boats")
		.select("boat_id, owner_packages(price)")
		.in("boat_id", boatIds);

	if (error || !Array.isArray(data)) {
		return priceByBoatId;
	}

	for (const row of data as unknown as PackagePriceRow[]) {
		const boatId = String(row.boat_id ?? "").trim();
		const price = Number(row.owner_packages?.price ?? 0);
		if (!boatId || !Number.isFinite(price) || price <= 0) {
			continue;
		}

		const current = priceByBoatId.get(boatId);
		if (!current || price < current) {
			priceByBoatId.set(boatId, price);
		}
	}

	return priceByBoatId;
};

const filterBoatRowsByVisibility = (rows: BoatRow[], includeInactive = false) =>
	includeInactive ? rows : rows.filter((row) => isPublicBoatStatus(row?.status));

const fetchBoatsFromSupabase = async (includeInactive = false) => {
	const partyRows = await loadPartyBoats();
	const partyBoatIds = new Set(partyRows.map((row) => String(row.boat_id ?? row.id ?? "").trim()).filter(Boolean));
	const primary = await queryBoats(BOAT_SELECT);
	if (!primary.error) {
		const rows = filterBoatRowsByVisibility((primary.data ?? []) as unknown as BoatRow[], includeInactive)
			.filter((row) => !partyBoatIds.has(row.id));
		const partyImageRows = partyBoatImageRows(partyRows);
		const boatIds = rows.map((row) => row.id).filter(Boolean);
		const [sectorMaps, packagePriceByBoatId] = await Promise.all([loadSectorMaps(boatIds), loadPackagePriceMap(boatIds)]);
		const signedImageUrls = await fetchSignedBoatImageUrls([...rows, ...partyImageRows]);
		const visible: Boat[] = [];
		for (const row of rows) {
			try {
				visible.push(
					mapRow(
						row,
						{ party: sectorMaps.partyByBoatId.get(row.id), watersports: sectorMaps.watersportsByBoatId.get(row.id) },
						{ signedImageUrls, packagePriceByBoatId },
					),
				);
			} catch (error) {
				// Skip boats that fail mapping (e.g. owner payouts not ready).
				console.warn("Skipping boat row due to mapping error", error);
			}
		}
		for (const partyRow of partyRows) {
			try {
				visible.push(mapPartyBoatRow(partyRow, { signedImageUrls }));
			} catch (error) {
				console.warn("Skipping party boat row due to mapping error", error);
			}
		}
		return visible;
	}

	const relationFallback = await queryBoats(BOAT_SELECT_FALLBACK);
	if (!relationFallback.error) {
		const rows = filterBoatRowsByVisibility((relationFallback.data ?? []) as unknown as BoatRow[], includeInactive)
			.filter((row) => !partyBoatIds.has(row.id));
		const partyImageRows = partyBoatImageRows(partyRows);
		const boatIds = rows.map((row) => row.id).filter(Boolean);
		const [sectorMaps, packagePriceByBoatId] = await Promise.all([loadSectorMaps(boatIds), loadPackagePriceMap(boatIds)]);
		const signedImageUrls = await fetchSignedBoatImageUrls([...rows, ...partyImageRows]);
		const visible: Boat[] = [];
		for (const row of rows) {
			try {
				visible.push(
					mapRow(
						row,
						{ party: sectorMaps.partyByBoatId.get(row.id), watersports: sectorMaps.watersportsByBoatId.get(row.id) },
						{ signedImageUrls, packagePriceByBoatId },
					),
				);
			} catch (error) {
				console.warn("Skipping boat row due to mapping error", error);
			}
		}
		for (const partyRow of partyRows) {
			try {
				visible.push(mapPartyBoatRow(partyRow, { signedImageUrls }));
			} catch (error) {
				console.warn("Skipping party boat row due to mapping error", error);
			}
		}
		return visible;
	}

	const minimal = await queryBoats(BOAT_SELECT_MINIMAL);
	if (!minimal.error) {
		const rows = filterBoatRowsByVisibility((minimal.data ?? []) as unknown as BoatRow[], includeInactive)
			.filter((row) => !partyBoatIds.has(row.id));
		const partyImageRows = partyBoatImageRows(partyRows);
		const boatIds = rows.map((row) => row.id).filter(Boolean);
		const [sectorMaps, packagePriceByBoatId] = await Promise.all([loadSectorMaps(boatIds), loadPackagePriceMap(boatIds)]);
		const signedImageUrls = await fetchSignedBoatImageUrls([...rows, ...partyImageRows]);
		const visible: Boat[] = [];
		for (const row of rows) {
			try {
				visible.push(
					mapRow(
						row,
						{ party: sectorMaps.partyByBoatId.get(row.id), watersports: sectorMaps.watersportsByBoatId.get(row.id) },
						{ signedImageUrls, packagePriceByBoatId },
					),
				);
			} catch (error) {
				console.warn("Skipping boat row due to mapping error", error);
			}
		}
		for (const partyRow of partyRows) {
			try {
				visible.push(mapPartyBoatRow(partyRow, { signedImageUrls }));
			} catch (error) {
				console.warn("Skipping party boat row due to mapping error", error);
			}
		}
		return visible;
	}

	const minimalWithoutStatus = await supabase
		.from("boats")
		.select(BOAT_SELECT_MINIMAL);

	if (!minimalWithoutStatus.error) {
		const rows = filterBoatRowsByVisibility((minimalWithoutStatus.data ?? []) as unknown as BoatRow[], includeInactive)
			.filter((row) => !partyBoatIds.has(row.id));
		const partyImageRows = partyBoatImageRows(partyRows);
		const boatIds = rows.map((row) => row.id).filter(Boolean);
		const [sectorMaps, packagePriceByBoatId] = await Promise.all([loadSectorMaps(boatIds), loadPackagePriceMap(boatIds)]);
		const signedImageUrls = await fetchSignedBoatImageUrls([...rows, ...partyImageRows]);
		const visible: Boat[] = [];
		for (const row of rows) {
			try {
				visible.push(
					mapRow(
						row,
						{ party: sectorMaps.partyByBoatId.get(row.id), watersports: sectorMaps.watersportsByBoatId.get(row.id) },
						{ signedImageUrls, packagePriceByBoatId },
					),
				);
			} catch (error) {
				console.warn("Skipping boat row due to mapping error", error);
			}
		}
		for (const partyRow of partyRows) {
			try {
				visible.push(mapPartyBoatRow(partyRow, { signedImageUrls }));
			} catch (error) {
				console.warn("Skipping party boat row due to mapping error", error);
			}
		}
		return visible;
	}

	throw new Error(
		minimalWithoutStatus.error?.message ||
			minimal.error?.message ||
			relationFallback.error?.message ||
			primary.error?.message ||
			"Failed to load boats",
	);
};

export const getBoats = async (): Promise<Boat[]> => {
	if (boatsInMemory && isFresh(boatsInMemory.updatedAt, BOATS_CACHE_TTL_MS)) {
		return boatsInMemory.boats;
	}

	const cached = readCachedBoats();
	if (cached && isFresh(cached.updatedAt, BOATS_CACHE_TTL_MS) && cached.boats.length > 0) {
		boatsInMemory = cached;
		return cached.boats;
	}

	if (boatsInFlight) {
		return boatsInFlight;
	}

	boatsInFlight = (async () => {
		try {
			const boats = await fetchBoatsFromSupabase();
			writeCachedBoats(boats);
			return boats;
		} catch {
			if (cached && cached.boats.length > 0 && isFresh(cached.updatedAt, BOATS_CACHE_MAX_STALE_MS)) {
				boatsInMemory = cached;
				return cached.boats;
			}

			if (boatsInMemory?.boats?.length) {
				return boatsInMemory.boats;
			}

			return [];
		} finally {
			boatsInFlight = null;
		}
	})();

	return boatsInFlight;
};

export const getBoatById = async (id: string): Promise<Boat | null> => {
	const normalizedId = String(id ?? "").trim();
	if (!UUID_REGEX.test(normalizedId)) {
		return null;
	}

	const { data, error } = await supabase
		.from("boats")
		.select(BOAT_SELECT)
		.eq("id", normalizedId)
		.maybeSingle();

	if (!error && data) {
		const row = data as unknown as BoatRow;
		const sectorMaps = await loadSectorMaps([row.id]);
		const signedImageUrls = await fetchSignedBoatImageUrls([row]);
		return mapRow(row, { party: sectorMaps.partyByBoatId.get(row.id), watersports: sectorMaps.watersportsByBoatId.get(row.id) }, { signedImageUrls });
	}

	const { data: fallbackData, error: fallbackError } = await supabase
		.from("boats")
		.select(BOAT_SELECT_FALLBACK)
		.eq("id", normalizedId)
		.maybeSingle();

	if (!fallbackError && fallbackData) {
		const row = fallbackData as unknown as BoatRow;
		const sectorMaps = await loadSectorMaps([row.id]);
		const signedImageUrls = await fetchSignedBoatImageUrls([row]);
		return mapRow(row, { party: sectorMaps.partyByBoatId.get(row.id), watersports: sectorMaps.watersportsByBoatId.get(row.id) }, { signedImageUrls });
	}

	const { data: minimalData, error: minimalError } = await supabase
		.from("boats")
		.select(BOAT_SELECT_MINIMAL)
		.eq("id", normalizedId)
		.maybeSingle();

	if (!minimalError && minimalData) {
		const row = minimalData as unknown as BoatRow;
		const sectorMaps = await loadSectorMaps([row.id]);
		const signedImageUrls = await fetchSignedBoatImageUrls([row]);
		return mapRow(row, { party: sectorMaps.partyByBoatId.get(row.id), watersports: sectorMaps.watersportsByBoatId.get(row.id) }, { signedImageUrls });
	}

	const partyRows = await loadPartyBoats([normalizedId]);
	if (partyRows.length > 0) {
		const signedImageUrls = await fetchSignedBoatImageUrls(partyBoatImageRows(partyRows));
		return mapPartyBoatRow(partyRows[0], { ignorePayoutsCheck: true, signedImageUrls });
	}

	return null;
};

// Owner-only helper: fetch a boat by ID even if Stripe payouts are not ready.
// Used for owner dashboard previews so owners can view their boat page
// before connecting payouts or while adjusting settings.
export const getBoatByIdForOwner = async (id: string): Promise<Boat | null> => {
	const normalizedId = String(id ?? "").trim();
	if (!UUID_REGEX.test(normalizedId)) {
		return null;
	}

	const { data, error } = await supabase
		.from("boats")
		.select(BOAT_SELECT)
		.eq("id", normalizedId)
		.maybeSingle();

	if (!error && data) {
		const row = data as unknown as BoatRow;
		const sectorMaps = await loadSectorMaps([row.id]);
		const signedImageUrls = await fetchSignedBoatImageUrls([row]);
		return mapRow(row, { party: sectorMaps.partyByBoatId.get(row.id), watersports: sectorMaps.watersportsByBoatId.get(row.id) }, { ignorePayoutsCheck: true, signedImageUrls });
	}

	const { data: fallbackData, error: fallbackError } = await supabase
		.from("boats")
		.select(BOAT_SELECT_FALLBACK)
		.eq("id", normalizedId)
		.maybeSingle();

	if (!fallbackError && fallbackData) {
		const row = fallbackData as unknown as BoatRow;
		const sectorMaps = await loadSectorMaps([row.id]);
		const signedImageUrls = await fetchSignedBoatImageUrls([row]);
		return mapRow(row, { party: sectorMaps.partyByBoatId.get(row.id), watersports: sectorMaps.watersportsByBoatId.get(row.id) }, { ignorePayoutsCheck: true, signedImageUrls });
	}

	const { data: minimalData, error: minimalError } = await supabase
		.from("boats")
		.select(BOAT_SELECT_MINIMAL)
		.eq("id", normalizedId)
		.maybeSingle();

	if (!minimalError && minimalData) {
		const row = minimalData as unknown as BoatRow;
		const sectorMaps = await loadSectorMaps([row.id]);
		const signedImageUrls = await fetchSignedBoatImageUrls([row]);
		return mapRow(row, { party: sectorMaps.partyByBoatId.get(row.id), watersports: sectorMaps.watersportsByBoatId.get(row.id) }, { ignorePayoutsCheck: true, signedImageUrls });
	}

	const partyRows = await loadPartyBoats([normalizedId]);
	if (partyRows.length > 0) {
		const signedImageUrls = await fetchSignedBoatImageUrls(partyBoatImageRows(partyRows));
		return mapPartyBoatRow(partyRows[0], { ignorePayoutsCheck: true, signedImageUrls });
	}

	return null;
};

export const getBoatByPublicReference = async (reference: string): Promise<Boat | null> => {
	const normalizedReference = String(reference ?? "").trim();
	if (!normalizedReference) {
		return null;
	}

	const directMatch = await getBoatById(normalizedReference);
	if (directMatch) {
		return directMatch;
	}

	try {
		const allBoats = await fetchBoatsFromSupabase(true);
		const matchedBoat = allBoats.find((boat) => isBoatReferenceMatch(boat, normalizedReference));
		if (matchedBoat) return matchedBoat;
	} catch {
		// Fallback to cached/public fetch path below.
	}

	const boats = await getBoats();
	return boats.find((boat) => isBoatReferenceMatch(boat, normalizedReference)) ?? null;
};


