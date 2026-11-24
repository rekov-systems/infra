import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => {
  const isElectronMode = mode === "electron";

  // Plugins base (siempre activos)
  const plugins: any[] = [
    react(),
    // El tagger de Lovable solo en modo web development
    mode === "development" && !isElectronMode && componentTagger(),
    // PWA: solo en despliegue web, nunca en Electron
    !isElectronMode &&
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.ico", "robots.txt", "apple-touch-icon.png"],
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2}"],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          // Sin navigateFallback la SPA no puede servirse offline en deep-links.
          // navigateFallbackDenylist solo tiene efecto cuando navigateFallback está activo.
          navigateFallback: "index.html",
          // Excluye rutas de API local (si las hubiera) para que no sirvan index.html.
          // Las llamadas a Supabase son cross-origin y el SW nunca las intercepta,
          // por lo que no es necesario listarlas aquí.
          navigateFallbackDenylist: [/^\/api\//],
        },
        devOptions: {
          enabled: false,
        },
        manifest: {
          name: "POS S360T",
          short_name: "POS S360T",
          description:
            "Multi-branch POS system. Sales, cash register, inventory, production, and reports.",
          theme_color: "#1469A1",
          background_color: "#ffffff",
          display: "standalone",
          orientation: "any",
          scope: "/",
          start_url: "/",
          lang: "es",
          icons: [
            {
              src: "/pwa-192x192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "/pwa-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "/pwa-maskable-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
      }),
  ].filter(Boolean);

  // Plugin de Electron: solo cuando mode=electron
  if (isElectronMode) {
    const { default: electron } = await import("vite-plugin-electron/simple");
    plugins.push(
      electron({
        main: {
          // Entrada del proceso principal
          entry: "electron/main.ts",
          vite: {
            build: {
              // Compilar el main process a la carpeta dist-electron/
              outDir: "dist-electron",
              rollupOptions: {
                // Estas dependencias son módulos nativos/binarios:
                // no se pueden bundlear, electron-builder las copia por separado.
                external: [
                  "electron",
                  "electron-updater",
                  "electron-store",
                  "node-thermal-printer",
                  "serialport",
                  "@serialport/parser-readline",
                ],
              },
            },
          },
        },
        preload: {
          // Entrada del preload
          input: "electron/preload.ts",
          vite: {
            build: {
              outDir: "dist-electron",
              rollupOptions: {
                external: ["electron"],
              },
            },
          },
        },
        // En modo dev, el renderer sigue corriendo en localhost
        // y el main process lo carga vía VITE_DEV_SERVER_URL
        renderer: {},
      })
    );
  }

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        // En Electron no se incluye VitePWA, así que el módulo virtual no
        // existe; lo redirigimos a un stub no-op para no romper el build.
        ...(isElectronMode
          ? {
              "virtual:pwa-register": path.resolve(
                __dirname,
                "./src/pwa-register-stub.ts"
              ),
            }
          : {}),
      },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    // En modo electron, no se necesita la base URL relativa
    base: isElectronMode ? "./" : "/",
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom", "react-router-dom"],
            supabase: ["@supabase/supabase-js"],
            query: ["@tanstack/react-query", "@tanstack/react-query-persist-client"],
            ui: ["@radix-ui/react-dialog", "@radix-ui/react-select", "@radix-ui/react-tabs", "lucide-react"],
          },
        },
      },
    },
  };
});
