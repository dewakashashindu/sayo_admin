// server.js

import("./server.mjs").catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
