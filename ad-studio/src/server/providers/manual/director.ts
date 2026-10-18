// مخرج «نصك أنت» المجاني: بلا ذكاء اصطناعي. يقسّم السيناريو الذي كتبه المستخدم على مشاهد بمدد مضبوطة.
// مخرجاته ليست محاكاة لأن الكلام كلام المستخدم نفسه؛ ولا يقترح أفكارًا ولا يكتب نصًا من عنده.
import { ProviderError, type DirectorBrief, type DirectorProvider } from "../types";
import { SimulationDirector } from "../simulation/director";

export const MANUAL_ONLY_MESSAGE = "كتابة الأفكار والسيناريو تحتاج مفتاح ANTHROPIC_API_KEY. بدونه اختر «لدي فكرة جاهزة» واكتب نص إعلانك، وتقسّمه المنصة على المشاهد مجانًا.";

export class ManualDirector implements DirectorProvider {
  info = { id: "manual", label: "تقسيم نصك على المشاهد (مجاني، بلا ذكاء اصطناعي)", mode: "live" as const, free: true, setup: "أضف ANTHROPIC_API_KEY لاقتراح الأفكار وكتابة السيناريو تلقائيًا." };
  private planner = new SimulationDirector();

  async ideas(): Promise<never> {
    throw new ProviderError("manual director has no ideas", false, MANUAL_ONLY_MESSAGE);
  }

  async direct(brief: DirectorBrief) {
    if (brief.settings.mode !== "own_idea" || !brief.settings.own_idea.trim()) throw new ProviderError("manual director needs own script", false, MANUAL_ONLY_MESSAGE);
    const r = await this.planner.direct(brief);
    return { ...r, model: "manual" };
  }
}
