// tsup.config.ts
import { defineConfig, type Options } from "tsup";

const isProduction = process.env.NODE_ENV === "production";

const DEFAULT_CONFIG: Options = {
  entry: ["src/index.ts"],
  dts: true,
  minify: isProduction,
  clean: true,
  outDir: "dist",
  skipNodeModulesBundle: true,
};

export default defineConfig([
  {
    ...DEFAULT_CONFIG,
    format: "esm",
  },
  {
    ...DEFAULT_CONFIG,
    format: "cjs",
    dts: false,
  },
]);
