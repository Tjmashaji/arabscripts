import type { SceneInput } from "@/lib/domain";
import { Emoji } from "./emoji";

// معاينة تقريبية للمشهد بمقاس الشورتس 9:16 (التخطيط نفسه في محرك التصدير)
export function ScenePreview({ scene, index, total }: { scene: SceneInput; index: number; total: number }) {
  const n = scene.emoji.length;
  const size = n === 1 ? 46 : n === 2 ? 33 : n === 3 ? 25 : n === 4 ? 29 : 23;
  const hero = !n && scene.text.trim();
  const len = [...scene.text.replace(/\s/g, "")].length;
  return (
    <div className="relative mx-auto w-full max-w-[220px] lg:max-w-[280px] aspect-[9/16] rounded-[28px] border-[6px] border-ink overflow-hidden shadow-lg" style={{ background: `linear-gradient(${scene.bg}e0, ${scene.bg})` }}>
      {scene.text.trim() && n ? <p className="absolute top-[10%] inset-x-3 text-center font-display text-white leading-tight [text-shadow:0_2px_0_#2B1E4A,0_0_6px_#2B1E4A]" style={{ fontSize: 26 }}>{scene.text}</p> : null}
      {n ? (
        <div className="absolute inset-x-0 top-[47%] -translate-y-1/2 flex flex-wrap justify-center gap-[3%] px-[4%]">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 aspect-square w-[95%] rounded-full bg-white/20" />
          {scene.emoji.map((e, i) => (
            <div key={i} className="relative bob" style={{ width: `${size}%`, animationDelay: `${i * 0.2}s`, flexBasis: n === 4 ? "40%" : undefined }}>
              <Emoji e={e} size={120} className="w-full h-auto" />
            </div>
          ))}
        </div>
      ) : null}
      {hero ? <p className="absolute inset-x-2 top-[45%] -translate-y-1/2 text-center font-display text-white [text-shadow:0_4px_0_#2B1E4A,0_0_8px_#2B1E4A] leading-none" style={{ fontSize: len <= 2 ? 150 : len <= 5 ? 72 : len <= 10 ? 46 : 32 }}>{scene.text}</p> : null}
      {scene.narration.trim() ? <p className="absolute bottom-[19%] inset-x-4 text-center"><span className="inline bg-black/45 text-white text-[12px] leading-6 px-1.5 py-0.5 [box-decoration-break:clone]">{scene.narration}</span></p> : null}
      <span className="absolute top-2 end-3 text-[10px] font-bold text-white/80">{index + 1}/{total}</span>
    </div>
  );
}
