import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "webdeck-html-entry",
      transformIndexHtml: {
        order: "pre",
        handler(html) {
          return html
            .replace(
              /    <script type="module" crossorigin src="\.\/assets\/app\.js"><\/script>\r?\n/,
              "",
            )
            .replace(
              /    <link rel="stylesheet" crossorigin href="\.\/assets\/app\.css" \/>\r?\n/,
              "",
            )
            .replace(
              "  </body>",
              '    <script type="module" src="/src/main.ts"></script>\n  </body>',
            );
        },
      },
    },
  ],
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
