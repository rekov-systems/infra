import { X } from 'lucide-react'

interface TweaksPanelProps {
  onClose: () => void
}

export function TweaksPanel({ onClose }: TweaksPanelProps) {
  return (
    <div className="w-72 rounded-xl border bg-card shadow-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-foreground">Tweaks · POS360T</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          title="Cerrar"
          className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        La apariencia ahora se gestiona desde Configuración &rsaquo; Apariencia.
      </p>
    </div>
  )
}
