# بيانات متجرَي Apple وGoogle Play — «مساري»

أُعدّت بتاريخ 13 أكتوبر 2026 من الكود الفعلي (`app/`، `supabase/migrations/`، `ios/`، `android/`). لا أرقام مستخدمين ولا تقييمات ولا جوائز ولا أسعار، لأنها غير موجودة. الأعداد بين القوسين محسوبة ببايثون (`len()`) على النص داخل الكتلة نفسها.

| البند | القيمة | المصدر |
|---|---|---|
| معرّف التطبيق (Bundle ID / Package) | `sa.masari.app` | `capacitor.config.json`، `android/app/build.gradle` |
| الاسم على الجهاز | مساري | `capacitor.config.json`، `strings.xml` |
| لغة التطوير الأساسية | العربية (`CFBundleDevelopmentRegion = ar`) | `ios/App/App/Info.plist` |
| رابط سياسة الخصوصية | `https://masari-zeta.vercel.app/#privacy` | `lib/site.ts` + `app/privacy.tsx` |
| رابط حذف الحساب (Google Play) | `https://masari-zeta.vercel.app/#delete-account` | `app/delete-request.tsx` |

---

## ⚠️ قبل الرفع: نقاط تمنع أو تهدد القبول

1. **الإشعارات في تطبيق الجوال غير مفعّلة بعد.** التطبيق يعتمد Web Push (`app/account.tsx`: `PushManager`/`serviceWorker`)، ولا يوجد في `package.json` أي إضافة إشعارات أصلية (مثل `@capacitor/push-notifications`). داخل غلاف Capacitor على iOS وAndroid لا يتوفر `PushManager`، فلن تصل الإشعارات والتطبيق مغلق. لذلك حذفتُ عبارة «حتى والتطبيق مغلق» من كل نصوص المتجر. أضيفوا إشعارات أصلية (APNs/FCM) قبل الرفع، وإلا فالتنبيهات الموصوفة هنا تظهر فقط في قائمة «الإشعارات» داخل التطبيق، أو برسائل SMS/واتساب إذا ضُبط مزوّد لها.
2. ✅ **رابط الخصوصية (تم):** النطاق القديم `masari-tjmashajis-projects.vercel.app` كان محميًا بتسجيل دخول Vercel، فلا يفتحه إلا أعضاء الفريق. صار `lib/site.ts` يشير إلى `masari-zeta.vercel.app` العام. يُفضَّل لاحقًا نطاق خاص.
3. ✅ **Google Play: رابط حذف الحساب من الويب (تم):** `https://masari-zeta.vercel.app/#delete-account` صفحة عامة بلا دخول، تشرح الخطوات وما يُحذف وما يبقى، وزرها يفتح الدخول ثم «حسابي» مباشرة.
4. **Google Play: الموقع في الخدمة الأمامية.** `FOREGROUND_SERVICE_LOCATION` يتطلب نموذج «Foreground service types» في Play Console مع فيديو قصير لتدفق السائق، والإفصاح الواضح داخل التطبيق قبل طلب إذن الموقع ✅ موجود (`app/location-disclosure.tsx`)، فيبقى الفيديو فقط. التطبيق لا يطلب `ACCESS_BACKGROUND_LOCATION`، وهذا جيد.
5. **Apple: إرشاد 4.2 (الحد الأدنى من الوظائف).** التطبيق غلاف Capacitor لموقع ويب. في ملاحظات المراجعة اذكروا الميزات الأصلية: الموقع في الخلفية أثناء الرحلة، والكاميرا لمسح بطاقة QR. ولا تُرسلوا التطبيق قبل حل البند 1.
6. **حسابات تجريبية للمراجعين:** التطبيق كله خلف تسجيل الدخول، ويحتاج ولي الأمر إلى مدرسة مشتركة. جهّزوا حساب ولي أمر وحساب سائق على المدرسة التجريبية (الرياض، باص 1، مسار 1: الروضة ← النهضة ← النسيم ← المدرسة)، مع رحلة يمكن بدؤها أثناء المراجعة.

