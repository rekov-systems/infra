import { GearMark } from "@/components/shared/GearMark";
import { LiveDot } from "@/components/shared/LiveDot";
import { User } from "lucide-react";

interface BrandBarProps {
  branch?:   string;
  session?:  string;
  channel?:  string;
  showSync?: boolean;
}

export function BrandBar({
  branch   = "Sucursal",
  session  = "Caja #01",
  channel  = "Local",
  showSync = true,
}: BrandBarProps) {
  return (
    <div className="brand-bar shrink-0">
      {/* Lockup */}
      <div className="flex items-center gap-2.5">
        <GearMark size={28} />
        <div className="lockup-text text-[15px] leading-none">
          POS<span className="text-[#007BFF]">360</span><span className="text-[#10B981]">T</span>
        </div>
      </div>

      <div className="h-5 w-px bg-border shrink-0" />

      {/* Branch */}
      <div>
        <div className="eyebrow text-[9px]">SUCURSAL</div>
        <div className="text-[13px] font-semibold leading-tight mt-0.5">{branch}</div>
      </div>

      <div className="flex-1" />

      {/* Channel pill */}
      <span className="s-pill s-pill-blue">
        <LiveDot kind="blue" />
        {channel}
      </span>

      {/* Sync pill */}
      {showSync && (
        <span className="s-pill s-pill-green">
          <LiveDot kind="green" />
          SYNC OK
        </span>
      )}

      {/* Session */}
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <User size={14} />
        {session}
      </div>
    </div>
  );
}
