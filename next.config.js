/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb", // for CSV uploads
    },
  },
};

module.exports = nextConfig;
