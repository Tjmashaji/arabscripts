#!/usr/bin/env bash
# تشغيل المنصة على ماك أو لينكس: ./start.sh
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker غير مثبت. ثبّت Docker Desktop من https://www.docker.com/products/docker-desktop ثم أعد المحاولة."
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker غير شغّال. افتح تطبيق Docker Desktop وانتظر حتى يجهز، ثم أعد المحاولة."
  exit 1
fi

# أول تشغيل: إنشاء ملف .env بأسرار عشوائية خاصة بجهازك
if [ ! -f .env ]; then
  gen() { head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }
  cat > .env <<ENV
# أُنشئ تلقائيًا. لا تشاركه مع أحد.
POSTGRES_PASSWORD=$(gen 24)
STUDIO_DB_SECRET=$(gen 32)
FILE_SIGNING_SECRET=$(gen 32)
STUDIO_PORT=3000
# true: نتائج محاكاة موسومة للتجربة دون مفاتيح. اجعلها false بعد إضافة المفاتيح.
ALLOW_SIMULATION=true
ANTHROPIC_API_KEY=
ELEVENLABS_API_KEY=
RUNWAY_API_KEY=
ENV
  echo "أُنشئ ملف .env"
fi

PORT=$(grep -E '^STUDIO_PORT=' .env | cut -d= -f2); PORT=${PORT:-3000}
echo "جارٍ البناء والتشغيل (أول مرة تأخذ 5 إلى 10 دقائق)..."
docker compose up -d --build

URL="http://localhost:$PORT"
for _ in $(seq 1 180); do
  if curl -sf "$URL/api/health" >/dev/null 2>&1; then
    echo "المنصة جاهزة: $URL"
    (command -v open >/dev/null && open "$URL") || (command -v xdg-open >/dev/null && xdg-open "$URL") || true
    exit 0
  fi
  sleep 2
done
echo "لم تجهز المنصة بعد. اعرض السجلات بالأمر: docker compose logs app"
exit 1
