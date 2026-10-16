#!/usr/bin/env bash
# يعيد إنشاء قاعدة الاختبار من الصفر ويطبّق الترحيلات والقوالب
set -euo pipefail
cd "$(dirname "$0")/.."
PGPASSWORD="${PGPASSWORD:-postgres}" DB_NAME=ad_studio_test RESET=1 ./db/setup-local.sh >/dev/null
export MIGRATION_DATABASE_URL=postgres://studio_owner:studio_owner_dev@127.0.0.1:5432/ad_studio_test
npx tsx scripts/migrate.ts >/dev/null
npx tsx scripts/seed-system.ts >/dev/null
echo "قاعدة الاختبار جاهزة"
