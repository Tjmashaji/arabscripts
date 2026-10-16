import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export type Probe = { width?: number; height?: number; durationMs?: number; hasAudio: boolean; hasVideo: boolean; codec?: string };

// قراءة الأبعاد والمدة فعليًا عبر ffprobe. فشل القراءة يعني أن الملف تالف أو غير مدعوم.
export async function probe(file: string): Promise<Probe> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], { timeout: 30_000 });
  const j = JSON.parse(stdout) as { format?: { duration?: string }; streams?: { codec_type: string; codec_name?: string; width?: number; height?: number; duration?: string; tags?: { rotate?: string }; side_data_list?: { rotation?: number }[] }[] };
  const v = j.streams?.find((s) => s.codec_type === "video");
  const a = j.streams?.find((s) => s.codec_type === "audio");
  const dur = Number(j.format?.duration ?? v?.duration ?? a?.duration);
  const rot = Math.abs(Number(v?.tags?.rotate ?? v?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0));
  const swap = rot === 90 || rot === 270;
  return {
    width: swap ? v?.height : v?.width,
    height: swap ? v?.width : v?.height,
    durationMs: Number.isFinite(dur) && dur > 0 ? Math.round(dur * 1000) : undefined,
    hasAudio: Boolean(a),
    hasVideo: Boolean(v),
    codec: v?.codec_name ?? a?.codec_name,
  };
}
