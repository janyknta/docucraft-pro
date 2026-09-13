import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
import path from "path";

export default defineConfig({
  plugins: [
    tanstackStart({
      server: { entry: "server" },
      // Generate TanStack Start's client-only HTML shell for Firebase Hosting.
      spa: {
        enabled: true,
        prerender: {
          crawlLinks: true,
        },
      },
    }),
    viteReact(),
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    nitro({ preset: "node-server" }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    // `mermaid` is deliberately NOT pre-bundled. It is loaded lazily (see
    // MermaidLazy.tsx) and forcing it through optimizeDeps pulled its whole
    // dependency tree — cytoscape, dagre, d3 — into the dev-server warm-up and
    // encouraged it back into the initial graph.
    exclude: ["mermaid", "@babel/standalone", "xlsx", "mammoth"],
    // `cytoscape-cose-bilkent` (mermaid's mindmap layout) ships CommonJS only —
    // no `module`, no `exports` — and because `mermaid` is excluded above, Vite
    // never converts it, so importing a mindmap died with "does not provide an
    // export named default". Pre-bundling just the CJS leaf fixes the import
    // without dragging mermaid itself back into the warm-up.
    include: [
      "dayjs",
      "@braintree/sanitize-url",
      "cytoscape",
      "cytoscape-cose-bilkent",
      "cytoscape-fcose",
    ],
  },
  build: {
    // Terser-grade minification is worth the build time here: the app ships a
    // large markdown pipeline, and this is the cheapest win for low-end devices
    // on slow connections.
    cssMinify: "lightningcss",
    // These are all code-split now; anything still large is a real regression
    // rather than an expected big vendor chunk.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Keep the React runtime in one long-lived chunk. It changes far less
        // often than app code, so a deploy shouldn't invalidate it.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react";
        },
      },
    },
  },
});
