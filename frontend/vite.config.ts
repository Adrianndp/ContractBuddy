import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 8080 },
  envDir: "..", // the one .env for the whole project is in the repo root (only VITE_* reach the browser)
  resolve: { tsconfigPaths: true }, // "@/..." imports, from tsconfig.json "paths"
  plugins: [
    tailwindcss(),
    // SPA mode: the build is static files (dist/client, entry _shell.html) that nginx can serve.
    // The app only talks to the backend from the browser, so no server-side rendering is needed.
    tanstackStart({ spa: { enabled: true } }),
    viteReact(),
  ],
});
