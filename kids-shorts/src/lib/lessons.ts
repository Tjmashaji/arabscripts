// دروس جاهزة من بيانات مكتوبة ومراجعة يدويًا (لا ذكاء اصطناعي): تعمل فورًا دون أي مفتاح.
import { BACKGROUNDS, type Age, type Category, type SceneInput, type YoutubeMeta } from "./domain";

export type Lesson = { title: string; scenes: SceneInput[]; youtube: YoutubeMeta };
type Word = [word: string, emoji: string];

// الحروف بالترتيب الهجائي، ولكل حرف كلمات تبدأ به مع رسم من المكتبة
export const LETTERS: { letter: string; name: string; words: Word[] }[] = [
  { letter: "أ", name: "الألف", words: [["أرنب", "🐰"], ["أسد", "🦁"], ["أناناس", "🍍"]] },
  { letter: "ب", name: "الباء", words: [["بطة", "🦆"], ["باب", "🚪"], ["بيت", "🏠"]] },
  { letter: "ت", name: "التاء", words: [["تفاحة", "🍎"], ["تمساح", "🐊"], ["توت", "🫐"]] },
  { letter: "ث", name: "الثاء", words: [["ثعلب", "🦊"], ["ثلج", "❄️"], ["ثوم", "🧄"]] },
  { letter: "ج", name: "الجيم", words: [["جمل", "🐫"], ["جزر", "🥕"], ["جبل", "⛰️"]] },
  { letter: "ح", name: "الحاء", words: [["حصان", "🐴"], ["حليب", "🥛"], ["حوت", "🐋"]] },
  { letter: "خ", name: "الخاء", words: [["خروف", "🐑"], ["خبز", "🍞"], ["خيمة", "⛺"]] },
  { letter: "د", name: "الدال", words: [["دب", "🐻"], ["دجاجة", "🐔"], ["دلفين", "🐬"]] },
  { letter: "ذ", name: "الذال", words: [["ذئب", "🐺"], ["ذرة", "🌽"], ["ذبابة", "🪰"]] },
  { letter: "ر", name: "الراء", words: [["ريشة", "🪶"], ["رسم", "🎨"]] },
  { letter: "ز", name: "الزاي", words: [["زرافة", "🦒"], ["زهرة", "🌸"], ["زيتون", "🫒"]] },
  { letter: "س", name: "السين", words: [["سمكة", "🐟"], ["سيارة", "🚗"], ["ساعة", "⌚"]] },
  { letter: "ش", name: "الشين", words: [["شمس", "☀️"], ["شجرة", "🌳"], ["شمعة", "🕯️"]] },
  { letter: "ص", name: "الصاد", words: [["صاروخ", "🚀"], ["صندوق", "📦"], ["صدفة", "🐚"]] },
  { letter: "ض", name: "الضاد", words: [["ضفدع", "🐸"], ["ضوء", "💡"], ["ضرس", "🦷"]] },
  { letter: "ط", name: "الطاء", words: [["طائرة", "✈️"], ["طماطم", "🍅"], ["طبل", "🥁"]] },
  { letter: "ظ", name: "الظاء", words: [["ظرف", "✉️"], ["ظبي", "🦌"]] },
  { letter: "ع", name: "العين", words: [["عنب", "🍇"], ["عصفور", "🐦"], ["عين", "👁️"]] },
  { letter: "غ", name: "الغين", words: [["غيمة", "☁️"], ["غزال", "🦌"], ["غوريلا", "🦍"]] },
  { letter: "ف", name: "الفاء", words: [["فيل", "🐘"], ["فراشة", "🦋"], ["فراولة", "🍓"]] },
  { letter: "ق", name: "القاف", words: [["قطة", "🐱"], ["قمر", "🌙"], ["قلم", "✏️"]] },
  { letter: "ك", name: "الكاف", words: [["كلب", "🐶"], ["كتاب", "📖"], ["كرة", "⚽"]] },
  { letter: "ل", name: "اللام", words: [["ليمون", "🍋"], ["لعبة", "🧸"]] },
  { letter: "م", name: "الميم", words: [["موز", "🍌"], ["مفتاح", "🔑"], ["مطر", "🌧️"]] },
  { letter: "ن", name: "النون", words: [["نحلة", "🐝"], ["نمر", "🐯"], ["نجمة", "⭐"]] },
  { letter: "هـ", name: "الهاء", words: [["هدية", "🎁"], ["هاتف", "📱"], ["هلال", "🌙"]] },
  { letter: "و", name: "الواو", words: [["وردة", "🌹"], ["ورقة", "🍃"], ["وطواط", "🦇"]] },
  { letter: "ي", name: "الياء", words: [["يد", "✋"], ["يمامة", "🕊️"], ["يقطين", "🎃"]] },
];

