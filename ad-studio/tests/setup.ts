// بيئة الاختبار: قاعدة ad_studio_test منفصلة ومجلد تخزين مؤقت. لا مفاتيح مزودين، فتعمل المحاكاة.
import os from "node:os";
import path from "node:path";

(process.env as Record<string, string>).NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://studio_app:studio_app_dev@127.0.0.1:5432/ad_studio_test";
process.env.WORKER_DATABASE_URL ??= "postgres://studio_worker:studio_worker_dev@127.0.0.1:5432/ad_studio_test";
process.env.MIGRATION_DATABASE_URL ??= "postgres://studio_owner:studio_owner_dev@127.0.0.1:5432/ad_studio_test";
process.env.FILE_SIGNING_SECRET ??= "test-secret-test-secret-test-secret-123";
process.env.STORAGE_DIR ??= path.join(os.tmpdir(), "ad-studio-test-storage");
process.env.MAX_UPLOAD_MB ??= "50";
// الاختبارات معزولة عن الشبكة: الصوت المجاني (edge-tts) معطّل هنا
process.env.FREE_TTS ??= "false";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ELEVENLABS_API_KEY;
delete process.env.RUNWAY_API_KEY;
