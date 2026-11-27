interface GearMarkProps {
  size?: number;
  mono?: boolean;
}

/** Same Desk mark as desk.rekov.co: orange tile, letter D. */
export function GearMark({ size = 28, mono = false }: GearMarkProps) {
  const radius = Math.round(size * (9 / 31));
  const corner = Math.max(2, Math.round(size * (3 / 31)));
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: `${radius}px ${radius}px ${radius}px ${corner}px`,
        background: mono ? "currentColor" : "linear-gradient(145deg, #ff8a45, #ff5a1f)",
        display: "grid",
        placeItems: "center",
        color: mono ? "inherit" : "#171717",
        fontWeight: 900,
        fontFamily: '"Space Grotesk", "DM Sans", sans-serif',
        fontSize: Math.round(size * 0.62),
        lineHeight: 1,
        transform: "rotate(-8deg)",
        boxShadow: mono ? undefined : "0 5px 18px rgba(255, 90, 31, 0.35)",
        flexShrink: 0,
      }}
    >
      D
    </span>
  );
}
