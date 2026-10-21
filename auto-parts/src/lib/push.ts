import "server-only";
import { connect } from "node:http2";
import { createPrivateKey, sign } from "node:crypto";
import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";
import { isLocale, type Locale } from "@/i18n/locales";
import { pushText, type PushMessages } from "./push-content";

const messages: Record<Locale, PushMessages> = { ar, en, zh } as unknown as Record<Locale, PushMessages>;

export type PushTarget = { token: string; platform: "android" | "ios" };
export type PushResult = "sent" | "invalid" | "failed";

export function pushContent(kind: string, payload: Record<string, unknown>, locale: string) {
  return pushText(messages[isLocale(locale) ? locale : "ar"], kind, payload, isLocale(locale) ? locale : "ar");
}

const b64url = (data: Buffer | string) => Buffer.from(data).toString("base64url");

// ───────── أندرويد: Firebase Cloud Messaging (HTTP v1) بحساب خدمة Firebase ─────────
type ServiceAccount = { project_id: string; client_email: string; private_key: string };
let fcmToken: { value: string; expires: number } | null = null;

function serviceAccount(): ServiceAccount | null {
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) return null;
    const sa = JSON.parse(raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
    return sa.project_id && sa.client_email && sa.private_key ? sa : null;
  } catch {
    return null;
  }
}

async function fcmAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (fcmToken && fcmToken.expires > now + 60) return fcmToken.value;
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const signature = sign("RSA-SHA256", Buffer.from(`${head}.${claims}`), createPrivateKey(sa.private_key));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${b64url(signature)}` }),
  });
  if (!res.ok) throw new Error(`fcm auth ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  fcmToken = { value: json.access_token, expires: now + json.expires_in };
  return json.access_token;
}

async function sendFcm(sa: ServiceAccount, token: string, msg: { title: string; body: string; path: string }): Promise<PushResult> {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${await fcmAccessToken(sa)}`, "content-type": "application/json" },
    body: JSON.stringify({ message: {
      token, notification: { title: msg.title, body: msg.body }, data: { path: msg.path },
      android: { priority: "high", notification: { icon: "ic_stat_notify", color: "#c2410c", channel_id: "default" } },
    } }),
  });
  if (res.ok) return "sent";
  const err = await res.text();
  // الرمز لم يعد صالحًا (حُذف التطبيق أو أُعيد تثبيته).
  return res.status === 404 || /UNREGISTERED|registration-token-not-registered/.test(err) ? "invalid" : "failed";
}

// ───────── آيفون: Apple Push Notification service بمفتاح .p8 ─────────
type ApnsKey = { key: string; keyId: string; teamId: string; topic: string; host: string };
let apnsJwt: { value: string; issued: number } | null = null;

function apnsKey(): ApnsKey | null {
  const { APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, APNS_SANDBOX, APNS_HOST } = process.env;
  if (!APNS_KEY || !APNS_KEY_ID || !APNS_TEAM_ID) return null;
  const key = APNS_KEY.includes("BEGIN PRIVATE KEY") ? APNS_KEY : Buffer.from(APNS_KEY, "base64").toString("utf8");
  return { key, keyId: APNS_KEY_ID, teamId: APNS_TEAM_ID, topic: APNS_BUNDLE_ID || "sa.chinesecarparts.app",
    host: APNS_HOST || (APNS_SANDBOX === "1" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com") };
}

function apnsAuth(k: ApnsKey): string {
  const now = Math.floor(Date.now() / 1000);
  // أبل تقبل الرمز ساعة، وترفض تجديده أكثر من مرة كل 20 دقيقة.
  if (apnsJwt && now - apnsJwt.issued < 45 * 60) return apnsJwt.value;
  const head = b64url(JSON.stringify({ alg: "ES256", kid: k.keyId }));
  const claims = b64url(JSON.stringify({ iss: k.teamId, iat: now }));
  const signature = sign("SHA256", Buffer.from(`${head}.${claims}`), { key: createPrivateKey(k.key), dsaEncoding: "ieee-p1363" });
  apnsJwt = { value: `${head}.${claims}.${b64url(signature)}`, issued: now };
  return apnsJwt.value;
}

function sendApns(k: ApnsKey, token: string, msg: { title: string; body: string; path: string }): Promise<PushResult> {
  return new Promise((resolve) => {
    const client = connect(k.host);
    client.on("error", () => resolve("failed"));
    const req = client.request({
      ":method": "POST", ":path": `/3/device/${token}`, authorization: `bearer ${apnsAuth(k)}`,
      "apns-topic": k.topic, "apns-push-type": "alert", "apns-priority": "10", "content-type": "application/json",
    });
    let status = 0;
    let body = "";
    req.on("response", (h) => { status = Number(h[":status"]); });
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      client.close();
      if (status === 200) resolve("sent");
      else resolve(status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(body) ? "invalid" : "failed");
    });
    req.on("error", () => { client.close(); resolve("failed"); });
    req.end(JSON.stringify({ aps: { alert: { title: msg.title, body: msg.body }, sound: "default" }, path: msg.path }));
  });
}

export function pushConfigured() {
  return { android: serviceAccount() !== null, ios: apnsKey() !== null };
}

export async function sendPush(target: PushTarget, msg: { title: string; body: string; path: string }): Promise<PushResult> {
  try {
    if (target.platform === "android") {
      const sa = serviceAccount();
      return sa ? await sendFcm(sa, target.token, msg) : "failed";
    }
    const k = apnsKey();
    return k ? await sendApns(k, target.token, msg) : "failed";
  } catch {
    return "failed";
  }
}
