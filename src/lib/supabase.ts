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
          owner_title: string | null;
          owner_bio: string | null;
          owner_languages: string[] | null;
          is_superhost: boolean | null;
          response_rate: number | null;
          stripe_payouts_ready: boolean | null;
          phone: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          name: string;
          is_owner?: boolean;
          owner_title?: string | null;
          owner_bio?: string | null;
          owner_languages?: string[] | null;
          is_superhost?: boolean | null;
          response_rate?: number | null;
          stripe_payouts_ready?: boolean | null;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          name?: string;
          is_owner?: boolean;
          owner_title?: string | null;
          owner_bio?: string | null;
          owner_languages?: string[] | null;
          is_superhost?: boolean | null;
          response_rate?: number | null;
          stripe_payouts_ready?: boolean | null;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
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
          length_meters: number | null;
          year: number | null;
          cruising_speed_knots: number | null;
          fuel_burn_litres_per_hour: number | null;
          departure_marina: string | null;
          cancellation_policy: string | null;
          response_time: string | null;
          map_query: string | null;
          external_calendar_url: string | null;
          flash_sale_enabled: boolean | null;
          unavailable_dates: string[] | null;
          min_notice_hours: number | null;
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
          length_meters?: number | null;
          year?: number | null;
          cruising_speed_knots?: number | null;
          fuel_burn_litres_per_hour?: number | null;
          departure_marina?: string | null;
          cancellation_policy?: string | null;
          response_time?: string | null;
          map_query?: string | null;
          external_calendar_url?: string | null;
          flash_sale_enabled?: boolean | null;
          unavailable_dates?: string[] | null;
          min_notice_hours?: number | null;
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
          length_meters?: number | null;
          year?: number | null;
          cruising_speed_knots?: number | null;
          fuel_burn_litres_per_hour?: number | null;
          departure_marina?: string | null;
          cancellation_policy?: string | null;
          response_time?: string | null;
          map_query?: string | null;
          external_calendar_url?: string | null;
          flash_sale_enabled?: boolean | null;
          unavailable_dates?: string[] | null;
          min_notice_hours?: number | null;
          revenue?: number;
          updated_at?: string;
        };
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
      };
      bookings: {
        Row: {
          id: string;
          boat_id: string;
          customer_id: string | null;
          customer_name: string | null;
          customer_email: string | null;
          boat_name: string | null;
          owner_name: string | null;
          package_label: string | null;
          guests: number | null;
          start_date: string;
          end_date: string;
          start_time: string | null;
          end_time: string | null;
          package_hours: number | null;
          departure_time: string | null;
          departure_marina: string | null;
          status: "pending" | "confirmed" | "completed" | "cancelled";
          total_price: number;
          payment_method: string | null;
          payment_plan: string | null;
          amount_due_now: number | null;
          deposit_amount: number | null;
          platform_commission: number | null;
          owner_payout: number | null;
          extras: unknown;
          notes: string | null;
          request_id: string | null;
          stripe_session_id: string | null;
          stripe_payment_intent_id: string | null;
          party_ticket_code: string | null;
          party_ticket_count: number | null;
          party_ticket_status: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          boat_id: string;
          customer_id?: string | null;
          customer_name?: string | null;
          customer_email?: string | null;
          boat_name?: string | null;
          owner_name?: string | null;
          package_label?: string | null;
          guests?: number | null;
          start_date: string;
          end_date: string;
          start_time?: string | null;
          end_time?: string | null;
          package_hours?: number | null;
          departure_time?: string | null;
          departure_marina?: string | null;
          status?: "pending" | "confirmed" | "completed" | "cancelled";
          total_price: number;
          payment_method?: string | null;
          payment_plan?: string | null;
          amount_due_now?: number | null;
          deposit_amount?: number | null;
          platform_commission?: number | null;
          owner_payout?: number | null;
          extras?: unknown;
          notes?: string | null;
          request_id?: string | null;
          stripe_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          party_ticket_code?: string | null;
          party_ticket_count?: number | null;
          party_ticket_status?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          customer_id?: string | null;
          customer_name?: string | null;
          customer_email?: string | null;
          boat_name?: string | null;
          owner_name?: string | null;
          package_label?: string | null;
          guests?: number | null;
          start_date?: string;
          end_date?: string;
          start_time?: string | null;
          end_time?: string | null;
          package_hours?: number | null;
          departure_time?: string | null;
          departure_marina?: string | null;
          status?: "pending" | "confirmed" | "completed" | "cancelled";
          total_price?: number;
          payment_method?: string | null;
          payment_plan?: string | null;
          amount_due_now?: number | null;
          deposit_amount?: number | null;
          platform_commission?: number | null;
          owner_payout?: number | null;
          extras?: unknown;
          notes?: string | null;
          request_id?: string | null;
          stripe_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          party_ticket_code?: string | null;
          party_ticket_count?: number | null;
          party_ticket_status?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      calendar_events: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          event_type: string | null;
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
          event_type?: string | null;
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
          event_type?: string | null;
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
        Relationships: [];
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
        Update: Record<string, never>;
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
      };
      party_boats: {
        Row: {
          id: string;
          boat_id: string;
          owner_id: string;
          name: string;
          location: string;
          description: string | null;
          departure_marina: string | null;
          capacity: number;
          ticket_max_people: number | null;
          ticket_price_per_person: number | null;
          party_tiers: unknown;
          party_event_date: string | null;
          party_event_time: string | null;
          images: string | null;
          status: string;
          map_query: string | null;
          flash_sale_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          boat_id: string;
          owner_id: string;
          name: string;
          location: string;
          description?: string | null;
          departure_marina?: string | null;
          capacity?: number;
          ticket_max_people?: number | null;
          ticket_price_per_person?: number | null;
          party_tiers?: unknown;
          party_event_date?: string | null;
          party_event_time?: string | null;
          images?: string | null;
          status?: string;
          map_query?: string | null;
          flash_sale_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          boat_id?: string;
          owner_id?: string;
          name?: string;
          location?: string;
          description?: string | null;
          departure_marina?: string | null;
          capacity?: number;
          ticket_max_people?: number | null;
          ticket_price_per_person?: number | null;
          party_tiers?: unknown;
          party_event_date?: string | null;
          party_event_time?: string | null;
          images?: string | null;
          status?: string;
          map_query?: string | null;
          flash_sale_enabled?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      watersports_boats: {
        Row: {
          id: string;
          boat_id: string;
          owner_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          boat_id: string;
          owner_id: string;
          created_at?: string;
        };
        Update: {
          boat_id?: string;
          owner_id?: string;
        };
        Relationships: [];
      };
      owner_packages: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          duration_hours: number;
          price: number;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          duration_hours: number;
          price: number;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          duration_hours?: number;
          price?: number;
          description?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      owner_package_boats: {
        Row: {
          package_id: string;
          boat_id: string;
        };
        Insert: {
          package_id: string;
          boat_id: string;
        };
        Update: {
          package_id?: string;
          boat_id?: string;
        };
        Relationships: [];
      };
      owner_extras: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          price: number;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          price: number;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          name?: string;
          price?: number;
          description?: string | null;
        };
        Relationships: [];
      };
      owner_extra_boats: {
        Row: {
          extra_id: string;
          boat_id: string;
        };
        Insert: {
          extra_id: string;
          boat_id: string;
        };
        Update: {
          extra_id?: string;
          boat_id?: string;
        };
        Relationships: [];
      };
      business_tickets: {
        Row: {
          id: string;
          business_name: string;
          business_type: "hotel" | "travel-agent" | "villa" | "other";
          contact_name: string;
          contact_email: string;
          message: string;
          status: "new" | "reviewing" | "approved";
          created_at: string;
        };
        Insert: {
          id?: string;
          business_name: string;
          business_type: "hotel" | "travel-agent" | "villa" | "other";
          contact_name: string;
          contact_email: string;
          message: string;
          status?: "new" | "reviewing" | "approved";
          created_at?: string;
        };
        Update: {
          status?: "new" | "reviewing" | "approved";
        };
        Relationships: [];
      };
      chat_threads: {
        Row: {
          id: string;
          boat_id: string;
          boat_name: string;
          owner_name: string;
          customer_id: string;
          created_at: string;
          last_updated_at: string;
        };
        Insert: {
          id?: string;
          boat_id: string;
          boat_name: string;
          owner_name: string;
          customer_id: string;
          created_at?: string;
          last_updated_at?: string;
        };
        Update: {
          last_updated_at?: string;
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          thread_id: string;
          boat_id: string;
          sender_role: "customer" | "owner";
          sender_user_id: string;
          text: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          thread_id: string;
          boat_id: string;
          sender_role: "customer" | "owner";
          sender_user_id: string;
          text: string;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      destinations: {
        Row: {
          id: string;
          slug: string;
          name: string;
          images: string | null;
          boats: number | null;
          description: string | null;
          best_for: string | null;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          images?: string | null;
          boats?: number | null;
          description?: string | null;
          best_for?: string | null;
        };
        Update: {
          name?: string;
          images?: string | null;
          boats?: number | null;
          description?: string | null;
          best_for?: string | null;
        };
        Relationships: [];
      };
      booking_requests: {
        Row: {
          id: string;
          boat_id: string;
          boat_name: string;
          owner_id: string;
          owner_name: string | null;
          customer_id: string | null;
          customer_name: string;
          customer_email: string;
          start_date: string;
          departure_time: string;
          end_time: string | null;
          package_hours: number | null;
          guests: number;
          package_label: string | null;
          special_requests: string | null;
          total_price: number;
          status: "pending" | "accepted" | "rejected";
          admin_notes: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          boat_id: string;
          boat_name: string;
          owner_id: string;
          owner_name?: string | null;
          customer_id?: string | null;
          customer_name: string;
          customer_email: string;
          start_date: string;
          departure_time: string;
          end_time?: string | null;
          package_hours?: number | null;
          guests?: number;
          package_label?: string | null;
          special_requests?: string | null;
          total_price?: number;
          status?: "pending" | "accepted" | "rejected";
          admin_notes?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          boat_id?: string;
          boat_name?: string;
          owner_id?: string;
          owner_name?: string | null;
          status?: "pending" | "accepted" | "rejected";
          admin_notes?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      news_posts: {
        Row: {
          id: string;
          slug: string;
          title: string;
          excerpt: string;
          content: string;
          category: "nautiplex" | "thassos";
          cover_image: string | null;
          author_name: string | null;
          status: "draft" | "published";
          published_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          title: string;
          excerpt: string;
          content: string;
          category: "nautiplex" | "thassos";
          cover_image?: string | null;
          author_name?: string | null;
          status?: "draft" | "published";
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          slug?: string;
          title?: string;
          excerpt?: string;
          content?: string;
          category?: "nautiplex" | "thassos";
          cover_image?: string | null;
          author_name?: string | null;
          status?: "draft" | "published";
          published_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      global_settings: {
        Row: {
          key: string;
          value: string | number | null;
        };
        Insert: {
          key: string;
          value?: string | number | null;
        };
        Update: {
          value?: string | number | null;
        };
        Relationships: [];
      };
      report_tickets: {
        Row: {
          id: string;
          report_type: "customer" | "owner" | "boat" | "website";
          subject: string;
          target_name: string;
          target_ref: string | null;
          reporter_name: string;
          reporter_email: string;
          severity: "low" | "medium" | "high" | "critical";
          message: string;
          page_url: string | null;
          metadata: Record<string, unknown>;
          status: "new" | "triaged" | "resolved";
          created_at: string;
        };
        Insert: {
          id?: string;
          report_type: "customer" | "owner" | "boat" | "website";
          subject: string;
          target_name: string;
          target_ref?: string | null;
          reporter_name: string;
          reporter_email: string;
          severity: "low" | "medium" | "high" | "critical";
          message: string;
          page_url?: string | null;
          metadata?: Record<string, unknown>;
          status?: "new" | "triaged" | "resolved";
          created_at?: string;
        };
        Update: {
          status?: "new" | "triaged" | "resolved";
        };
        Relationships: [];
      };
      owner_applications: {
        Row: {
          id: string;
          type: string;
          applicant_user_id: string;
          owner_name: string;
          owner_email: string;
          title: string;
          notes: string | null;
          status: "pending" | "approved" | "rejected";
          submitted_at: string;
        };
        Insert: {
          id?: string;
          type: string;
          applicant_user_id: string;
          owner_name: string;
          owner_email: string;
          title: string;
          notes?: string | null;
          status?: "pending" | "approved" | "rejected";
          submitted_at?: string;
        };
        Update: {
          status?: "pending" | "approved" | "rejected";
          notes?: string | null;
        };
        Relationships: [];
      };
      owner_notifications: {
        Row: {
          id: string;
          booking_id: string;
          owner_name: string;
          owner_email: string;
          subject: string;
          message: string;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          owner_name: string;
          owner_email: string;
          subject: string;
          message: string;
          status?: string;
          created_at?: string;
        };
        Update: {
          status?: string;
        };
        Relationships: [];
      };
      customer_emails: {
        Row: {
          id: string;
          booking_id: string;
          to_email: string;
          subject: string;
          preview_text: string | null;
          body: string;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          to_email: string;
          subject: string;
          preview_text?: string | null;
          body: string;
          status?: string;
          created_at?: string;
        };
        Update: {
          status?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
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

const GET_SESSION_TIMEOUT_MS = 4000;

/**
 * Drop-in replacement for `supabase.auth.getSession()` that never hangs
 * forever. supabase-js's client can occasionally stall indefinitely on this
 * call (internal session-lock contention, most reliably reproduced right
 * after a fresh page load while signed in — see withRetry in lib/retry.ts
 * for the same issue on data queries). Returns the identical response shape,
 * so existing call sites can swap the awaited function without other
 * changes; on timeout it resolves as "no session" rather than rejecting, so
 * callers that only check `session?.user` degrade the same way they already
 * do for an anonymous visitor.
 */
export const getSessionSafe = (): ReturnType<typeof supabase.auth.getSession> =>
  Promise.race([
    supabase.auth.getSession(),
    new Promise<Awaited<ReturnType<typeof supabase.auth.getSession>>>((resolve) =>
      setTimeout(
        () => resolve({ data: { session: null }, error: null } as Awaited<ReturnType<typeof supabase.auth.getSession>>),
        GET_SESSION_TIMEOUT_MS,
      ),
    ),
  ]);

type DatabaseShape = Database;

export type AppDatabase = DatabaseShape;

export type DatabasePublic = DatabaseShape["public"];

export type DatabaseTables = DatabasePublic["Tables"];

export type DatabaseUsersRow = DatabaseTables["users"]["Row"];

export type DatabaseUsersInsert = DatabaseTables["users"]["Insert"];

export type DatabaseUsersUpdate = DatabaseTables["users"]["Update"];


