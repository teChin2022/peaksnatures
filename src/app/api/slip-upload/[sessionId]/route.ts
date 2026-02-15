import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

const BUCKET = "payment-slips";

// Check if a slip has been uploaded for this session
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  if (!sessionId || sessionId.length < 10) {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const path = `sessions/${sessionId}/slip`;

  // List files in the session folder
  const { data: files } = await supabase.storage.from(BUCKET).list(`sessions/${sessionId}`);

  if (!files || files.length === 0) {
    return NextResponse.json({ uploaded: false });
  }

  // Generate a signed URL so the desktop can display it
  const { data: signedUrl } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(`sessions/${sessionId}/${files[0].name}`, 3600);

  return NextResponse.json({
    uploaded: true,
    url: signedUrl?.signedUrl || null,
    filename: files[0].name,
  });
}

// Upload a slip for this session (called from mobile upload page)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  if (!sessionId || sessionId.length < 10) {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }

  const formData = await req.formData();
  const file = formData.get("slip") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Validate file size (max 5MB)
  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File too large. Maximum size is 5MB." }, { status: 400 });
  }

  // Validate file type
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Invalid file type. Only image files are allowed." }, { status: 400 });
  }

  // Sanitize extension to allowed set only
  const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "heic", "heif"];
  const rawExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const ext = ALLOWED_EXTENSIONS.includes(rawExt) ? rawExt : "jpg";
  const path = `sessions/${sessionId}/slip.${ext}`;

  const supabase = createServiceRoleClient();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) {
    console.error("Slip upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true, path });
}
