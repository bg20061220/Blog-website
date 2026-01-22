import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";
import sitemap from "@astrojs/sitemap";
import swup from "@swup/astro";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://bhavyagoel.netlify.app/",
  integrations: [
    swup({
      theme: ["overlay", { direction: "to-top" }],
      cache: true,
      progress: true,
    }),
    preact(),
    sitemap(),
  ],
  image: {
    responsiveStyles: true,
  },
  vite: {
    plugins: [tailwindcss()],
  },
  redirects: {
    '/blog': '/blog/1'  // ← Add this
  }
});