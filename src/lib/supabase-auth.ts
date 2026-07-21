import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { DatabaseUsersRow } from "./supabase";
import {
  clearRememberedSessionIssuedAt,
  ensureRememberedSessionIssuedAt,
  isRememberedSessionExpired,
  markRememberedSessionIssuedAt,
  setRememberMePreference,
} from "./auth-session";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isOwner: boolean;
}

const AUTH_USER_CACHE_KEY = "nautiplex.auth.user";

const readCachedAuthUser = (): AuthUser | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(AUTH_USER_CACHE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<AuthUser>;
    if (!parsed?.id || !parsed?.email || !parsed?.name) {
      return null;
    }

    return {
      id: String(parsed.id),
      email: String(parsed.email),
      name: String(parsed.name),
      isOwner: Boolean(parsed.isOwner),
    };
  } catch {
    return null;
  }
};

const writeCachedAuthUser = (authUser: AuthUser | null) => {
  if (typeof window === "undefined") {
    return;
  }

  if (!authUser) {
    window.localStorage.removeItem(AUTH_USER_CACHE_KEY);
    return;
  }

  window.localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(authUser));
};

const toReadableAuthError = (message?: string) => {
  const normalizedMessage = message?.trim().toLowerCase() ?? "";

  if (
    normalizedMessage.includes("email rate limit exceeded") ||
    normalizedMessage.includes("over_email_send_rate_limit")
  ) {
    return "Supabase email sending is rate-limited right now. Wait a few minutes, or disable email confirmation in Supabase: Authentication > Providers > Email > Confirm email.";
  }

  if (normalizedMessage.includes("user already registered")) {
    return "This email is already registered. Try signing in instead.";
  }

  if (normalizedMessage.includes("invalid login credentials")) {
    return "Invalid email or password.";
  }

  return message || "Authentication failed";
};

const mapProfileToAuthUser = (profile: DatabaseUsersRow): AuthUser => ({
  id: profile.id,
  email: profile.email,
  name: profile.name,
  isOwner: profile.is_owner ?? false,
});

const mapSessionToAuthUser = (user: User): AuthUser => ({
  id: user.id,
  email: user.email?.trim().toLowerCase() ?? "",
  name: buildProfileName(user),
  isOwner: false,
});

const buildProfileName = (user: User, fallbackName?: string) => {
  const metadataName = typeof user.user_metadata?.name === "string" ? user.user_metadata.name.trim() : "";
  if (metadataName) {
    return metadataName;
  }

  if (fallbackName?.trim()) {
    return fallbackName.trim();
  }

  const email = user.email?.trim();
  if (email) {
    return email.split("@")[0];
  }

  return "Nautiplex User";
};

const ensureUserProfile = async (user: User, fallbackName?: string): Promise<DatabaseUsersRow> => {
  const email = user.email?.trim().toLowerCase();
  if (!email) {
    throw new Error("Supabase user is missing an email address");
  }

  const usersTable = supabase.from("users");

  const { data, error } = await usersTable.upsert(
      {
        id: user.id,
        email,
        name: buildProfileName(user, fallbackName),
      },
      { onConflict: "id" }
    )
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to create or load user profile");
  }

  return data;
};

/**
 * Sign up with email and password using Supabase Auth
 * Also creates a user record in the users table
 */
export const signUpWithEmail = async (
  name: string,
  email: string,
  password: string,
  options?: { rememberMe?: boolean }
): Promise<AuthUser> => {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedName = name.trim();
  const rememberMe = Boolean(options?.rememberMe);

  setRememberMePreference(rememberMe);

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: {
        name: normalizedName,
      },
    },
  });

  if (authError || !authData.user) {
    throw new Error(toReadableAuthError(authError?.message || "Failed to sign up"));
  }

  if (!authData.session) {
    throw new Error("Account created. Confirm your email, then sign in.");
  }

  const profile = await ensureUserProfile(authData.user, normalizedName);
  const authUser = mapProfileToAuthUser(profile);
  if (rememberMe) {
    markRememberedSessionIssuedAt();
  } else {
    clearRememberedSessionIssuedAt();
  }
  writeCachedAuthUser(authUser);
  return authUser;
};

export const signInWithGoogle = async (
  redirectTo?: string,
  options?: { rememberMe?: boolean }
): Promise<void> => {
  const target = redirectTo || `${window.location.origin}/`;
  setRememberMePreference(Boolean(options?.rememberMe));
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: target,
    },
  });

  if (error) {
    throw new Error(toReadableAuthError(error.message || "Google sign in failed"));
  }
};

/**
 * Sign in with email and password
 */
