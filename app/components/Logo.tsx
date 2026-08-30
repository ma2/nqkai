/**
 * nQkai のロゴ。
 * マークは「Q＝円相（enso）」をモチーフにした小さな図形。ワードマークはアプリのフォントを使う。
 */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" className={className}>
      <title>nQkai</title>
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <circle
        cx="16"
        cy="16"
        r="7.5"
        fill="none"
        stroke="#fafaf9"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="40 7"
        transform="rotate(35 16 16)"
      />
      <line
        x1="19"
        y1="19"
        x2="24"
        y2="24"
        stroke="#fafaf9"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({
  size = 28,
  withWordmark = true,
  className,
}: {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <LogoMark size={size} className="text-stone-900" />
      {withWordmark ? (
        <span className="text-lg font-bold tracking-tight text-stone-900">nQkai</span>
      ) : null}
    </span>
  );
}
