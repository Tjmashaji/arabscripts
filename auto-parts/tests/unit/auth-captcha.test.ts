import { beforeEach, describe, expect, it, vi } from "vitest";

// رمز Turnstile يمر من النموذج إلى Supabase Auth في كل عملية تحميها CAPTCHA، ورفض Supabase له يظهر رسالة واضحة.

class Redirect extends Error {
  constructor(public url: string) { super(url); }
}

type AuthCall = { method: string; args: unknown[] };
const state: { calls: AuthCall[]; error: { code: string } | null } = { calls: [], error: null };

const auth = new Proxy({}, {
  get: (_t, method: string) => async (...args: unknown[]) => {
    state.calls.push({ method, args });
    return { data: {}, error: state.error };
  },
});

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Redirect(url); } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: vi.fn(), get: () => undefined, delete: vi.fn() }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth,
    rpc: async () => ({ data: null, error: null }),
    from: () => ({ select: () => ({ maybeSingle: async () => ({ data: { locale: "ar" } }) }) }),
  }),
}));
vi.mock("@/lib/supabase/implicit", () => ({ createEmailLinkClient: () => ({ auth }) }));

const { signIn, signUp, requestPasswordReset } = await import("@/server/auth-actions");

function form(values: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.append(k, v);
  return f;
}
async function run(action: (f: FormData) => Promise<unknown>, values: Record<string, string>) {
  try { await action(form(values)); } catch (e) { if (e instanceof Redirect) return e.url; throw e; }
  throw new Error("no redirect");
}

const login = { locale: "ar", next: "/account", email: "a@example.com", password: "password-123" };

beforeEach(() => {
  state.calls = [];
  state.error = null;
});

describe("CAPTCHA token", () => {
  it("is passed to sign in", async () => {
    await run(signIn, { ...login, "cf-turnstile-response": "tok-1" });
    expect(state.calls[0]).toEqual({ method: "signInWithPassword", args: [{ email: "a@example.com", password: "password-123", options: { captchaToken: "tok-1" } }] });
  });

  it("is omitted when the widget is off (no site key)", async () => {
    await run(signIn, login);
    expect((state.calls[0].args[0] as { options: { captchaToken?: string } }).options.captchaToken).toBeUndefined();
  });

  it("is passed to sign up and to the password reset email", async () => {
    await run(signUp, { ...login, fullName: "عميل", "cf-turnstile-response": "tok-2" });
    expect((state.calls[0].args[0] as { options: { captchaToken: string } }).options.captchaToken).toBe("tok-2");
    state.calls = [];
    await run(requestPasswordReset, { locale: "en", email: "a@example.com", "cf-turnstile-response": "tok-3" });
    expect(state.calls[0].method).toBe("resetPasswordForEmail");
    expect((state.calls[0].args[1] as { captchaToken: string }).captchaToken).toBe("tok-3");
  });
});

describe("a rejected CAPTCHA", () => {
  beforeEach(() => { state.error = { code: "captcha_failed" }; });

  it("shows the captcha message on sign in and sign up", async () => {
    expect(await run(signIn, login)).toBe("/login?error=captcha&next=%2Faccount");
    expect(await run(signUp, { ...login, fullName: "عميل" })).toBe("/signup?error=captcha&next=%2Faccount");
  });

  it("shows the captcha message on password reset, while other errors still look like success", async () => {
    expect(await run(requestPasswordReset, { locale: "ar", email: "a@example.com" })).toBe("/forgot-password?error=captcha");
    state.error = { code: "user_not_found" };
    expect(await run(requestPasswordReset, { locale: "ar", email: "a@example.com" })).toBe("/forgot-password?sent=1");
  });
});
