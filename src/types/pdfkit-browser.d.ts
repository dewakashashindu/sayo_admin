/* rev 34: browser-side standard-font registration for @react-pdf/renderer.
   pdfkit 0.20 no longer auto-registers the base-14 fonts in the browser
   build — the app must call registerStdFonts() with the font payloads. */

declare module "pdfkit/standard-fonts/Helvetica" { const f: unknown; export default f; }
declare module "pdfkit/standard-fonts/HelveticaBold" { const f: unknown; export default f; }
declare module "pdfkit/standard-fonts/HelveticaOblique" { const f: unknown; export default f; }
declare module "pdfkit/standard-fonts/HelveticaBoldOblique" { const f: unknown; export default f; }
declare module "pdfkit/standard-fonts/TimesRoman" { const f: unknown; export default f; }
declare module "pdfkit/standard-fonts/TimesBold" { const f: unknown; export default f; }
declare module "pdfkit/standard-fonts/TimesItalic" { const f: unknown; export default f; }
declare module "pdfkit/standard-fonts/TimesBoldItalic" { const f: unknown; export default f; }
declare module "pdfkit/standard-fonts/Courier" { const f: unknown; export default f; }
declare module "pdfkit/standard-fonts/CourierBold" { const f: unknown; export default f; }
declare module "pdfkit/standard-fonts/CourierOblique" { const f: unknown; export default f; }
declare module "pdfkit/standard-fonts/CourierBoldOblique" { const f: unknown; export default f; }
