#!/usr/bin/env bash
# يعيد إنشاء قاعدة الاختبار من الصفر ويطبّق الترحيلات
set -euo pipefail
cd "$(dirname "$0")/.."
PGPASSWORD="${PGPASSWORD:-postgres}" DB_NAME=salla_trends_test RESET=1 ./db/setup-local.sh >/dev/null
MIGRATION_DATABASE_URL=postgres://trends_owner:trends_owner_dev@127.0.0.1:5432/salla_trends_test npx tsx scripts/migrate.ts >/dev/null
echo "قاعدة الاختبار جاهزة"
