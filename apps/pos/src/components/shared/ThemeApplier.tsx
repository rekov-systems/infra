import { useEffect } from 'react'
import { useThemeStore } from '@/stores/theme'
import { useBrandingStore } from '@/stores/branding'

type ColorSet = { primary: string; glow: string; sidebar: string; gradient: string }

const ACCENT_COLORS: Record<string, { light: ColorSet; dark: ColorSet }> = {
  azul: {
    light: { primary: '18 100% 56%', glow: '26 100% 64%', sidebar: '18 100% 62%', gradient: 'linear-gradient(135deg, #ff5a1f, #ff8a45)' },
    dark:  { primary: '18 100% 56%', glow: '26 100% 64%', sidebar: '18 100% 62%', gradient: 'linear-gradient(135deg, #ff5a1f, #ff8a45)' },
  },
  indigo: {
    light: { primary: '18 100% 56%', glow: '26 100% 64%', sidebar: '18 100% 62%', gradient: 'linear-gradient(135deg, #ff5a1f, #ff8a45)' },
    dark:  { primary: '18 100% 56%', glow: '26 100% 64%', sidebar: '18 100% 62%', gradient: 'linear-gradient(135deg, #ff5a1f, #ff8a45)' },
  },
  teal: {
    light: { primary: '18 100% 56%', glow: '26 100% 64%', sidebar: '18 100% 62%', gradient: 'linear-gradient(135deg, #ff5a1f, #ff8a45)' },
    dark:  { primary: '18 100% 56%', glow: '26 100% 64%', sidebar: '18 100% 62%', gradient: 'linear-gradient(135deg, #ff5a1f, #ff8a45)' },
  },
}

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const clean = hex.replace(/^#/, '')
  if (clean.length !== 6) return null
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

export function ThemeApplier() {
  const { accent, spacing } = useThemeStore()
  const { primaryColor } = useBrandingStore()

  useEffect(() => {
    const root = document.documentElement
    // Dark mode is disabled — the glassmorphism design system is light-only.
    root.classList.remove('dark')
    root.classList.toggle('spacing-compact', spacing === 'compacto')

    // Remove old class-based accent markers (kept for any residual CSS selectors)
    root.classList.remove('accent-indigo', 'accent-teal')

    let colors: ColorSet

    if (accent === 'azul' && primaryColor) {
      const hsl = hexToHsl(primaryColor)
      // Tenant supplied orange shades may vary while preserving the Desk palette.
      const isBrandHue = hsl && hsl.s >= 35 && (hsl.h <= 42 || hsl.h >= 345)
      if (hsl && isBrandHue) {
        const glowL = Math.min(hsl.l + 11, 95)
        const sidebarL = Math.min(hsl.l + 20, 95)
        colors = {
          primary: `${hsl.h} ${hsl.s}% ${hsl.l}%`,
          glow: `${hsl.h} ${hsl.s}% ${glowL}%`,
          sidebar: `${hsl.h} ${hsl.s}% ${sidebarL}%`,
          gradient: `linear-gradient(135deg, hsl(${hsl.h} ${hsl.s}% ${hsl.l}%), hsl(${hsl.h} ${hsl.s}% ${glowL}%))`,
        }
      } else {
        colors = ACCENT_COLORS.azul.light
      }
    } else {
      colors = (ACCENT_COLORS[accent] ?? ACCENT_COLORS.azul).light
    }

    root.style.setProperty('--primary', colors.primary)
    root.style.setProperty('--primary-glow', colors.glow)
    root.style.setProperty('--ring', colors.primary)
    root.style.setProperty('--sidebar-primary', colors.sidebar)
    root.style.setProperty('--sidebar-ring', colors.sidebar)
    root.style.setProperty('--gradient-primary', colors.gradient)

    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(el => {
      el.content = `hsl(${colors.primary})`
    })
  }, [accent, spacing, primaryColor])

  return null
}
