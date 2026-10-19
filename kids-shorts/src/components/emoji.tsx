import { EMOJI, emojiFile } from "@/lib/emoji";

// رسم من المكتبة بنفس صورة Twemoji المستخدمة في الفيديو
export function Emoji({ e, className, size = 40 }: { e: string; className?: string; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/emoji/${emojiFile(e)}.png`} alt={EMOJI[e] ?? ""} width={size} height={size} className={className} draggable={false} />;
}
