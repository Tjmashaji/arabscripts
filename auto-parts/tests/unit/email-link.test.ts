import { describe, expect, it } from "vitest";
import { parseEmailLinkHash } from "@/lib/email-link";

describe("parseEmailLinkHash", () => {
  it("reads a recovery session from the fragment", () => {
    expect(parseEmailLinkHash("#access_token=a.b.c&refresh_token=r&expires_in=3600&type=recovery")).toEqual({
      kind: "session",
      accessToken: "a.b.c",
      refreshToken: "r",
      type: "recovery",
    });
  });
  it("reports expired or invalid links", () => {
    expect(parseEmailLinkHash("#error=access_denied&error_code=otp_expired&error_description=x")).toEqual({ kind: "error" });
  });
  it("ignores unrelated fragments", () => {
    expect(parseEmailLinkHash("")).toBeNull();
    expect(parseEmailLinkHash("#main")).toBeNull();
    expect(parseEmailLinkHash("#access_token=only")).toBeNull();
  });
});
