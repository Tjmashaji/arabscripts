import { describe, expect, it } from "vitest";
import { buildAss } from "@/server/media/ass";
import { splitSubtitle } from "@/server/media/render";
import { sniff } from "@/server/media/sniff";
import { fitDurations, repairDirectorOutput } from "@/server/providers/repair";
import { distributeScript, SimulationDirector } from "@/server/providers/simulation/director";
import { ProviderError } from "@/server/providers/types";
import { renderTemplate, SYSTEM_TEMPLATES } from "@/server/templates/system";
import { projectSettings, sceneUpdate } from "@/lib/domain";
import { sceneStarts } from "@/lib/timing";

describe("ضبط المدد", () => {
  it("يحافظ على مجموع المدة المطلوبة بالضبط", () => {
    for (const total of [15, 30, 60, 37]) {
      const d = fitDurations([3, 7, 2, 9, 4], total);
      expect(Math.round(d.reduce((a, b) => a + b, 0) * 10) / 10).toBe(total);
      expect(d.every((x) => x >= 0.5)).toBe(true);
    }
  });
  it("يتعامل مع مدد غير صالحة من النموذج", () => {
    const d = fitDurations([Number.NaN, -1, 5], 30);
    expect(Math.round(d.reduce((a, b) => a + b, 0))).toBe(30);
  });
  it("يحسب بدايات المشاهد", () => {
    expect(sceneStarts([4000, 5000, 7000])).toEqual([0, 4000, 9000]);
  });
});

describe("توزيع السيناريو على المشاهد", () => {
  it("يوزّع الجمل بالترتيب ولا يفقد أي جملة", () => {
    const s = ["أ ب ج", "د ه", "و ز ح ط", "ي ك"];
    const out = distributeScript(s, [4, 5, 7, 8, 6]);
    expect(out).toHaveLength(5);
    expect(out.join(" ").split(" ").filter(Boolean)).toEqual(s.join(" ").split(" "));
  });
});

describe("القوالب", () => {
  it("يحذف السطر الذي يعتمد على حقل فارغ بدل اختراع قيمة", () => {
    const t = SYSTEM_TEMPLATES.find((x) => x.slug === "restaurant-trendy-30")!;
    const r = renderTemplate(t.base_prompt, { name: "مطعم الجمر", description: "مشويات", city: "", offer: "" });
    expect(r.text).toContain("مطعم الجمر");
    expect(r.text).not.toMatch(/\{\{|offer|Located in/);
    expect(r.missing).toEqual(expect.arrayContaining(["offer", "city"]));
  });
  it("قوالب النظام السبعة موجودة بخطط مشاهد صالحة", () => {
    expect(SYSTEM_TEMPLATES).toHaveLength(7);
    for (const t of SYSTEM_TEMPLATES) expect(t.scene_plan.length).toBeGreaterThan(1);
  });
});

describe("المخرج الإبداعي", () => {
  it("يصحح المخرجات ويحذف مراجع الملفات غير الموجودة", () => {
    const out = repairDirectorOutput(
      { campaign_name: "x", core_idea: "y", marketing_message: "z", hook: "h", cta: "c", scenes: [{ title: "1", duration_s: 10, visual_prompt: "a", transition: "warp", reference_asset_ids: ["11111111-1111-4111-8111-111111111111", "not-a-file"] }, { title: "2", duration_s: 10, visual_prompt: "b" }] },
      30,
      new Set(["11111111-1111-4111-8111-111111111111"]),
    );
    expect(out.scenes.reduce((a, s) => a + s.duration_s, 0)).toBe(30);
    expect(out.scenes[0].transition).toBe("cut");
    expect(out.scenes[0].reference_asset_ids).toEqual(["11111111-1111-4111-8111-111111111111"]);
  });
  it("يرفض مخرجات بلا مشاهد كخطأ قابل لإعادة المحاولة", () => {
    try {
      repairDirectorOutput({ campaign_name: "x", scenes: [] }, 30, new Set());
      throw new Error("لم يُرفض");
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderError);
      expect((e as ProviderError).retryable).toBe(true);
    }
  });
  it("المحاكاة لا تضيف عروضًا أو أسعارًا غير موجودة", async () => {
    const r = await new SimulationDirector().direct({
      business: { name: "متجر", business_type: "fashion", description: "", audience: "", city: "", differentiator: "", offer: "", contact: "" },
      settings: projectSettings.parse({ duration_s: 15 }),
      assets: [],
    });
    const all = JSON.stringify(r.output);
    expect(all).not.toMatch(/خصم|ريال|عرض خاص|%/);
    expect(r.output.scenes.reduce((a, s) => a + s.duration_s, 0)).toBe(15);
  });
});

describe("التحديث الجزئي للمشهد", () => {
  it("لا يضيف قيمًا افتراضية تمسح الحقول غير المرسلة", () => {
    const p = sceneUpdate.parse({ transition: "fade", version: 3 });
    expect(p).toEqual({ transition: "fade", version: 3 });
  });
});

describe("تحديد نوع الملف من محتواه", () => {
  it("يتعرف على الصيغ المدعومة ويرفض غيرها", () => {
    expect(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))?.mime).toBe("image/jpeg");
    expect(sniff(Buffer.from("\x89PNG\r\n\x1a\n\0\0\0\0", "latin1"))?.kind).toBe("image");
    expect(sniff(Buffer.from("\0\0\0\x18ftypisom\0\0", "latin1"))?.mime).toBe("video/mp4");
    expect(sniff(Buffer.from("\0\0\0\x14ftypqt  \0\0", "latin1"))?.mime).toBe("video/quicktime");
    expect(sniff(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script/></svg>"))).toBeNull();
    expect(sniff(Buffer.from("<html><script>alert(1)</script>"))).toBeNull();
  });
});

describe("النصوص داخل الفيديو", () => {
  it("يمنع حقن أوامر ASS من نص المستخدم", () => {
    const ass = buildAss({ width: 1080, height: 1920, font: "IBM Plex Sans Arabic", color: "#FFFFFF", size: 64, box: true, position: "bottom", lines: [{ startMs: 0, endMs: 1000, text: "مرحبا {\\fs200}هاك", style: "Caption" }] });
    expect(ass).toContain("مرحبا fs200هاك");
    expect(ass).not.toContain("{\\fs200}");
  });
  it("يقسم الترجمة إلى أسطر قصيرة متتابعة", () => {
    const lines = splitSubtitle("واحد اثنان ثلاثة أربعة خمسة ستة سبعة ثمانية تسعة", 1000, 9000, 7);
    expect(lines).toHaveLength(2);
    expect(lines[0].startMs).toBe(1000);
    expect(lines[1].endMs).toBeCloseTo(10000);
  });
});
