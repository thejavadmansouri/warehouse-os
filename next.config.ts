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
      ignored: [
        "**/node_modules/**",
        "**/.git/**",
        "**/.next/**",
        "C:/*.sys",
        "C:/*.tmp",
        "C:/DumpStack.log.tmp",
        "C:/System Volume Information/**",
        "C:/pagefile.sys",
        "C:/swapfile.sys",
        "C:/hiberfil.sys",
      ],
    };
    return config;
  },
};

export default nextConfig;
