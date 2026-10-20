// بيئة الاختبار: قاعدة salla_trends_test منفصلة، ومفاتيح وهمية، ولا اتصال بسلة (الشبكة تُستبدل في الاختبارات).
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://trends_app:trends_app_dev@127.0.0.1:5432/salla_trends_test";
process.env.WORKER_DATABASE_URL ??= "postgres://trends_worker:trends_worker_dev@127.0.0.1:5432/salla_trends_test";
process.env.TOKEN_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.SALLA_WEBHOOK_SECRET ??= "test-webhook-secret";
process.env.SALLA_CLIENT_ID ??= "test-client";
process.env.SALLA_CLIENT_SECRET ??= "test-client-secret";
process.env.SALLA_ACCOUNTS_URL ??= "https://accounts.salla.test";
process.env.SALLA_API_URL ??= "https://api.salla.test/admin/v2";
process.env.CRON_SECRET ??= "test-cron-secret-test-cron-secret";
process.env.APP_URL ??= "http://localhost:3000";
export {};
