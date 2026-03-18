export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type BookingStatus =
  | "pending"
  | "verified"
  | "confirmed"
  | "rejected"
  | "cancelled"
  | "completed";

export interface Database {
  public: {
    Tables: {
      hosts: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          email: string;
          phone: string | null;
          promptpay_id: string;
          line_user_id: string | null;
          line_channel_access_token: string | null;
          deposit_amount: number;
          deposit_by_month: Record<string, number> | null;
          cancellation_days: number;
          notification_preference: string;
          security_pin_hash: string | null;
          status: string;
          created_at: string;
          created_by: string;
          updated_at: string;
          updated_by: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          email: string;
          phone?: string | null;
          promptpay_id: string;
          line_user_id?: string | null;
          line_channel_access_token?: string | null;
          deposit_amount?: number;
          deposit_by_month?: Record<string, number> | null;
          cancellation_days?: number;
          notification_preference?: string;
          security_pin_hash?: string | null;
          status?: string;
          created_at?: string;
          created_by?: string;
          updated_at?: string;
          updated_by?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          email?: string;
          phone?: string | null;
          promptpay_id?: string;
          line_user_id?: string | null;
          line_channel_access_token?: string | null;
          deposit_amount?: number;
          deposit_by_month?: Record<string, number> | null;
          cancellation_days?: number;
          notification_preference?: string;
          security_pin_hash?: string | null;
          status?: string;
          created_at?: string;
          created_by?: string;
          updated_at?: string;
          updated_by?: string;
        };
      };
      homestays: {
        Row: {
          id: string;
          host_id: string;
          slug: string;
          name: string;
          description: string;
          tagline: string | null;
          location: string;
          map_embed_url: string | null;
          max_guests: number;
          amenities: string[];
          prohibitions: string[];
          check_in_time: string | null;
          check_out_time: string | null;
          hero_image_url: string | null;
          logo_url: string | null;
          gallery: string[];
          theme_color: string;
          is_active: boolean;
          created_at: string;
          created_by: string;
          updated_at: string;
          updated_by: string;
        };
        Insert: {
          id?: string;
          host_id: string;
          slug: string;
          name: string;
          description: string;
          tagline?: string | null;
          location: string;
          map_embed_url?: string | null;
          max_guests?: number;
          amenities?: string[];
          prohibitions?: string[];
          check_in_time?: string | null;
          check_out_time?: string | null;
          hero_image_url?: string | null;
          logo_url?: string | null;
          gallery?: string[];
          theme_color?: string;
          is_active?: boolean;
          created_at?: string;
          created_by?: string;
          updated_at?: string;
          updated_by?: string;
        };
        Update: {
          id?: string;
          host_id?: string;
          slug?: string;
          name?: string;
          description?: string;
          tagline?: string | null;
          location?: string;
          map_embed_url?: string | null;
          max_guests?: number;
          amenities?: string[];
          prohibitions?: string[];
          check_in_time?: string | null;
          check_out_time?: string | null;
          hero_image_url?: string | null;
          logo_url?: string | null;
          gallery?: string[];
          theme_color?: string;
          is_active?: boolean;
          created_at?: string;
          created_by?: string;
          updated_at?: string;
          updated_by?: string;
        };
      };
      rooms: {
        Row: {
          id: string;
          homestay_id: string;
          name: string;
          description: string | null;
          price_per_night: number;
          max_guests: number;
          quantity: number;
          images: string[];
          is_active: boolean;
          created_at: string;
          created_by: string;
          updated_at: string;
          updated_by: string;
        };
        Insert: {
          id?: string;
          homestay_id: string;
          name: string;
          description?: string | null;
          price_per_night: number;
          max_guests?: number;
          quantity?: number;
          images?: string[];
          is_active?: boolean;
          created_at?: string;
          created_by?: string;
          updated_at?: string;
          updated_by?: string;
        };
        Update: {
          id?: string;
          homestay_id?: string;
          name?: string;
          description?: string | null;
          price_per_night?: number;
          max_guests?: number;
          quantity?: number;
          images?: string[];
          is_active?: boolean;
          created_at?: string;
          created_by?: string;
          updated_at?: string;
          updated_by?: string;
        };
      };
      bookings: {
        Row: {
          id: string;
          homestay_id: string;
          room_id: string | null;
          guest_name: string;
          guest_email: string;
          guest_phone: string;
          guest_province: string | null;
          check_in: string;
          check_out: string;
          num_guests: number;
          total_price: number;
          status: BookingStatus;
          payment_slip_url: string | null;
          easyslip_verified: boolean;
          easyslip_response: Json | null;
          payment_slip_hash: string | null;
          slip_trans_ref: string | null;
          notes: string | null;
          payment_type: string;
          amount_paid: number;
          checked_in_at: string | null;
          checked_out_at: string | null;
          cancelled_by: string | null;
          cancelled_at: string | null;
          created_at: string;
          created_by: string;
          updated_at: string;
          updated_by: string;
        };
        Insert: {
          id?: string;
          homestay_id: string;
          room_id?: string | null;
          guest_name: string;
          guest_email: string;
          guest_phone: string;
          guest_line_id?: string | null;
          check_in: string;
          check_out: string;
          num_guests: number;
          total_price: number;
          status?: BookingStatus;
          payment_slip_url?: string | null;
          easyslip_verified?: boolean;
          easyslip_response?: Json | null;
          payment_slip_hash?: string | null;
          slip_trans_ref?: string | null;
          notes?: string | null;
          payment_type?: string;
          amount_paid?: number;
          checked_in_at?: string | null;
          checked_out_at?: string | null;
          cancelled_by?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          created_by?: string;
          updated_at?: string;
          updated_by?: string;
        };
        Update: {
          id?: string;
          homestay_id?: string;
          room_id?: string | null;
          guest_name?: string;
          guest_email?: string;
          guest_phone?: string;
          guest_line_id?: string | null;
          check_in?: string;
          check_out?: string;
          num_guests?: number;
          total_price?: number;
          status?: BookingStatus;
          payment_slip_url?: string | null;
          easyslip_verified?: boolean;
          easyslip_response?: Json | null;
          payment_slip_hash?: string | null;
          slip_trans_ref?: string | null;
          notes?: string | null;
          payment_type?: string;
          amount_paid?: number;
          checked_in_at?: string | null;
          checked_out_at?: string | null;
          cancelled_by?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          created_by?: string;
          updated_at?: string;
          updated_by?: string;
        };
      };
      blocked_dates: {
        Row: {
          id: string;
          homestay_id: string;
          date: string;
          reason: string | null;
          room_id: string | null;
          created_at: string;
          created_by: string;
          updated_at: string;
          updated_by: string;
        };
        Insert: {
          id?: string;
          homestay_id: string;
          date: string;
          reason?: string | null;
          room_id?: string | null;
          created_at?: string;
          created_by?: string;
          updated_at?: string;
          updated_by?: string;
        };
        Update: {
          id?: string;
          homestay_id?: string;
          date?: string;
          reason?: string | null;
          room_id?: string | null;
          created_at?: string;
          created_by?: string;
          updated_at?: string;
          updated_by?: string;
        };
      };
      booking_holds: {
        Row: {
          id: string;
          room_id: string;
          check_in: string;
          check_out: string;
          session_id: string;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          check_in: string;
          check_out: string;
          session_id: string;
          expires_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          check_in?: string;
          check_out?: string;
          session_id?: string;
          expires_at?: string;
          created_at?: string;
        };
      };
      reviews: {
        Row: {
          id: string;
          homestay_id: string;
          booking_id: string;
          guest_name: string;
          rating: number;
          comment: string | null;
          created_at: string;
          created_by: string;
          updated_at: string;
          updated_by: string;
        };
        Insert: {
          id?: string;
          homestay_id: string;
          booking_id: string;
          guest_name: string;
          rating: number;
          comment?: string | null;
          created_at?: string;
          created_by?: string;
          updated_at?: string;
          updated_by?: string;
        };
        Update: {
          id?: string;
          homestay_id?: string;
          booking_id?: string;
          guest_name?: string;
          rating?: number;
          comment?: string | null;
          created_at?: string;
          created_by?: string;
          updated_at?: string;
          updated_by?: string;
        };
      };
      push_subscriptions: {
        Row: {
          id: string;
          host_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent: string | null;
          created_at: string;
          created_by: string;
          updated_at: string;
          updated_by: string;
        };
        Insert: {
          id?: string;
          host_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent?: string | null;
          created_at?: string;
          created_by?: string;
          updated_at?: string;
          updated_by?: string;
        };
        Update: {
          id?: string;
          host_id?: string;
          endpoint?: string;
          p256dh?: string;
          auth?: string;
          user_agent?: string | null;
          created_at?: string;
          created_by?: string;
          updated_at?: string;
          updated_by?: string;
        };
      };
      login_otps: {
        Row: {
          id: string;
          email: string;
          code: string;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          code: string;
          expires_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          code?: string;
          expires_at?: string;
          created_at?: string;
        };
      };
      room_seasonal_prices: {
        Row: {
          id: string;
          room_id: string;
          name: string;
          start_date: string;
          end_date: string;
          price_per_night: number;
          created_at: string;
          created_by: string;
          updated_at: string;
          updated_by: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          name: string;
          start_date: string;
          end_date: string;
          price_per_night: number;
          created_at?: string;
          created_by?: string;
          updated_at?: string;
          updated_by?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          name?: string;
          start_date?: string;
          end_date?: string;
          price_per_night?: number;
          created_at?: string;
          created_by?: string;
          updated_at?: string;
          updated_by?: string;
        };
      };
      platform_admins: {
        Row: {
          id: string;
          user_id: string;
          email: string;
          name: string;
          phone: string | null;
          promptpay_id: string | null;
          line_user_id: string | null;
          line_channel_access_token: string | null;
          created_at: string;
          created_by: string;
          updated_at: string;
          updated_by: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          email: string;
          name: string;
          phone?: string | null;
          promptpay_id?: string | null;
          line_user_id?: string | null;
          line_channel_access_token?: string | null;
          created_at?: string;
          created_by?: string;
          updated_at?: string;
          updated_by?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          email?: string;
          name?: string;
          phone?: string | null;
          promptpay_id?: string | null;
          line_user_id?: string | null;
          line_channel_access_token?: string | null;
          created_at?: string;
          created_by?: string;
          updated_at?: string;
          updated_by?: string;
        };
      };
      history_logs: {
        Row: {
          id: string;
          homestay_id: string | null;
          entity_type: string;
          entity_id: string;
          event_type: string;
          actor_type: string;
          actor_id: string | null;
          data: Json;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          homestay_id?: string | null;
          entity_type: string;
          entity_id: string;
          event_type: string;
          actor_type: string;
          actor_id?: string | null;
          data?: Json;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          homestay_id?: string | null;
          entity_type?: string;
          entity_id?: string;
          event_type?: string;
          actor_type?: string;
          actor_id?: string | null;
          data?: Json;
          ip_address?: string | null;
          created_at?: string;
        };
      };
      date_change_requests: {
        Row: {
          id: string;
          booking_id: string;
          old_check_in: string;
          old_check_out: string;
          new_check_in: string;
          new_check_out: string;
          old_total_price: number;
          new_total_price: number;
          price_difference: number;
          status: string;
          requested_by: string;
          slip_hash: string | null;
          slip_trans_ref: string | null;
          payment_slip_url: string | null;
          easyslip_response: Json | null;
          easyslip_verified: boolean;
          reject_reason: string | null;
          old_room_id: string | null;
          new_room_id: string | null;
          additional_payment: number;
          created_at: string;
          updated_at: string;
          created_by: string;
          updated_by: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          old_check_in: string;
          old_check_out: string;
          new_check_in: string;
          new_check_out: string;
          old_total_price: number;
          new_total_price: number;
          price_difference?: number;
          status?: string;
          requested_by: string;
          slip_hash?: string | null;
          slip_trans_ref?: string | null;
          payment_slip_url?: string | null;
          easyslip_response?: Json | null;
          easyslip_verified?: boolean;
          reject_reason?: string | null;
          old_room_id?: string | null;
          new_room_id?: string | null;
          additional_payment?: number;
          created_at?: string;
          updated_at?: string;
          created_by?: string;
          updated_by?: string;
        };
        Update: {
          id?: string;
          booking_id?: string;
          old_check_in?: string;
          old_check_out?: string;
          new_check_in?: string;
          new_check_out?: string;
          old_total_price?: number;
          new_total_price?: number;
          price_difference?: number;
          status?: string;
          requested_by?: string;
          slip_hash?: string | null;
          slip_trans_ref?: string | null;
          payment_slip_url?: string | null;
          easyslip_response?: Json | null;
          easyslip_verified?: boolean;
          reject_reason?: string | null;
          old_room_id?: string | null;
          new_room_id?: string | null;
          additional_payment?: number;
          created_at?: string;
          updated_at?: string;
          created_by?: string;
          updated_by?: string;
        };
      };
    };
  };
}

export type Host = Database["public"]["Tables"]["hosts"]["Row"];
export type Homestay = Database["public"]["Tables"]["homestays"]["Row"];
export type Room = Database["public"]["Tables"]["rooms"]["Row"];
export type Booking = Database["public"]["Tables"]["bookings"]["Row"];
export type BlockedDate = Database["public"]["Tables"]["blocked_dates"]["Row"];
export type BookingHold = Database["public"]["Tables"]["booking_holds"]["Row"];
export type Review = Database["public"]["Tables"]["reviews"]["Row"];
export type RoomSeasonalPrice = Database["public"]["Tables"]["room_seasonal_prices"]["Row"];
export type PlatformAdmin = Database["public"]["Tables"]["platform_admins"]["Row"];
export type HistoryLog = Database["public"]["Tables"]["history_logs"]["Row"];
export type DateChangeRequest = Database["public"]["Tables"]["date_change_requests"]["Row"];
