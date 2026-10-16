// واجهة التخزين: التنفيذ الحالي محلي على القرص. لإضافة S3 أو Supabase Storage
// نفّذ نفس الواجهة (انظر ARCHITECTURE.md). FFmpeg يحتاج مسارًا محليًا، لذلك localPath
// في المحولات السحابية تنزّل الملف إلى مجلد مؤقت.
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export interface StorageAdapter {
  put(key: string, body: Readable, maxBytes: number): Promise<{ size: number; sha256: string; head: Buffer }>;
  read(key: string, range?: { start: number; end: number }): Readable;
  size(key: string): Promise<number>;
  localPath(key: string): Promise<string>;
  remove(key: string): Promise<void>;
}

export class TooLargeError extends Error {}

export class LocalStorage implements StorageAdapter {
  constructor(private root: string) {}

  private resolve(key: string) {
    // يمنع الخروج من مجلد التخزين عبر ../
    const p = path.resolve(this.root, key);
    if (!p.startsWith(path.resolve(this.root) + path.sep)) throw new Error("مفتاح تخزين غير صالح");
    return p;
  }

  async put(key: string, body: Readable, maxBytes: number) {
    const dest = this.resolve(key);
    await mkdir(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.${randomUUID()}.part`;
    const hash = createHash("sha256");
    let size = 0;
    const chunks: Buffer[] = [];
    let headLen = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        size += chunk.length;
        if (size > maxBytes) return cb(new TooLargeError());
        hash.update(chunk);
        if (headLen < 64) {
          chunks.push(chunk.subarray(0, 64 - headLen));
          headLen += Math.min(chunk.length, 64 - headLen);
        }
        cb(null, chunk);
      },
    });
    try {
      await pipeline(body, meter, createWriteStream(tmp));
      await rename(tmp, dest);
    } catch (e) {
      await rm(tmp, { force: true });
      throw e;
    }
    return { size, sha256: hash.digest("hex"), head: Buffer.concat(chunks) };
  }

  read(key: string, range?: { start: number; end: number }) {
    return createReadStream(this.resolve(key), range);
  }

  async size(key: string) {
    return (await stat(this.resolve(key))).size;
  }

  async localPath(key: string) {
    return this.resolve(key);
  }

  async remove(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}

let instance: StorageAdapter | undefined;
export function storage(): StorageAdapter {
  instance ??= new LocalStorage(path.resolve(process.env.STORAGE_DIR ?? "./storage"));
  return instance;
}

export const newKey = (workspaceId: string, projectId: string | null, ext: string) =>
  `${workspaceId}/${projectId ?? "shared"}/${randomUUID()}.${ext}`;