const NUMBERS: { n: number; word: string; digit: string; emoji: string; thing: string }[] = [
  { n: 1, word: "واحد", digit: "١", emoji: "🍎", thing: "تفاحة واحدة" },
  { n: 2, word: "اثنان", digit: "٢", emoji: "🦆", thing: "بطتان" },
  { n: 3, word: "ثلاثة", digit: "٣", emoji: "⭐", thing: "ثلاث نجمات" },
  { n: 4, word: "أربعة", digit: "٤", emoji: "🎈", thing: "أربعة بالونات" },
  { n: 5, word: "خمسة", digit: "٥", emoji: "🍌", thing: "خمس موزات" },
  { n: 6, word: "ستة", digit: "٦", emoji: "🐟", thing: "ست سمكات" },
  { n: 7, word: "سبعة", digit: "٧", emoji: "🌸", thing: "سبع زهرات" },
  { n: 8, word: "ثمانية", digit: "٨", emoji: "🐝", thing: "ثماني نحلات" },
  { n: 9, word: "تسعة", digit: "٩", emoji: "🍓", thing: "تسع حبات فراولة" },
  { n: 10, word: "عشرة", digit: "١٠", emoji: "🐞", thing: "عشر دعسوقات" },
];

// لكل لون أمثلة بجملتها كاملة (تذكير وتأنيث صحيح)
export const COLORS: { id: string; name: string; bg: string; things: [label: string, emoji: string, sentence: string][] }[] = [
  { id: "red", name: "الأحمر", bg: "#E53935", things: [["التفاحة", "🍎", "التفاحة حمراء"], ["الفراولة", "🍓", "الفراولة حمراء"], ["الطماطم", "🍅", "الطماطم حمراء"]] },
  { id: "yellow", name: "الأصفر", bg: "#FBC02D", things: [["الموز", "🍌", "الموز أصفر"], ["الشمس", "☀️", "الشمس صفراء"], ["الليمون", "🍋", "الليمون أصفر"]] },
  { id: "blue", name: "الأزرق", bg: "#1E88E5", things: [["الحوت", "🐋", "الحوت أزرق"], ["قطرة الماء", "💧", "قطرة الماء زرقاء"], ["الموج", "🌊", "موج البحر أزرق"]] },
  { id: "green", name: "الأخضر", bg: "#43A047", things: [["الشجرة", "🌳", "الشجرة خضراء"], ["الضفدع", "🐸", "الضفدع أخضر"], ["الخيار", "🥒", "الخيار أخضر"]] },
  { id: "orange", name: "البرتقالي", bg: "#FB8C00", things: [["البرتقالة", "🍊", "البرتقالة برتقالية"], ["الجزر", "🥕", "الجزر برتقالي"], ["اليقطين", "🎃", "اليقطين برتقالي"]] },
  { id: "purple", name: "البنفسجي", bg: "#8E24AA", things: [["العنب", "🍇", "العنب بنفسجي"], ["الباذنجان", "🍆", "الباذنجان بنفسجي"]] },
  { id: "brown", name: "البني", bg: "#6D4C41", things: [["الدب", "🐻", "الدب بني"], ["البسكويت", "🍪", "البسكويت بني"]] },
  { id: "white", name: "الأبيض", bg: "#90A4AE", things: [["الغيمة", "☁️", "الغيمة بيضاء"], ["الخروف", "🐑", "صوف الخروف أبيض"], ["الحليب", "🥛", "الحليب أبيض"]] },
];

export const SHAPES: { id: string; name: string; intro: string; icon: string; things: Word[] }[] = [
  { id: "circle", intro: "هذه دائرة", name: "الدائرة", icon: "🔵", things: [["الكرة", "⚽"], ["البسكويتة", "🍪"], ["الساعة", "⏰"]] },
  { id: "square", intro: "هذا مربع", name: "المربع", icon: "🟦", things: [["الصندوق", "📦"], ["الهدية", "🎁"]] },
  { id: "triangle", intro: "هذا مثلث", name: "المثلث", icon: "🔺", things: [["قطعة البيتزا", "🍕"], ["الخيمة", "⛺"], ["الجبل", "⛰️"]] },
  { id: "star", intro: "هذه نجمة", name: "النجمة", icon: "⭐", things: [["النجمة اللامعة", "🌟"]] },
  { id: "heart", intro: "هذا قلب", name: "القلب", icon: "❤️", things: [] },
];