---

## الاستراتيجية باختصار (منهج ASO)

- **الجمهور:** ولي الأمر السعودي (يحمّل التطبيق) وإدارة المدرسة (تسجّل المدرسة). السائق يحمّل التطبيق بدعوة من المدرسة، ولا يحتاج إلى إقناع في المتجر.
- **الكلمة الأساسية:** «باص المدرسة» / «تتبع» في الاسم، وهو أعلى المواقع وزنًا. «نقل مدرسي» في العنوان الفرعي. بقية الكلمات في حقل الكلمات (Apple) والوصف القصير (Google).
- **حجم البحث:** لا توجد بيانات حجم بحث موثوقة دون اتصال بالإنترنت، وسكربتات المهارة تعطي تقديرات فقط. الأولوية هنا حسب الصلة بالوظيفة 🟡. بعد الإطلاق راقبوا الكلمات في App Store Connect وPlay Console.
- **قسم «الإثبات الاجتماعي»** في هيكل الوصف المقترح **محذوف عمدًا**، لأنه لا توجد تقييمات ولا أعداد حقيقية بعد. حلّ محله قسم «الأمان أولًا» لأنه الحجة الأقوى عند ولي الأمر.
- **أسماء المنافسين:** لم يُستخدم أي اسم منافس.

---

# أولًا: Apple App Store

## العربية (السعودية) — ar-SA

**اسم التطبيق** (23/30)
<!-- f:ar_name -->
```
مساري: تتبع باص المدرسة
```

**العنوان الفرعي** (28/30)
<!-- f:ar_sub -->
```
نقل مدرسي آمن وتنبيهات فورية
```

**الكلمات المفتاحية** (96/100). بلا مسافات بعد الفواصل، ولا تتكرر فيها كلمة من الاسم أو العنوان الفرعي (تحقق آلي).
<!-- f:ar_kw -->
```
حافلة,طلاب,ولي أمر,أولياء,حضور,غياب,سائق,رحلة,مواصلات,توصيل,خريطة,مدارس,أبنائي,إشعار,بوابة,سلامة
```

**النص الترويجي** (127/170). يمكن تعديله دون تحديث التطبيق.
<!-- f:ar_promo -->
```
تابع باص ابنك على الخريطة أثناء رحلته، وسجّل غيابه قبل أن يتحرك الباص، واعرف لحظة صعوده ووصوله. مجاني لأولياء الأمور والسائقين.
```

