import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAuthStorageAdapter } from "./auth-session";

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          name: string;
          is_owner: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          name: string;
          is_owner?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          name?: string;
          is_owner?: boolean;
          updated_at?: string;
        };
      };
      boats: {
        Row: {
          id: string;
          owner_id: string;
          location_id: string | null;
          name: string;
          description: string | null;
          type: string;
          location: string;
          capacity: number;
          price: number | null;
          rating: number;
          image: string;
          images: string | null;
          skipper_required: boolean | null;
          documents_folder: string | null;
          image_url: string | null;
          stripe_link: string | null;
          status: "active" | "inactive" | "maintenance";
          bookings: number;
          revenue: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          location_id?: string | null;
          name: string;
          description?: string | null;
          type: string;
          location: string;
          capacity: number;
          price?: number | null;
          rating?: number;
          image?: string;
          images?: string | null;
          skipper_required?: boolean | null;
          documents_folder?: string | null;
          image_url?: string | null;
          stripe_link?: string | null;
          status?: "active" | "inactive" | "maintenance";
          bookings?: number;
          revenue?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          location_id?: string | null;
          name?: string;
          description?: string | null;
          type?: string;
          location?: string;
          capacity?: number;
          price?: number | null;
          rating?: number;
          image?: string;
          images?: string | null;
          skipper_required?: boolean | null;
          documents_folder?: string | null;
          image_url?: string | null;
          stripe_link?: string | null;
          status?: "active" | "inactive" | "maintenance";
          bookings?: number;
          revenue?: number;
          updated_at?: string;
        };
      };
      boat_locations: {
        Row: {
          id: string;
          name: string;
          location: string;
          map_query: string;
          latitude: number | null;
          longitude: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          location: string;
          map_query: string;
          latitude?: number | null;
          longitude?: number | null;
          created_at?: string;
        };
        Update: {
          name?: string;
          location?: string;
          map_query?: string;
          latitude?: number | null;
          longitude?: number | null;
        };
      };
      boat_features: {
        Row: {
          id: string;
          boat_id: string;
          feature: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          boat_id: string;
          feature: string;
          created_at?: string;
        };
        Update: {
          feature?: string;
        };
      };
      boat_documents: {
        Row: {
          id: string;
          boat_id: string;
          name: string;
          file_path: string;
          file_type: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          boat_id: string;
          name: string;
          file_path: string;
          file_type: string;
          created_at?: string;
        };
        Update: {
          name?: string;
        };
      };
      bookings: {
        Row: {
          id: string;
          boat_id: string;
          customer_id: string | null;
          start_date: string;
          end_date: string;
          start_time: string | null;
          end_time: string | null;
          package_hours: number | null;
          departure_time: string | null;
          departure_marina: string | null;
          status: "pending" | "confirmed" | "completed" | "cancelled";
          total_price: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          boat_id: string;
          customer_id?: string | null;
          start_date: string;
          end_date: string;
          start_time?: string | null;
          end_time?: string | null;
          package_hours?: number | null;
          departure_time?: string | null;
          departure_marina?: string | null;
          status?: "pending" | "confirmed" | "completed" | "cancelled";
          total_price: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          customer_id?: string | null;
          start_date?: string;
          end_date?: string;
          start_time?: string | null;
          end_time?: string | null;
          package_hours?: number | null;
          departure_time?: string | null;
          departure_marina?: string | null;
          status?: "pending" | "confirmed" | "completed" | "cancelled";
          total_price?: number;
          updated_at?: string;
        };
      };
      calendar_events: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          location: string | null;
          start_time: string;
          end_time: string | null;
          all_day: boolean;
          timezone: string | null;
          created_at: string;
          updated_at: string;
          booking_id: string | null;
          boat_id: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description?: string | null;
          location?: string | null;
          start_time: string;
          end_time?: string | null;
          all_day?: boolean;
          timezone?: string | null;
          created_at?: string;
          updated_at?: string;
          booking_id?: string | null;
          boat_id?: string | null;
        };
        Update: {
          user_id?: string;
          title?: string;
          description?: string | null;
          location?: string | null;
          start_time?: string;
          end_time?: string | null;
          all_day?: boolean;
          timezone?: string | null;
          created_at?: string;
          updated_at?: string;
          booking_id?: string | null;
          boat_id?: string | null;
        };
      };
      admin_users: {
        Row: {
          id: string;
          user_id: string;
          email: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          email: string;
          created_at?: string;
        };
        Update: {};
      };
      reviews: {
        Row: {
          id: string;
          boat_id: string;
          customer_id: string;
          rating: number;
          comment: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          boat_id: string;
          customer_id: string;
          rating: number;
          comment?: string;
          created_at?: string;
        };
        Update: {
          rating?: number;
          comment?: string;
        };
      };
      favorites: {
        Row: {
          id: string;
          user_id: string;
          boat_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          boat_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          boat_id?: string;
          created_at?: string;
        };
      };
      badges: {
        Row: {
          id: string;
          name: string;
          icon_slug: string;
          description: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          icon_slug: string;
          description?: string | null;
        };
        Update: {
          name?: string;
          icon_slug?: string;
          description?: string | null;
        };
      };
      boat_owner_badges: {
        Row: {
          owner_id: string;
          badge_id: string;
          assigned_at: string;
        };
        Insert: {
          owner_id: string;
          badge_id: string;
          assigned_at?: string;
        };
        Update: {
          assigned_at?: string;
        };
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
  };
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

