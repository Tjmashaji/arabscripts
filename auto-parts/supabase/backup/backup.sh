#!/usr/bin/env bash
# نسخة احتياطية منطقية لبيانات المنصة (خطة Supabase المجانية لا توفر نسخًا قابلة للتنزيل).
#   DB_URL=<رابط اتصال Session pooler> OUT=<مجلد> bash supabase/backup/backup.sh
# يكتب أرشيفًا واحدًا فيه:
#   app-data.sql   بيانات جداول المنصة (public.ap_*) وأرقام المراجع
#   auth-data.sql  حسابات الدخول (auth.users وauth.identities) لاستعادتها في مشروع Supabase جديد
#   schema.sql     هيكل public وap_private كما هو في الإنتاج (لكشف أي اختلاف عن الترحيلات)
# لا يشمل ملفات التخزين (المستندات والصور): قاعدة البيانات تحفظ بياناتها الوصفية فقط.
set -euo pipefail
: "${DB_URL:?DB_URL مطلوب}"; : "${OUT:?OUT مطلوب}"
PG_DUMP="${PG_DUMP:-pg_dump}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
name="auto-parts-$stamp"; dir="$OUT/$name"
mkdir -p "$dir"
common=(--no-owner --no-privileges --quote-all-identifiers)
PSQL_BIN="${PSQL:-psql}"

# عدد صفوف كل جدول في الإنتاج من نفس اللقطة (snapshot) التي تُنسخ منها البيانات، ليتحقق اختبار الاستعادة
# من مصدر مستقل عن ملف النسخة نفسه. الجلسة تبقى مفتوحة حتى ينتهي pg_dump.
coproc HOLD { "$PSQL_BIN" "$DB_URL" -X -q -At -v ON_ERROR_STOP=1 2>&1; }
exec {to_hold}>&"${HOLD[1]}" {from_hold}<&"${HOLD[0]}"
printf '%s\n' "begin isolation level repeatable read read only;" "select pg_export_snapshot();" >&"$to_hold"
IFS= read -r snapshot <&"$from_hold"
[[ "$snapshot" =~ ^[0-9A-F-]+$ ]] || { echo "تعذّر أخذ لقطة: $snapshot" >&2; exit 1; }
printf '%s\n' "select c.relname || chr(9) || (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace where ns.nspname = 'public' and c.relkind = 'r' and c.relname like 'ap\\_%' order by 1;" \
  "select '__END__';" >&"$to_hold"
: > "$dir/COUNTS"
while IFS= read -r line <&"$from_hold"; do [ "$line" = "__END__" ] && break; printf '%s\n' "$line" >> "$dir/COUNTS"; done
"$PG_DUMP" "$DB_URL" "${common[@]}" --snapshot="$snapshot" --data-only --table='public.ap_*' -f "$dir/app-data.sql"
printf '%s\n' "commit;" "\\q" >&"$to_hold"; exec {to_hold}>&-; wait "$HOLD_PID" 2>/dev/null || true
"$PG_DUMP" "$DB_URL" "${common[@]}" --data-only --table=auth.users --table=auth.identities -f "$dir/auth-data.sql"
"$PG_DUMP" "$DB_URL" "${common[@]}" --schema-only --schema=public --schema=ap_private -f "$dir/schema.sql"
{ echo "created_at=$stamp"; echo "pg_dump=$("$PG_DUMP" --version)"; } > "$dir/MANIFEST"
tar -C "$OUT" -czf "$OUT/$name.tar.gz" "$name"
rm -rf "$dir"
echo "$OUT/$name.tar.gz"
