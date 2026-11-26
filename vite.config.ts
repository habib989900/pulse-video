import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Vercel port: plain Vite build for the React SPA (replaces the Muse
// runtime's @hatch/space-sdk/build). Entry is client/index.html, which
// loads client/src/main.tsx; output goes to dist/ at the repo root,
// which Vercel serves as static files. API routes live in api/ and are
// deployed as Vercel Serverless Functions.
export default defineConfig({
  root: "client",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
