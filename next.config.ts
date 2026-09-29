import type { NextConfig } from "next";

/* Kept in step with SECURITY_HEADERS in server.mjs (the custom server used by
   `npm start` sets them itself, because next.config headers are ignored there).
   No script-src / style-src here on purpose: the pages use inline styles. */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'" },
  { key: "Strict-Transport-Security", value: "max-age=15552000" },   // no includeSubDomains — see server.mjs
];

const nextConfig: NextConfig = {
 
  allowedDevOrigins: ["192.168.1.100"],

  /* pdfkit reads its font metrics (the .afm files) from disk at run time, so it
     must stay a real node_modules package instead of being bundled into the
     server chunk. This is what Next recommends for packages like it. */
  serverExternalPackages: ["pdfkit"],

  /* Personal/business data must never be cached by a browser or a proxy. */
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      {
        source: "/api/:path*",
        headers: [
          ...SECURITY_HEADERS,
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, private" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
    ];
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com', pathname: '/**' },
      { protocol: 'https', hostname: 'placehold.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
};

export default nextConfig;