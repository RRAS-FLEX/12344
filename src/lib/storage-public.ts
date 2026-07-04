const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";

const ABSOLUTE_URL = /^https?:\/\//i;
const DATA_URL = /^data:/i;
const STORAGE_OBJECT_PATH = /^\/?storage\/v1\/object\/(public|sign)\/([^/]+)\/(.+)$/i;
const KNOWN_BUCKETS = new Set([
  "boat-images",
  "destination-images",
  "profile-images",
  "review-media",
  "boat-documents",
  "owner-verification-docs",
  "chat-attachments",
  "payment-receipts",
  "support-attachments",
  "temp-uploads",
  "news-images",
]);

const encodeStoragePath = (path: string) =>
  path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

export const getPublicStorageUrl = (bucket: string, path: string): string => {
  if (!supabaseUrl || !path.trim()) {
    return "";
  }

  const normalizedPath = path.replace(/^\/+/, "");
  return `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodeStoragePath(normalizedPath)}`;
};

export const parseStorageReference = (
  value: string | null | undefined,
  defaultBucket: string,
): { bucket: string; path: string } | null => {
	const trimmed = String(value ?? "").trim();
  if (!trimmed || ABSOLUTE_URL.test(trimmed) || DATA_URL.test(trimmed)) {
    return null;
  }

  const relativeStorageMatch = trimmed.match(STORAGE_OBJECT_PATH);
  if (relativeStorageMatch) {
    const [, , bucket, rawPath] = relativeStorageMatch;
    const cleanPath = String(rawPath ?? "").split("?")[0].replace(/^\/+/, "");
    if (!cleanPath) return null;
    return { bucket, path: cleanPath };
  }

  const bucketPrefix = `${defaultBucket}/`;
  if (trimmed.startsWith(bucketPrefix)) {
    return {
      bucket: defaultBucket,
      path: trimmed.slice(bucketPrefix.length).replace(/^\/+/, ""),
    };
  }

  const firstSlash = trimmed.indexOf("/");
  if (firstSlash > 0) {
    const maybeBucket = trimmed.slice(0, firstSlash);
    const maybePath = trimmed.slice(firstSlash + 1).replace(/^\/+/, "");
    if (KNOWN_BUCKETS.has(maybeBucket) && maybePath) {
      return { bucket: maybeBucket, path: maybePath };
    }
  }

  return {
    bucket: defaultBucket,
    path: trimmed.replace(/^\/+/, ""),
  };
};

export const resolveStorageImage = (
  value: string | null | undefined,
  defaultBucket: string,
  fallback = "",
): string => {
	const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return fallback;
  }

  if (ABSOLUTE_URL.test(trimmed) || DATA_URL.test(trimmed)) {
    return trimmed;
  }

  const relativeStorageMatch = trimmed.match(STORAGE_OBJECT_PATH);
  if (relativeStorageMatch) {
    const [, , bucket, rawPath] = relativeStorageMatch;
    const cleanPath = String(rawPath ?? "").split("?")[0].replace(/^\/+/, "");
    return getPublicStorageUrl(bucket, cleanPath) || fallback;
  }

  const bucketPrefix = `${defaultBucket}/`;
  if (trimmed.startsWith(bucketPrefix)) {
    return getPublicStorageUrl(defaultBucket, trimmed.slice(bucketPrefix.length)) || fallback;
  }

  const firstSlash = trimmed.indexOf("/");
  if (firstSlash > 0) {
    const maybeBucket = trimmed.slice(0, firstSlash);
    const maybePath = trimmed.slice(firstSlash + 1);
    if (KNOWN_BUCKETS.has(maybeBucket)) {
      return getPublicStorageUrl(maybeBucket, maybePath) || fallback;
    }
  }

  return getPublicStorageUrl(defaultBucket, trimmed) || fallback;
};
