// إشعارات الجوال الأصلية (supabase/functions/push/native.ts): توقيع JWT لـ Google وApple، وشكل الطلبات، وحذف الرموز المنتهية.
import { test } from "node:test";
import assert from "node:assert/strict";
import { signJwt, sendFcm, sendApns, nativeConfig } from "../supabase/functions/push/native.ts";

const pem = (der, label) => `-----BEGIN ${label}-----\n${Buffer.from(der).toString("base64").match(/.{1,64}/g).join("\n")}\n-----END ${label}-----\n`;
const decode = (part) => JSON.parse(Buffer.from(part, "base64url").toString());

async function keys(alg) {
  const params = alg === "RS256" ? { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" } : { name: "ECDSA", namedCurve: "P-256" };
  const pair = await crypto.subtle.generateKey(params, true, ["sign", "verify"]);
  return { pair, privatePem: pem(await crypto.subtle.exportKey("pkcs8", pair.privateKey), "PRIVATE KEY") };
}
async function verify(jwt, alg, publicKey) {
  const [h, c, s] = jwt.split(".");
  const algo = alg === "RS256" ? "RSASSA-PKCS1-v1_5" : { name: "ECDSA", hash: "SHA-256" };
  return crypto.subtle.verify(algo, publicKey, Buffer.from(s, "base64url"), new TextEncoder().encode(`${h}.${c}`));
}
const msg = { id: "11111111-2222-3333-4444-555555555555", type: "student_boarded", title: "صعد ابنك الباص", body: "سجّل السائق الصعود." };

test("RS256 (Google) يوقَّع بشكل صحيح", async () => {
  const { pair, privatePem } = await keys("RS256");
  const jwt = await signJwt("RS256", {}, { iss: "a@b.iam.gserviceaccount.com", iat: 1 }, privatePem);
  assert.equal(decode(jwt.split(".")[0]).alg, "RS256");
  assert.ok(await verify(jwt, "RS256", pair.publicKey));
});

test("ES256 (Apple) يوقَّع بشكل صحيح ويحمل kid", async () => {
  const { pair, privatePem } = await keys("ES256");
  const jwt = await signJwt("ES256", { kid: "ABC123" }, { iss: "TEAM", iat: 1 }, privatePem);
  assert.deepEqual(decode(jwt.split(".")[0]), { alg: "ES256", typ: "JWT", kid: "ABC123" });
  assert.equal(Buffer.from(jwt.split(".")[2], "base64url").length, 64); // r||s
  assert.ok(await verify(jwt, "ES256", pair.publicKey));
});

test("FCM: يطلب رمز الدخول ثم يرسل لقناة trips، ويحذف الرمز المنتهي", async () => {
  const { privatePem } = await keys("RS256");
  const sa = { project_id: "masari-test", client_email: "push@masari-test.iam.gserviceaccount.com", private_key: privatePem };
  const calls = [];
  let sendStatus = 200;
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    if (url.includes("oauth2")) return new Response(JSON.stringify({ access_token: "ya29.test", expires_in: 3600 }), { status: 200 });
    return new Response(sendStatus === 200 ? "{}" : '{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}', { status: sendStatus });
  };
  const ok = await sendFcm("device-token-1", msg, sa, fetcher);
  assert.deepEqual(ok, { status: 200, remove: false });
  const send = calls.find((c) => c.url.includes("fcm.googleapis.com"));
  assert.equal(send.url, "https://fcm.googleapis.com/v1/projects/masari-test/messages:send");
  assert.equal(send.init.headers.Authorization, "Bearer ya29.test");
  const body = JSON.parse(send.init.body);
  assert.equal(body.message.token, "device-token-1");
  assert.equal(body.message.android.notification.channel_id, "trips");
  assert.equal(body.message.notification.title, "صعد ابنك الباص");
  sendStatus = 404;
  const gone = await sendFcm("device-token-2", msg, sa, fetcher);
  assert.equal(gone.remove, true);
});

test("APNs: يجرّب بيئة sandbox عند BadDeviceToken، ويحذف الرمز عند 410", async () => {
  const { privatePem } = await keys("ES256");
  const cfg = { key: privatePem, keyId: "KEY1", teamId: "TEAM1", bundleId: "sa.masari.app", sandbox: false };
  const hosts = [];
  let mode = "bad-then-ok";
  const fetcher = async (url, init) => {
    hosts.push(new URL(url).host);
    assert.equal(init.headers["apns-topic"], "sa.masari.app");
    assert.match(init.headers.authorization, /^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    if (mode === "gone") return new Response('{"reason":"Unregistered"}', { status: 410 });
    return url.includes("sandbox") ? new Response("", { status: 200 }) : new Response('{"reason":"BadDeviceToken"}', { status: 400 });
  };
  const r = await sendApns("abc123", msg, cfg, fetcher);
  assert.deepEqual(r, { status: 200, remove: false });
  assert.deepEqual(hosts, ["api.push.apple.com", "api.sandbox.push.apple.com"]);
  mode = "gone";
  assert.equal((await sendApns("abc123", msg, cfg, fetcher)).remove, true);
});

test("الأسرار الناقصة تعني مزوّدًا غير مضبوط، لا خطأ", () => {
  assert.deepEqual(nativeConfig(() => undefined), { fcm: null, apns: null });
  assert.equal(nativeConfig((k) => (k === "FCM_SERVICE_ACCOUNT" ? "not json" : undefined)).fcm, null);
  const c = nativeConfig((k) => ({ APNS_KEY: "k", APNS_KEY_ID: "i", APNS_TEAM_ID: "t", APNS_ENV: "sandbox" })[k]);
  assert.deepEqual(c.apns, { key: "k", keyId: "i", teamId: "t", bundleId: "sa.masari.app", sandbox: true });
});
