import type { NextConfig } from "next";

const nextConfig: NextConfig = {
 
  allowedDevOrigins: ["192.168.1.100"],

  /* pdfkit reads its font metrics (the .afm files) from disk at run time, so it
     must stay a real node_modules package instead of being bundled into the
     server chunk. This is what Next recommends for packages like it. */
  serverExternalPackages: ["pdfkit"],

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com', pathname: '/**' },
      { protocol: 'https', hostname: 'placehold.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
};

export default nextConfig;