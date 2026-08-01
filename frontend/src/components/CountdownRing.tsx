interface Props {
  /** Seconds left. */
  remaining: number;
  /** Seconds the ring represents when full. */
  total: number;
  label: string;
  colour?: string;
  size?: number;
}

/**
 * Circular progress for anything that expires — session keys, challenge TTL,
 * recovery timelocks. The arc drains as time runs out.
 */
export function CountdownRing({
  remaining,
  total,
  label,
  colour = "var(--violet)",
  size = 96,
}: Props) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const offset = circumference * (1 - fraction);

  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.09)"
          strokeWidth="6"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
          style={{ transition: "stroke-dashoffset 0.9s linear" }}
        />
      </svg>
      <span className="ring-label" style={{ color: colour }}>
        {label}
      </span>
    </div>
  );
}
