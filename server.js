// server.js
// ─────────────────────────────────────────────────────────────────────────────
// This filename is what IIS starts (see `web.config` → httpPlatformHandler →
// arguments="server.js"), so it has to stay. It now hands the work straight to
// `server.mjs`, which is this same Next.js server plus one thing the security
// limits need: the real address of the caller.
//
// Why that matters on IIS: the platform sits in front of Node, so the socket
// address is the platform's own. Without the hand-over below the application
// would see the same address for everybody, and one visitor filling the booking
// form would lock out the others. `server.mjs` reads the address the platform
// put on the request and passes it on in a header of its own, after deleting any
// copy the caller sent — so the limits count each visitor separately.
//
// You can keep starting the app exactly as before:
//     node server.js          (IIS / web.config — unchanged)
//     npm start               (runs server.mjs directly)
// Both end up in the same place. Nothing else about the server changed.
// ─────────────────────────────────────────────────────────────────────────────
import("./server.mjs").catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
