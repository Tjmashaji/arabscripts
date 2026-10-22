import "server-only";
import { anonymous } from "./db";

export type PublicVerification = { name: string; domain: string | null; verified: boolean; verified_at: Date | null; legal_name: string | null; active: boolean };

export async function publicVerification(publicId: string): Promise<PublicVerification | null> {
  if (!/^[0-9a-f]{18}$/.test(publicId)) return null;
  return (await anonymous((tx) => tx.one<PublicVerification>("SELECT * FROM trends.public_verification($1)", [publicId]))) ?? null;
}
