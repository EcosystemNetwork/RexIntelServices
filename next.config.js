/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb", // for CSV uploads
    },
  },
  // Allow next/image to optimize + cache external hero images coming from
  // common event hosts. Anything not on this list falls back to the raw
  // <img> tag (with eslint warning) so we don't silently 4xx new sources.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.lumacdn.com" },
      { protocol: "https", hostname: "**.lumacdn.com" },
      { protocol: "https", hostname: "cdn.evbuc.com" }, // eventbrite cdn
      { protocol: "https", hostname: "img.evbuc.com" },
      { protocol: "https", hostname: "ethglobal.b-cdn.net" },
      { protocol: "https", hostname: "ethglobal.com" },
      { protocol: "https", hostname: "**.cloudinary.com" },
      { protocol: "https", hostname: "**.cloudfront.net" },
      { protocol: "https", hostname: "**.imgix.net" },
      { protocol: "https", hostname: "**.devpost.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

module.exports = nextConfig;
