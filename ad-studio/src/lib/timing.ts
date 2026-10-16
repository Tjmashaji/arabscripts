// بداية كل مشهد على الخط الزمني (بالملّي ثانية)
export function sceneStarts(durations: number[]): number[] {
  const out: number[] = [];
  let t = 0;
  for (const d of durations) {
    out.push(t);
    t += d;
  }
  return out;
}
