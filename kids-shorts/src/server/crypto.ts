import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "./env";

// تشفير رمز التحديث من Google قبل حفظه: AES-256-GCM بمتجه عشوائي لكل قيمة
export function encrypt(plain: string) {
  const key = Buffer.from(env().TOKEN_ENCRYPTION_KEY, "hex");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

export function decrypt(stored: string) {
  const [v, iv, tag, data] = stored.split(".");
  if (v !== "v1") throw new Error("صيغة رمز مشفر غير معروفة");
  const key = Buffer.from(env().TOKEN_ENCRYPTION_KEY, "hex");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}
