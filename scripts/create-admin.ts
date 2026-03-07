#!/usr/bin/env npx tsx
/**
 * Create a Platform Admin user.
 *
 * Usage:
 *   npx tsx scripts/create-admin.ts
 *
 * Requires environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * You can set them in .env.local or pass them inline:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/create-admin.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as readline from "readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    console.error("   Set them in .env.local or pass them as environment variables.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("\n🔧 Create Platform Admin\n");

  const name = await ask("Admin name: ");
  const email = await ask("Email: ");
  const password = await ask("Password (min 6 chars): ");
  const phone = await ask("Phone (optional, press Enter to skip): ");
  const promptpayId = await ask("PromptPay ID (optional, press Enter to skip): ");

  if (!name.trim() || !email.trim() || !password.trim()) {
    console.error("❌ Name, email, and password are required.");
    rl.close();
    process.exit(1);
  }

  if (password.trim().length < 6) {
    console.error("❌ Password must be at least 6 characters.");
    rl.close();
    process.exit(1);
  }

  // Check if admin already exists
  const { data: existing } = await supabase
    .from("platform_admins")
    .select("id")
    .eq("email", email.trim().toLowerCase())
    .single();

  if (existing) {
    console.error("❌ An admin with this email already exists.");
    rl.close();
    process.exit(1);
  }

  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password: password.trim(),
    email_confirm: true,
  });

  if (authError) {
    console.error("❌ Failed to create auth user:", authError.message);
    rl.close();
    process.exit(1);
  }

  const userId = authData.user.id;
  console.log(`✅ Auth user created: ${userId}`);

  // Insert into platform_admins
  const { error: insertError } = await supabase.from("platform_admins").insert({
    user_id: userId,
    email: email.trim().toLowerCase(),
    name: name.trim(),
    phone: phone.trim() || null,
    promptpay_id: promptpayId.trim() || null,
  });

  if (insertError) {
    console.error("❌ Failed to insert platform_admins record:", insertError.message);
    // Clean up the auth user
    await supabase.auth.admin.deleteUser(userId);
    console.log("🧹 Rolled back auth user.");
    rl.close();
    process.exit(1);
  }

  console.log(`✅ Platform admin created successfully!`);
  console.log(`   Name:  ${name.trim()}`);
  console.log(`   Email: ${email.trim().toLowerCase()}`);
  console.log(`\n   Login at: /admin/login`);

  rl.close();
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  rl.close();
  process.exit(1);
});
