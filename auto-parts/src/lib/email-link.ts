// يقرأ ما يضعه Supabase في جزء # من رابط البريد بعد التحقق (تدفق implicit).
export type EmailLinkHash =
  | { kind: "session"; accessToken: string; refreshToken: string; type: string | null }
  | { kind: "error" }
  | null;

export function parseEmailLinkHash(hash: string): EmailLinkHash {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  if (params.has("error") || params.has("error_code")) return { kind: "error" };
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return null;
  return { kind: "session", accessToken, refreshToken, type: params.get("type") };
}
