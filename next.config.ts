import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep tracing inside this folder even when the repo root has its own lockfile.
  outputFileTracingRoot: process.cwd(),
  turbopack: { root: process.cwd() },
  // mupdf is a WASM package used only by the admin import API route.
  serverExternalPackages: ["mupdf"],
  outputFileTracingIncludes: {
    "/api/admin/extract": ["./node_modules/mupdf/dist/**/*"],
  },
};

export default nextConfig;
