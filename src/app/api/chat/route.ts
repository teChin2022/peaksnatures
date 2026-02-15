import { NextRequest, NextResponse } from "next/server";
import { generateText, tool, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Homestay, Room, BlockedDate } from "@/types/database";
import { format, eachDayOfInterval, parseISO } from "date-fns";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, homestayId } = body as {
      messages: ChatMessage[];
      homestayId: string;
    };

    // Input validation
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!homestayId || !UUID_REGEX.test(homestayId)) {
      return NextResponse.json({ message: "Invalid homestay ID." }, { status: 400 });
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ message: "Messages are required." }, { status: 400 });
    }
    const MAX_MESSAGES = 20;
    const MAX_CONTENT_LENGTH = 2000;
    const validatedMessages = messages.slice(-MAX_MESSAGES).map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content.slice(0, MAX_CONTENT_LENGTH) : "",
    }));

    const supabase = createServiceRoleClient();

    // Fetch homestay from DB
    const { data: homestayRow } = await supabase
      .from("homestays")
      .select("*")
      .eq("id", homestayId)
      .single();

    if (!homestayRow) {
      return NextResponse.json({
        message: "Sorry, I couldn't find this homestay.",
      });
    }
    const homestay = homestayRow as unknown as Homestay;

    // Fetch rooms
    const { data: roomRows } = await supabase
      .from("rooms")
      .select("*")
      .eq("homestay_id", homestayId);
    const rooms = (roomRows as unknown as Room[]) || [];

    // Fetch blocked dates
    const { data: blockedRows } = await supabase
      .from("blocked_dates")
      .select("*")
      .eq("homestay_id", homestayId);
    const blockedDates = (blockedRows as unknown as BlockedDate[]) || [];

    const systemPrompt = `You are a friendly booking assistant for "${homestay.name}" — a nature homestay in ${homestay.location}, Thailand.

Key info:
- Max guests: ${homestay.max_guests}
- Amenities: ${(homestay.amenities || []).join(", ")}
- Description: ${homestay.tagline || homestay.description}

Rooms available:
${rooms.map((r) => `- ${r.name}: ฿${r.price_per_night}/night, max ${r.max_guests} guests — ${r.description || ""}`).join("\n") || "No rooms configured yet."}

Blocked dates: ${blockedDates.map((d) => `${d.date} (${d.reason || ""})`).join(", ") || "None"}

You can use tools to check availability and get room info. Be helpful, concise, and warm. Use emojis sparingly. If the guest wants to book, guide them to use the booking form above or collect their details. You can respond in Thai or English based on the guest's language.

Today's date: ${format(new Date(), "yyyy-MM-dd")}`;

    const result = await generateText({
      model: google("gemini-2.5-flash"),
      system: systemPrompt,
      messages: validatedMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      tools: {
        check_availability: tool({
          description:
            "Check if the homestay is available for specific dates",
          inputSchema: z.object({
            check_in: z.string().describe("Check-in date YYYY-MM-DD"),
            check_out: z.string().describe("Check-out date YYYY-MM-DD"),
          }),
          execute: async ({ check_in, check_out }) => {
            const blockedSet = new Set(blockedDates.map((d) => d.date));
            const days = eachDayOfInterval({
              start: parseISO(check_in),
              end: parseISO(check_out),
            });
            const conflicts = days.filter((d) =>
              blockedSet.has(format(d, "yyyy-MM-dd"))
            );

            if (conflicts.length > 0) {
              return {
                available: false,
                conflicting_dates: conflicts.map((d) =>
                  format(d, "yyyy-MM-dd")
                ),
              };
            }

            return {
              available: true,
              nights: days.length - 1,
              check_in,
              check_out,
            };
          },
        }),

        get_room_options: tool({
          description: "Get room types, pricing, and capacity",
          inputSchema: z.object({
            num_guests: z
              .number()
              .optional()
              .describe("Filter by guest capacity"),
          }),
          execute: async ({ num_guests }) => {
            let filtered = rooms;
            if (num_guests) {
              filtered = rooms.filter((r) => r.max_guests >= num_guests);
            }
            return {
              rooms: filtered.map((r) => ({
                name: r.name,
                price_per_night: r.price_per_night,
                max_guests: r.max_guests,
                description: r.description,
              })),
            };
          },
        }),

        calculate_price: tool({
          description: "Calculate total price for a stay",
          inputSchema: z.object({
            room_name: z.string().describe("Room name"),
            check_in: z.string().describe("Check-in YYYY-MM-DD"),
            check_out: z.string().describe("Check-out YYYY-MM-DD"),
          }),
          execute: async ({ room_name, check_in, check_out }) => {
            const room = rooms.find(
              (r) => r.name.toLowerCase() === room_name.toLowerCase()
            );
            if (!room) return { error: "Room not found" };

            const nights =
              eachDayOfInterval({
                start: parseISO(check_in),
                end: parseISO(check_out),
              }).length - 1;

            return {
              room: room.name,
              price_per_night: room.price_per_night,
              nights,
              total: room.price_per_night * nights,
            };
          },
        }),

        get_homestay_info: tool({
          description: "Get homestay details, amenities, and location",
          inputSchema: z.object({}),
          execute: async () => ({
            name: homestay.name,
            location: homestay.location,
            description: homestay.description,
            amenities: homestay.amenities,
            max_guests: homestay.max_guests,
            price_per_night: homestay.price_per_night,
          }),
        }),
      },
      stopWhen: stepCountIs(3),
    });

    return NextResponse.json({ message: result.text });
  } catch (error) {
    console.error("Chat API error:", error);

    const errMsg =
      error instanceof Error ? error.message : "Unknown error";

    // Friendly error messages based on error type
    if (
      errMsg.includes("API key") ||
      errMsg.includes("401") ||
      errMsg.includes("403")
    ) {
      return NextResponse.json({
        message:
          "The AI assistant is not configured yet. Please check your GOOGLE_GENERATIVE_AI_API_KEY in .env.local.\n\nIn the meantime, use the booking form above to make a reservation!",
      });
    }

    if (
      errMsg.includes("429") ||
      errMsg.includes("quota") ||
      errMsg.includes("RESOURCE_EXHAUSTED")
    ) {
      return NextResponse.json({
        message:
          "The AI assistant is temporarily rate-limited. Please wait a minute and try again, or use the booking form above.\n\nTip: Upgrade your Gemini API plan for higher limits.",
      });
    }

    return NextResponse.json(
      {
        message:
          "Sorry, something went wrong. Please try again or use the booking form above.",
      },
      { status: 500 }
    );
  }
}
