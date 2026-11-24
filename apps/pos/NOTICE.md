# Third-Party Notices

POS S360T is built on top of many excellent open-source projects. This file acknowledges the major ones. For the complete list of all transitive dependencies and their licenses, see `package-lock.json` or run:

```bash
npx license-checker --summary
```

## Core Framework and Build Tools

| Project | License | Usage |
|---------|---------|-------|
| React | MIT | UI framework |
| React DOM | MIT | DOM renderer |
| React Router | MIT | Client-side routing |
| Vite | MIT | Build tool and dev server |
| TypeScript | Apache-2.0 | Type system |
| SWC (via @vitejs/plugin-react-swc) | Apache-2.0 AND MIT | Fast JSX/TS compilation |

## Backend and Database

| Project | License | Usage |
|---------|---------|-------|
| Supabase (client library) | MIT | Auth, database, realtime client |
| Dexie | Apache-2.0 | IndexedDB wrapper for offline queue |
| idb-keyval | Apache-2.0 | Lightweight IndexedDB key-value store |

## State Management and Data Fetching

| Project | License | Usage |
|---------|---------|-------|
| TanStack Query | MIT | Server state, caching, synchronization |
| Zustand | MIT | Client state management |

## UI and Styling

| Project | License | Usage |
|---------|---------|-------|
| Tailwind CSS | MIT | Utility-first CSS framework |
| Radix UI | MIT | Headless accessible UI primitives |
| shadcn/ui | MIT | Component patterns and primitives |
| Lucide React | ISC | Icon library |
| class-variance-authority | MIT | Variant API for components |
| clsx / tailwind-merge | MIT | Conditional class merging |
| next-themes | MIT | Theme provider |
| vaul | MIT | Drawer component |
| cmdk | MIT | Command palette component |
| input-otp | MIT | OTP input component |
| embla-carousel-react | MIT | Carousel component |
| recharts | MIT | Charts and data visualization |
| sonner | MIT | Toast notifications |
| date-fns | MIT | Date formatting and manipulation |

## Forms and Validation

| Project | License | Usage |
|---------|---------|-------|
| React Hook Form | MIT | Form handling |
| Zod | MIT | Schema validation |
| @hookform/resolvers | MIT | Zod resolver for React Hook Form |

## Desktop and Hardware

| Project | License | Usage |
|---------|---------|-------|
| Electron | MIT | Desktop application shell |
| electron-builder | MIT | Build and package Electron apps |
| electron-store | MIT | Persistent settings in Electron |
| electron-updater | MIT | Auto-updater for Electron |
| node-thermal-printer | MIT | ESC/POS thermal printer support |
| serialport | MIT | Serial port barcode scanner support |

## PWA and Offline

| Project | License | Usage |
|---------|---------|-------|
| Vite PWA plugin | MIT | Service worker and PWA manifest |
| Workbox | MIT | Service worker runtime |

## Testing and Quality

| Project | License | Usage |
|---------|---------|-------|
| Vitest | MIT | Unit testing framework |
| React Testing Library | MIT | Component testing utilities |
| jsdom | MIT | Browser environment for tests |
| ESLint | MIT | Linting |
| TypeScript ESLint | MIT | TypeScript lint rules |

## AI and Integrations

| Project | License | Usage |
|---------|---------|-------|
| qrcode.react | MIT | QR code generation |

## Design Assets

The project may include fonts loaded from Google Fonts and icons from Lucide. All are used under their respective open licenses.

## Generated Components

Some UI components in `src/components/ui/` are based on patterns from **shadcn/ui**, which provides MIT-licensed reusable component building blocks.

## License of This Project

POS S360T itself is licensed under the MIT License. See [LICENSE](LICENSE) for the full text.

## Notice

This software includes code from third-party open-source projects. The inclusion of such code does not imply endorsement by the original authors. Each project retains its own copyright and license terms.

If you believe any attribution is missing or incorrect, please open an issue in the repository.
