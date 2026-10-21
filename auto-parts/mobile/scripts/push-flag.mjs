// يُشغَّل بعد cap sync. على أندرويد تعمل الإشعارات فقط إذا وُجد android/app/google-services.json (إعداد Firebase)،
// وبدونه يتعطل التطبيق إن طلب التسجيل. لذلك نضيف "ApPush" إلى وكيل المستخدم في نسخة أندرويد فقط عند وجود الملف،
// والموقع لا يطلب الإشعارات على أندرويد إلا إذا وجد هذه العلامة. (آيفون يستخدم APNs مباشرة ولا يحتاجها.)
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const config = "android/app/src/main/assets/capacitor.config.json";
if (!existsSync(config)) process.exit(0);
const json = JSON.parse(readFileSync(config, "utf8"));
const base = (json.appendUserAgent ?? "").replace(/\s*ApPush\b/, "");
const enabled = existsSync("android/app/google-services.json");
json.appendUserAgent = enabled ? `${base} ApPush`.trim() : base;
writeFileSync(config, JSON.stringify(json, null, "\t") + "\n");
console.log(`android push notifications: ${enabled ? "enabled" : "disabled (no google-services.json)"}`);
