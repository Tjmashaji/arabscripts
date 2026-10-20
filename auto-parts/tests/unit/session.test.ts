import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

type Result = { data: unknown; error?: { message: string } | null };
const state: { claims: Record<string, unknown> | null; profiles: Result[]; perms: Result; rpc: Result; calls: string[] } = {
  claims: null, profiles: [], perms: { data: [] }, rpc: { data: null }, calls: [],
};

function query(table: string) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => { state.calls.push(table); return state.profiles.shift() ?? { data: null }; },
    then: (resolve: (r: Result) => unknown) => { state.calls.push(table); return Promise.resolve(state.perms).then(resolve); },
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: state.claims ? { claims: state.claims } : null }) },
    from: (table: string) => query(table),
    rpc: async (name: string) => { state.calls.push(name); return state.rpc; },
  }),
}));

const perms = { data: [
  { role: "operations_admin", permission: "quotes.manage" }, { role: "operations_admin", permission: "shipping.manage" },
  { role: "finance_admin", permission: "finance.manage" },
] };
const profile = (over: Record<string, unknown> = {}) => ({ data: {
  full_name: "تركي", phone: "+966500000000", status: "active", ap_user_preferences: { locale: "en" },
  ap_staff_roles: [{ role: "operations_admin" }],
  ap_organization_members: [{ organization_id: "o1", member_role: "owner", status: "active" }, { organization_id: "o2", member_role: "staff", status: "removed" }],
  ...over,
} });

async function load() {
  vi.resetModules();
  const { getSession } = await import("@/lib/auth");
  return getSession();
}

beforeEach(() => {
  state.claims = { sub: "u1", email: "a@example.com", is_anonymous: false, user_metadata: { full_name: "تركي" } };
  state.profiles = []; state.perms = perms; state.rpc = { data: null, error: null }; state.calls = [];
});

describe("getSession", () => {
  it("returns null without a verified session or for anonymous sessions", async () => {
    state.claims = null;
    expect(await load()).toBeNull();
    state.claims = { sub: "u1", is_anonymous: true };
    expect(await load()).toBeNull();
  });

  it("builds roles, permissions and active memberships from one profile query", async () => {
    state.profiles = [profile()];
    const s = await load();
    expect(s).toMatchObject({ userId: "u1", email: "a@example.com", fullName: "تركي", locale: "en", staffRoles: ["operations_admin"] });
    expect([...s!.permissions].sort()).toEqual(["quotes.manage", "shipping.manage"]);
    expect(s!.organizations).toEqual([{ id: "o1", role: "owner" }]);
    expect(state.calls.sort()).toEqual(["ap_profiles", "ap_roles_permissions"]);
  });

  it("drops permissions for a suspended account", async () => {
    state.profiles = [profile({ status: "suspended" })];
    const s = await load();
    expect(s!.status).toBe("suspended");
    expect(s!.permissions.size).toBe(0);
  });

  it("creates the profile on first sign-in, then reloads it", async () => {
    state.profiles = [{ data: null }, profile({ ap_staff_roles: [], ap_user_preferences: null })];
    const s = await load();
    expect(state.calls).toContain("ap_ensure_profile");
    expect(s).toMatchObject({ locale: "ar", staffRoles: [] });
    expect(s!.permissions.size).toBe(0);
  });
});
