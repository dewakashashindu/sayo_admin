import type { NextConfig } from "next";
import path from "path";

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

  /* rev 33: @react-pdf/renderer ships ESM-only — without this the server
     compile tries to require() it and fails (import-esm-externals). */
  transpilePackages: ["@react-pdf/renderer"],

  /* rev 35: force the CLIENT bundle (app code AND @react-pdf/renderer) to
     resolve one single pdfkit copy, so registerStdFonts() reaches the same
     Font registry the renderer uses. Server keeps the real external package
     (pdfkit reads .afm metrics from disk at run time). */
  webpack: (config, { isServer }) => {
    if (!isServer) {
      const pk = path.resolve(process.cwd(), "node_modules/pdfkit/js");
      const fonts = [
        "Helvetica", "HelveticaBold", "HelveticaOblique", "HelveticaBoldOblique",
        "TimesRoman", "TimesBold", "TimesItalic", "TimesBoldItalic",
        "Courier", "CourierBold", "CourierOblique", "CourierBoldOblique",
      ];
      const alias: Record<string, string> = {
        ...config.resolve.alias as Record<string, string>,
        pdfkit$: path.join(pk, "pdfkit.browser.mjs"),
      };
      for (const f of fonts) {
        alias[`pdfkit/standard-fonts/${f}$`] = path.join(pk, "standard-fonts", `${f}.mjs`);
      }
      config.resolve.alias = alias;
    }
    return config;
  },

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