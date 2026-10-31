import type { NextConfig } from "next";
import path from "path";

const workspaceRoot = path.resolve(__dirname).replace(/\\/g, "/");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: false,
  turbopack: {
    root: path.resolve(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      followSymlinks: false,
      ignored: (filePath: string) => {
        if (!filePath) return false;
        const normalized = filePath.replace(/\\/g, "/");
        // هر مسیری خارج از پوشه پروژه را نادیده بگیر تا تغییرات روت C:\ باعث ری‌لود نشود
        if (!normalized.startsWith(workspaceRoot)) {
          return true;
        }
        if (normalized.includes("/node_modules/") || normalized.includes("/.git/")) {
          return true;
        }
        return false;
      },
    };
    return config;
  },
};

export default nextConfig;
