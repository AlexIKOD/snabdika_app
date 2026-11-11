import { devBackend } from "./devBackend";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Конфигурация Vite для оболочки Tauri v2.
// Сборка идёт в dist/, который читает оболочка (см. src-tauri/tauri.conf.json).
export default defineConfig(async ({ command, mode }) => {
  const backend = command === "serve" && mode !== "test" ? await devBackend() : null;
  return {
  plugins: [react(), ...(backend ? [backend.plugin] : [])],
  preview: { proxy: backend?.proxy },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  clearScreen: false,
  server: {
    // Порт фиксирован: оболочка Tauri обращается к devUrl из tauri.conf.json.
    port: 5173,
    strictPort: true,
    host: "127.0.0.1",
    watch: { ignored: ['**/backend/build/**', '**/backend/dist/**', '**/src-tauri/target/**'] },
    proxy: backend?.proxy,
  },
  build: {
    // Целевой движок WebView2 (Windows) поддерживает современный синтаксис.
    target: "chrome110",
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    // Разбиение vendor-бандла: приложение запускается внутри WebView2, где
    // повторная загрузка одного огромного чанка заметно дольше, чем несколько
    // небольших, к тому же снимается порог предупреждения Vite (500 kB).
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          // Windows отдаёт пути с обратными слешами — нормализуем.
          const p = id.replace(/\\/g, "/");

          if (p.includes("/node_modules/react-dom/") || p.includes("/node_modules/react/") || p.includes("/node_modules/scheduler/")) {
            return "vendor-react";
          }
          if (p.includes("/node_modules/react-router/") || p.includes("/node_modules/react-router-dom/") || p.includes("/node_modules/@remix-run/")) {
            return "vendor-router";
          }
          if (p.includes("/node_modules/lucide-react/")) {
            return "vendor-icons";
          }
          if (p.includes("/node_modules/@radix-ui/")) {
            return "vendor-radix";
          }
          if (p.includes("/node_modules/@tanstack/")) {
            return "vendor-virtual";
          }
          if (p.includes("/node_modules/sonner/")) {
            return "vendor-toast";
          }
          if (p.includes("/node_modules/@tauri-apps/")) {
            return "vendor-tauri";
          }
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  };
});