**الوصف** (2455/4000). النص نفسه يُستخدم في Google Play.
<!-- f:ar_desc -->
```
وين باص ولدك الحين؟ مع مساري تعرف.
تابع باص المدرسة على الخريطة أثناء رحلة ابنك، ويتحدّث موقعه كل 10 ثوانٍ.
وتصلك التنبيهات: بدأت الرحلة، الباص على بعد 5 دقائق تقريبًا، صعد ابنك، وصل المدرسة، وصل المنزل.

مساري منصة نقل مدرسي تربط ولي الأمر والسائق وإدارة المدرسة في نظام واحد: مسارات، حضور، تتبع مباشر، وتنبيهات.

لأولياء الأمور
• تتبع مباشر لموقع الباص أثناء رحلة ابنك فقط.
• سجّل غياب ابنك قبل بدء الرحلة، فيراه السائق «غائب» قبل أن يتحرك. ويمكنك تسجيل غياب أو استلام بنفسك أو خروج مبكر لأيام قادمة.
• «أنا عند البوابة»: وصلت المدرسة؟ يظهر نداؤك فورًا عند البوابة لتسليم ابنك.
• كل أبنائك في حساب واحد، ولو كانوا في مدارس ومسارات مختلفة.
• أرسل لقريب رابط تتبع مؤقتًا (حتى 24 ساعة) يعرض الباص وحالة رحلة اليوم فقط، وأوقفه متى شئت.
• محادثة مع المدرسة بدل الاتصالات.
• رسوم النقل وفواتيرها، والإبلاغ عن السداد بمرجع التحويل.
• إشعار بالإجازات المدرسية.

للسائقين
• رحلة اليوم وطلابها ومحطاتها بالترتيب، مع الملاحة إلى المحطة التالية في خرائط Google.
• اعتماد المحطة عند الوصول، ولا يُقبل إلا داخل نطاقها الجغرافي وبموقع GPS فعلي.
• تسجيل الصعود والنزول بضغطة، أو بمسح بطاقة الطالب (QR).
• يعمل عند انقطاع الإنترنت: تُحفظ العمليات على الجهاز وتُرسل عند عودة الاتصال.
• فحص الباص اليومي قبل أول رحلة.
• زر بلاغ طارئ يصل لبرج المراقبة مع موقعك.
• واجهة السائق متاحة بالإنجليزية.

لإدارة المدرسة
• برج مراقبة: كل الرحلات الجارية ومواقع الباصات والبلاغات في مكان واحد.
• المسارات ومحطاتها على الخريطة، وإسناد كل طالب لمحطته.
• اعتماد طلبات الطلاب والسائقين، وربط الحسابات تلقائيًا.
• سائق بديل لرحلة واحدة، وفريق المدرسة بأدوار: مشرف نقل وموظف بوابة.
• بطاقات QR للطلاب، والبطاقة المفقودة تُستبدل فتتوقف القديمة فورًا.
• تقويم الإجازات، وتنبيهات صيانة الباصات ووثائقها.
• رسوم النقل: إصدار الفواتير ومتابعة السداد مع تذكير تلقائي.
• سجل موثّق للحضور والانصراف وأحداث كل رحلة، مع التقارير.

الأمان أولًا
• لا تنتهي الرحلة وفي الباص طالب: يرفض التطبيق إنهاءها ويبلّغ المدرسة.
• كل مستخدم يرى ما يخصه فقط: المدرسة طلابها، وولي الأمر أبناءه.
• موقع الباص يُرسل من جوال السائق أثناء الرحلة فقط، ويُحذف تلقائيًا بعد 90 يومًا.
• احذف حسابك من داخل التطبيق في أي وقت.

الأسعار
مجاني لأولياء الأمور والسائقين. باقة المدرسة حسب عدد الباصات والطلاب، ويتواصل معك فريق مساري بعد طلب التفعيل.

كيف تبدأ
• ولي الأمر: يعمل مساري مع المدارس المشتركة فيه. سجّل بالبريد الذي أضافته المدرسة، فيُربط حسابك بأبنائك. مدرسة ابنك غير مشتركة؟ ابحث عنها واضغط «أريد الخدمة في هذه المدرسة».
• إدارة المدرسة: ابحث عن مدرستك واضغط «أنا من إدارة المدرسة»، فيتحقق فريق مساري منك ثم يفعّلها.
```

## English (U.S. or U.K.) — en

**App name** (26/30)
<!-- f:en_name -->
```
Masari: School Bus Tracker
```

**Subtitle** (28/30)
<!-- f:en_sub -->
```
Live bus map & parent alerts
```

**Keywords** (100/100). No spaces after commas, no word repeated from the name or subtitle, no plurals (verified).
<!-- f:en_kw -->
```
transport,student,kids,child,pickup,attendance,driver,gps,location,safety,absence,route,saudi,arabic
```

**Promotional text** (166/170)
<!-- f:en_promo -->
```
Follow your child's school bus on the map during the trip, report an absence before the bus leaves, and know when they board and arrive. Free for parents and drivers.
```