export const ANIMALS: { id: string; name: string; emoji: string; facts: string[]; home: string }[] = [
  { id: "cow", name: "البقرة", emoji: "🐄", facts: ["البقرة تعطينا الحليب", "تأكل البقرة العشب الأخضر"], home: "تعيش في المزرعة" },
  { id: "camel", name: "الجمل", emoji: "🐫", facts: ["الجمل يصبر على العطش أيامًا", "له سنام على ظهره"], home: "يعيش في الصحراء" },
  { id: "elephant", name: "الفيل", emoji: "🐘", facts: ["الفيل أكبر حيوان على اليابسة", "يشرب الماء بخرطومه الطويل"], home: "يعيش في الغابات والسهول" },
  { id: "bee", name: "النحلة", emoji: "🐝", facts: ["النحلة تصنع العسل", "تطير من زهرة إلى زهرة"], home: "تعيش في خلية" },
  { id: "penguin", name: "البطريق", emoji: "🐧", facts: ["البطريق طائر لا يطير", "يسبح في الماء البارد بسرعة"], home: "يعيش في الأماكن الباردة" },
  { id: "turtle", name: "السلحفاة", emoji: "🐢", facts: ["السلحفاة تمشي ببطء", "تحمل بيتها على ظهرها"], home: "تعيش في البر والبحر" },
  { id: "owl", name: "البومة", emoji: "🦉", facts: ["البومة تستيقظ في الليل", "لها عينان كبيرتان"], home: "تعيش في الأشجار" },
  { id: "octopus", name: "الأخطبوط", emoji: "🐙", facts: ["للأخطبوط ثماني أذرع", "يختبئ بين الصخور"], home: "يعيش في البحر" },
];

export const MANNERS: { id: string; name: string; scenes: [string, string, string[]][] }[] = [
  {
    id: "handwash", name: "غسل اليدين",
    scenes: [
      ["قبل الأكل نغسل أيدينا", "قبل الأكل", ["🍎", "✋"]],
      ["نبلل اليدين بالماء", "نبلل بالماء", ["💧", "✋"]],
      ["نفرك اليدين بالصابون جيدًا", "نفرك بالصابون", ["🧼"]],
      ["نشطف ثم ننشف أيدينا", "نشطف وننشف", ["💧", "👏"]],
    ],
  },
  {
    id: "thanks", name: "قول شكرًا",
    scenes: [
      ["عندما يساعدنا أحد نقول: شكرًا", "شكرًا", ["🙏"]],
      ["إذا أعطتك أمك هدية قل: شكرًا يا أمي", "شكرًا يا أمي", ["🎁", "🥰"]],
      ["الكلمة الطيبة تسعد الجميع", "الكلمة الطيبة", ["😀", "❤️"]],
    ],
  },
  {
    id: "sharing", name: "المشاركة",
    scenes: [
      ["نشارك ألعابنا مع أصدقائنا", "نشارك الألعاب", ["🧸", "🤝"]],
      ["نلعب معًا بالدور", "نلعب بالدور", ["⚽", "🧒"]],
      ["المشاركة تجعلنا أصدقاء", "أصدقاء", ["🤝", "❤️"]],
    ],
  },
  {
    id: "teeth", name: "تنظيف الأسنان",
    scenes: [
      ["ننظف أسناننا كل صباح ومساء", "صباحًا ومساءً", ["☀️", "🌙"]],
      ["نضع قليلًا من المعجون على الفرشاة", "الفرشاة والمعجون", ["🪥"]],
      ["نفرك الأسنان برفق من كل جهة", "برفق", ["🦷", "🪥"]],
    ],
  },
  {
    id: "tidy", name: "ترتيب الألعاب",
    scenes: [
      ["بعد اللعب نرتب ألعابنا", "نرتب الألعاب", ["🧸", "🧩"]],
      ["نضع كل لعبة في الصندوق", "في الصندوق", ["📦"]],
      ["الغرفة المرتبة جميلة", "غرفة جميلة", ["🛏️", "🌟"]],
    ],
  },
];

