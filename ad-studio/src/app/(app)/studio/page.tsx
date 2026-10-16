"use client";
import { Mic2, Play, Plus, Star, Trash2, UserRound } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, ChoiceGroup, EmptyState, Field, Input, Modal, Notice, PageHeader, Select, Textarea } from "@/components/ui";
import { CHARACTER_TYPES, LANGUAGES, VOICE_TONES } from "@/lib/domain";
import { api, ApiError, useData } from "@/lib/client";

type Voice = { id: string; name: string; provider: string; provider_voice_id: string; dialect: keyof typeof LANGUAGES.label; gender: string; speed: string; tone: keyof typeof VOICE_TONES.label; is_favorite: boolean };
type Character = { id: string; name: string; type: keyof typeof CHARACTER_TYPES.label; presentation_style: string; appearance: string; wardrobe: string; voice_profile_id: string | null; rights_confirmed: boolean; is_favorite: boolean };
type Catalog = { provider: { id: string; label: string; mode: string } | null; voices: { id: string; name: string; gender: string; note?: string }[]; dialects: string[] };

export default function Studio() {
  const voices = useData<{ voices: Voice[] }>("/api/voices");
  const chars = useData<{ characters: Character[] }>("/api/characters");
  const catalog = useData<Catalog>("/api/voices/catalog");
  const [vEdit, setVEdit] = useState<Partial<Voice> | null>(null);
  const [cEdit, setCEdit] = useState<Partial<Character> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cat = catalog.data;

  async function saveVoice() {
    setBusy(true);
    setError(null);
    try {
      const v = vEdit!;
      await api(v.id ? `/api/voices/${v.id}` : "/api/voices", { method: v.id ? "PATCH" : "POST", body: { name: v.name, provider: cat?.provider?.id ?? v.provider, provider_voice_id: v.provider_voice_id, dialect: v.dialect ?? "ar_msa", gender: v.gender ?? "male", speed: Number(v.speed ?? 1), tone: v.tone ?? "calm", is_favorite: Boolean(v.is_favorite) } });
      setVEdit(null);
      await voices.reload();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveChar() {
    setBusy(true);
    setError(null);
    try {
      const c = cEdit!;
      await api(c.id ? `/api/characters/${c.id}` : "/api/characters", { method: c.id ? "PATCH" : "POST", body: { name: c.name, type: c.type ?? "narrator", presentation_style: c.presentation_style ?? "", appearance: c.appearance ?? "", wardrobe: c.wardrobe ?? "", voice_profile_id: c.voice_profile_id || null, rights_confirmed: Boolean(c.rights_confirmed), is_favorite: Boolean(c.is_favorite) } });
      setCEdit(null);
      await chars.reload();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }
  async function preview(id: string) {
    const res = await fetch("/api/voices/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ voice_id: id }) });
    if (!res.ok) return setError((await res.json()).error?.message ?? "تعذّرت المعاينة");
    const url = res.headers.get("content-type")?.startsWith("audio") ? URL.createObjectURL(await res.blob()) : (await res.json()).url;
    void new Audio(url).play();
  }

  return (
    <>
      <PageHeader title="استوديو الشخصيات والأصوات" subtitle="احفظ الراوي والأصوات المفضلة لتستخدمها في مشاريعك القادمة." />
      {error ? <div className="mb-4"><Notice tone="danger">{error}</Notice></div> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center gap-2 mb-4"><Mic2 className="size-5 text-accent" aria-hidden /><h2 className="font-display text-lg">الأصوات</h2>{cat?.provider ? <Badge tone={cat.provider.mode === "live" ? "ok" : "warn"}>{cat.provider.label}</Badge> : <Badge tone="danger">غير متصل</Badge>}<Button className="ms-auto h-9 text-sm" variant="secondary" disabled={!cat?.provider} onClick={() => setVEdit({ provider_voice_id: cat?.voices[0]?.id, dialect: "ar_sa", tone: "calm", speed: "1" })} icon={<Plus className="size-4" />}>صوت مفضل</Button></div>
          {!cat?.provider ? <Notice tone="warn">لا يوجد مزود صوت متصل. أضف ELEVENLABS_API_KEY في إعدادات الخادم.</Notice> : null}
          {cat?.provider ? (
            <details className="mb-4 rounded-xl border border-line p-3 text-sm">
              <summary className="font-bold cursor-pointer">الأصوات المتاحة لدى {cat.provider.label} ({cat.voices.length})</summary>
              <ul className="mt-3 grid gap-2 max-h-72 overflow-y-auto">
                {cat.voices.map((v) => <li key={v.id} className="flex items-center gap-2"><button onClick={() => preview(v.id)} className="grid size-8 place-items-center rounded-full bg-surface-2" aria-label={`معاينة ${v.name}`}><Play className="size-3.5" /></button><span>{v.name}</span><span className="text-xs text-muted">{v.note}</span></li>)}
              </ul>
            </details>
          ) : null}
          {!voices.data?.voices.length ? <EmptyState icon={<Mic2 className="size-6" />} title="لا أصوات محفوظة">اختر صوتًا من المتاح لدى المزود واحفظه بسرعته ونبرته المفضلة.</EmptyState> : (
            <ul className="flex flex-col divide-y divide-line">
              {voices.data.voices.map((v) => (
                <li key={v.id} className="py-3 flex items-center gap-3">
                  {v.is_favorite ? <Star className="size-4 text-amber fill-amber" aria-label="مفضل" /> : null}
                  <div className="flex-1"><p className="font-bold text-sm">{v.name}</p><p className="text-xs text-muted">{LANGUAGES.label[v.dialect]} · {VOICE_TONES.label[v.tone]} · {Number(v.speed).toFixed(2)}×</p></div>
                  <Button variant="ghost" className="h-8 px-2" onClick={() => preview(v.provider_voice_id)} aria-label="معاينة"><Play className="size-4" /></Button>
                  <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => setVEdit(v)}>تعديل</Button>
                  <Button variant="ghost" className="h-8 px-2 text-danger" onClick={async () => { await api(`/api/voices/${v.id}`, { method: "DELETE" }); void voices.reload(); }} aria-label="حذف"><Trash2 className="size-4" /></Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-4"><UserRound className="size-5 text-accent" aria-hidden /><h2 className="font-display text-lg">الشخصيات</h2><Button className="ms-auto h-9 text-sm" variant="secondary" onClick={() => setCEdit({ type: "narrator" })} icon={<Plus className="size-4" />}>شخصية</Button></div>
          <Notice tone="info">ظهور الشخصية في الفيديو يعتمد على قدرات مزود الفيديو. لا نَعِد بتحريك الشفاه أو مزامنة الكلام ما لم تدعمه الخدمة المتصلة.</Notice>
          {!chars.data?.characters.length ? <div className="mt-4"><EmptyState icon={<UserRound className="size-6" />} title="لا شخصيات محفوظة">احفظ وصف الراوي أو المقدم ليحافظ المخرج على نفس الشكل والملابس بين المشاهد.</EmptyState></div> : (
            <ul className="mt-4 flex flex-col divide-y divide-line">
              {chars.data.characters.map((c) => (
                <li key={c.id} className="py-3 flex items-center gap-3">
                  <div className="flex-1"><p className="font-bold text-sm">{c.name} {c.is_favorite ? <Star className="inline size-3.5 text-amber fill-amber" aria-label="مفضلة" /> : null}</p><p className="text-xs text-muted">{CHARACTER_TYPES.label[c.type]}{c.appearance ? ` · ${c.appearance.slice(0, 60)}` : ""}</p></div>
                  <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => setCEdit(c)}>تعديل</Button>
                  <Button variant="ghost" className="h-8 px-2 text-danger" onClick={async () => { await api(`/api/characters/${c.id}`, { method: "DELETE" }); void chars.reload(); }} aria-label="حذف"><Trash2 className="size-4" /></Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal open={Boolean(vEdit)} onClose={() => setVEdit(null)} title="صوت مفضل" footer={<><Button variant="secondary" onClick={() => setVEdit(null)}>إلغاء</Button><Button onClick={saveVoice} loading={busy} disabled={!vEdit?.name?.trim() || !vEdit?.provider_voice_id}>حفظ</Button></>}>
        {vEdit ? (
          <div className="grid gap-4">
            <Field label="اسم داخلي" htmlFor="vn"><Input id="vn" value={vEdit.name ?? ""} onChange={(e) => setVEdit({ ...vEdit, name: e.target.value })} placeholder="مثال: راوي المطعم" /></Field>
            <Field label="الصوت لدى المزود" htmlFor="vp"><Select id="vp" value={vEdit.provider_voice_id ?? ""} onChange={(e) => setVEdit({ ...vEdit, provider_voice_id: e.target.value })} options={(cat?.voices ?? []).map((v) => ({ value: v.id, label: v.name }))} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="اللهجة المقصودة" htmlFor="vd" hint="للتوثيق؛ الناتج يعتمد على الصوت نفسه"><Select id="vd" value={vEdit.dialect ?? "ar_msa"} onChange={(e) => setVEdit({ ...vEdit, dialect: e.target.value as Voice["dialect"] })} options={LANGUAGES.list.filter((l) => !cat || cat.dialects.includes(l.value))} /></Field>
              <Field label="الجنس" htmlFor="vg"><Select id="vg" value={vEdit.gender ?? "male"} onChange={(e) => setVEdit({ ...vEdit, gender: e.target.value })} options={[{ value: "male", label: "رجالي" }, { value: "female", label: "نسائي" }]} /></Field>
              <Field label={`السرعة ${Number(vEdit.speed ?? 1).toFixed(2)}×`} htmlFor="vs"><input id="vs" type="range" min={0.7} max={1.3} step={0.05} value={Number(vEdit.speed ?? 1)} onChange={(e) => setVEdit({ ...vEdit, speed: e.target.value })} /></Field>
              <Field label="النبرة" htmlFor="vt"><Select id="vt" value={vEdit.tone ?? "calm"} onChange={(e) => setVEdit({ ...vEdit, tone: e.target.value as Voice["tone"] })} options={VOICE_TONES.list} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(vEdit.is_favorite)} onChange={(e) => setVEdit({ ...vEdit, is_favorite: e.target.checked })} /> مفضل للمشاريع القادمة</label>
          </div>
        ) : null}
      </Modal>

      <Modal open={Boolean(cEdit)} onClose={() => setCEdit(null)} title="شخصية" footer={<><Button variant="secondary" onClick={() => setCEdit(null)}>إلغاء</Button><Button onClick={saveChar} loading={busy} disabled={!cEdit?.name?.trim()}>حفظ</Button></>}>
        {cEdit ? (
          <div className="grid gap-4">
            <Field label="الاسم" htmlFor="cn"><Input id="cn" value={cEdit.name ?? ""} onChange={(e) => setCEdit({ ...cEdit, name: e.target.value })} /></Field>
            <ChoiceGroup label="النوع" value={cEdit.type ?? "narrator"} onChange={(v) => setCEdit({ ...cEdit, type: v })} options={CHARACTER_TYPES.list} columns={2} />
            <Field label="أسلوب التقديم" htmlFor="cs"><Input id="cs" value={cEdit.presentation_style ?? ""} onChange={(e) => setCEdit({ ...cEdit, presentation_style: e.target.value })} placeholder="ودود، سريع، فاخر…" /></Field>
            <Field label="الشكل والسمات" htmlFor="ca" hint="وصف ثابت يُرسل مع كل مشهد للحفاظ على الاستمرارية"><Textarea id="ca" value={cEdit.appearance ?? ""} onChange={(e) => setCEdit({ ...cEdit, appearance: e.target.value })} /></Field>
            <Field label="الملابس" htmlFor="cw"><Input id="cw" value={cEdit.wardrobe ?? ""} onChange={(e) => setCEdit({ ...cEdit, wardrobe: e.target.value })} /></Field>
            <Field label="الصوت" htmlFor="cv"><Select id="cv" value={cEdit.voice_profile_id ?? ""} onChange={(e) => setCEdit({ ...cEdit, voice_profile_id: e.target.value || null })} options={[{ value: "", label: "— بدون —" }, ...(voices.data?.voices ?? []).map((v) => ({ value: v.id, label: v.name }))]} /></Field>
            {cEdit.type === "ai_human" ? <label className="flex items-start gap-2 text-sm rounded-xl bg-amber-soft p-3"><input type="checkbox" className="mt-1" checked={Boolean(cEdit.rights_confirmed)} onChange={(e) => setCEdit({ ...cEdit, rights_confirmed: e.target.checked })} /> أؤكد أن لدي حق استخدام هذه الشخصية، وموافقة أي شخص حقيقي تُستخدم ملامحه أو صوته مرجعًا.</label> : null}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(cEdit.is_favorite)} onChange={(e) => setCEdit({ ...cEdit, is_favorite: e.target.checked })} /> مفضلة</label>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
