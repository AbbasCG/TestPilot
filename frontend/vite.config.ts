import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        // Stable vendor chunks: app code changes do not invalidate the cached framework and animation libraries.
        codeSplitting: {
          groups: [
            { name: "vendor-react", test: /node_modules[/](react|react-dom|scheduler|react-router|react-router-dom)[/]/, priority: 30 },
            { name: "vendor-query", test: /node_modules[/]@tanstack[/]/, priority: 20 },
            { name: "vendor-gsap", test: /node_modules[/](gsap|@gsap)[/]/, priority: 20 },
          ],
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": process.env.API_PROXY_TARGET || "http://127.0.0.1:8000",
      "/sanctum": process.env.API_PROXY_TARGET || "http://127.0.0.1:8000",
    },
  },
});