**Description** (3339/4000). The same text is used on Google Play.
<!-- f:en_desc -->
```
Where is your child's school bus right now? With Masari, you know.
Follow the bus on the map during your child's trip, with its location updated every 10 seconds.
Get alerts when the trip starts, when the bus is about 5 minutes away, when your child boards, and when they arrive at school or home.

Masari is a school transport platform that connects parents, drivers and the school in one system: routes, attendance, live tracking and alerts.

For parents
• Live bus location, only during your child's trip.
• Report an absence before the trip starts, so the driver sees "Absent" before leaving. You can also set an absence, self pickup or early leave for upcoming days.
• "I'm at the gate": arrived at school? Your call shows at the gate right away so your child can be handed over.
• All your children in one account, even across different schools and routes.
• Send a relative a temporary tracking link (up to 24 hours) that shows only the bus and today's trip status. Stop it any time.
• Chat with the school instead of phone calls.
• Transport fees and invoices, and report a payment with your bank transfer reference.
• School holiday notices.

For drivers
• Today's trip, students and stops in order, with navigation to the next stop in Google Maps.
• Confirm each stop on arrival. It is accepted only inside the stop's geofence with a real GPS fix.
• Record boarding and drop-off with one tap, or by scanning the student's QR card.
• Works when the internet drops: actions are saved on the phone and sent when the connection returns.
• Daily bus check before the first trip.
• Emergency button that alerts the control tower with your location.
• Driver screens available in English.

For school admins
• Control tower: all running trips, bus locations and reports in one place.
• Routes and stops on the map, with each student assigned to a stop.
• Approve student and driver requests, and accounts link automatically.
• Substitute driver for a single trip, and a school team with roles: transport supervisor and gate staff.
• Student QR cards. A lost card is replaced and the old one stops working at once.
• Holiday calendar, and alerts for bus maintenance and documents.
• Transport fees: issue invoices and track payments, with automatic reminders.
• A dated record of attendance and every trip event, with reports.

Safety first
• A trip cannot end while a student is still on the bus: the app refuses and notifies the school.
• Everyone sees only what is theirs: the school sees its students, a parent sees their own children.
• The bus location comes from the driver's phone during the trip only, and is deleted automatically after 90 days.
• Delete your account from inside the app at any time.

Language
Masari is an Arabic app. Drivers can switch the driver screens to English.

Pricing
Free for parents and drivers. The school plan depends on the number of buses and students. The Masari team contacts the school after it requests activation.

Getting started
• Parents: Masari works with schools that subscribe to it. Sign up with the email your school added and your account links to your children. School not on Masari yet? Find it and tap "I want the service at this school".
• School admins: find your school and tap "I'm from the school administration". The Masari team verifies you and then activates the school.
```

> ملاحظة: الواجهة الإنجليزية في الكود (`app/i18n.ts`) تغطي القوائم وشاشة السائق وفحص الباص والحساب فقط، وشاشات ولي الأمر تبقى عربية في معظمها. لهذا قسم «Language» في الوصف الإنجليزي ضروري حتى لا تأتي تقييمات سلبية من متحدثين بالإنجليزية. ولنفس السبب لا تجعلوا الإنجليزية لغة أساسية للتطبيق في المتجر.

---

# ثانيًا: Google Play

الوصف الكامل في Google Play هو نفس وصف Apple أعلاه (العربي 2455/4000، والإنجليزي 3339/4000). Google يسمح بعنوان حتى 50 حرفًا، لكن التزمنا بـ30 ليتطابق الاسم في المتجرين.

## العربية — ar

**اسم التطبيق** (23/30)
<!-- f:g_ar_name -->
```
مساري: تتبع باص المدرسة
```

**الوصف القصير** (66/80)
<!-- f:ar_short -->
```
تابع باص المدرسة مباشرة، وتنبيهات صعود ابنك ووصوله للمدرسة والمنزل
```

## English — en-US

**App name** (26/30)
<!-- f:g_en_name -->
```
Masari: School Bus Tracker
```

**Short description** (69/80)
<!-- f:en_short -->
```
Track your child's school bus live, with boarding and arrival alerts.
```

---

# ثالثًا: الفئة والتصنيف العمري

