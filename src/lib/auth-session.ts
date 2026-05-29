const AUTH_PERSISTENCE_KEY = "nautiplex.auth.rememberMe";
const AUTH_REMEMBERED_AT_KEY = "nautiplex.auth.rememberedAt";
const LEGACY_AUTH_PERSISTENCE_KEY = "nautiq.auth.rememberMe";
const LEGACY_AUTH_REMEMBERED_AT_KEY = "nautiq.auth.rememberedAt";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const canUseBrowserStorage = () => typeof window !== "undefined";

const readBrowserStorage = (storage: Storage, key: string) => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const writeBrowserStorage = (storage: Storage, key: string, value: string) => {
  try {
    storage.setItem(key, value);
  } catch {
    // Ignore storage quota / privacy errors.
  }
};

const removeBrowserStorage = (storage: Storage, key: string) => {
  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage quota / privacy errors.
  }
};

const getPersistentStorage = () => {
  if (!canUseBrowserStorage()) {
    return null;
  }

  return window.localStorage;
};

const getSessionStorage = () => {
  if (!canUseBrowserStorage()) {
    return null;
  }

  return window.sessionStorage;
};

const migrateAuthPreferenceKeys = () => {
  const storage = getPersistentStorage();
  if (!storage) {
    return;
  }

  const hasNextRemember = readBrowserStorage(storage, AUTH_PERSISTENCE_KEY);
  const legacyRemember = readBrowserStorage(storage, LEGACY_AUTH_PERSISTENCE_KEY);
  if (hasNextRemember === null && legacyRemember !== null) {
    writeBrowserStorage(storage, AUTH_PERSISTENCE_KEY, legacyRemember);
  }

  const hasNextRememberedAt = readBrowserStorage(storage, AUTH_REMEMBERED_AT_KEY);
  const legacyRememberedAt = readBrowserStorage(storage, LEGACY_AUTH_REMEMBERED_AT_KEY);
  if (hasNextRememberedAt === null && legacyRememberedAt !== null) {
    writeBrowserStorage(storage, AUTH_REMEMBERED_AT_KEY, legacyRememberedAt);
  }

  if (legacyRemember !== null) {
    removeBrowserStorage(storage, LEGACY_AUTH_PERSISTENCE_KEY);
  }

  if (legacyRememberedAt !== null) {
    removeBrowserStorage(storage, LEGACY_AUTH_REMEMBERED_AT_KEY);
  }
};

export const getRememberMePreference = (): boolean => {
  migrateAuthPreferenceKeys();

  const storage = getPersistentStorage();
  if (!storage) {
    return false;
  }

  return readBrowserStorage(storage, AUTH_PERSISTENCE_KEY) === "true";
};

export const setRememberMePreference = (rememberMe: boolean) => {
  migrateAuthPreferenceKeys();

  const storage = getPersistentStorage();
  if (!storage) {
    return;
  }

  writeBrowserStorage(storage, AUTH_PERSISTENCE_KEY, rememberMe ? "true" : "false");
};

export const ensureRememberedSessionIssuedAt = () => {
  migrateAuthPreferenceKeys();

  if (!getRememberMePreference()) {
    return;
  }

  const storage = getPersistentStorage();
  if (!storage) {
    return;
  }

  const existing = readBrowserStorage(storage, AUTH_REMEMBERED_AT_KEY);
  if (existing) {
    return;
  }

  writeBrowserStorage(storage, AUTH_REMEMBERED_AT_KEY, String(Date.now()));
};

export const markRememberedSessionIssuedAt = () => {
  migrateAuthPreferenceKeys();

  if (!getRememberMePreference()) {
    return;
  }

  const storage = getPersistentStorage();
  if (!storage) {
    return;
  }

  writeBrowserStorage(storage, AUTH_REMEMBERED_AT_KEY, String(Date.now()));
};

export const clearRememberedSessionIssuedAt = () => {
  migrateAuthPreferenceKeys();

  const storage = getPersistentStorage();
  if (!storage) {
    return;
  }

  removeBrowserStorage(storage, AUTH_REMEMBERED_AT_KEY);
};

export const isRememberedSessionExpired = (maxAgeMs = THIRTY_DAYS_MS) => {
  migrateAuthPreferenceKeys();

  if (!getRememberMePreference()) {
    return false;
  }

  const storage = getPersistentStorage();
  if (!storage) {
    return false;
  }

  const raw = readBrowserStorage(storage, AUTH_REMEMBERED_AT_KEY);
  if (!raw) {
    return false;
  }

  const startedAt = Number(raw);
  if (!Number.isFinite(startedAt)) {
    return false;
  }

  return Date.now() - startedAt > maxAgeMs;
};

export const createAuthStorageAdapter = () => ({
  getItem: (key: string) => {
    if (!canUseBrowserStorage()) {
      return null;
    }

    const persistentStorage = getPersistentStorage();
    const sessionStorage = getSessionStorage();
    const rememberMe = getRememberMePreference();

    const primaryValue = rememberMe
      ? readBrowserStorage(persistentStorage ?? window.localStorage, key)
      : readBrowserStorage(sessionStorage ?? window.sessionStorage, key);

    if (primaryValue !== null) {
      return primaryValue;
    }

    const fallbackStorage = rememberMe
      ? sessionStorage
      : persistentStorage;

    return fallbackStorage ? readBrowserStorage(fallbackStorage, key) : null;
  },
  setItem: (key: string, value: string) => {
    if (!canUseBrowserStorage()) {
      return;
    }

    const persistentStorage = getPersistentStorage();
    const sessionStorage = getSessionStorage();
    const rememberMe = getRememberMePreference();

    if (rememberMe) {
      if (persistentStorage) {
        writeBrowserStorage(persistentStorage, key, value);
      }

      if (sessionStorage) {
        removeBrowserStorage(sessionStorage, key);
      }
      return;
    }

    if (sessionStorage) {
      writeBrowserStorage(sessionStorage, key, value);
    }

    if (persistentStorage) {
      removeBrowserStorage(persistentStorage, key);
    }
  },
  removeItem: (key: string) => {
    if (!canUseBrowserStorage()) {
      return;
    }

    const persistentStorage = getPersistentStorage();
    const sessionStorage = getSessionStorage();

    if (persistentStorage) {
      removeBrowserStorage(persistentStorage, key);
    }

    if (sessionStorage) {
      removeBrowserStorage(sessionStorage, key);
    }
  },
});

