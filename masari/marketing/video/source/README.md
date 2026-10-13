# مصدر فيديو إعلان مساري

الفيديوهات في المجلد الأعلى ولّدها Claude آليًا. لإعادة توليدها بعد أي تعديل:

1. `tts.py`: يولّد صوت كل جملة من `lines.json` بصوت `ar-SA-HamedNeural` (مكتبة edge-tts).
2. `trim.py`: يقص الصمت من أول كل مقطع صوتي وآخره.
3. `mix.py`: يرتّب المقاطع حسب الفواصل في `gaps.json`، ويضيف نغمة الإشعار والموسيقى، ويخرج `audio.wav` و`timeline.json`.
4. `render.mjs`: يرسم المشاهد من `stage.html` حسب `scenes.json` بـ Playwright (30 إطارًا في الثانية)، ثم يدمج الصورة والصوت بـ ffmpeg.

يحتاج: Python مع edge-tts وnumpy، وNode مع playwright-core و@fontsource/noto-sans-arabic، وffmpeg.
