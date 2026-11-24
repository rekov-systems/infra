import Branches from "@/modules/branches/Branches";

// Reuse the existing Branches module. It already includes header + create/edit/toggle.
export default function BranchesSettings() {
  return (
    <div className="-m-6">
      <Branches />
    </div>
  );
}
