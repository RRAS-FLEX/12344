import { supabase } from "@/lib/supabase";

const AVATAR_BUCKET = "profile-images";
const AVATAR_OBJECT_NAME = "avatar";

const toReadableStorageError = (error: unknown, fallback: string) => {
  const errorLike = error as { message?: string } | null | undefined;
  const message = String(errorLike?.message ?? fallback);
  const normalized = message.toLowerCase();

  if (normalized.includes("bucket") && normalized.includes("not")) {
    return "Profile avatar storage is not ready. Create a Supabase Storage bucket named 'profile-images'.";
  }

  return message || fallback;
};

const getAvatarObjectPath = (userId: string | null | undefined) => {
  const normalized = String(userId ?? "").trim();
  return `${normalized}/${AVATAR_OBJECT_NAME}`;
};

export const getUserAvatarUrl = async (userId: string | null | undefined): Promise<string | null> => {
  const normalized = String(userId ?? "").trim();
  if (!normalized) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(getAvatarObjectPath(normalized), 60 * 60 * 24 * 7);

  if (error || !data?.signedUrl) {
    const message = String(error?.message ?? "").toLowerCase();
    if (message.includes("not found") || message.includes("no such object")) {
      return null;
    }
    throw new Error(toReadableStorageError(error, "Failed to load avatar"));
  }

  return data.signedUrl;
};

export const uploadUserAvatar = async (userId: string | null | undefined, file: File): Promise<string> => {
  const normalized = String(userId ?? "").trim();
  if (!normalized) {
    throw new Error("Missing user account context for avatar upload.");
  }

  if (!(file instanceof File)) {
    throw new Error("Please select an image file.");
  }

  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(getAvatarObjectPath(normalized), file, {
      upsert: true,
      contentType: file.type || "image/jpeg",
    });

  if (error) {
    throw new Error(toReadableStorageError(error, "Failed to upload avatar"));
  }

  const signedUrl = await getUserAvatarUrl(userId);
  if (!signedUrl) {
    throw new Error("Avatar uploaded but URL could not be resolved.");
  }

  return `${signedUrl}${signedUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;
};
