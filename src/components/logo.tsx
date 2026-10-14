export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect width="40" height="40" rx="9" fill="#C8102E" />
      <path d="M8 27 L16 15 L21 21 L25 16 L32 27 Z" fill="#fff" />
      <rect x="8" y="29" width="24" height="3" rx="1.5" fill="#14213D" opacity="0.9" />
    </svg>
  );
}

export function Logo({ src, light = false, subtitle = true }: { src?: string; light?: boolean; subtitle?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="Logo SIGAP" className="h-9 w-9 rounded-lg object-contain" />
      ) : (
        <LogoMark />
      )}
      <span className="leading-tight">
        <span className={`block text-lg font-extrabold tracking-tight ${light ? "text-white" : "text-navy"}`}>SIGAP</span>
        {subtitle && (
          <span className={`block text-[10px] font-medium uppercase tracking-wider ${light ? "text-white/70" : "text-gray-500"}`}>
            Gerak &amp; Penugasan
          </span>
        )}
      </span>
    </span>
  );
}
