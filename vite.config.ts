import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  // Rails serves the built app from Backend/public (generated; not in git).
  build: {
    outDir: path.resolve(import.meta.dirname, "Backend/public"),
    emptyOutDir: true,
  },
  // `npm run dev` (or bin/dev) serves the app on :5173 and sends /api to Rails.
  server: {
    port: 5173,
    proxy: {
      "/api": { target: process.env.RAILS_URL || "http://127.0.0.1:3000", changeOrigin: false, xfwd: true },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
