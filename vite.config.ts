import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The site is static: hash routes and relative asset paths, so it works from any path (GitHub Pages
// serves it under /parallax-results/).
export default defineConfig({
  root: "site",
  base: "./",
  plugins: [react()],
  build: { outDir: "../dist", emptyOutDir: true },
});
