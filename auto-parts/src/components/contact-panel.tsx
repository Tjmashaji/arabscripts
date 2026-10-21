import { getTranslations } from "next-intl/server";
import { Badge, Card } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requeueContact } from "@/server/contact-actions";
import type { ContactKind, ContactOutcome, ContactStatus } from "@/lib/contact";

export type ContactJobRow = {
  id: string; kind: ContactKind; status: ContactStatus; attempts: number; outcome: ContactOutcome | null;
  summary: string | null; last_error: string | null; created_at: string; updated_at: string;
};
export const CONTACT_SELECT = "id, kind, status, attempts, outcome, summary, last_error, created_at, updated_at";

const tone = (j: ContactJobRow) =>
  j.outcome === "confirmed" ? "success" : j.outcome === "declined" || j.status === "failed" ? "danger"
    : j.status === "queued" || j.status === "calling" ? "info" : "neutral";

// مكالمات المساعد الآلي لطلب تسعير أو طلب شراء، مع زر إعادة الاتصال. يظهر في صفحات الإدارة فقط.
export async function ContactPanel({ jobs, locale, back }: { jobs: ContactJobRow[]; locale: string; back: string }) {
  const t = await getTranslations("contact");
  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
  return (
    <Card id="contact" className="flex flex-col gap-3">
      <h2 className="font-bold">{t("title")}</h2>
      {jobs.length === 0 ? (
        <p className="text-sm text-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {jobs.map((j) => (
            <li key={j.id} className="flex flex-col gap-1 rounded-lg border border-line p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{t(`kind_${j.kind}`)}</span>
                <Badge tone={tone(j)}>{t(`status_${j.status}`)}</Badge>
                {j.outcome && <Badge tone={tone(j)}>{t(`outcome_${j.outcome}`)}</Badge>}
                <span className="text-xs text-muted">{dateFmt.format(new Date(j.updated_at))} · {t("attempts", { count: j.attempts })}</span>
              </div>
              {j.summary && <p>{j.summary}</p>}
              {j.last_error && j.status !== "answered" && <p className="text-xs text-muted ltr-value">{j.last_error}</p>}
              {!["queued", "calling"].includes(j.status) && (
                <form action={requeueContact}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="jobId" value={j.id} />
                  <input type="hidden" name="back" value={back} />
                  <SubmitButton variant="secondary">{t("requeue")}</SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">{t("note")}</p>
    </Card>
  );
}
