"use client";
import { useMemo, useState } from "react";
import { EMOJI, EMOJI_LIST } from "@/lib/emoji";
import { Emoji } from "./emoji";
import { Input, Modal } from "./ui";

export function EmojiPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (e: string) => void }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => (q.trim() ? EMOJI_LIST.filter((e) => EMOJI[e].includes(q.trim())) : EMOJI_LIST), [q]);
  return (
    <Modal open={open} onClose={onClose} title="اختر رسمًا" wide>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث: قطة، تفاحة، نجمة…" aria-label="بحث في الرسوم" className="mb-4" />
      <div className="grid grid-cols-5 sm:grid-cols-8 lg:grid-cols-10 gap-2">
        {list.map((e) => (
          <button key={e} type="button" onClick={() => { onPick(e); onClose(); }} className="rounded-xl border border-line p-2 hover:border-accent hover:bg-accent-soft flex flex-col items-center gap-1" title={EMOJI[e]}>
            <Emoji e={e} size={40} />
            <span className="text-[10px] text-muted leading-3 truncate max-w-full">{EMOJI[e]}</span>
          </button>
        ))}
        {!list.length ? <p className="col-span-full text-sm text-muted py-6 text-center">لا يوجد رسم بهذا الاسم.</p> : null}
      </div>
    </Modal>
  );
}