| | Apple | Google Play |
|---|---|---|
| الفئة الأساسية | **Education** | **Education** |
| الفئة الثانوية / البديل | Navigation | Maps & Navigation (بديل يُختبر لاحقًا) |
| السبب | من يبحث عن «باص المدرسة» ولي أمر يفكر في المدرسة، والمنافسة في Education على هذه الكلمة أقل من Navigation 🟡 | نفس السبب |

**التصنيف العمري:**
- **Apple:** أجيبوا في الاستبيان بـ«لا يوجد» لكل المحتوى (عنف، جنس، مقامرة، إلخ). «الوصول غير المقيد إلى الويب»: لا. يوجد تواصل بين المستخدمين (محادثة ولي الأمر مع المدرسة)، فأجيبوا عنه بنعم إن سُئل. النتيجة المتوقعة 4+، والحكم النهائي للاستبيان. **لا تختاروا فئة Kids**، فالمستخدمون بالغون.
- **Google (IARC):** المتوقع «للجميع / Everyone» مع العناصر التفاعلية: **Users Interact** (المحادثة) و**Shares Location** (موقع الباص).
- **الجمهور المستهدف في Google Play:** **18 عامًا فأكثر**. الطالب لا يملك حسابًا (سياسة الخصوصية، قسم «الأطفال»)، والمستخدمون أولياء أمور وسائقون وموظفو مدارس. اختيار فئة أصغر يُدخل التطبيق في سياسة «Families» بمتطلباتها.

---

# رابعًا: لقطات الشاشة (7 لقطات بالترتيب)

صوّروها من التطبيق الحقيقي ببيانات المدرسة التجريبية (باص 1، المحطات: الروضة، النهضة، النسيم). لا وجوه ولا أسماء ولا أرقام لأطفال حقيقيين. اكتبوا النص بخط كبير أعلى الشاشة، فأول 3 لقطات هي التي تظهر في نتائج البحث.

| # | النص العربي | English caption | الشاشة الحقيقية |
|---|---|---|---|
| 1 | وين الباص الحين؟ قدامك على الخريطة | Where's the bus? Right on your map | ولي الأمر ← «رحلة اليوم» أثناء رحلة جارية: الخريطة (`trip-map.tsx`) والباص بين محطتين |
| 2 | تعرف لحظة صعوده ووصوله | Know the moment they board and arrive | قائمة «الإشعارات» وفيها: بدأت الرحلة، الباص على بعد 5 دقائق تقريبًا، صعد ابنك الباص، وصل ابنك إلى المدرسة |
| 3 | ولدك غائب؟ بلّغ قبل الرحلة | Absent today? Tell the driver first | ولي الأمر ← «النداء والتصاريح» بعد تسجيل الغياب، وبجانبها شاشة السائق والطالب بحالة «غائب» |
| 4 | المحطة التالية أمامك واعتمادها بضغطة | Next stop in front of you, one tap to confirm | السائق ← «مسارك اليوم»: المحطة الحالية وزر «اعتماد محطة الوصول» ومسافة السائق عن المحطة |
| 5 | ما تنتهي الرحلة وفي الباص طالب | No trip ends with a child still on board | السائق يضغط «إنهاء الرحلة» فتظهر رسالة الرفض «لا يمكن إنهاء الرحلة: ما زال في الباص…» |
| 6 | بلاغ طارئ يوصل موقعك فورًا | Emergency report sends your location instantly | زر «إرسال بلاغ طارئ» عند السائق، أو البلاغ كما يظهر في برج المراقبة |
| 7 | كل باصات مدرستك في شاشة واحدة | Every school bus on one screen | المدرسة ← «برج المراقبة» (`live-control.tsx`) وعليه عدة رحلات جارية |
| 8 (اختيارية) | بطاقة QR لكل طالب | A QR card for every student | بطاقة الطالب (`student-card.tsx`) مع شاشة «مسح بطاقة طالب» عند السائق |

في نسخة المتجر الإنجليزية: اللقطات 4 و5 و6 فقط يمكن تصويرها بواجهة إنجليزية (شاشات السائق). البقية تبقى عربية مع تعليق إنجليزي.

---

