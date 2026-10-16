// شعار المنصة: زر تسجيل داخل إطار فيلم
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
        <rect x="2" y="6" width="36" height="28" rx="9" fill="#1b1530" />
        <circle cx="20" cy="20" r="7.5" fill="#e8492b" />
        <circle cx="20" cy="20" r="3" fill="#fde9e3" />
        {[9, 15, 25, 31].map((x) => (
          <rect key={x} x={x - 1.5} y="9" width="3" height="2.4" rx="1" fill="#fbf8f4" opacity=".5" />
        ))}
      </svg>
      <span className="font-display text-[17px] leading-none">استوديو الإعلانات</span>
    </span>
  );
}
