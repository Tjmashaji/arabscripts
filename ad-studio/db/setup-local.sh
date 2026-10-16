#!/usr/bin/env bash
# يجهّز قاعدة بيانات محلية للتطوير أو الاختبار: الأدوار ثم القاعدة ثم الترحيلات.
# الاستخدام: DB_NAME=ad_studio ./db/setup-local.sh   (يتطلب صلاحية postgres محليًا)
set -euo pipefail
DB_NAME="${DB_NAME:-ad_studio}"
OWNER_PW="${STUDIO_OWNER_PASSWORD:-studio_owner_dev}"
APP_PW="${STUDIO_APP_PASSWORD:-studio_app_dev}"
WORKER_PW="${STUDIO_WORKER_PASSWORD:-studio_worker_dev}"
PSQL=(psql -v ON_ERROR_STOP=1 -h "${PGHOST:-127.0.0.1}" -U "${PGSUPERUSER:-postgres}")
"${PSQL[@]}" -d postgres -v owner_password="$OWNER_PW" -v app_password="$APP_PW" -v worker_password="$WORKER_PW" -f "$(dirname "$0")/roles.sql"
if [ "${RESET:-0}" = "1" ]; then "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE)"; fi
"${PSQL[@]}" -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || "${PSQL[@]}" -d postgres -c "CREATE DATABASE \"$DB_NAME\" OWNER studio_owner"
echo "قاعدة $DB_NAME جاهزة. شغّل الآن: npm run db:migrate"
