#!/usr/bin/env bash
# يختبر سكربتي النسخ والاستعادة محليًا: قاعدة «إنتاج» مؤقتة ببيانات كاملة (سيناريو اختبار المرحلة D بلا تراجع)
# ← backup.sh ← restore-check.sh يجب أن ينجح. ثم حالتان يجب أن يفشل فيهما: صف ناقص، واختلاف في هيكل الإنتاج.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; SUPA="$(cd "$HERE/.." && pwd)"
BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"; [ -x "$BIN/initdb" ] || BIN="$(dirname "$(command -v initdb)")"
WORK="$(mktemp -d)"; PORT="${PG_PORT:-54349}"
AS=(); if [ "$(id -u)" = 0 ]; then chown postgres "$WORK"; AS=(runuser -u postgres --); fi
cleanup() { "${AS[@]}" "$BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
"${AS[@]}" "$BIN/initdb" -D "$WORK/data" -U postgres -A trust -E UTF8 --locale=C.UTF-8 >/dev/null
"${AS[@]}" "$BIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/pg.log" -w start >/dev/null
PSQL=(psql -h "$WORK" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -d postgres -c "create database prod" >/dev/null
sed "s/current_database_placeholder/prod/" "$SUPA/tests/local/supabase_stub.sql" | "${PSQL[@]}" -d prod >/dev/null
for f in "$SUPA"/migrations/*.sql; do "${PSQL[@]}" -d prod -f "$f" >/dev/null; done
grep -v "raise exception 'RESULT%'" "$SUPA/tests/shipping.sql" | "${PSQL[@]}" -d prod >/dev/null 2>&1
echo "· بيانات الاختبار: $("${PSQL[@]}" -d prod -At -c "select count(*) from public.ap_audit_logs") سجل تدقيق، $("${PSQL[@]}" -d prod -At -c "select count(*) from public.ap_orders") طلب"
DB_URL="postgresql://postgres@/prod?host=$WORK&port=$PORT"
mkdir -p "$WORK/out"; chmod 777 "$WORK/out"
archive="$(DB_URL="$DB_URL" OUT="$WORK/out" PG_DUMP="$BIN/pg_dump" bash "$HERE/backup.sh")"

echo "── استعادة نسخة سليمة (يجب أن تنجح)"
PG_PORT=54359 bash "$HERE/restore-check.sh" "$archive"

echo "── نسخة ناقصة صفًا (يجب أن تفشل)"
x="$WORK/x"; mkdir -p "$x"; tar -C "$x" -xzf "$archive"; d="$(ls -d "$x"/auto-parts-*)"
# حذف أول صف من بيانات ap_orders داخل كتلة COPY (محاكاة نسخة تالفة).
awk '/^COPY "public"\."ap_orders"/ {print; skip=1; next} skip==1 {skip=2; next} {print}' "$d/app-data.sql" > "$d/tmp" && mv "$d/tmp" "$d/app-data.sql"
tar -C "$x" -czf "$WORK/broken.tar.gz" "$(basename "$d")"
if PG_PORT=54359 bash "$HERE/restore-check.sh" "$WORK/broken.tar.gz" >/dev/null 2>&1; then echo "✗ لم يُكتشف الصف الناقص"; exit 1; else echo "✓ اكتُشفت النسخة الناقصة"; fi

echo "── إنتاج فيه جدول ليس في الترحيلات (يجب أن تفشل)"
"${PSQL[@]}" -d prod -c "create table public.ap_drift_example (id int)" >/dev/null
drift="$(DB_URL="$DB_URL" OUT="$WORK/out" PG_DUMP="$BIN/pg_dump" bash "$HERE/backup.sh")"
if PG_PORT=54359 bash "$HERE/restore-check.sh" "$drift" >/dev/null 2>&1; then echo "✗ لم يُكتشف اختلاف الهيكل"; exit 1; else echo "✓ اكتُشف اختلاف هيكل الإنتاج عن الترحيلات"; fi
echo "✓ اختبار النسخ والاستعادة نجح"
