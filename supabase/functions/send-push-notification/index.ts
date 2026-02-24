import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// ---- VAPID / Web Push helpers (no npm deps, uses Web Crypto) ----

function base64UrlDecode(str: string): Uint8Array {
  const padding = "=".repeat((4 - (str.length % 4)) % 4);
  const base64 = (str + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importVapidKeys(publicKeyB64: string, privateKeyB64: string) {
  const publicKeyBytes = base64UrlDecode(publicKeyB64);
  const privateKeyBytes = base64UrlDecode(privateKeyB64);

  // Build JWK for ECDSA P-256 private key
  const x = base64UrlEncode(publicKeyBytes.slice(1, 33));
  const y = base64UrlEncode(publicKeyBytes.slice(33, 65));
  const d = base64UrlEncode(privateKeyBytes);

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x, y, d },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  return { privateKey, publicKeyBytes };
}

async function createVapidJwt(
  privateKey: CryptoKey,
  publicKeyBytes: Uint8Array,
  audience: string,
  subject: string,
  expSeconds: number
): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + expSeconds,
    sub: subject,
  };

  const encoder = new TextEncoder();
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    encoder.encode(unsignedToken)
  );

  // Convert DER signature to raw r||s format (64 bytes)
  const sigBytes = new Uint8Array(signature);
  let rawSig: Uint8Array;

  if (sigBytes.length === 64) {
    rawSig = sigBytes;
  } else {
    // DER format: parse r and s
    const r = parseDerInt(sigBytes, 3);
    const sOffset = 3 + 1 + sigBytes[3] + 1;
    const s = parseDerInt(sigBytes, sOffset);
    rawSig = new Uint8Array(64);
    rawSig.set(padTo32(r), 0);
    rawSig.set(padTo32(s), 32);
  }

  const jwt = `${unsignedToken}.${base64UrlEncode(rawSig)}`;
  const vapidKey = base64UrlEncode(publicKeyBytes);

  return `vapid t=${jwt}, k=${vapidKey}`;
}

function parseDerInt(buf: Uint8Array, offset: number): Uint8Array {
  const len = buf[offset];
  return buf.slice(offset + 1, offset + 1 + len);
}

function padTo32(bytes: Uint8Array): Uint8Array {
  if (bytes.length === 32) return bytes;
  if (bytes.length > 32) return bytes.slice(bytes.length - 32);
  const padded = new Uint8Array(32);
  padded.set(bytes, 32 - bytes.length);
  return padded;
}

