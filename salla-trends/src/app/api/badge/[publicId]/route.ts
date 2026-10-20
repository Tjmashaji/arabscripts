import { publicVerification } from "@/server/public";

// شارة SVG تتبع الحالة الحالية: إذا سُحب التوثيق تتغير الشارة في كل المتاجر التي تعرضها
export async function GET(_: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const s = await publicVerification(publicId);
  const ok = Boolean(s?.verified && s.active);
  const label = ok ? "متجر موثق" : "غير موثق";
  const color = ok ? "#0d5c55" : "#6f8080";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="168" height="40" viewBox="0 0 168 40" role="img" aria-label="${label}">
<rect width="168" height="40" rx="10" fill="${color}"/>
<g transform="translate(130 8)"><path fill="#fff" d="M12 1.5l2.6 1.9 3.2-.1 1 3.1 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3.1-3.2-.1L12 22.5l-2.6-1.9-3.2.1-1-3.1-2.6-1.9 1-3.1-1-3.1 2.6-1.9 1-3.1 3.2.1z"/>${ok ? `<path fill="${color}" d="M10.6 15.6l-3.2-3.2 1.4-1.4 1.8 1.8 4.6-4.6 1.4 1.4z"/>` : ""}</g>
<text x="120" y="17" fill="#fff" font-family="Tahoma, Arial, sans-serif" font-size="14" font-weight="700" text-anchor="end" dominant-baseline="central">${label}</text>
<text x="120" y="33" fill="#ffffffb3" font-family="Tahoma, Arial, sans-serif" font-size="8" text-anchor="end">رادار الترند</text>
</svg>`;
  return new Response(svg, {
    status: s ? 200 : 404,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=300",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
      "x-content-type-options": "nosniff",
    },
  });
}
