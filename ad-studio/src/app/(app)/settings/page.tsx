"use client";
import { useState } from "react";
import { Badge, Button, Card, Field, Input, Notice, PageHeader } from "@/components/ui";
import { api, ApiError, useData } from "@/lib/client";

type Caps = { capabilities: { capability: string; label: string; state: "live" | "simulation" | "unavailable"; provider: string; setup?: string }[]; simulation_allowed: boolean };
type Usage = { workspace: { name: string; monthly_spend_cap_cents: number; plan_code: string; role: string } };
const STATE = { live: { tone: "ok", label: "متصل" }, simulation: { tone: "warn", label: "محاكاة" }, unavailable: { tone: "danger", label: "غير متصل" } } as const;

export default function Settings() {
  const usage = useData<Usage>("/api/usage");
  if (!usage.data) return null;
  return <SettingsForm usage={usage.data} />;
}

function SettingsForm({ usage: u }: { usage: Usage }) {
  const caps = useData<Caps>("/api/settings/providers");
  const usage = { data: u };
  const [ws, setWs] = useState({ name: u.workspace.name, cap: String(u.workspace.monthly_spend_cap_cents / 100) });
  const [acc, setAcc] = useState({ name: "", current_password: "", new_password: "" });
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: "ok", text: ok });
    } catch (e) {
      setMsg({ tone: "danger", text: (e as ApiError).message });
    } finally {
      setBusy(null);
    }
  }
  const owner = usage.data?.workspace.role === "owner";
  return (
    <>
      <PageHeader title="الإعدادات" subtitle="الحساب، مساحة العمل، حدود الإنفاق، وحالة خدمات الذكاء الاصطناعي." />
      {msg ? <div className="mb-4"><Notice tone={msg.tone}>{msg.text}</Notice></div> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-display text-lg mb-4">الحساب</h2>
          <div className="grid gap-4">
            <Field label="الاسم" htmlFor="an"><Input id="an" value={acc.name} onChange={(e) => setAcc({ ...acc, name: e.target.value })} placeholder="اسمك" /></Field>
            <Field label="كلمة المرور الحالية" htmlFor="cp"><Input id="cp" type="password" className="ltr" value={acc.current_password} onChange={(e) => setAcc({ ...acc, current_password: e.target.value })} autoComplete="current-password" /></Field>
            <Field label="كلمة مرور جديدة (اختياري)" htmlFor="np" hint="10 أحرف على الأقل"><Input id="np" type="password" className="ltr" value={acc.new_password} onChange={(e) => setAcc({ ...acc, new_password: e.target.value })} autoComplete="new-password" /></Field>
            <Button className="justify-self-end" loading={busy === "acc"} disabled={!acc.name.trim()} onClick={() => run("acc", () => api("/api/settings/account", { method: "PATCH", body: { name: acc.name, current_password: acc.current_password || undefined, new_password: acc.new_password || undefined } }), "حُفظ الحساب.")}>حفظ</Button>
          </div>
        </Card>
        <Card>
          <h2 className="font-display text-lg mb-4">مساحة العمل والإنفاق</h2>
          <div className="grid gap-4">
            <Field label="اسم المساحة" htmlFor="wn"><Input id="wn" value={ws.name} disabled={!owner} onChange={(e) => setWs({ ...ws, name: e.target.value })} /></Field>
            <Field label="سقف الإنفاق الشهري على خدمات الذكاء الاصطناعي (دولار)" htmlFor="cap" hint="أي مهمة مدفوعة تتجاوز السقف تُرفض قبل إرسالها للمزود."><Input id="cap" type="number" min={0} step={1} className="ltr text-end" disabled={!owner} value={ws.cap} onChange={(e) => setWs({ ...ws, cap: e.target.value })} /></Field>
            <Button className="justify-self-end" loading={busy === "ws"} disabled={!owner} onClick={() => run("ws", () => api("/api/settings/workspace", { method: "PATCH", body: { name: ws.name, monthly_spend_cap_cents: Math.round(Number(ws.cap) * 100) } }), "حُفظت المساحة.")}>حفظ</Button>
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <h2 id="providers" className="font-display text-lg mb-1">خدمات الذكاء الاصطناعي</h2>
          <p className="text-sm text-ink-2 mb-4">تُفعَّل الخدمات الحقيقية بإضافة مفاتيحها في متغيرات بيئة الخادم (وليس من المتصفح). التفاصيل في ملف AI_PROVIDERS.md.</p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(caps.data?.capabilities ?? []).map((c) => (
              <li key={c.capability} className="rounded-2xl border border-line p-4">
                <div className="flex items-center justify-between gap-2"><span className="font-bold text-sm">{c.label}</span><Badge tone={STATE[c.state].tone}>{STATE[c.state].label}</Badge></div>
                <p className="text-xs text-muted mt-1 ltr text-start">{c.provider}</p>
                {c.setup ? <p className="text-xs text-ink-2 mt-2">{c.setup}</p> : null}
              </li>
            ))}
          </ul>
          {caps.data && !caps.data.simulation_allowed ? <p className="text-xs text-muted mt-3">وضع المحاكاة معطّل في هذه البيئة.</p> : null}
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="font-display text-lg mb-1">الخطة والفوترة</h2>
          <p className="text-sm text-ink-2 mb-3">خطتك الحالية: <Badge>{usage.data?.workspace.plan_code === "free" ? "المجانية" : usage.data?.workspace.plan_code}</Badge></p>
          <Notice tone="info" title="الدفع غير مفعّل بعد">البنية جاهزة للاشتراكات وشراء الرصيد (الخطط، الاشتراكات، سجل الاستخدام)، لكن لم تُربط بوابة دفع. لن تُعرض أي عملية دفع أو خصم حتى يتم ذلك فعليًا. تكلفة الخدمات تُحتسب حاليًا على حسابات المزودين الخاصة بمشغّل المنصة، وتظهر في «المهام والتكلفة».</Notice>
        </Card>
      </div>
    </>
  );
}
