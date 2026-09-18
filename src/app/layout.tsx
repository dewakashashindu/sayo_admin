import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  // The tab title, and the sheet name the browser puts on a printed page when
  // its own header/footer is switched on. The print stylesheet gives the page
  // no margin to draw that header in, so it stays off the paper either way —
  // this only stops the browser tab from reading "Create Next App".
  title: "SAYO — Salon Management",
  description: "Salon management: bookings, billing, inventory and purchase orders.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
