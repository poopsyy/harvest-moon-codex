import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Willowmere Acres",
        short_name: "Willowmere",
        description: "A little farm. A valley worth keeping.",
        theme_color: "#263e37",
        background_color: "#f4e7ca",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        dontCacheBustURLsMatching: /-[a-zA-Z0-9_-]{8,}\.(?:js|css)$/,
        globPatterns: ["**/*.{js,css,html,png,json,ttf,woff2,xml,webmanifest}"],
        maximumFileSizeToCacheInBytes: 4000000,
      },
    }),
  ],
  build: {
    manifest: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: (id: string) =>
          id.includes("/phaser/") ? "engine" : undefined,
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    hmr: process.env.WILLOW_E2E === "1" ? false : undefined,
  },
  preview: { host: "0.0.0.0", port: 4173 },
});
