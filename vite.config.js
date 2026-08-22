import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      registerType: "autoUpdate",

      manifest: {
        name: "RD Kasir",
        short_name: "RD Kasir",
        description: "Aplikasi kasir RD Kasir",
        theme_color: "#1E2A22",
        background_color: "#EAF0E4",
        display: "standalone",
        orientation: "portrait",

        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },

      workbox: {
        navigateFallback: "/index.html",
      },
    }),
  ],
});
