import { createServiceRoleClient } from "@/lib/supabase/server";
import { getCacheEnvPrefix, getReadyRedis } from "@/lib/redis";
import type { PlatformAdmin } from "@/types/database";
import type { EasySlipV2RawSlip } from "@/lib/easyslip";

type AlertAdmin = Pick<PlatformAdmin, "email" | "line_user_id" | "line_channel_access_token">;

export const ADMIN_ALERT_THROTTLE_MS = 30 * 60 * 1000;

// shortcut: per serverless instance when Redis is down or unset; fine while REDIS_URL is set in prod.
const localThrottle = new Map<string, number>();

/** True the first time a key is seen inside the throttle window. */
async function claimAlertSlot(key: string): Promise<boolean> {
  const redisKey = `${getCacheEnvPrefix()}:admin-alert:${key}`;
  try {
    const redis = await getReadyRedis();
    if (redis) {
      return (await redis.set(redisKey, "1", "PX", ADMIN_ALERT_THROTTLE_MS, "NX")) === "OK";
    }
  } catch (err) {
    console.error("[admin-alert] Redis throttle failed, using in-memory:", err);
  }
  const now = Date.now();
  const until = localThrottle.get(redisKey);
  if (until && until > now) return false;
  localThrottle.set(redisKey, now + ADMIN_ALERT_THROTTLE_MS);
  return true;
}

/**
 * Push a plain-text LINE message to every platform admin with LINE set up.
 * With a throttleKey, the same key alerts at most once per 30 minutes, so an
 * outage (sms-kub out of credit, EasySlip quota) is one message, not hundreds.
 * Never throws: an alert must not break the request that raised it.
 */
export async function alertAdmins(text: string, throttleKey?: string): Promise<void> {
  try {
    if (throttleKey && !(await claimAlertSlot(throttleKey))) return;

    const { data: admins, error } = await createServiceRoleClient()
      .from("platform_admins")
      .select("email, line_user_id, line_channel_access_token");
    if (error) {
      console.error("[admin-alert] could not load admins:", error.message);
      return;
    }

    const message = `[${getCacheEnvPrefix()}] ${text}`;
    await Promise.allSettled(
      ((admins ?? []) as AlertAdmin[]).map(async (admin) => {
        if (!admin.line_user_id || !admin.line_channel_access_token) return;
        try {
          const res = await fetch("https://api.line.me/v2/bot/message/push", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${admin.line_channel_access_token}`,
            },
            body: JSON.stringify({
              to: admin.line_user_id,
              messages: [{ type: "text", text: message }],
            }),
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) console.error(`[admin-alert] LINE ${res.status} for ${admin.email}`);
        } catch (err) {
          console.error(`[admin-alert] LINE failed for ${admin.email}:`, err);
        }
      }),
    );
  } catch (err) {
    console.error("[admin-alert] failed:", err);
  }
}

const PAYMENT_KIND_LABEL = {
  wallet_topup: "เติมเงิน wallet",
  invoice: "ชำระใบแจ้งหนี้",
  plan_activation: "เปิดใช้แผน Fixed Rate",
} as const;

/**
 * A host's real transfer that EasySlip has now seen (and will call a duplicate
 * forever) was refused afterwards: an admin must settle it by hand. Never
 * throttled: each one is money.
 */
export function alertStrandedPayment(p: {
  kind: keyof typeof PAYMENT_KIND_LABEL;
  reason: string;
  hostName: string;
  hostId: string;
  expectedAmount: number;
  slipAmount: number;
  transRef: string | null;
}): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  return alertAdmins(
    [
      "💸 สลิปถูกปฏิเสธหลังผ่าน EasySlip — ต้องเคลียร์ด้วยมือ",
      `ประเภท: ${PAYMENT_KIND_LABEL[p.kind]} · เหตุผล: ${p.reason}`,
      `โฮสต์: ${p.hostName} (${p.hostId})`,
      `คาด ฿${p.expectedAmount.toLocaleString()} / สลิป ฿${p.slipAmount.toLocaleString()}`,
      `transRef: ${p.transRef ?? "-"}`,
      ...(appUrl ? [`🔗 ${appUrl}/admin/logs`] : []),
    ].join("\n"),
  );
}

const PAYMENT_SMS_LABEL = {
  wallet_topup: "เติมwallet",
  invoice: "ใบแจ้งหนี้",
  plan_activation: "FixedRate",
} as const;

/**
 * A host payment the platform accepted: an SMS to every admin with a phone
 * (owner, 2026-11-27). A slip whose receiver did not match the platform account
 * is accepted too, so it also raises a LINE alert for an admin to check the
 * slip. Never throttled: each one is money. Never throws.
 */
export async function notifyPlatformPayment(p: {
  kind: keyof typeof PAYMENT_KIND_LABEL;
  hostName: string;
  hostId: string;
  amount: number;
  transRef: string | null;
  receiver: EasySlipV2RawSlip["receiver"] | null;
  receiverUnverified: boolean;
}): Promise<void> {
  try {
    const { data: admins, error } = await createServiceRoleClient().from("platform_admins").select("phone");
    if (error) console.error("[admin-alert] could not load admin phones:", error.message);
    const phones = ((admins ?? []) as { phone: string | null }[]).flatMap((a) => (a.phone ? [a.phone] : []));
    if (phones.length > 0) {
      // Dynamic: notifications.ts imports this module.
      const { sendSms, truncateForSms } = await import("@/lib/notifications");
      // The flag leads: truncateForSms cuts the end.
      const text = truncateForSms(
        `${p.receiverUnverified ? "ตรวจบัญชีผู้รับ! " : ""}Peaksnature รับ฿${p.amount.toLocaleString()} ${PAYMENT_SMS_LABEL[p.kind]} ${p.hostName}`,
      );
      await Promise.allSettled(phones.map((phone) => sendSms(phone, text)));
    }
  } catch (err) {
    console.error("[admin-alert] payment SMS failed:", err);
  }

  if (!p.receiverUnverified) return;
  const account = p.receiver?.account;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  await alertAdmins(
    [
      "⚠️ รับชำระแล้ว แต่บัญชีผู้รับในสลิปไม่ตรงกับบัญชีแพลตฟอร์ม — ตรวจสอบสลิป",
      `ประเภท: ${PAYMENT_KIND_LABEL[p.kind]} · ฿${p.amount.toLocaleString()}`,
      `โฮสต์: ${p.hostName} (${p.hostId})`,
      `ผู้รับ: ${account?.name?.th || account?.name?.en || "-"} · ${account?.proxy?.account || account?.bank?.account || "-"}`,
      `transRef: ${p.transRef ?? "-"}`,
      ...(appUrl ? [`🔗 ${appUrl}/admin/logs`] : []),
    ].join("\n"),
  );
}
