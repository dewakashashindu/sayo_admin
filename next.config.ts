import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", 
  allowedDevOrigins: ["192.168.1.100"],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'placehold.co',
      },
      // ✅ Add this if you want unsplash in future
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
};

export default nextConfig;