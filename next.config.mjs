/** @type {import('next').NextConfig} */
const nextConfig = {
  // libSQL ships a native addon for `file:` databases. Leaving it outside the
  // server bundle keeps that binary out of the traced build, which is what
  // Vercel's serverless packaging needs; the hosted (`libsql://`) client is
  // pure JavaScript and works either way.
  serverExternalPackages: ["@libsql/client", "libsql"],
  experimental: {
    // Server Actions power every mutation in the app.
    serverActions: { bodySizeLimit: "1mb" },
  },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
