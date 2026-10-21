import { generateKeyPairSync, createVerify } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http2";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const sa = { project_id: "demo-project", client_email: "push@demo-project.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() };
const msg = { title: "عنوان", body: "نص", path: "/account/orders" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("sendPush (Android / FCM)", () => {
  it("signs a valid service-account JWT and sends the notification with its link", async () => {
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT", JSON.stringify(sa));
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("oauth2")) return new Response(JSON.stringify({ access_token: "ya29.token", expires_in: 3600 }));
      return new Response("{}", { status: 200 });
    }));
    const { sendPush } = await import("@/lib/push");
    expect(await sendPush({ token: "device-token-1234567890", platform: "android" }, msg)).toBe("sent");

    const assertion = new URLSearchParams(calls[0].init.body as string).get("assertion")!;
    const [h, c, s] = assertion.split(".");
    const v = createVerify("RSA-SHA256");
    v.update(`${h}.${c}`);
    expect(v.verify(publicKey, Buffer.from(s, "base64url"))).toBe(true);
    expect(JSON.parse(Buffer.from(c, "base64url").toString()).iss).toBe(sa.client_email);

    expect(calls[1].url).toBe("https://fcm.googleapis.com/v1/projects/demo-project/messages:send");
    expect((calls[1].init.headers as Record<string, string>).authorization).toBe("Bearer ya29.token");
    const sent = JSON.parse(calls[1].init.body as string).message;
    expect(sent.token).toBe("device-token-1234567890");
    expect(sent.notification).toEqual({ title: "عنوان", body: "نص" });
    expect(sent.data.path).toBe("/account/orders");
  });

  it("reports an unregistered device as invalid and other errors as failed", async () => {
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT", Buffer.from(JSON.stringify(sa)).toString("base64"));
    let reply = new Response('{"error":{"details":[{"errorCode":"UNREGISTERED"}]}}', { status: 404 });
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.includes("oauth2") ? new Response(JSON.stringify({ access_token: "t", expires_in: 3600 })) : reply));
    const { sendPush } = await import("@/lib/push");
    expect(await sendPush({ token: "gone-token-1234567890", platform: "android" }, msg)).toBe("invalid");
    reply = new Response("quota", { status: 429 });
    expect(await sendPush({ token: "busy-token-1234567890", platform: "android" }, msg)).toBe("failed");
  });

  it("fails safely when nothing is configured", async () => {
    const { sendPush, pushConfigured } = await import("@/lib/push");
    expect(pushConfigured()).toEqual({ android: false, ios: false });
    expect(await sendPush({ token: "t".repeat(30), platform: "android" }, msg)).toBe("failed");
    expect(await sendPush({ token: "t".repeat(30), platform: "ios" }, msg)).toBe("failed");
  });
});

describe("sendPush (iPhone / APNs)", () => {
  it("sends an ES256-signed request over HTTP/2 to the device and maps 410 to invalid", async () => {
    const { execFileSync } = await import("node:child_process");
    const { mkdtempSync, readFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const http2 = await import("node:http2");
    const dir = mkdtempSync(join(tmpdir(), "apns-"));
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=localhost", "-days", "1",
      "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem")], { stdio: "ignore" });
    const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });

    const seen: { path: string; headers: IncomingHttpHeaders; body: string }[] = [];
    const server = http2.createSecureServer({ key: readFileSync(join(dir, "k.pem")), cert: readFileSync(join(dir, "c.pem")) });
    server.on("stream", (stream, headers) => {
      let body = "";
      stream.on("data", (c) => { body += c; });
      stream.on("end", () => {
        seen.push({ path: String(headers[":path"]), headers, body });
        const gone = String(headers[":path"]).endsWith("/gone-device");
        stream.respond({ ":status": gone ? 410 : 200 });
        stream.end(gone ? '{"reason":"Unregistered"}' : "");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;

    vi.stubEnv("NODE_TLS_REJECT_UNAUTHORIZED", "0");
    vi.stubEnv("APNS_KEY", ec.privateKey.export({ type: "pkcs8", format: "pem" }).toString());
    vi.stubEnv("APNS_KEY_ID", "KEY123");
    vi.stubEnv("APNS_TEAM_ID", "TEAM456");
    vi.stubEnv("APNS_HOST", `https://127.0.0.1:${port}`);
    const { sendPush } = await import("@/lib/push");
    try {
      expect(await sendPush({ token: "ios-device", platform: "ios" }, msg)).toBe("sent");
      expect(await sendPush({ token: "gone-device", platform: "ios" }, msg)).toBe("invalid");
    } finally {
      server.close();
    }

    const first = seen[0];
    expect(first.path).toBe("/3/device/ios-device");
    expect(first.headers["apns-topic"]).toBe("sa.chinesecarparts.app");
    expect(first.headers["apns-push-type"]).toBe("alert");
    const [h, c, s] = String(first.headers.authorization).replace("bearer ", "").split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "ES256", kid: "KEY123" });
    expect(JSON.parse(Buffer.from(c, "base64url").toString()).iss).toBe("TEAM456");
    const v = createVerify("SHA256");
    v.update(`${h}.${c}`);
    expect(v.verify({ key: ec.publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"))).toBe(true);
    expect(JSON.parse(first.body)).toEqual({ aps: { alert: { title: "عنوان", body: "نص" }, sound: "default" }, path: "/account/orders" });
  });
});
