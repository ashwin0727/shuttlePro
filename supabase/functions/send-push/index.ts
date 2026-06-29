// ============================================================
//  ShuttlePro · Supabase Edge Function
//  File: supabase/functions/send-push/index.ts
//
//  Deploy: supabase functions deploy send-push
//  Call:   supabase.functions.invoke('send-push', { body: {...} })
// ============================================================

// @ts-ignore — Deno runtime import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface PushPayload {
  tournament_id: string;
  title: string;
  body: string;
  icon?: string;
  type?: string;
  audience?: "all" | "teams" | "admins" | "live_viewers";
  data?: Record<string, string>;
}

const FCM_PROJECT_ID = Deno.env.get("FCM_PROJECT_ID")!;
const FCM_SERVICE_ACCOUNT_KEY = Deno.env.get("FCM_SERVICE_ACCOUNT_KEY")!; // base64 JSON
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── Get OAuth2 access token for FCM HTTP v1 API ─────────────
async function getAccessToken(): Promise<string> {
  const serviceAccount = JSON.parse(atob(FCM_SERVICE_ACCOUNT_KEY));

  const jwtHeader = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const jwtClaim = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const encoder = new TextEncoder();
  const base64url = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const unsigned = `${base64url(jwtHeader)}.${base64url(jwtClaim)}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(unsigned)
  );

  const jwt = `${unsigned}.${btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const { access_token } = await tokenRes.json();
  return access_token;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ── Send a single FCM message ────────────────────────────────
async function sendFcmMessage(accessToken: string, token: string, title: string, body: string, icon: string, data: Record<string, string>) {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          webpush: {
            notification: { icon: "/icon-192.png", badge: "/badge-72.png" },
            fcm_options: { link: data.url || "/" },
          },
          data,
        },
      }),
    }
  );
  return { ok: res.ok, status: res.status, body: await res.text() };
}

// ── Main handler ──────────────────────────────────────────────
// @ts-ignore
Deno.serve(async (req: Request) => {
  try {
    const payload: PushPayload = await req.json();
    const { tournament_id, title, body, icon = "🏸", type = "info", audience = "all", data = {} } = payload;

    // 1. Store the notification in the DB (triggers in-app realtime too)
    const { data: notif, error: notifErr } = await supabase
      .from("notifications")
      .insert({ tournament_id, title, body, icon, type })
      .select()
      .single();

    if (notifErr) throw notifErr;

    // 2. Fetch target device tokens based on audience
    let query = supabase
      .from("device_tokens")
      .select("id, token, platform, user_id")
      .eq("tournament_id", tournament_id)
      .eq("is_active", true);

    if (audience === "admins") {
      const { data: admins } = await supabase
        .from("profiles")
        .select("id")
        .in("role", ["admin", "superadmin"]);
      query = query.in("user_id", (admins ?? []).map((a) => a.id));
    }

    const { data: tokens, error: tokenErr } = await query;
    if (tokenErr) throw tokenErr;

    // 3. Get FCM access token once
    const accessToken = await getAccessToken();

    // 4. Send to all devices in parallel, log each delivery
    const results = await Promise.allSettled(
      (tokens ?? []).map(async (t) => {
        const result = await sendFcmMessage(accessToken, t.token, title, body, icon, {
          ...data,
          notification_id: notif.id,
          tournament_id,
        });

        await supabase.from("notification_deliveries").insert({
          notification_id: notif.id,
          device_token_id: t.id,
          platform: t.platform,
          status: result.ok ? "sent" : "failed",
          error_message: result.ok ? null : result.body,
        });

        return result;
      })
    );

    const sent = results.filter((r) => r.status === "fulfilled" && (r.value as any).ok).length;
    const failed = results.length - sent;

    return new Response(
      JSON.stringify({ success: true, notification_id: notif.id, sent, failed, total: results.length }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
