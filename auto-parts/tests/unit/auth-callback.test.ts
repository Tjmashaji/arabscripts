import { describe, expect, it } from "vitest";
import { authCallbackTarget, hasFreshRecovery, isRecoveryToken, tokenEmail } from "@/lib/auth-callback";

const q = (s: string) => new URLSearchParams(s);

describe("authCallbackTarget", () => {
  it("sends ?code= from the home page to /auth/confirm", () => {
    expect(authCallbackTarget("/", q("code=abc"))).toBe("/auth/confirm?code=abc");
  });
  it("keeps token_hash, type and next", () => {
    expect(authCallbackTarget("/en", q("token_hash=h&type=recovery&next=%2Freset-password"))).toBe(
      "/auth/confirm?token_hash=h&type=recovery&next=%2Freset-password",
    );
  });
  it("turns an expired-link error into the sign-in error", () => {
    expect(authCallbackTarget("/", q("error=access_denied&error_code=otp_expired"))).toBe("/login?error=confirmFailed");
  });
  it("ignores normal pages and the confirm route itself", () => {
    expect(authCallbackTarget("/login", q("next=%2Faccount"))).toBeNull();
    expect(authCallbackTarget("/auth/confirm", q("code=abc"))).toBeNull();
    expect(authCallbackTarget("/", q("type=recovery"))).toBeNull();
  });
});

describe("isRecoveryToken", () => {
  const token = (payload: object) => `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.y`;
  it("detects a recovery session", () => {
    expect(isRecoveryToken(token({ amr: [{ method: "recovery", timestamp: 1 }] }))).toBe(true);
  });
  it("rejects other sessions and garbage", () => {
    expect(isRecoveryToken(token({ amr: [{ method: "password" }] }))).toBe(false);
    expect(isRecoveryToken("not-a-jwt")).toBe(false);
    expect(isRecoveryToken(undefined)).toBe(false);
  });
});

describe("hasFreshRecovery", () => {
  const now = 1_800_000_000;
  it("accepts a recovery login within the last hour only", () => {
    expect(hasFreshRecovery([{ method: "recovery", timestamp: now - 600 }], now)).toBe(true);
    expect(hasFreshRecovery([{ method: "recovery", timestamp: now - 7200 }], now)).toBe(false);
    expect(hasFreshRecovery([{ method: "password", timestamp: now }], now)).toBe(false);
    expect(hasFreshRecovery(undefined, now)).toBe(false);
    expect(hasFreshRecovery([{ method: "recovery" }], now)).toBe(false);
  });
});

describe("tokenEmail", () => {
  const token = (payload: object) => `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.y`;
  it("reads the account email from the link token (UTF-8 safe)", () => {
    expect(tokenEmail(token({ email: "a@example.com" }))).toBe("a@example.com");
    expect(tokenEmail(token({ email: "تجربة@example.com" }))).toBe("تجربة@example.com");
    expect(tokenEmail(token({ sub: "x" }))).toBeNull();
    expect(tokenEmail("garbage")).toBeNull();
  });
});
