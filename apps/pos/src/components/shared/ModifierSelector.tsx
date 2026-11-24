import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";

export interface SelectedModifier {
  option_id: string;
  group_id: string;
  name: string;
  price_delta: number;
}

interface Props {
  productId: string;
  selected: SelectedModifier[];
  onChange: (modifiers: SelectedModifier[]) => void;
}

export function ModifierSelector({ productId, selected, onChange }: Props) {
  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["modifier-groups", productId],
    enabled: !!productId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("modifier_groups")
        .select("*, modifier_options(*)")
        .eq("product_id", productId)
        .order("sort_order");
      return (data ?? []).filter((g: any) => (g.modifier_options ?? []).filter((o: any) => o.is_available).length > 0);
    },
  });

  if (isLoading || groups.length === 0) return null;

  const toggle = (group: any, option: any) => {
    const alreadySelected = selected.some(s => s.option_id === option.id);
    const groupSelected = selected.filter(s => s.group_id === group.id);

    if (alreadySelected) {
      onChange(selected.filter(s => s.option_id !== option.id));
    } else {
      if (groupSelected.length >= group.max_selections) {
        // Replace oldest in group
        const withoutOldest = selected.filter(s => s.option_id !== groupSelected[0].option_id);
        onChange([...withoutOldest, { option_id: option.id, group_id: group.id, name: option.name, price_delta: Number(option.price_delta) }]);
      } else {
        onChange([...selected, { option_id: option.id, group_id: group.id, name: option.name, price_delta: Number(option.price_delta) }]);
      }
    }
  };

  return (
    <div className="space-y-4 pt-2">
      {groups.map((group: any) => {
        const availableOptions = (group.modifier_options ?? []).filter((o: any) => o.is_available);
        const groupSelected = selected.filter(s => s.group_id === group.id);
        const isComplete = groupSelected.length >= group.max_selections;

        return (
          <div key={group.id} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{group.name}</span>
              {group.required && <Badge variant="destructive" className="text-xs">Obligatorio</Badge>}
              {group.max_selections > 1 && (
                <Badge variant="outline" className="text-xs">
                  {groupSelected.length}/{group.max_selections}
                </Badge>
              )}
            </div>
            <div className="space-y-1.5 pl-1">
              {availableOptions.map((option: any) => {
                const checked = selected.some(s => s.option_id === option.id);
                const disabled = !checked && isComplete;
                return (
                  <div key={option.id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`opt-${option.id}`}
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={() => toggle(group, option)}
                      />
                      <Label
                        htmlFor={`opt-${option.id}`}
                        className={`text-sm font-normal cursor-pointer ${disabled ? "text-muted-foreground" : ""}`}
                      >
                        {option.name}
                      </Label>
                    </div>
                    {Number(option.price_delta) !== 0 && (
                      <span className="text-xs text-muted-foreground">
                        {Number(option.price_delta) > 0 ? "+" : ""}{formatCurrency(Number(option.price_delta))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function validateModifiers(
  groups: any[],
  selected: SelectedModifier[]
): string | null {
  for (const group of groups) {
    if (!group.required) continue;
    const count = selected.filter(s => s.group_id === group.id).length;
    if (count < group.min_selections) {
      return `"${group.name}" es obligatorio`;
    }
  }
  return null;
}
