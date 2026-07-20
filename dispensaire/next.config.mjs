import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: { root: __dirname },
  // Les photos d'inventaire (scan IA) sont réduites côté client puis envoyées en base64.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
};

export default nextConfig;
