/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    // Server Actions power every mutation in the app.
    serverActions: { bodySizeLimit: "1mb" },
  },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
