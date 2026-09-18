#!/usr/bin/env bash
# scripts/run-billing-tests.sh
# Compiles the pure billing libraries and runs scripts/billing-tests.js.
# No database is needed — this only checks the maths and the row mapping.
#
#   bash scripts/run-billing-tests.sh
set -e
cd "$(dirname "$0")/.."

TSC="./node_modules/.bin/tsc"
if [ ! -x "$TSC" ]; then
  echo "Installing dependencies first (node_modules is missing)…"
  npm install --no-audit --no-fund
fi

rm -rf .tmptest
"$TSC" src/lib/itemCode.ts src/lib/bookingStatus.ts src/lib/billingTaxes.ts src/lib/billingPayments.ts src/lib/billingBill.ts src/lib/inventoryTotals.ts src/lib/poRequirements.ts src/lib/poPrint.ts src/lib/poEmail.ts src/lib/poPdf.ts src/lib/companyLetterhead.ts src/lib/grnPoEntry.ts src/lib/grnNotify.ts src/lib/sms.ts \
  --outDir .tmptest --module commonjs --target ES2019 --skipLibCheck --esModuleInterop >/dev/null
"$TSC" src/lib/serials.ts \
  --outDir .tmptest --module commonjs --target ES2020 --skipLibCheck --esModuleInterop --lib es2020 >/dev/null

node scripts/billing-tests.js
STATUS=$?
rm -rf .tmptest
exit $STATUS