async function encryptPayload(
  p256dhKey: string,
  authSecret: string,
  payload: string
): Promise<{ ciphertext: ArrayBuffer; salt: Uint8Array; serverPublicKey: ArrayBuffer }> {
  const clientPublicKey = base64UrlDecode(p256dhKey);
  const clientAuth = base64UrlDecode(authSecret);

  // Generate ephemeral ECDH key pair
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  const serverPublicKeyRaw = await crypto.subtle.exportKey("raw", serverKeyPair.publicKey);

  // Import client public key
  const clientKey = await crypto.subtle.importKey(
    "raw",
    clientPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // ECDH shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: clientKey },
    serverKeyPair.privateKey,
    256
  );

  // Salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // HKDF to derive encryption key and nonce (RFC 8291)
  const encoder = new TextEncoder();

  // auth_info = "WebPush: info\0" + client_public + server_public
  const authInfo = new Uint8Array([
    ...encoder.encode("WebPush: info\0"),
    ...clientPublicKey,
    ...new Uint8Array(serverPublicKeyRaw),
  ]);

  // IKM = HKDF(auth_secret, shared_secret, auth_info, 32)
  const authHkdfKey = await crypto.subtle.importKey("raw", clientAuth, "HKDF", false, ["deriveBits"]);
  const prk = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(sharedSecret), info: authInfo },
    authHkdfKey,
    256
  );

  // PRK from IKM
  const prkKey = await crypto.subtle.importKey("raw", prk, "HKDF", false, ["deriveBits"]);

  // CEK = HKDF(salt, PRK, "Content-Encoding: aes128gcm\0", 16)
  const cekInfo = encoder.encode("Content-Encoding: aes128gcm\0");
  const cekBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: cekInfo },
    prkKey,
    128
  );

  // Nonce = HKDF(salt, PRK, "Content-Encoding: nonce\0", 12)
  const nonceInfo = encoder.encode("Content-Encoding: nonce\0");
  const nonceBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: nonceInfo },
    prkKey,
    96
  );

  // Encrypt with AES-128-GCM
  const contentKey = await crypto.subtle.importKey("raw", cekBits, "AES-GCM", false, ["encrypt"]);

  // Pad payload: add delimiter byte 0x02 (record with more records = 1, final = 2)
  const payloadBytes = encoder.encode(payload);
  const paddedPayload = new Uint8Array(payloadBytes.length + 1);
  paddedPayload.set(payloadBytes);
  paddedPayload[payloadBytes.length] = 2; // Final record delimiter

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonceBits, tagLength: 128 },
    contentKey,
    paddedPayload
  );

  // Build aes128gcm content-coding header:
  // salt (16) + rs (4, big-endian uint32) + idlen (1) + keyid (65 for P-256 uncompressed)
  const rs = payloadBytes.length + 1 + 16 + 86; // padded_payload + tag + overhead
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  const rsView = new DataView(header.buffer, 16, 4);
  rsView.setUint32(0, rs > 4096 ? 4096 : rs);
  header[20] = 65; // idlen
  header.set(new Uint8Array(serverPublicKeyRaw), 21);

  // Combine header + ciphertext
  const encryptedBytes = new Uint8Array(encrypted);
  const body = new Uint8Array(header.length + encryptedBytes.length);
  body.set(header);
  body.set(encryptedBytes, header.length);

  return { ciphertext: body.buffer, salt, serverPublicKey: serverPublicKeyRaw };
}

async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: object
): Promise<{ success: boolean; status?: number; gone?: boolean }> {
  const { privateKey, publicKeyBytes } = await importVapidKeys(VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const endpointUrl = new URL(subscription.endpoint);
  const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;

  const authorization = await createVapidJwt(
    privateKey,
    publicKeyBytes,
    audience,
    "mailto:notification@peaksnature.com",
    86400
  );

  const payloadStr = JSON.stringify(payload);
  const { ciphertext } = await encryptPayload(subscription.p256dh, subscription.auth, payloadStr);

  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
      Urgency: "high",
    },
    body: ciphertext,
  });

  if (response.status === 410 || response.status === 404) {
    return { success: false, status: response.status, gone: true };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error(`[WebPush] Failed ${response.status}: ${text}`);
    return { success: false, status: response.status };
  }

  return { success: true, status: response.status };
}

// ---- Deno serve handler ----

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  // Verify authorization (service role key or custom secret)
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ") || authHeader.slice(7) !== SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const { host_id, title, body, url } = await req.json();

    if (!host_id) {
      return new Response(JSON.stringify({ error: "host_id required" }), { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch all push subscriptions for this host
    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("host_id", host_id);

    if (error) {
      console.error("[Edge] DB error:", error);
      return new Response(JSON.stringify({ error: "Database error" }), { status: 500 });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "No subscriptions" }), { status: 200 });
    }

    const payload = { title, body, url, tag: `booking-${Date.now()}` };
    let sent = 0;
    const expired: string[] = [];

    for (const sub of subscriptions) {
      const result = await sendWebPush(sub, payload);
      if (result.success) {
        sent++;
      } else if (result.gone) {
        expired.push(sub.id);
      }
    }

    // Clean up expired subscriptions
    if (expired.length > 0) {
      await supabase.from("push_subscriptions").delete().in("id", expired);
      console.log(`[Edge] Cleaned ${expired.length} expired subscriptions`);
    }

    return new Response(
      JSON.stringify({ sent, total: subscriptions.length, expired: expired.length }),
      { status: 200 }
    );
  } catch (err) {
    console.error("[Edge] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
