import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// scrypt من مكتبة Node المدمجة: N=16384، r=8، p=1، مفتاح 64 بايت
const N = 16384, R = 8, P = 1, LEN = 64;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((res, rej) => scrypt(password.normalize("NFKC"), salt, LEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const key = await derive(password, Buffer.from(parts[4], "base64"));
  const expected = Buffer.from(parts[5], "base64");
  return expected.length === key.length && timingSafeEqual(expected, key);
}

// هاش ثابت يُستخدم عند عدم وجود الحساب حتى لا يكشف زمن الاستجابة وجود البريد
export const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");
