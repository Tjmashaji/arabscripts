#!/usr/bin/env bash
# يشغّل اختبارات قاعدة البيانات محليًا على Postgres 16 مؤقت (بدون Supabase ولا Docker):
#   1) ينشئ قاعدة فارغة ويضع فيها بديلًا مصغرًا لـ Supabase (supabase_stub.sql)
#   2) يطبّق كل الترحيلات بالترتيب
#   3) يشغّل كل ملف .sql في supabase/tests ويطبع PASS/FAIL، ويفشل إن وُجد FAIL
# الاستخدام: npm run test:db        (يحتاج initdb وpg_ctl وpsql من PostgreSQL 16)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; SUPA="$(cd "$HERE/../.." && pwd)"
BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"; [ -x "$BIN/initdb" ] || BIN="$(dirname "$(command -v initdb)")"
WORK="$(mktemp -d)"; PORT="${PG_PORT:-54329}"
AS=(); if [ "$(id -u)" = 0 ]; then chown postgres "$WORK"; AS=(runuser -u postgres --); fi
cleanup() { "${AS[@]}" "$BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
"${AS[@]}" "$BIN/initdb" -D "$WORK/data" -U postgres -A trust -E UTF8 --locale=C.UTF-8 >/dev/null
"${AS[@]}" "$BIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses='' -c wal_level=logical" -l "$WORK/pg.log" -w start >/dev/null
PSQL=(psql -h "$WORK" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -d postgres -c "create database masari_test" >/dev/null
sed "s/current_database_placeholder/masari_test/" "$HERE/supabase_stub.sql" | "${PSQL[@]}" -d masari_test >/dev/null
n=0
for f in "${MIGRATIONS_DIR:-$SUPA/migrations}"/*.sql; do
  # pg_cron وpg_net غير متوفرين محليًا؛ البديل في supabase_stub.sql
  sed -E '/create extension if not exists (pg_cron|pg_net)/d' "$f" | "${PSQL[@]}" -d masari_test >/dev/null 2>"$WORK/err" \
    || { echo "✗ فشل تطبيق الترحيل $(basename "$f")"; cat "$WORK/err"; exit 1; }
  n=$((n+1))
done
echo "✓ طُبّق $n ترحيلًا"
fail=0
for t in "$SUPA"/tests/*.sql; do
  echo "── $(basename "$t")"
  out="$("${PSQL[@]}" -d masari_test -f "$t" 2>&1 || true)"
  res="$(printf '%s\n' "$out" | sed -n '/RESULT/,$p' | grep -E '^(PASS|FAIL|INFO)' || true)"
  if [ -z "$res" ]; then echo "✗ لم يُخرج الاختبار نتائج:"; printf '%s\n' "$out" | tail -20; fail=1; continue; fi
  printf '%s\n' "$res" | sed -E 's/^PASS/  ✓/; s/^FAIL/  ✗ FAIL/; s/^INFO/  ·/'
  grep -q '^FAIL' <<<"$res" && fail=1 || true
done
[ "$fail" = 0 ] && echo "✓ كل اختبارات قاعدة البيانات نجحت" || { echo "✗ فيه اختبارات فاشلة"; exit 1; }
