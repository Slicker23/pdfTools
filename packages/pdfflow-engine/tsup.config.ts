import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../../src");

export default defineConfig({
  tsconfig: "tsconfig.build.json",
  entry: {
    index: path.join(src, "lib/pdf-engine/public.ts"),
    node: path.join(src, "lib/pdf-engine/public/node.ts"),
  },
  outDir: "dist",
  format: ["esm", "cjs"],
  dts: {
    resolve: true,
  },
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: [
    "pdf-lib",
    "@pdf-lib/fontkit",
    "zod",
    "pdfjs-dist",
    "pdfium-native",
    "@napi-rs/canvas",
    "node:crypto",
    "node:fs",
    "node:fs/promises",
    "node:path",
  ],
  esbuildOptions(options) {
    options.alias = {
      "@": src,
    };
  },
});
