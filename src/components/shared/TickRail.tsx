interface TickItem {
  key: string;
  value: string;
}

interface TickRailProps {
  items: TickItem[];
}

export function TickRail({ items }: TickRailProps) {
  return (
    <div className="tick-rail overflow-hidden font-mono text-[11px]">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5 shrink-0">
          <span className="tk-key">{item.key}</span>
          <span className="tk-val">{item.value}</span>
          {i < items.length - 1 && <span className="tk-sep mx-1">·</span>}
        </span>
      ))}
    </div>
  );
}
