import { useState, useEffect, useCallback } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { supabase } from "@/lib/supabase";

const STORAGE_KEY = "nautiplex_favorites";
const LEGACY_STORAGE_KEY = "nautiq_favorites";
const remoteFavoritesCache = new Map<string, Set<string>>();
const remoteSyncInFlight = new Map<string, Promise<Set<string>>>();

const loadFavorites = (): Set<string> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return new Set();

    const parsed = new Set(JSON.parse(raw) as string[]);

    if (!localStorage.getItem(STORAGE_KEY) && parsed.size > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...parsed]));
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }

    return parsed;
  } catch {
    return new Set();
  }
};

const saveFavorites = (ids: Set<string>) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // localStorage may be unavailable in some environments
  }
};

const cloneSet = (ids: Set<string>) => new Set<string>(ids);

const fetchRemoteFavorites = async (userId: string): Promise<Set<string>> => {
  const cached = remoteFavoritesCache.get(userId);
  if (cached) {
    return cloneSet(cached);
  }

  const inFlight = remoteSyncInFlight.get(userId);
  if (inFlight) {
    return inFlight.then(cloneSet);
  }

  const request = (async () => {
    const { data, error } = await supabase
      .from("favorites")
      .select("boat_id")
      .eq("user_id", userId);

    if (error) {
      return new Set<string>();
    }

    const next = new Set<string>(
      Array.isArray(data) ? data.map((row: { boat_id: string }) => row.boat_id) : [],
    );

    remoteFavoritesCache.set(userId, cloneSet(next));
    return next;
  })();

  remoteSyncInFlight.set(userId, request);

  try {
    const resolved = await request;
    return cloneSet(resolved);
  } finally {
    remoteSyncInFlight.delete(userId);
  }
};

export const useFavorites = () => {
  const { user } = useCurrentUser();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(loadFavorites);

  useEffect(() => {
    saveFavorites(favoriteIds);
  }, [favoriteIds]);

  useEffect(() => {
    let isMounted = true;

    const syncFavorites = async () => {
      if (!user?.id) {
        if (isMounted) {
          setFavoriteIds(loadFavorites());
        }
        return;
      }

      const localFavorites = loadFavorites();
      const remoteFavorites = await fetchRemoteFavorites(user.id);

      const mergedFavorites = new Set<string>([...localFavorites, ...remoteFavorites]);

      if (mergedFavorites.size > remoteFavorites.size) {
        const { error } = await supabase
          .from("favorites")
          .upsert(
            [...mergedFavorites].map((boatId) => ({ user_id: user.id, boat_id: boatId })),
            { onConflict: "user_id,boat_id", ignoreDuplicates: true },
          );

        if (!error) {
          remoteFavoritesCache.set(user.id, cloneSet(mergedFavorites));
        }
      }

      if (isMounted) {
        setFavoriteIds(mergedFavorites);
      }
    };

    void syncFavorites();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  const isFavorite = useCallback((id: string) => favoriteIds.has(id), [favoriteIds]);

  const refreshFromRemote = useCallback(async (userId: string) => {
    const next = await fetchRemoteFavorites(userId);
    setFavoriteIds(next);
  }, []);

  const persistFavoriteChange = useCallback(
    async (userId: string, boatId: string, shouldFavorite: boolean) => {
      if (shouldFavorite) {
        const { error } = await supabase
          .from("favorites")
          .upsert({ user_id: userId, boat_id: boatId }, { onConflict: "user_id,boat_id" });

        if (error) {
          await refreshFromRemote(userId);
        } else {
          const cached = remoteFavoritesCache.get(userId) ?? new Set<string>();
          cached.add(boatId);
          remoteFavoritesCache.set(userId, cloneSet(cached));
        }
        return;
      }

      const { error } = await supabase
        .from("favorites")
        .delete()
        .eq("user_id", userId)
        .eq("boat_id", boatId);

      if (error) {
        await refreshFromRemote(userId);
      } else {
        const cached = remoteFavoritesCache.get(userId) ?? new Set<string>();
        cached.delete(boatId);
        remoteFavoritesCache.set(userId, cloneSet(cached));
      }
    },
    [refreshFromRemote],
  );

  const toggleFavorite = useCallback((id: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      const hasFavorite = next.has(id);
      if (hasFavorite) {
        next.delete(id);
      } else {
        next.add(id);
      }

      if (user?.id) {
        void persistFavoriteChange(user.id, id, !hasFavorite);
      }

      return next;
    });
  }, [persistFavoriteChange, user?.id]);

  return { favoriteIds: [...favoriteIds], isFavorite, toggleFavorite };
};

