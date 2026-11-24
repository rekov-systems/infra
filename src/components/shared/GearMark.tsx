interface GearMarkProps {
  size?: number;
  mono?: boolean;
}

export function GearMark({ size = 28, mono = false }: GearMarkProps) {
  const blue  = mono ? "currentColor" : "#007BFF";
  const green = mono ? "currentColor" : "#10B981";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <g stroke={blue} strokeWidth="3.5" strokeLinecap="round">
        <circle cx="32" cy="32" r="14" fill="none" />
        {Array.from({ length: 8 }).map((_, i) => {
          const a  = (i / 8) * Math.PI * 2;
          const x1 = 32 + Math.cos(a) * 18;
          const y1 = 32 + Math.sin(a) * 18;
          const x2 = 32 + Math.cos(a) * 24;
          const y2 = 32 + Math.sin(a) * 24;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
      </g>
      <circle cx="32" cy="32" r="4.5" fill={green} />
    </svg>
  );
}
