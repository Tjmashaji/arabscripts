#!/usr/bin/env bash
# يجهّز قاعدة بيانات محلية للتطوير أو الاختبار: الأدوار ثم القاعدة.
# الاستخدام: DB_NAME=salla_trends ./db/setup-local.sh   ثم npm run db:migrate
set -euo pipefail
DB_NAME="${DB_NAME:-salla_trends}"
OWNER_PW="${TRENDS_OWNER_PASSWORD:-trends_owner_dev}"
APP_PW="${TRENDS_APP_PASSWORD:-trends_app_dev}"
WORKER_PW="${TRENDS_WORKER_PASSWORD:-trends_worker_dev}"
PSQL=(psql -v ON_ERROR_STOP=1 -h "${PGHOST:-127.0.0.1}" -U "${PGSUPERUSER:-postgres}")
"${PSQL[@]}" -d postgres -v owner_password="$OWNER_PW" -v app_password="$APP_PW" -v worker_password="$WORKER_PW" -f "$(dirname "$0")/roles.sql"
if [ "${RESET:-0}" = "1" ]; then "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE)"; fi
"${PSQL[@]}" -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || "${PSQL[@]}" -d postgres -c "CREATE DATABASE \"$DB_NAME\" OWNER trends_owner"
echo "قاعدة $DB_NAME جاهزة. شغّل الآن: npm run db:migrate"
