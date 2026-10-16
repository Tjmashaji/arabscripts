// قراءة بيانات ملف برابط موقّع: الرابط نفسه هو التفويض، لذلك نقرأ بدالة محددة بالمعرّف فقط.
import { anonymous } from "../db";

export async function workerTxReadOnlyAsset(id: string) {
  return anonymous((tx) => tx.one<{ storage_key: string; mime_type: string; original_name: string }>("SELECT * FROM app.signed_asset($1)", [id]));
}