# خامسًا: الخصوصية والبيانات (App Privacy في Apple و Data safety في Google)

**الموقع:** بنص التطبيق نفسه (`ios/App/App/Info.plist`):
- «يستخدم مساري موقعك أثناء الرحلة فقط ليرى أولياء الأمور والمدرسة موقع الباص ويُعتمد الوصول للمحطات.»
- «يستمر مساري في إرسال موقع الباص أثناء الرحلة حتى لو كانت الشاشة مطفأة، ويتوقف تلقائيًا عند إنهاء الرحلة.»
- الموقع يُجمع **من جوال السائق فقط** أثناء الرحلة. Android: خدمة أمامية بإشعار ظاهر، بلا `ACCESS_BACKGROUND_LOCATION`. iOS: `UIBackgroundModes = location`. ولي الأمر يحدد موقع المنزل يدويًا على الخريطة (`home-location.tsx`)، ولا يُقرأ موقع جواله.
- مواقع الباص تُحذف تلقائيًا بعد 90 يومًا.

**البيانات التي يُفصَح عنها** (من `app/privacy.tsx`):

| النوع | الأمثلة | مرتبطة بالمستخدم | الغرض |
|---|---|---|---|
| معلومات التواصل | الاسم، البريد، الجوال | نعم | وظائف التطبيق، الحساب |
| الموقع الدقيق | موقع الباص من جوال السائق، وموقع منزل الطالب | نعم | وظائف التطبيق |
| الصور | صورة الطالب (اختيارية، تضيفها المدرسة)، وصورة فحص الباص | نعم | وظائف التطبيق |
| محتوى المستخدم | المحادثات، البلاغات، الملاحظات والتقييمات | نعم | وظائف التطبيق، الدعم |
| معلومات شخصية أخرى | رقم هوية الطالب (اختياري)، رقم رخصة السائق وتاريخ انتهائها | نعم | وظائف التطبيق |
| معلومات مالية أخرى | مرجع التحويل لرسوم النقل (لا دفع داخل التطبيق ولا بطاقات) | نعم | وظائف التطبيق |
| المعرّفات | معرّف المستخدم، ورموز الإشعارات | نعم | وظائف التطبيق |
| التشخيص | أخطاء الواجهة (رسالة الخطأ، الصفحة، نوع المتصفح) في `client_errors` | نعم (`user_id`) | التحليلات / إصلاح الأعطال |

- **التتبع (Apple ATT):** لا. **بيع البيانات أو الإعلانات:** لا («لا نبيع البيانات ولا نستخدمها للإعلانات»).
- **التشفير أثناء النقل:** نعم. **حذف الحساب:** نعم، من «حسابي» ← «حذف الحساب» (`app/delete-account.tsx`). تُحذف البيانات الشخصية، وتبقى سجلات الرحلات لدى المدرسة دون الاسم. بيانات الطالب تملكها المدرسة.
- **مزودو الخدمة:** Supabase (خوادم في مومباي، الهند) وVercel، وTwilio أو Unifonic لرسائل SMS/واتساب إذا فُعّلت. هؤلاء معالجون بالنيابة عنكم، وفي Google لا يُعدّ ذلك «مشاركة».
- **يحتاج مراجعة قانونية 🔴:** سياسة الخصوصية تذكر أن «إدارة التعليم في المنطقة» ترى الرحلات والمدارس. حددوا هل يُعدّ ذلك «مشاركة مع طرف ثالث» في نموذج Data safety.
- **التشفير في Apple:** `ITSAppUsesNonExemptEncryption = false` مضبوط مسبقًا، فلا حاجة لمستندات التصدير.
- **الدفع:** رسوم النقل تحويل بنكي بين ولي الأمر والمدرسة مع إدخال المرجع فقط، واشتراك المدرسة يتم خارج التطبيق. لا يوجد محتوى رقمي يُشترى داخل التطبيق، فلا ينطبق شرط الشراء داخل التطبيق (IAP). اذكروا ذلك في ملاحظات المراجعة.
