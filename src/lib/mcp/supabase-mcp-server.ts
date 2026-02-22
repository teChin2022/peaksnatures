import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Homestay, Room, BlockedDate, Host } from "@/types/database";
import { format, eachDayOfInterval, parseISO, isWithinInterval } from "date-fns";

/**
 * Creates a Supabase MCP Server with scoped tools for the AI booking assistant.
 * All tools query Supabase directly.
 */
export function createSupabaseMcpServer() {
  const server = new McpServer({
    name: "peaksnature-supabase",
    version: "1.0.0",
  });

  const supabase = createServiceRoleClient();

  // Tool: check_availability
  server.tool(
    "check_availability",
    "Check if a homestay is available for a given date range",
    {
      homestay_id: z.string().describe("The homestay UUID"),
      check_in: z.string().describe("Check-in date in YYYY-MM-DD format"),
      check_out: z.string().describe("Check-out date in YYYY-MM-DD format"),
    },
    async ({ homestay_id, check_in, check_out }) => {
      const { data: blockedRows } = await supabase
        .from("blocked_dates")
        .select("*")
        .eq("homestay_id", homestay_id);
      const blockedDates = (blockedRows as unknown as BlockedDate[]) || [];
      // Only homestay-wide blocks (room_id=null) block all rooms
      const blockedSet = new Set(
        blockedDates.filter((d) => d.room_id === null).map((d) => d.date)
      );

      const days = eachDayOfInterval({
        start: parseISO(check_in),
        end: parseISO(check_out),
      });

      const conflicts = days.filter((d) =>
        blockedSet.has(format(d, "yyyy-MM-dd"))
      );

      if (conflicts.length > 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                available: false,
                conflicting_dates: conflicts.map((d) =>
                  format(d, "yyyy-MM-dd")
                ),
                message: `Not available. ${conflicts.length} date(s) are blocked.`,
              }),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              available: true,
              check_in,
              check_out,
              nights: days.length - 1,
              message: "Available for the requested dates!",
            }),
          },
        ],
      };
    }
  );

  // Tool: list_available_dates
  server.tool(
    "list_available_dates",
    "List available and blocked dates for a homestay in a given month",
    {
      homestay_id: z.string().describe("The homestay UUID"),
      year: z.number().describe("Year (e.g., 2026)"),
      month: z.number().describe("Month (1-12)"),
    },
    async ({ homestay_id, year, month }) => {
      const { data: blockedRows } = await supabase
        .from("blocked_dates")
        .select("*")
        .eq("homestay_id", homestay_id);
      const blockedDates = (blockedRows as unknown as BlockedDate[]) || [];
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0);

      const blocked = blockedDates.filter((d) => {
        const date = parseISO(d.date);
        return isWithinInterval(date, { start: monthStart, end: monthEnd });
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              year,
              month,
              total_days: monthEnd.getDate(),
              blocked_dates: blocked.map((d) => ({
                date: d.date,
                reason: d.reason,
                room_id: d.room_id,
              })),
              available_count: monthEnd.getDate() - blocked.length,
            }),
          },
        ],
      };
    }
  );

  // Tool: get_homestay_info
  server.tool(
    "get_homestay_info",
    "Get detailed information about a homestay",
    {
      homestay_id: z.string().describe("The homestay UUID"),
    },
    async ({ homestay_id }) => {
      const { data: row } = await supabase
        .from("homestays")
        .select("*")
        .eq("id", homestay_id)
        .single();

      if (!row) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "Homestay not found" }),
            },
          ],
        };
      }
      const homestay = row as unknown as Homestay;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              name: homestay.name,
              description: homestay.description,
              tagline: homestay.tagline,
              location: homestay.location,
              max_guests: homestay.max_guests,
              amenities: homestay.amenities,
            }),
          },
        ],
      };
    }
  );

  // Tool: get_room_options
  server.tool(
    "get_room_options",
    "List available room types and pricing for a homestay",
    {
      homestay_id: z.string().describe("The homestay UUID"),
      num_guests: z
        .number()
        .optional()
        .describe("Filter rooms that can accommodate this many guests"),
    },
    async ({ homestay_id, num_guests }) => {
      const { data: roomRows } = await supabase
        .from("rooms")
        .select("*")
        .eq("homestay_id", homestay_id);
      let rooms = (roomRows as unknown as Room[]) || [];

      if (num_guests) {
        rooms = rooms.filter((r) => r.max_guests >= num_guests);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              rooms: rooms.map((r) => ({
                id: r.id,
                name: r.name,
                description: r.description,
                price_per_night: r.price_per_night,
                max_guests: r.max_guests,
                quantity: r.quantity,
              })),
            }),
          },
        ],
      };
    }
  );

  // Tool: create_booking
  server.tool(
    "create_booking",
    "Create a new booking for a homestay",
    {
      homestay_id: z.string().describe("The homestay UUID"),
      room_id: z.string().describe("The room UUID"),
      check_in: z.string().describe("Check-in date YYYY-MM-DD"),
      check_out: z.string().describe("Check-out date YYYY-MM-DD"),
      num_guests: z.number().describe("Number of guests"),
      guest_name: z.string().describe("Guest full name"),
      guest_email: z.string().describe("Guest email"),
      guest_phone: z.string().describe("Guest phone number"),
    },
    async ({
      homestay_id,
      room_id,
      check_in,
      check_out,
      num_guests,
      guest_name,
      guest_email,
      guest_phone,
    }) => {
      const { data: roomRow } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", room_id)
        .single();
      const room = roomRow as unknown as Room | null;

      const { data: homestayRow } = await supabase
        .from("homestays")
        .select("*, hosts(*)")
        .eq("id", homestay_id)
        .single();

      if (!room || !homestayRow) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "Room or homestay not found" }),
            },
          ],
        };
      }
      const homestay = homestayRow as unknown as Homestay & { hosts: Host };

      const nights =
        eachDayOfInterval({
          start: parseISO(check_in),
          end: parseISO(check_out),
        }).length - 1;

      const totalPrice = room.price_per_night * nights;

      // Insert booking into DB
      const { data: bookingRow, error } = await supabase
        .from("bookings")
        .insert({
          homestay_id,
          room_id,
          check_in,
          check_out,
          num_guests,
          guest_name,
          guest_email,
          guest_phone,
          total_price: totalPrice,
          status: "pending",
        } as never)
        .select("id")
        .single();

      if (error || !bookingRow) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "Failed to create booking" }),
            },
          ],
        };
      }

      const bookingId = (bookingRow as { id: string }).id;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              booking: {
                id: bookingId,
                homestay_name: homestay.name,
                room_name: room.name,
                check_in,
                check_out,
                nights,
                num_guests,
                total_price: totalPrice,
                guest_name,
                guest_email,
                guest_phone,
                status: "pending",
                promptpay_id: homestay.hosts?.promptpay_id,
              },
              message: `Booking created! Total: ฿${totalPrice.toLocaleString()} for ${nights} night(s). Please pay via PromptPay to ${homestay.hosts?.promptpay_id || "the host"}.`,
            }),
          },
        ],
      };
    }
  );

  // Tool: get_booking_status
  server.tool(
    "get_booking_status",
    "Check the status of an existing booking",
    {
      booking_id: z.string().describe("The booking ID"),
    },
    async ({ booking_id }) => {
      const { data: row } = await supabase
        .from("bookings")
        .select("id, status, guest_name, check_in, check_out, total_price")
        .eq("id", booking_id)
        .single();

      if (!row) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                booking_id,
                error: "Booking not found",
              }),
            },
          ],
        };
      }

      const booking = row as { id: string; status: string; guest_name: string; check_in: string; check_out: string; total_price: number };
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              booking_id: booking.id,
              status: booking.status,
              guest_name: booking.guest_name,
              check_in: booking.check_in,
              check_out: booking.check_out,
              total_price: booking.total_price,
              message:
                booking.status === "pending"
                  ? "Booking is pending payment. Please upload your PromptPay payment slip to confirm."
                  : `Booking status: ${booking.status}`,
            }),
          },
        ],
      };
    }
  );

  return server;
}
