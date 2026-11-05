import type { NextConfig } from "next";
import { wgslTurbopackRule } from "@vgpu/wgsl/next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    // @anchor-lang/core's browser bundle requires "fs" for NodeWallet, unused in the web.
    resolveAlias: {
      fs: { browser: "./lib/shims/empty.ts" },
    },
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
      // vgpu: .wgsl imports become prepared, typed shader modules (05 §4.1).
      "*.wgsl": wgslTurbopackRule({ minify: true }),
    },
  },
};

export default nextConfig;
