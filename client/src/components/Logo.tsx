// SignalForge logo — a "signal forged into a spark" motif:
// an anvil base (forge) topped by an upward signal bolt / ascending bars.
export function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-label="SignalForge logo"
      className={className}
    >
      {/* forge / anvil base */}
      <rect x="4" y="24" width="24" height="3.5" rx="1.5" fill="currentColor" opacity="0.4" />
      {/* ascending signal bars forged upward */}
      <rect x="6" y="17" width="4" height="5" rx="1" fill="currentColor" opacity="0.55" />
      <rect x="13" y="12" width="4" height="10" rx="1" fill="currentColor" opacity="0.8" />
      {/* the spark / lead bolt */}
      <path
        d="M22 3 L16.5 14 H21 L19 22 L26 11 H21.5 L24 3 Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function LogoWordmark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5" data-testid="logo-signalforge">
      <span className="text-primary">
        <Logo size={26} />
      </span>
      {!collapsed && (
        <span className="text-[15px] font-bold tracking-tight leading-none">
          Signal<span className="text-primary">Forge</span>
        </span>
      )}
    </div>
  );
}
