import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { resolve } from "path";

// Default: multi-file build for GitHub Pages
// SINGLE_FILE=1: self-contained single HTML for S3 hosting
const isSingleFile = process.env.SINGLE_FILE === "1";

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(isSingleFile ? [viteSingleFile()] : [])],
  base: isSingleFile ? "./" : "/one-step-aws/",
  build: {
    outDir: isSingleFile ? "dist-single" : "dist-downloader",
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
