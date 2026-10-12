# تطبيق مساري للجوال

التطبيق نفسه (نفس الكود) مغلّف كتطبيق أندرويد بأداة Capacitor. الفرق الأساسي عن الموقع:
**موقع الباص يستمر في الإرسال والشاشة مطفأة أو التطبيق مصغّر**، مع إشعار دائم «رحلة جارية — مساري» كما يشترط أندرويد.
لذلك هو مخصص أولًا للسائقين. أولياء الأمور والمدارس يكفيهم الموقع.

## تنزيل نسخة أندرويد للتجربة

1. افتح المستودع في GitHub ← **Actions** ← آخر تشغيل ناجح لـ **masari-ci**.
2. أسفل الصفحة في **Artifacts** نزّل **masari-android** (ملف مضغوط فيه `app-debug.apk`).
3. انقل الملف لجوال السائق وثبّته (اسمح بالتثبيت من مصادر غير معروفة).

## إعداد جوال السائق (مرة واحدة)

- عند أول رحلة يطلب التطبيق إذن الموقع: اختر **السماح طوال الوقت** (Allow all the time).
- اسمح بالإشعارات.
- الإعدادات ← التطبيقات ← مساري ← البطارية ← **غير مقيد** (حتى لا يوقفه توفير الطاقة).
- اسمح بالكاميرا عند أول «مسح بطاقة طالب».

## النشر في Google Play

نسخة التجربة غير موقّعة للنشر. للنشر:
1. أنشئ مفتاح توقيع (keystore) واحفظه في مكان آمن، وأضفه لأسرار المستودع (`ANDROID_KEYSTORE_BASE64`، `ANDROID_KEYSTORE_PASSWORD`، `ANDROID_KEY_ALIAS`، `ANDROID_KEY_PASSWORD`).
2. ابنِ `./gradlew bundleRelease` بالتوقيع وارفع ملف `.aab` إلى Google Play Console.
3. في نموذج «أذونات الموقع في الخلفية» في Play Console اشرح أن التطبيق يرسل موقع الباص المدرسي لأولياء الأمور أثناء الرحلة فقط، وأرفق فيديو قصيرًا للميزة. Google تراجع هذا الإذن يدويًا.

## نسخة آيفون (تحتاج جهاز Mac وحساب Apple Developer)

```bash
npm install @capacitor/ios@8.5.3
npm run build:spa
npx cap add ios
npx cap open ios
```
ثم في Xcode أضف إلى `Info.plist`:
- `NSLocationWhenInUseUsageDescription` و `NSLocationAlwaysAndWhenInUseUsageDescription`: «يرسل مساري موقع الباص لأولياء الأمور أثناء الرحلة.»
- `NSCameraUsageDescription`: «لمسح بطاقة الطالب عند الصعود والنزول.»
- في **Signing & Capabilities** أضف **Background Modes** وفعّل **Location updates**.

## التحديثات

بعد أي تعديل في الواجهة: `npm run android:sync` ثم ابنِ من جديد (أو اترك GitHub Actions يبنيه تلقائيًا).
