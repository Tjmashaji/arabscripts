"use client";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/client";
import { AGES, CATEGORIES, CATEGORY_IDS, MUSIC, VOICE_MODES, type Age, type Category, type Music, type VoiceMode } from "@/lib/domain";
import { subjectsFor } from "@/lib/lessons";
import { Emoji } from "./emoji";
import { Button, Card, ChoiceGroup, cx, Field, Input, Notice, Select } from "./ui";

type Services = { youtube: boolean; claude: boolean; voice: boolean };

export function NewWizard({ services }: { services: Services }) {
  const router = useRouter();
  const [category, setCategory] = useState<Category>("letters");
  const [subject, setSubject] = useState(subjectsFor("letters")[1].value);
  const [age, setAge] = useState<Age>("3-5");
  const [voiceMode, setVoiceMode] = useState<VoiceMode>(services.voice ? "ai" : "recorded");
  const [music, setMusic] = useState<Music>("happy");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subjects = subjectsFor(category);

  function pick(c: Category) {
    setCategory(c);
    setSubject(subjectsFor(c)[0]?.value ?? "");
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const { id } = await api<{ id: string }>("/api/projects", { body: { category, subject, age, voiceMode, music } });
      router.push(`/projects/${id}`);
    } catch (e) {
      setError((e as ApiError).message);
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 max-w-4xl">
      <Card>
        <h2 className="font-display text-lg mb-4">١. ماذا نتعلم اليوم؟</h2>
        <div role="radiogroup" aria-label="المجال" className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {CATEGORY_IDS.map((c) => {
            const on = c === category;
            return (
              <button key={c} type="button" role="radio" aria-checked={on} onClick={() => pick(c)} className={cx("rounded-2xl border p-3 text-center transition", on ? "border-accent bg-accent-soft ring-2 ring-accent" : "border-line bg-surface hover:border-ink-2")}>
                <Emoji e={CATEGORIES[c].icon} size={36} className="mx-auto" />
                <span className="block font-bold text-sm mt-1.5">{CATEGORIES[c].label}</span>
                <span className="block text-[11px] text-muted leading-4 mt-0.5">{CATEGORIES[c].hint}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-5">
          {category === "custom" ? (
            <Field label="الموضوع" htmlFor="subject" hint={services.claude ? "مثال: لماذا نشرب الماء؟ أو فصول السنة الأربعة" : "المخرج الذكي غير متصل، فستبدأ بثلاثة مشاهد فارغة تكتبها بنفسك."}>
              <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="اكتب موضوع الدرس" />
            </Field>
          ) : (
            <Field label="الموضوع" htmlFor="subject">
              <Select id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} options={subjects} />
            </Field>
          )}
        </div>
      </Card>
      <Card>
        <h2 className="font-display text-lg mb-4">٢. لمن المقطع، وكيف يبدو؟</h2>
        <div className="grid gap-5">
          <ChoiceGroup label="عمر الطفل" value={age} onChange={setAge} columns={2} options={(Object.keys(AGES) as Age[]).map((a) => ({ value: a, label: AGES[a], hint: a === "3-5" ? "جمل أقصر ومشاهد أقل" : "كلمات أكثر وسؤال تفاعلي" }))} />
          <ChoiceGroup
            label="التعليق الصوتي"
            value={voiceMode}
            onChange={setVoiceMode}
            options={(Object.keys(VOICE_MODES) as VoiceMode[]).map((v) => ({
              value: v,
              label: VOICE_MODES[v],
              hint: v === "ai" ? (services.voice ? "يُولَّد لكل مشهد بضغطة" : "غير متصل على الخادم") : v === "recorded" ? "من الميكروفون مباشرة في المتصفح" : "مناسب للأغاني والعدّ الصامت",
            }))}
          />
          <ChoiceGroup label="الموسيقى" value={music} onChange={setMusic} options={(Object.keys(MUSIC) as Music[]).map((m) => ({ value: m, label: MUSIC[m], hint: m === "none" ? undefined : "لحن مولّد خالٍ من الحقوق" }))} />
        </div>
      </Card>
      {voiceMode === "ai" && !services.voice ? <Notice tone="warn">الصوت الذكي غير متصل على الخادم. اختر التسجيل بصوتك أو بدون تعليق.</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div>
        <Button onClick={create} loading={busy} disabled={!subject.trim() || (voiceMode === "ai" && !services.voice)} className="h-12 px-6">
          أنشئ المقطع <ArrowLeft className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