export const signInWithEmail = async (
  email: string,
  password: string,
  options?: { rememberMe?: boolean }
): Promise<AuthUser> => {
  const usersTable = supabase.from("users");
  const rememberMe = Boolean(options?.rememberMe);

  setRememberMePreference(rememberMe);

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error || !data.user) {
    throw new Error(toReadableAuthError(error?.message || "Invalid email or password"));
  }

  // Fetch user profile
  const { data: userData, error: userError } = await usersTable
    .select("*")
    .eq("id", data.user.id)
    .single();

  if (userError || !userData) {
    try {
      const profile = await ensureUserProfile(data.user);
      const authUser = mapProfileToAuthUser(profile);
      if (rememberMe) {
        markRememberedSessionIssuedAt();
      } else {
        clearRememberedSessionIssuedAt();
      }
      writeCachedAuthUser(authUser);
      return authUser;
    } catch {
      const sessionFallback = mapSessionToAuthUser(data.user);
      const cachedUser = readCachedAuthUser();
      const resolved = cachedUser && cachedUser.id === sessionFallback.id
        ? { ...sessionFallback, isOwner: cachedUser.isOwner }
        : sessionFallback;
      if (rememberMe) {
        markRememberedSessionIssuedAt();
      } else {
        clearRememberedSessionIssuedAt();
      }
      writeCachedAuthUser(resolved);
      return resolved;
    }
  }

  const authUser = mapProfileToAuthUser(userData);
  if (rememberMe) {
    markRememberedSessionIssuedAt();
  } else {
    clearRememberedSessionIssuedAt();
  }
  writeCachedAuthUser(authUser);
  return authUser;
};

// Resolves the app-level profile for an already-known auth user. Deliberately
// does not call supabase.auth.getSession()/getUser() — GoTrueClient invokes
// onAuthStateChange callbacks while holding its internal session lock, and
// calling another session-locking method from inside that callback (or from
// anything it transitively calls) deadlocks forever. Callers that already
// have a `session.user` (from getSession() or from the onAuthStateChange
// callback's own argument) should go through this instead.
const resolveUserProfile = async (user: User): Promise<AuthUser> => {
  if (isRememberedSessionExpired()) {
    await signOut();
    return mapSessionToAuthUser(user);
  }

  ensureRememberedSessionIssuedAt();

  const sessionFallback = mapSessionToAuthUser(user);

  const { data: userData, error: userError } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();

  if (userError || !userData) {
    try {
      const profile = await ensureUserProfile(user);
      const authUser = mapProfileToAuthUser(profile);
      writeCachedAuthUser(authUser);
      return authUser;
    } catch {
      const cachedUser = readCachedAuthUser();
      const resolved = cachedUser && cachedUser.id === sessionFallback.id
        ? { ...sessionFallback, isOwner: cachedUser.isOwner }
        : sessionFallback;
      writeCachedAuthUser(resolved);
      return resolved;
    }
  }

  const authUser = mapProfileToAuthUser(userData);
  writeCachedAuthUser(authUser);
  return authUser;
};

const SESSION_CHECK_TIMEOUT_MS = 2500;
const TIMED_OUT = Symbol("session-check-timed-out");

// supabase-js's getSession() occasionally never resolves (observed hang tied to
// its internal cross-tab session lock, most consistently right after a fresh
// page load). Rather than let that strand the visitor on a permanent loading
// screen, race it against a timeout and fall back to the last-known cached
// user so the app stays usable even when the live check stalls.
const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> =>
  Promise.race([
    promise,
    new Promise<typeof TIMED_OUT>((resolve) => setTimeout(() => resolve(TIMED_OUT), ms)),
  ]);

/**
 * Get the currently signed-in user (from Supabase session)
 */
export const getSessionUser = async (): Promise<AuthUser | null> => {
  const result = await withTimeout(supabase.auth.getSession(), SESSION_CHECK_TIMEOUT_MS);

  if (result === TIMED_OUT) {
    return readCachedAuthUser();
  }

  const {
    data: { session },
    error: sessionError,
  } = result;

  if (sessionError || !session?.user) {
    return null;
  }

  return resolveUserProfile(session.user);
};

/**
 * Sign out the current user
 */
export const signOut = async (): Promise<void> => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message || "Failed to sign out");
  }

  clearRememberedSessionIssuedAt();
  writeCachedAuthUser(null);
};

/**
 * Listen to auth state changes (for reactive UI updates)
 */
export const onAuthStateChange = (
  callback: (user: AuthUser | null) => void
): (() => void) => {
  const { data: listener } = supabase.auth.onAuthStateChange(
    async (_event, session) => {
      if (!session?.user) {
        callback(null);
        return;
      }

      // Use the session already provided instead of calling getSessionUser()
      // (which calls getSession()) — see resolveUserProfile's comment above.
      const user = await resolveUserProfile(session.user);
      callback(user ?? mapSessionToAuthUser(session.user));
    }
  );

  return () => {
    listener?.subscription.unsubscribe();
  };
};

