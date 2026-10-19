// موسيقى خلفية مولّدة برمجيًا (بلا ملفات خارجية ولا حقوق طرف ثالث): لحن خماسي بسيط مع غلاف ناعم لكل نغمة.
import { writeFile } from "node:fs/promises";

const RATE = 44100;
// السلم الخماسي (دو كبير) بالهرتز
const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
const MELODIES = {
  calm: { bpm: 84, notes: [0, 2, 4, 2, 3, 2, 1, -1, 0, 2, 4, 5, 4, 2, 1, -1], bass: [0, 0, 3, 3] },
  happy: { bpm: 126, notes: [4, 5, 4, 2, 3, 4, 2, -1, 0, 2, 4, 5, 7, 5, 4, -1], bass: [0, 3, 4, 3] },
};

export function synthMusic(kind: keyof typeof MELODIES, seconds: number) {
  const m = MELODIES[kind];
  const beat = 60 / m.bpm;
  const n = Math.ceil(seconds * RATE);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const step = Math.floor(t / beat);
    const local = t - step * beat;
    let v = 0;
    const note = m.notes[step % m.notes.length];
    if (note >= 0) {
      const f = SCALE[note];
      // هجوم سريع ثم اضمحلال، مع توافقية خفيفة لصوت يشبه الماريمبا
      const env = Math.min(1, local / 0.01) * Math.exp(-local * 5);
      v += env * (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t));
    }
    const barLen = beat * 4;
    const bar = Math.floor(t / barLen);
    const bl = t - bar * barLen;
    const bf = SCALE[m.bass[bar % m.bass.length]] / 2;
    v += 0.35 * Math.exp(-bl * 1.2) * Math.sin(2 * Math.PI * bf * t);
    pcm[i] = Math.max(-1, Math.min(1, v * 0.35)) * 32767;
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.byteLength, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.byteLength, 40);
  return Buffer.concat([header, Buffer.from(pcm.buffer)]);
}

export async function writeMusic(file: string, kind: keyof typeof MELODIES, seconds: number) {
  await writeFile(file, synthMusic(kind, seconds));
}
