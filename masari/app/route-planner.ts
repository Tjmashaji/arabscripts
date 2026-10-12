// اقتراح المسارات من مواقع منازل الطلاب (يعمل في المتصفح، بلا خدمات خارجية):
// 1) تجميع البيوت المتقاربة (ضمن 250م) في محطة واحدة.
// 2) توزيع المحطات على الباصات بطريقة «المسح الزاوي» حول المدرسة مع احترام سعة الباص.
// 3) ترتيب محطات كل مسار: من الأبعد عن المدرسة ثم الأقرب فالأقرب، مع تحسين 2-opt.
// المسافات تقريبية (خط مستقيم × 1.4 للطرق)، والمدرسة تراجع الاقتراح قبل إنشائه.

export type Point = { lat: number; lng: number };
export type PlannerStudent = { id: string; name: string; lat: number; lng: number };
export type PlannedStop = Point & { label: string; students: PlannerStudent[] };
export type PlannedRoute = { stops: PlannedStop[]; students: number; distanceKm: number; minutes: number };

const R = 6371000;
export const distM = (a: Point, b: Point) => {
  const dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const ROAD_FACTOR = 1.4, SPEED_MS = 25000 / 3600, STOP_MIN = 1.5;

const stopLabel = (students: PlannerStudent[]) => {
  const first = students.map((x) => x.name.split(" ")[0]);
  return `محطة ${first.slice(0, 2).join(" و")}${first.length > 2 ? ` و${first.length - 2} آخرين` : ""}`;
};

export function clusterStops(students: PlannerStudent[], radiusM = 250): PlannedStop[] {
  const stops: PlannedStop[] = [];
  for (const s of students) {
    const near = stops.find((st) => distM(st, s) <= radiusM);
    if (near) {
      near.students.push(s);
      near.lat = near.students.reduce((a, x) => a + x.lat, 0) / near.students.length;
      near.lng = near.students.reduce((a, x) => a + x.lng, 0) / near.students.length;
    } else stops.push({ lat: s.lat, lng: s.lng, label: "", students: [s] });
  }
  for (const st of stops) st.label = stopLabel(st.students);
  return stops;
}

const routeLength = (stops: Point[], school: Point) => {
  let d = 0;
  for (let i = 0; i < stops.length; i++) d += distM(stops[i], i + 1 < stops.length ? stops[i + 1] : school);
  return d;
};

// ترتيب المحطات: البداية من الأبعد، ثم أقرب جار، ثم 2-opt
export function orderStops(stops: PlannedStop[], school: Point): PlannedStop[] {
  if (stops.length <= 1) return stops;
  const rest = [...stops];
  rest.sort((a, b) => distM(b, school) - distM(a, school));
  const order = [rest.shift()!];
  while (rest.length) {
    const last = order[order.length - 1];
    let bi = 0;
    for (let i = 1; i < rest.length; i++) if (distM(last, rest[i]) < distM(last, rest[bi])) bi = i;
    order.push(rest.splice(bi, 1)[0]);
  }
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < order.length - 1; i++) for (let j = i + 1; j < order.length; j++) {
      const cand = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
      if (routeLength(cand, school) + 1 < routeLength(order, school)) { order.splice(0, order.length, ...cand); improved = true; }
    }
  }
  return order;
}

export function suggestRoutes(students: PlannerStudent[], school: Point, capacity: number, radiusM = 250): PlannedRoute[] {
  if (!students.length) return [];
  const cap = Math.max(1, capacity);
  const stops = clusterStops(students, radiusM);
  // المسح الزاوي: نرتب المحطات حسب الاتجاه من المدرسة، ونبدأ من أكبر فجوة زاوية حتى لا نقسم حيًا متصلًا
  const angle = (p: Point) => Math.atan2(p.lat - school.lat, (p.lng - school.lng) * Math.cos(school.lat * Math.PI / 180));
  const sorted = [...stops].sort((a, b) => angle(a) - angle(b));
  let gapAt = 0, gap = -1;
  for (let i = 0; i < sorted.length; i++) {
    const a1 = angle(sorted[i]), a2 = angle(sorted[(i + 1) % sorted.length]) + (i + 1 === sorted.length ? 2 * Math.PI : 0);
    if (a2 - a1 > gap) { gap = a2 - a1; gapAt = (i + 1) % sorted.length; }
  }
  const sweep = [...sorted.slice(gapAt), ...sorted.slice(0, gapAt)];
  const groups: PlannedStop[][] = [];
  let cur: PlannedStop[] = [], count = 0;
  for (const st of sweep) {
    // محطة أكبر من السعة تُقسم على أكثر من باص
    let pending = [...st.students];
    while (pending.length) {
      const room = cap - count;
      if (room <= 0) { groups.push(cur); cur = []; count = 0; continue; }
      const take = pending.slice(0, room); pending = pending.slice(room);
      cur.push({ ...st, students: take, label: take.length === st.students.length ? st.label : stopLabel(take) }); count += take.length;
    }
  }
  if (cur.length) groups.push(cur);
  return groups.map((g) => {
    const ordered = orderStops(g, school);
    const meters = routeLength(ordered, school) * ROAD_FACTOR;
    return { stops: ordered, students: g.reduce((a, s) => a + s.students.length, 0), distanceKm: Math.round(meters / 100) / 10, minutes: Math.round(meters / SPEED_MS / 60 + ordered.length * STOP_MIN) };
  });
}
