import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      preserveEntrySignatures: "exports-only",
      input: {
        app: resolve(__dirname, "index.html"),
        obs: resolve(__dirname, "src/modules/obs.ts"),
        warudo: resolve(__dirname, "src/modules/warudo.ts"),
        "vtube-studio": resolve(__dirname, "src/modules/vtube-studio.ts"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (["obs", "warudo", "vtube-studio"].includes(chunkInfo.name)) {
            return "[name].js";
          }

          return "assets/[name].js";
        },
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
