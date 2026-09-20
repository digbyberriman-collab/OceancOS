/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
    // Never bundle these: playwright-core reaches for optional native modules
    // that webpack cannot resolve, and exceljs is large and only loaded when an
    // export is requested. Both are required at runtime instead.
    serverComponentsExternalPackages: ["playwright-core", "exceljs"],
  },
};
