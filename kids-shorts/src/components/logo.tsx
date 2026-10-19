// الشعار: شاشة عمودية مبتسمة بزر تشغيل
export function Logo({ size = 34, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
        <rect x="9" y="3" width="22" height="34" rx="6" fill="#6C4CF1" />
        <rect x="12" y="7" width="16" height="22" rx="3" fill="#FFC93C" />
        <path d="M18 13.5v7l6-3.5z" fill="#1F1A3D" />
        <circle cx="20" cy="33" r="1.8" fill="#FFC93C" />
      </svg>
      {withText ? <span className="font-display text-lg leading-none">شورتس الأطفال</span> : null}
    </span>
  );
}

// أيقونة يوتيوب (lucide لم تعد تتضمن شعارات العلامات التجارية)
export function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8ZM9.7 15.1V8.9L15.5 12z" />
    </svg>
  );
}
