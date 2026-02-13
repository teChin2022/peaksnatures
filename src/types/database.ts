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
          created_at: string;
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
          created_at?: string;
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
          created_at?: string;
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
          price_per_night: number;
          max_guests: number;
          amenities: string[];
          hero_image_url: string | null;
          logo_url: string | null;
          gallery: string[];
          theme_color: string;
          is_active: boolean;
          created_at: string;
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
          price_per_night: number;
          max_guests?: number;
          amenities?: string[];
          hero_image_url?: string | null;
          logo_url?: string | null;
          gallery?: string[];
          theme_color?: string;
          is_active?: boolean;
          created_at?: string;
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
          price_per_night?: number;
          max_guests?: number;
          amenities?: string[];
          hero_image_url?: string | null;
          logo_url?: string | null;
          gallery?: string[];
          theme_color?: string;
          is_active?: boolean;
          created_at?: string;
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
          notes: string | null;
          created_at: string;
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
          notes?: string | null;
          created_at?: string;
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
          notes?: string | null;
          created_at?: string;
        };
      };
      blocked_dates: {
        Row: {
          id: string;
          homestay_id: string;
          date: string;
          reason: string | null;
        };
        Insert: {
          id?: string;
          homestay_id: string;
          date: string;
          reason?: string | null;
        };
        Update: {
          id?: string;
          homestay_id?: string;
          date?: string;
          reason?: string | null;
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
