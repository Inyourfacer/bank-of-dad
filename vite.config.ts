import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Served from https://<user>.github.io/bank-of-dad/ on GitHub Pages.
export default defineConfig({
  base: "/bank-of-dad/",
  plugins: [react()],
  build: { chunkSizeWarningLimit: 800 },
});