// المواضيع المتاحة لكل مجال (للاختيار في المعالج)
export function subjectsFor(category: Category): { value: string; label: string }[] {
  switch (category) {
    case "letters": return LETTERS.map((l) => ({ value: l.letter, label: `حرف ${l.name} (${l.letter})` }));
    case "numbers": return [{ value: "1-5", label: "من ١ إلى ٥" }, { value: "6-10", label: "من ٦ إلى ١٠" }, { value: "1-10", label: "من ١ إلى ١٠" }];
    case "colors": return COLORS.map((c) => ({ value: c.id, label: `اللون ${c.name}` }));
    case "shapes": return [{ value: "basic", label: "الأشكال الأساسية" }, ...SHAPES.map((s) => ({ value: s.id, label: s.name }))];
    case "animals": return ANIMALS.map((a) => ({ value: a.id, label: a.name }));
    case "manners": return MANNERS.map((m) => ({ value: m.id, label: m.name }));
    case "custom": return [];
  }
}

const TAGS = ["تعليم الأطفال", "أطفال", "تعليم", "Arabic for kids", "Shorts"];
let bgIndex = 0;
const nextBg = () => BACKGROUNDS[bgIndex++ % BACKGROUNDS.length];
const sid = (i: number) => `s${i + 1}`;
const finish = (scenes: Omit<SceneInput, "id">[]): SceneInput[] => scenes.map((s, i) => ({ id: sid(i), ...s }));

function meta(title: string, description: string, tags: string[]): YoutubeMeta {
  const t = `${title} #Shorts`;
  return { title: t.length <= 100 ? t : title.slice(0, 100), description: `${description}\n\n#تعليم_الأطفال #Shorts`, tags: [...tags, ...TAGS].slice(0, 15) };
}

const outro = (age: Age): Omit<SceneInput, "id"> => ({
  narration: age === "3-5" ? "أحسنت يا بطل! إلى اللقاء" : "أحسنت! تعلمنا اليوم شيئًا جديدًا. إلى اللقاء",
  text: "أحسنت!",
  emoji: ["🌟", "👏"],
  bg: "#7986CB",
});

