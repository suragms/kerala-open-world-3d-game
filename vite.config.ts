import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: { watch: { ignored: ["**/output/**", "**/dist-subdirectory/**", "**/test-results/**", "**/playwright-report/**"] } },
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: { output: { manualChunks: { engine: ["three"] } } },
  },
});
