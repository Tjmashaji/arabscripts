#!/usr/bin/env bash
# اختبار استعادة فعلي لنسخة احتياطية: Postgres مؤقت ← الترحيلات من المستودع ← بيانات النسخة ← مقارنة عدد الصفوف
# لكل جدول مع ما في النسخة، وكشف أي اختلاف بين هيكل الإنتاج والترحيلات، ثم فحوص الأمان على القاعدة المستعادة.
#   bash supabase/backup/restore-check.sh <ملف.tar.gz>     (يحتاج initdb وpg_ctl وpsql بإصدار ≥ إصدار pg_dump)
set -euo pipefail
ARCHIVE="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
HERE="$(cd "$(dirname "$0")" && pwd)"; SUPA="$(cd "$HERE/.." && pwd)"
BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"; [ -x "$BIN/initdb" ] || BIN="$(dirname "$(command -v initdb)")"
WORK="$(mktemp -d)"; PORT="${PG_PORT:-54339}"
AS=(); if [ "$(id -u)" = 0 ]; then chown postgres "$WORK"; AS=(runuser -u postgres --); fi
cleanup() { "${AS[@]}" "$BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
tar -C "$WORK" -xzf "$ARCHIVE"; SRC="$(ls -d "$WORK"/auto-parts-*)"; chmod -R a+rX "$WORK"
"${AS[@]}" "$BIN/initdb" -D "$WORK/data" -U postgres -A trust -E UTF8 --locale=C.UTF-8 >/dev/null
"${AS[@]}" "$BIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/pg.log" -w start >/dev/null
PSQL=(psql -h "$WORK" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -d postgres -c "create database restore_check" >/dev/null
sed "s/current_database_placeholder/restore_check/" "$SUPA/tests/local/supabase_stub.sql" | "${PSQL[@]}" -d restore_check >/dev/null
# pg_cron وpg_net غير متوفرين محليًا؛ البديل في supabase_stub.sql
for f in "$SUPA"/migrations/*.sql; do sed -E '/create extension if not exists (pg_cron|pg_net)/d' "$f" | "${PSQL[@]}" -d restore_check >/dev/null 2>"$WORK/err" || { echo "✗ ترحيل $(basename "$f")"; cat "$WORK/err"; exit 1; }; done

fail=0
# 1) هيكل الإنتاج يطابق الترحيلات (نفس الجداول).
grep -oE 'CREATE TABLE "public"\."ap_[a-z_]+"' "$SRC/schema.sql" | sed -E 's/.*"(ap_[a-z_]+)"/\1/' | sort -u > "$WORK/prod_tables"
"${PSQL[@]}" -d restore_check -At -c "select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r' and relname like 'ap\_%' order by 1" | sort -u > "$WORK/repo_tables"
if diff "$WORK/prod_tables" "$WORK/repo_tables" > "$WORK/diff"; then echo "✓ الجداول في الإنتاج تطابق الترحيلات ($(wc -l < "$WORK/repo_tables") جدولًا)"
else echo "✗ اختلاف بين هيكل الإنتاج والترحيلات (< الإنتاج، > المستودع):"; cat "$WORK/diff"; fail=1; fi

# 2) استعادة البيانات: تُفرَّغ جداول المنصة أولًا (الترحيلات تضيف بيانات مرجعية كاللغات والصلاحيات، والنسخة تحتويها)،
#    ثم التحميل والمشغّلات معطلة كما في أي استعادة. حسابات auth لا تُستعاد هنا (القاعدة المؤقتة ليست Supabase).
{ echo "set session_replication_role = replica;"
  echo "do \$\$ declare r record; begin for r in select c.oid::regclass t from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r' and relname like 'ap\\_%' loop execute 'truncate ' || r.t || ' cascade'; end loop; end \$\$;"
  cat "$SRC/app-data.sql"; } | "${PSQL[@]}" -d restore_check >/dev/null 2>"$WORK/err" \
  || { echo "✗ تعذّر تحميل البيانات:"; cat "$WORK/err"; exit 1; }
echo "✓ حُمّلت البيانات"

# 3) عدد الصفوف لكل جدول = عدده في الإنتاج لحظة النسخ (COUNTS) = عدد صفوفه في ملف النسخة.
awk '/^COPY "public"\."ap_/ { match($0, /"ap_[a-z_]+"/); t=substr($0, RSTART+1, RLENGTH-2); n=0; inside=1; next }
     inside && /^\\\.$/ { print t "\t" n; inside=0; next }
     inside { n++ }' "$SRC/app-data.sql" > "$WORK/expected"
rows=0; tables=0
[ -s "$SRC/COUNTS" ] || { echo "✗ النسخة بلا أعداد الإنتاج (COUNTS)"; exit 1; }
while IFS=$'\t' read -r table prod; do
  in_file="$(awk -F'\t' -v t="$table" '$1==t {print $2}' "$WORK/expected")"; in_file="${in_file:-0}"
  actual="$("${PSQL[@]}" -d restore_check -At -c "select count(*) from public.\"$table\"")"
  if [ "$prod" != "$in_file" ] || [ "$prod" != "$actual" ]; then
    echo "✗ $table: في الإنتاج $prod، في ملف النسخة $in_file، بعد الاستعادة $actual"; fail=1
  fi
  rows=$((rows + prod)); tables=$((tables + 1))
done < "$SRC/COUNTS"
echo "✓ تحقق عدد الصفوف: $tables جدولًا، $rows صفًا"

# 4) حسابات الدخول موجودة لكل ملف شخصي في النسخة.
users="$(awk '/^COPY "auth"\."users"/ {inside=1; next} inside && /^\\\.$/ {inside=0} inside {n++} END {print n+0}' "$SRC/auth-data.sql")"
profiles="$(awk -F'\t' '$1=="ap_profiles" {print $2}' "$WORK/expected")"; profiles="${profiles:-0}"
if [ "$users" -ge "$profiles" ]; then echo "✓ حسابات الدخول في النسخة: $users (الملفات الشخصية: $profiles)"
else echo "✗ حسابات الدخول ($users) أقل من الملفات الشخصية ($profiles)"; fail=1; fi

# 5) فحوص الأمان على القاعدة المستعادة.
findings="$("${PSQL[@]}" -d restore_check -At -f "$SUPA/manual/security_check.sql")"
if [ -z "$findings" ]; then echo "✓ فحوص الأمان على القاعدة المستعادة"; else echo "✗ فحوص الأمان:"; echo "$findings"; fail=1; fi

[ "$fail" = 0 ] && echo "✓ اختبار الاستعادة نجح ($(grep created_at "$SRC/MANIFEST"))" || { echo "✗ اختبار الاستعادة فشل"; exit 1; }