export function buildLesson(category: Category, subject: string, age: Age): Lesson | null {
  bgIndex = Math.abs([...subject].reduce((a, c) => a + c.charCodeAt(0), 0)) % BACKGROUNDS.length;
  if (category === "letters") {
    const l = LETTERS.find((x) => x.letter === subject);
    if (!l) return null;
    const words = age === "3-5" ? l.words.slice(0, 2) : l.words;
    const scenes: Omit<SceneInput, "id">[] = [
      { narration: `هيا نتعلم حرف ${l.name}!`, text: `حرف ${l.name}`, emoji: ["🤩"], bg: nextBg() },
      { narration: `هذا حرف ${l.name}. ${l.letter}`, text: l.letter, emoji: [], bg: nextBg() },
      ...words.map(([w, e]) => ({ narration: `${w}. ${w} تبدأ بحرف ${l.name}`, text: w, emoji: [e], bg: nextBg() })),
    ];
    if (age === "6-8") scenes.push({ narration: `هل تعرف كلمة أخرى تبدأ بحرف ${l.name}؟`, text: `كلمة أخرى بحرف ${l.letter}؟`, emoji: ["🤔"], bg: nextBg() });
    scenes.push(outro(age));
    return { title: `حرف ${l.name}`, scenes: finish(scenes), youtube: meta(`تعلم حرف ${l.name} (${l.letter}) للأطفال`, `درس قصير لتعليم الأطفال حرف ${l.name} مع كلمات تبدأ به: ${words.map((w) => w[0]).join("، ")}.`, [`حرف ${l.name}`, "الحروف العربية", "تعليم الحروف"]) };
  }
  if (category === "numbers") {
    const [from, to] = subject.split("-").map(Number);
    if (!from || !to || from > to || to > 10) return null;
    const list = NUMBERS.filter((n) => n.n >= from && n.n <= to);
    const scenes: Omit<SceneInput, "id">[] = [
      { narration: `هيا نعدّ معًا من ${list[0].word} إلى ${list[list.length - 1].word}!`, text: "هيا نعدّ!", emoji: ["🤩"], bg: nextBg() },
      // أكثر من ستة رموز يزدحم في الشاشة، فنكتفي بالرقم للأعداد الكبيرة
      ...list.map((n) => ({ narration: age === "3-5" ? `${n.word}. ${n.thing}` : `${n.word}. لدينا ${n.thing}`, text: n.digit, emoji: n.n <= 6 ? Array(n.n).fill(n.emoji) : [n.emoji], bg: nextBg() })),
      outro(age),
    ];
    return { title: `الأرقام ${list[0].digit}–${list[list.length - 1].digit}`, scenes: finish(scenes), youtube: meta(`تعلم العد من ${list[0].digit} إلى ${list[list.length - 1].digit} للأطفال`, "درس قصير لتعليم الأطفال الأرقام العربية والعد بالصور.", ["الأرقام", "تعليم العد", "أرقام عربية"]) };
  }
  if (category === "colors") {
    const c = COLORS.find((x) => x.id === subject);
    if (!c) return null;
    const scenes: Omit<SceneInput, "id">[] = [
      { narration: `ما هذا اللون؟ هذا هو اللون ${c.name}!`, text: c.name, emoji: ["🎨"], bg: c.bg },
      ...c.things.map(([w, e, sentence]) => ({ narration: sentence, text: w, emoji: [e], bg: c.bg })),
      { narration: `ابحث حولك عن شيء لونه ${c.name}`, text: "ابحث حولك!", emoji: ["🤔"], bg: c.bg },
      outro(age),
    ];
    return { title: `اللون ${c.name}`, scenes: finish(scenes), youtube: meta(`تعلم اللون ${c.name} للأطفال`, `درس قصير لتعليم الأطفال اللون ${c.name} بأمثلة من حولهم.`, ["الألوان", `اللون ${c.name}`, "تعليم الألوان"]) };
  }
  if (category === "shapes") {
    const list = subject === "basic" ? SHAPES.slice(0, 3) : SHAPES.filter((s) => s.id === subject);
    if (!list.length) return null;
    const scenes: Omit<SceneInput, "id">[] = [
      { narration: list.length > 1 ? "هيا نتعرف على الأشكال!" : `هيا نتعرف على ${list[0].name}!`, text: "الأشكال", emoji: ["🔺", "🔵", "🟦"], bg: nextBg() },
    ];
    for (const s of list) {
      scenes.push({ narration: s.intro, text: s.name, emoji: [s.icon], bg: nextBg() });
      for (const [w, e] of s.things.slice(0, list.length > 1 ? 1 : 3)) scenes.push({ narration: `${w} على شكل ${s.name.replace(/^ال/, "")}`, text: w, emoji: [e], bg: nextBg() });
    }
    scenes.push(outro(age));
    return { title: list.length > 1 ? "الأشكال الأساسية" : list[0].name, scenes: finish(scenes), youtube: meta(`تعلم ${list.length > 1 ? "الأشكال" : "شكل " + list[0].name} للأطفال`, "درس قصير لتعليم الأطفال الأشكال بأمثلة من حياتهم.", ["الأشكال", "تعليم الأشكال"]) };
  }
  if (category === "animals") {
    const a = ANIMALS.find((x) => x.id === subject);
    if (!a) return null;
    const scenes: Omit<SceneInput, "id">[] = [
      { narration: `من هذا الحيوان؟ إنه ${a.name}!`, text: a.name, emoji: [a.emoji], bg: nextBg() },
      { narration: `${a.name} ${a.home}`, text: a.home, emoji: [a.emoji], bg: nextBg() },
      ...(age === "3-5" ? a.facts.slice(0, 1) : a.facts).map((f) => ({ narration: f, text: "", emoji: [a.emoji], bg: nextBg() })),
      outro(age),
    ];
    return { title: a.name, scenes: finish(scenes), youtube: meta(`تعرف على ${a.name} | معلومات للأطفال`, `درس قصير يعرّف الأطفال على ${a.name}: ${a.facts.join("، ")}.`, ["الحيوانات", a.name, "معلومات للأطفال"]) };
  }
  if (category === "manners") {
    const m = MANNERS.find((x) => x.id === subject);
    if (!m) return null;
    const scenes: Omit<SceneInput, "id">[] = [
      { narration: `هيا نتعلم ${m.name}!`, text: m.name, emoji: ["🧒"], bg: nextBg() },
      ...m.scenes.map(([n, t, e]) => ({ narration: n, text: t, emoji: e, bg: nextBg() })),
      outro(age),
    ];
    return { title: m.name, scenes: finish(scenes), youtube: meta(`${m.name} | آداب وعادات للأطفال`, `درس قصير يعلّم الأطفال ${m.name} بخطوات بسيطة.`, ["آداب الأطفال", m.name, "عادات صحية"]) };
  }
  return null;
}
