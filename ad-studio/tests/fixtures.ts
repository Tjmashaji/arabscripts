// ملفات وسائط حقيقية مولّدة بـ FFmpeg للاختبار (بلا اعتماد على قاعدة البيانات)
import { execFileSync } from "node:child_process";
import { createReadStream, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const FIX = path.join(os.tmpdir(), "ad-studio-fixtures");
export function fixture(name: "clip.mp4" | "clip2.mp4" | "photo.jpg" | "photo.png" | "voice.mp3" | "music.mp3" | "logo.png" | "fake.txt") {
  mkdirSync(FIX, { recursive: true });
  const out = path.join(FIX, name);
  const ff = (...a: string[]) => execFileSync("ffmpeg", ["-v", "error", "-y", ...a, out]);
  switch (name) {
    case "clip.mp4": ff("-f", "lavfi", "-i", "testsrc2=s=1280x720:r=24:d=6", "-f", "lavfi", "-i", "sine=f=330:d=6", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac"); break;
    case "clip2.mp4": ff("-f", "lavfi", "-i", "smptebars=s=720x1280:r=30:d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p"); break;
    case "photo.jpg": ff("-f", "lavfi", "-i", "gradients=s=1600x1200:d=1", "-frames:v", "1"); break;
    case "photo.png": ff("-f", "lavfi", "-i", "mandelbrot=s=800x800", "-frames:v", "1"); break;
    case "voice.mp3": ff("-f", "lavfi", "-i", "sine=f=200:d=3", "-c:a", "libmp3lame"); break;
    case "music.mp3": ff("-f", "lavfi", "-i", "sine=f=500:d=8", "-c:a", "libmp3lame"); break;
    case "logo.png": ff("-f", "lavfi", "-i", "color=c=orange:s=256x256:d=1", "-frames:v", "1"); break;
    case "fake.txt": execFileSync("sh", ["-c", `echo '<html><script>alert(1)</script></html>' > ${out}`]); break;
  }
  return { path: out, stream: () => createReadStream(out) };
}
