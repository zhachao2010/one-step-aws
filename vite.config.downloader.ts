import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/one-step-aws/",
  build: {
    outDir: "dist-downloader",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "downloader.html"),
    },
  },
  server: {
    port: 5173,
    open: "/downloader.html",
  },
});
