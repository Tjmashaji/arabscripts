#!/usr/bin/env bash
# إيقاف المنصة. البيانات والملفات تبقى محفوظة للتشغيل القادم.
cd "$(dirname "$0")" && docker compose down
