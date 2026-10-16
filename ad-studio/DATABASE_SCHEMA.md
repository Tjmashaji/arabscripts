# مخطط قاعدة البيانات

PostgreSQL 14+. الترحيلات في `db/migrations` وتُطبَّق بالترتيب عبر `npm run db:migrate` (جدول `schema_migrations`).

## الأدوار

| الدور | يستخدمه | RLS |
|---|---|---|
| `studio_owner` | الترحيلات وبذر قوالب النظام | مالك الجداول |
| `studio_app` | خادم الويب | **يخضع** لسياسات RLS، ويضبط `app.user_id` في كل معاملة |
| `studio_worker` | العامل الخلفي ومهمة التنظيف | يتجاوز RLS، ويقيّد كل استعلام بمعرّف المهمة أو المشروع صراحةً |

تُنشأ الأدوار بـ `db/roles.sql` (عبر `db/setup-local.sh`).

## الجداول

| الجدول | الغرض | ملاحظات |
|---|---|---|
| `users` | الحسابات | بريد فريد بأحرف صغيرة، وهاش scrypt، و`is_admin`، وحذف منطقي |
| `sessions` | الجلسات | هاش SHA-256 للرمز فقط؛ لا وصول مباشر للتطبيق |
| `workspaces` | مساحات العمل | `plan_code`، و`monthly_spend_cap_cents` (سقف الإنفاق) |
| `workspace_members` | العضوية | أدوار `owner` و`editor` و`viewer` |
| `plans` / `subscriptions` | الخطط والاشتراكات | الاشتراك `inactive` حتى ربط بوابة دفع |
| `brands` | بيانات النشاط | المصدر الوحيد للحقائق في الإعلان، و`logo_asset_id` |
| `projects` | المشاريع | `settings` (jsonb موثّق بمخطط zod)، و`wizard_step`، و`version` للقفل التفاؤلي، وحذف منطقي |
| `media_assets` | كل الملفات | `kind` و`role` و`checksum`، والأبعاد والمدة، و`analysis` و`analysis_status`، و`is_simulated`، و`license` |
| `creative_briefs` | لقطة مدخلات المخرج | تبيّن على ماذا بُني كل سيناريو |
| `scripts` | نسخ السيناريو | `content` بمخطط `directorOutput`، ونسخة واحدة `is_current` لكل مشروع |
| `scenes` | المشاهد | الترتيب والمدة والبرومبت والكاميرا والإضاءة والنص والتعليق والانتقال والمراجع والمادة المختارة والقص، و`version`، وحذف منطقي |
| `ai_jobs` | المهام غير المتزامنة | الحالة والمزود و`provider_job_id` والتقدم والمحاولات والتكلفة والخطأ، و`idempotency_key` فريد لكل مساحة |
| `scene_generations` | سجل توليدات المشهد | كل توليد مع البرومبت والمعاملات والناتج |
| `audio_assets` | مقاطع التعليق والموسيقى | مقطع لكل مشهد مع إزاحة ومستوى صوت |
| `editing_timelines` | إعدادات المونتاج | المقاس والمزج والنصوص والشعار، و`version` |
| `exports` | ملفات التصدير | لقطة الإعدادات ونسخة المونتاج، و`is_simulated` |
| `prompt_templates` | القوالب | `workspace_id = NULL` تعني قالب نظام للقراءة فقط |
| `voice_profiles` / `characters` | الأصوات والشخصيات المحفوظة | `rights_confirmed` للشخصيات البشرية |
| `usage_ledger` | الاستخدام والتكلفة | فهرس فريد `(job_id, entry_type)` يمنع الاحتساب المزدوج |
| `audit_logs` | سجل التدقيق | الإنشاء والتعديل والحذف |
| `rate_limits` | حدود الطلبات | نوافذ زمنية ثابتة؛ لا وصول مباشر للتطبيق |

> **مقابل الأسماء المقترحة**: الجدول المقترح `brand_assets` مدمج في `media_assets` (بالحقلين `role = 'logo'` و`brand_id`). و`campaigns` مدمج في `scripts.content` (اسم الحملة والفكرة والرسالة والدعوة). و`export_jobs` هي مهام `ai_jobs` من نوع `type = 'export'`.

## الفهارس والقيود

- فهارس على كل مفتاح أجنبي يُستعلم به، وعلى طابور المهام (`run_after WHERE status IN (queued, processing)`).
- قيود `CHECK` على كل الحالات والأنواع والمدد والمستويات.
- `updated_at` يُحدَّث تلقائيًا بمشغّل.

## سياسات RLS (ملخص)

- **العضوية**: `app.is_member(workspace_id, min_role)` دالة `SECURITY DEFINER`.
- **القراءة**: أي عضو. **الكتابة**: `editor` أو `owner`.
- `ai_jobs`: الإدراج باسم المستخدم الحالي وبحالة `queued` فقط. والتحديث محصور بعمود `cancel_requested` عبر صلاحيات الأعمدة.
- `usage_ledger`: قراءة فقط للتطبيق؛ الكتابة من العامل.
- `prompt_templates`: قوالب النظام للقراءة للجميع، وقوالب المساحة لأعضائها.
- `sessions` و`rate_limits`: لا سياسات للتطبيق، فالوصول عبر الدوال فقط (`app.create_session` و`app.session_user` و`app.hit_rate_limit` وغيرها).
- مدير النظام (`users.is_admin`) يقرأ المستخدمين والمساحات والمهام والاستخدام لأغراض لوحة الإدارة.

هذه السياسات مختبرة بحسابات مختلفة في `tests/integration/security.test.ts`.

## إضافة مدير نظام

```sql
UPDATE users SET is_admin = true WHERE email = 'you@example.com';  -- بدور studio_owner
```
