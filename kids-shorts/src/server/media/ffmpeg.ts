import { spawn } from "node:child_process";
import path from "node:path";

export const FONTS_DIR = path.resolve(process.cwd(), "assets", "fonts");

// تشغيل ffmpeg مع مهلة وإرجاع آخر سطور الخطأ عند الفشل
export function ffmpeg(args: string[], opts: { timeoutMs?: number; onProgress?: (seconds: number) => void } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-hide_banner", "-nostdin", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let tail = "";
    const timer = setTimeout(() => p.kill("SIGKILL"), opts.timeoutMs ?? 15 * 60_000);
    p.stderr.on("data", (d: Buffer) => {
      const s = d.toString();
      tail = (tail + s).slice(-4000);
      const m = /time=(\d+):(\d+):(\d+\.\d+)/.exec(s);
      if (m && opts.onProgress) opts.onProgress(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
    });
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg فشل (رمز ${code}): ${tail.split("\n").slice(-6).join("\n")}`));
    });
  });
}

// تهريب المسار لاستخدامه داخل مخطط المرشحات (filtergraph)
export const filterPath = (p: string) => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
