# Screenshots

This folder contains screenshots of POS S360T. They are used in the main [README.md](../README.md).

## Current Screenshots

| File | Description |
|------|-------------|
| `dashboard-desktop.png` | Main dashboard on desktop |
| `dashboard-tablet.png` | Main dashboard on tablet |
| `dashboard-mobile.png` | Main dashboard on mobile |
| `pos-desktop.png` | POS terminal on desktop |
| `pos-mobile.png` | POS terminal on mobile |
| `pos-tablet.png` | POS terminal on tablet |
| `inventory.png` | Inventory and kardex view |
| `tables.png` | Table plan / salon layout |
| `kds.png` | Kitchen Display System |
| `production.png` | Production module |
| `ai-agent-desktop.png` | WhatsApp AI agent settings on desktop |
| `ai-agent-mobile.png` | WhatsApp AI agent on mobile |
| `settings.png` | Settings panel |
| `landing.png` | Landing page |

## Adding New Screenshots

1. Drop the image into this folder.
2. Use a descriptive, lowercase filename with hyphens.
3. Reference it from `README.md`.
4. Keep file sizes reasonable (preferably under 800 KB). Large images can be resized and compressed with:

```bash
python3 - <<'PY'
from PIL import Image
img = Image.open("large-screenshot.png")
img = img.convert("RGB")
img.thumbnail((1200, 1200))
img.save("optimized-screenshot.png", "PNG", optimize=True)
PY
```