const isLocalUrl = (value: string) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(value);

const isAllowedSupabaseUrl = (value: string) => /^https:\/\//i.test(value) || isLocalUrl(value);

const decodeJwtPayload = (token: string) => {
	try {
		const [, payload] = token.split(".");
		if (!payload) return null;
		const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
		const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
		return JSON.parse(atob(padded));
	} catch {
		return null;
	}
};

const isServiceRoleKey = (token: string) => {
	const payload = decodeJwtPayload(token);
	return payload?.role === "service_role";
};

let supabase: SupabaseClient<Database> | null = null;

const migrateLegacyAuthTokenStorageKey = () => {
  if (typeof window === "undefined") {
    return;
  }

  const nextKey = "nautiplex.auth.token";
  const legacyKey = "nautiq.auth.token";

  const nextLocal = window.localStorage.getItem(nextKey);
  const legacyLocal = window.localStorage.getItem(legacyKey);
  if (!nextLocal && legacyLocal) {
    window.localStorage.setItem(nextKey, legacyLocal);
  }
  if (legacyLocal) {
    window.localStorage.removeItem(legacyKey);
  }

  const nextSession = window.sessionStorage.getItem(nextKey);
  const legacySession = window.sessionStorage.getItem(legacyKey);
  if (!nextSession && legacySession) {
    window.sessionStorage.setItem(nextKey, legacySession);
  }
  if (legacySession) {
    window.sessionStorage.removeItem(legacyKey);
  }
};

if (supabaseUrl && supabaseAnonKey && isAllowedSupabaseUrl(supabaseUrl) && !isServiceRoleKey(supabaseAnonKey)) {
  migrateLegacyAuthTokenStorageKey();

  const authStorage = createAuthStorageAdapter();

  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
      storageKey: "nautiplex.auth.token",
      storage: authStorage,
    },
  });
} else {
  console.warn(
    "Supabase environment variables are missing or insecure. Database features will be disabled. " +
    "Use an HTTPS Supabase URL (or localhost for dev) and only the anon public key, never the service_role key."
  );

  const buildError = () => ({
    data: null,
    error: new Error("Supabase not configured"),
  });

  // Create a dummy client that mimics Supabase response shapes so callers
  // receive a structured error instead of hanging on rejected promises.
  supabase = {
    auth: {
      signUp: async () => {
        throw new Error("Supabase not configured");
      },
      signInWithPassword: async () => {
        throw new Error("Supabase not configured");
      },
      signOut: async () => {
        throw new Error("Supabase not configured");
      },
      getSession: async () => buildError(),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => ({
      select: async () => buildError(),
      insert: async () => buildError(),
      update: async () => buildError(),
      delete: async () => buildError(),
    }),
    storage: {
      from: () => ({
        upload: async () => buildError(),
        list: async () => buildError(),
        createSignedUrl: async () => buildError(),
      }),
    },
  } as any;
}

export { supabase };

type DatabaseShape = Database;

export type AppDatabase = DatabaseShape;

export type DatabasePublic = DatabaseShape["public"];

export type DatabaseTables = DatabasePublic["Tables"];

export type DatabaseUsersRow = DatabaseTables["users"]["Row"];

export type DatabaseUsersInsert = DatabaseTables["users"]["Insert"];

export type DatabaseUsersUpdate = DatabaseTables["users"]["Update"];


