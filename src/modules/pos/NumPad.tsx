import { Delete } from "lucide-react";

interface NumPadProps {
  value: string;
  onChange: (v: string) => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  shortcuts?: number[];
  onShortcut?: (n: number) => void;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"] as const;

export function NumPad({ value, onChange, onConfirm, confirmLabel = "OK", shortcuts, onShortcut }: NumPadProps) {
  const press = (k: string) => {
    if (k === "del") return onChange(value.slice(0, -1));
    if (k === "." && value.includes(".")) return;
    onChange((value === "0" && k !== ".") ? k : value + k);
  };

  return (
    <div className="flex flex-col gap-2.5">
      {shortcuts && shortcuts.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {shortcuts.map((s) => (
            <button key={s} type="button" className="g-btn g-btn-ghost g-numpad-shortcut"
              onClick={() => onShortcut?.(s)}>
              {s.toLocaleString()}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <button key={k} type="button" className="g-btn g-btn-ghost g-numpad-key"
            onClick={() => press(k)}>
            {k === "del" ? <Delete className="h-5 w-5" /> : k}
          </button>
        ))}
      </div>
      {onConfirm && (
        <button type="button" className="g-btn g-btn-primary g-numpad-confirm w-full"
          onClick={onConfirm}>{confirmLabel}</button>
      )}
    </div>
  );
}
