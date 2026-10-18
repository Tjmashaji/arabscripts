# صورة تشغيل واحدة لتطبيق الويب والعامل الخلفي معًا (انظر DEPLOY_RAILWAY.md)
FROM node:22-bookworm-slim

# FFmpeg من Debian مبني مع libass وlibfribidi وlibharfbuzz، وهي لازمة للنص العربي داخل الفيديو.
# python3 مع edge-tts للتعليق الصوتي المجاني (FREE_TTS).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates python3 python3-pip \
  && pip3 install --no-cache-dir --break-system-packages edge-tts==7.3.1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
# devDependencies مطلوبة وقت التشغيل أيضًا: tsx يشغّل العامل والترحيلات
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

ENV NODE_ENV=production
CMD ["node_modules/.bin/tsx", "scripts/start-production.ts"]
