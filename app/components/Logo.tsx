/**
 * nQkai のロゴ。円相（enso）＝「Q」をモチーフにしたマーク。
 * 落款（seal）としても使い、円相・落款・アプリマークを同じ形にそろえる。
 */
export function LogoMark({
  size = 28,
  tone = "ink",
  className,
}: {
  size?: number;
  tone?: "ink" | "seal" | "reverse";
  className?: string;
}) {
  const bg = tone === "seal" ? "none" : tone === "reverse" ? "#eef0e9" : "currentColor";
  const stroke = tone === "seal" ? "#a8432b" : tone === "reverse" ? "#1c1a16" : "#eef0e9";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" className={className}>
      <title>nQkai</title>
      {bg !== "none" ? (
        <rect width="32" height="32" rx={tone === "seal" ? 4 : 8} fill={bg} />
      ) : null}
      <circle
        cx="16"
        cy="16"
        r="7.5"
        fill="none"
        stroke={stroke}
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
        stroke={stroke}
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
      <LogoMark size={size} className="text-sumi" />
      {withWordmark ? (
        <span className="font-mincho text-lg font-medium tracking-[0.12em] text-sumi">nQkai</span>
      ) : null}
    </span>
  );
}

/** 特選の落款。押印のモーション（reduced-motion 尊重は CSS 側）。 */
export function Seal({ size = 22, animate = false }: { size?: number; animate?: boolean }) {
  return (
    <span
      role="img"
      aria-label="特選"
      className={`inline-block ${animate ? "seal-in" : ""}`}
      style={{ transform: "rotate(-4deg)" }}
    >
      <LogoMark size={size} tone="seal" />
    </span>
  );
}
