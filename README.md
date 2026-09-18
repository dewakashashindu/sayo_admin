This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
# sayo_admin

---

# 🔐 Admin Authentication (setup guide)

All admin pages & admin APIs are protected by a signed, `httpOnly` session
cookie. The **public booking page (`/booking`) needs no login** — it stays
open for online customers, together with the three APIs it uses
(`GET /api/booking-catalog`, `POST /api/bookings`, `GET /api/bookings/availability`).

Everything else (`/admin`, `/dashboard`, `/billing`, `/settings`, `/suppliers`,
`/categories`, `/units`, `/locations`, `/login`, `/register`, … and all other
`/api/*` routes) redirects to **`/admin-login`** unless a valid admin session
cookie is present. There is **no public sign-up** — accounts are created only
by an administrator.

## 1. Create the first admin (one-time, in phpMyAdmin)

Open `scripts/create-admin.sql` and run it on your database.
It inserts one enabled admin into `tbl_userdetails`:

| Field   | Value          |
|---------|----------------|
| LogName | `admin`        |
| PSW     | bcrypt hash of the temporary password `Admin@2025` |
| Enable  | 1              |

➡️ Log in once at `/admin-login`, then change the password immediately:
**Settings → Users → select the user → Security tab → Password**.

## 2. Configure environment variables

Copy `.env.example` to `.env` and fill in:

* `DATABASE_URL` – your MySQL connection string
* `AUTH_SECRET` – random 64-char hex string that signs the session cookie:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

Without `AUTH_SECRET` logins fail on purpose (fail-closed).

**Text.lk SMS** (used by the appointment messages and by “Message Admin”) —
add both, then restart:

```ini
TEXTLK_API_TOKEN=your-text.lk-api-token
TEXTLK_SENDER_ID=SAYO
```

While either one is empty nothing is sent, and the screen says which key is
missing instead of pretending the message went out. Nothing else in the app
changes — that is only the SMS features.

## 3. Run

```bash
npm install
npx prisma generate
npm run dev      # or: npm run build && npm start
```

`npm start` now runs **`node server.mjs`** instead of `next start` (the old
command is still there as `npm run start:next`). `server.mjs` is the same server
plus the one thing the security limits need: it reads the real address of the
caller off the connection and hands it to the app. Nothing else about the app
changed, so nothing else in this file changes.

**On the hosted Windows account (`web.config` → `node server.js`)** you do not
have to change anything: `server.js` now simply hands over to `server.mjs`, so
IIS keeps starting the app exactly as before and the limits work.

## 4. Security: the limits, the real address, and `/api/health`

This section is the short version of the security pass of 2026-09-18. Nothing
here needs a decision from you — it is written down so that a future change does
not quietly undo it.

**Who is calling.** `x-forwarded-for` is a header *any* caller can type, so it is
never trusted on its own. `server.mjs` measures the address on the connection
itself, deletes any copy of its own headers the caller sent, and passes the
address on together with a secret token made fresh at every start-up
(`SAYO_IP_TOKEN` — you never set this, the server makes it). Rules, in order:

| situation | the address used | what to configure |
| --- | --- | --- |
| plain Node (`npm start`, `node server.js`) | the connection address | nothing |
| IIS / the hosting panel in front, on the same machine | the entry IIS appended to `x-forwarded-for` (the last one) | nothing |
| nginx / cloudflared / a load balancer on **another** machine | the last hop that proxy appended | `TRUST_PROXY=1` |
| a proxy that passes `x-forwarded-for` through without appending | the connection address | `SAYO_IP_SOCKET_ONLY=1` |
| nothing trustworthy at all | everyone shares one bucket | — |

A caller writing `x-forwarded-for: 1.2.3.4` in front of what IIS appended only
adds a first entry; the last entry is what gets counted. `SAYO_IP_SOCKET_ONLY=1`
is the escape hatch if you ever see one bucket catching everybody.

**What is limited** (every limit answers `429` with a `Retry-After` header, and
the screen shows a plain sentence with the waiting time):

| endpoint | limit |
| --- | --- |
| `POST /api/bookings` (public) | 8 per caller / 15 min · 3 per phone number / hour |
| `POST /api/auth/register` (public) | 5 per caller / hour · 2 per phone number / day |
| `POST /api/auth/admin-login` | 20 per caller / 10 min · 8 wrong passwords per account / 10 min |
| `POST /api/auth/login` (customer) | 20 per caller / 10 min · 8 wrong passwords per account / 10 min |
| `POST /api/auth/forgot-password/send-otp` | 5 per caller / 30 min · 3 per e-mail address / 15 min |
| `POST /api/auth/forgot-password/reset` | 10 per caller / 30 min · 5 wrong codes per code, then the code is destroyed |
| `GET /api/health` | 60 per caller / min |

The per-caller limits protect the Text.lk balance and the Gmail account — a
script cannot make the site send thousands of SMS or reset mails. The per-phone
and per-account limits are the ones a caller cannot walk around by changing
address, and a *successful* sign-in clears that account's counter.

**The reset code.** Six digits from `crypto.randomInt` (not `Math.random`), valid
10 minutes, compared in constant time, and after 5 wrong tries it dies — a new
one has to be asked for. The code is never written to the server log.

**`/api/health`.** A visitor without a session gets only `reachable` and
`latencyMs`. The host, database name, user and MySQL version appear only for a
signed-in admin.

**The two login handlers were dead files.** `…/forgot-password/send-otp` and
`…/forgot-password/reset` were named `route.tsx`, which Next.js never serves
(only `route.ts` is a route) — the whole “forgot my password” screen returned
404 until this pass. If you add an endpoint, the file must be called `route.ts`.

**Not changed on purpose** (they were reported, not asked for): the customer
session cookie and the admin session cookie still share one signing key
(`AUTH_SECRET`), the SMTP connection still accepts the mail server's certificate
without checking it, `/api/test` still returns a raw error, and the package
updates suggested by `npm audit` were left alone because they include a
major-version jump of Next.js.

## Creating more users (no sign-up page exists)

**Settings → Users** (System Settings):

* *New* → fill Identification / Contact / Security tabs → **Save**
  (password is mandatory, min 8 chars, stored as a bcrypt hash).
* Existing user → Security tab → type a new password to reset it
  (leave blank to keep the current one).
* `Enable = false` blocks a user from logging in immediately.

## How it works (short version)

* `POST /api/auth/admin-login` checks `tbl_userdetails` (`LogName` + bcrypt
  `PSW`, `Enable = true`), then sets an `httpOnly`, `SameSite=Lax` cookie
  containing an HMAC-SHA256-signed token (`src/lib/adminSession.ts`, 8 h expiry).
* `src/middleware.ts` verifies that cookie on every protected page/API.
  Unauthenticated visitors are redirected to `/admin-login?next=…`;
  unauthenticated API calls get `401`.
* Login is rate-limited (8 attempts / 10 min per IP) and error messages never
  reveal whether the username or the password was wrong.
* Passwords are **never** returned by any API (`/api/settings` returns
  `psw: ""`), and are always stored as bcrypt hashes.

##  Troubleshooting login

| Symptom | Cause / fix |
|---|---|
| Button spins ~25 s then shows a *timeout* message | The server cannot reach MySQL. Check `DATABASE_URL` (host/port/user/password), and make sure the DB allows connections from the machine running the app (cPanel MySQL usually only allows `localhost`). Add `?connect_timeout=8` to fail fast. |
| “Database error during login …” | Same as above, or Prisma client not generated → run `npx prisma generate` and restart. |
| “Invalid username or password.” | The admin row does not exist yet → run `scripts/create-admin.sql` once. Default login `admin` / `Admin@2025` (case-sensitive). If you already changed it, reset via Settings → Users or the SQL snippet in that file. |
| “Server misconfigured: AUTH_SECRET missing.” | Create `.env` from `.env.example` and set `AUTH_SECRET`, then restart the server. |
| Page still behaves like the old version | An old server process is still running. Stop it (`Ctrl+C` / task manager) and start again after unzipping the new build. |
| `Cannot read properties of undefined (reading 'subtle')` | Node.js too old — Web Crypto needs Node 19+. Use Node 20/22 LTS. |

##  Booking / appointment flow fixes (audit batch)

1. **Dashboard reads real data** — `/api/dashboard` now aggregates the legacy
   booking tables (`tbl_bookingheder` + `tbl_bookingservicedetail`), the same
   tables the public booking page and the appointment form write to. The old
   mock-data generator in `/dashboard` was removed; the page fetches the API
   (day view + week/month range view).
2. **Trustworthy audit trail** — `ConfirmedBy` / `CancelledBy` / activity-log
   actors come from the signed session cookie, never from the request body.
3. **No duplicate customers** — the public booking upserts the customer inside
   the write transaction under a `SELECT … FOR UPDATE` email lock.
4. **No raw string interpolation** — `$queryRawUnsafe` IN-lists replaced with
   parameterized `$queryRaw` + `Prisma.join`.
5. **SMS visibility** — every SMS send/failed result (booking, confirm,
   cancel, reschedule) is written to `adminactivitylog` and shown under
   **Dashboard → Recent Activities** (failed SMS in red). Cancelling a
   double-booked appointment is no longer blocked by the capacity check.

##  Customer login / registration for booking (`/login`, `/register`)

* Booking requires a **customer account** (original design): opening `/booking`
  without a session redirects to `/login?redirect=/booking`.
* `/login`, `/register`, `/forgot-password` and their APIs are **public**.
* On successful login/registration the server sets a signed, `httpOnly`
  cookie `sayo_customer_session` (8 h). The old editable `localStorage('user')`
  store is gone — the booking page now auto-fills from `GET /api/auth/customer-me`.
* Customer sessions are a **separate cookie** from the admin session
  (`sayo_admin_session`) — a customer cookie never opens admin pages/APIs.
* Password reset: `/forgot-password` (OTP via `tbl_otpstore`, SMS/e-mail).
* Staff/admin accounts remain admin-created only (Settings → Users);
  customers self-register into `tbl_customermaster`.

## Technician workflow — check-in → additions → done → bill

Process flow (post check-in workstation):

1. **Check-in** (appointment screen) sets the booking status to `ONGOING`
   and stamps `tbl_bookingtxndetail.CheckInTime`.
2. **Technician workstation** (`/technician-appointments/[bookingID]`) unlocks
   two things while the client is checked in AND the booking is not billed/done:
   - *Recipe tab* — record the materials actually used for this booking
     → saved to `Tbl_BookingServiceRecipe` (per guest + service item).
   - *Add Technician tab* — assign supporting technicians per service
     → saved to `Tbl_BookingServiceItemAddTech`.
   Both are read-only before check-in and locked again once the work is
   marked done or the booking is billed.
3. **Done** button (`POST /api/appointments/:bookingID/done`) requires the
   check-in stamp and flips the header status to `DONE`. The technician screen
   then hands over to **Billing ▸ Billing Dashboard** (not the appointment
   screen).
   **Pressed Done by mistake?** The bill screen carries a **↩ Revert** button —
   see *Reverting a wrong “Done”* below.
4. **Billing Dashboard** (`/billing/dashboard`) lists every `DONE` booking that
   is not billed yet (`tbl_bookingheder.Status = 'DONE' AND BillingTime IS NULL`).
   Selecting one opens the bill screen for that booking.
   A `DONE` booking **leaves the appointment grid at that moment** — the grid
   (`GET /api/appointments?excludeDone=1`, used by `/appointment`) only shows work
   that still has to be done, so the Billing Dashboard is the single place where
   done, unbilled bookings are picked up.
5. **Bill screen** (`/billing?appointmentId=…`) builds itself from the database:
   - **Services** — read-only lines from `tbl_bookingservicedetail` (item, qty,
     price, **Main Technician**, supporters). They can never be added or removed
     here; only the appointment / technician screens change what was booked.
   - **Items** — free lines that can be added and removed. The item name searches
     `tbl_itemmaster` (`/api/items/search`) and picking a suggestion fills the
     item-master retail price; "Sales by" and the supporters picker list only the
     staff in `tbl_userdetails`. The materials the technician recorded
     (`Tbl_BookingServiceRecipe`) are seeded here at the retail price.
   - **Totals** — Gross ▸ Discount ▸ Gross After Dis. ▸ the enabled taxes ▸
     Net Total. (Packing, delivery and the old TOL row were removed.)
   - **Taxes come from `tbl_taxes`** (`GET /api/taxes`, only rows with
     `Enable = 1`): every enabled row is listed with its own `TaxDescription`
     and `TaxPrecentage` — nothing is hard-coded. The amounts follow the salon's
     worksheet in `src/lib/billingTaxes.ts`:
     `C = Gross - Discount`; `D = C × x%` (rows flagged `ServiceCharge = 1`);
     `E (VAT) = (C+D) × y%`; `F (NBT) = (C+D+E) × z%`; `G (SSCL) = (C+D) × p%`;
     `H (Net) = C + D + E + F + G`. A row keeps its `ListingOrder` when one is
     set, otherwise it is shown in worksheet order; an unknown enabled row
     (“Other VAT”, “City Levy”, …) is still listed and charged on `C + D`.
   - **Bill number** — nothing is printed before the payment is confirmed. The
     INV number is issued from `Tbl_Serials` (series `INV`) inside the
     complete-payment transaction and shows up on the receipt.
   - **Item lines** are shown by name only (the item-master code is not printed
     on the bill — it is carried in the background for `tbl_billdetail`).
   - **Payments** — a bill can be settled with **several methods at once**
     (`src/lib/billingPayments.ts`): Cash, Card (Visa / Master / Amex / Debit),
     Online (bank transfer / wallet / gateway) and Voucher (gift / promo /
     loyalty). Every line takes its own amount and an optional remark, the
     screen shows total paid and what is still owed, and the button switches to
     "Complete Partial Payment" when the bill is not fully covered.
     A **card / online / voucher line can never take more than the bill still
     owes** (`lineAmountCap()` in `src/lib/billingPayments.ts`): LKR 2,500 =
     card 1,500 + online 500 + card 500 — that last card line is capped at 500
     and says so on screen. **Cash is deliberately uncapped**, because handing
     over more than the bill is normal at a counter and the difference is
     returned as change.
   - **Balance** — under the payment lines the screen always states the money
     position: `Still to pay` (red) when the bill is not covered, `Balance`
     (green) when the customer handed over more than the bill — e.g. LKR 2,500
     bill paid with LKR 3,000 shows **Balance 500.00** plus the note that it is
     given back to the customer. The receipt prints the same row and says
     `Balance Due` instead when the bill is only part-paid.
   - The bill screen runs **full width** — it has no workspace sidebar, only the
     top bar with *Back to Billing Dashboard*.
   - **Complete Payment** writes the whole bill — see *Bill tables* below — and
     stamps `tbl_bookingheder.BillingTime`, which clears the booking from the
     dashboard and locks the technician additions as "billed". The bill number
     is issued by `Tbl_Serials` (series `INV`), exactly the way booking numbers
     come from the `BK` series, and is printed on the receipt.
6. **Bill tables** — `POST /api/billing/booking/:bookingID/complete` writes all
   four legacy bill tables in ONE transaction (`src/lib/billingBill.ts` holds the
   mapping, so it is testable on its own):

   | Table | What goes in |
   |---|---|
   | `tbl_billheader` | `BillNo` (from `Tbl_Serials`, series `INV`), `Txndate`/`TxnTime`, `Gross`, `DisPre`, `DisVal`, `ServiceCharge` (the enabled `tbl_taxes` rows with `ServiceCharge = 1`), `TotalTaxAmount` (every other enabled tax — VAT, NBT, SSCL …), `AdvAmount` (the booking's advance), `NetTotal`, `CusID`, `CashierID` (the signed-in user), `Rmks` |
   | `tbl_billdetail` | one row per item code — services and items together — with `Qty`, `SalesPrice`, `TotalItmPrice`, `CostPrice` (the recipe cost the technician recorded, otherwise the item master's own cost). `(LocCode, BillNo, ItemID)` is the key, so lines that share an item code are merged; `ItemID` is `CHAR(15)` and holds the **full** item code — see *Item codes* below |
   | `tbl_billpaytxn` | one row per payment line: `PayCode` (`CASH`, `VISA`, `MASTER`, `AMEX`, `DEBIT`, `CARD`, `BANK`, `WALLET`, `GATEWAY`, `ONLINE`, `GIFT`, `PROMO`, `LOYALTY`, `VOUCHER` — suffixed `2`, `3` … when a bill uses the same code twice), `TenderedAmt` (money handed over), `ActAmt` (money applied to the bill, so the difference is the change) and `Rmks` (sub-type + the line remark) |
   | `tbl_billtaxes` | one row per tax that carries money, `TaxCode` straight from `tbl_taxes`, `TaxAmount` written as text because the column is `CHAR(10)` |

   The header always adds back up:
   `Gross − DisVal + ServiceCharge + TotalTaxAmount = NetTotal`.
   A bill is refused (nothing written) when the screen total disagrees with the
   tax breakdown, when the bill has no amount, when there is no payment line,
   when the booking is already billed or when the technician has not marked the
   work DONE.

   **When a bill does not save**, the screen stays on the bill (no money lost)
   and prints the step that failed (`bill number`, `tbl_billheader`,
   `tbl_billdetail`, `tbl_billpaytxn`, `tbl_billtaxes`, `BillingTime`) together
   with the database's own message and a hint for the usual causes — a missing
   table, a column the live table does not have, a duplicate bill number (the
   `INV` counter behind the stored bills), a value too long for its column.
   The same text appears in the server log as
   `[billing-complete] failed at <step>:`.

   To test a bill without writing anything:
   `GET /api/billing/diagnose/bill?bookingID=BK0000010&dryRun=1` — it runs the
   whole write inside a transaction and rolls it back, and returns a check list
   (booking status, `Tbl_Serials` INV counter, the real columns of the four
   tables, and the result of every insert step). Add `&lines=[…]&taxes=[…]&payments=[…]`
   as JSON to rehearse an exact bill.

7. **Reverting a wrong “Done”** — the bill screen has a **↩ Revert** button
   next to the booking status (`POST /api/billing/booking/:bookingID/revert`,
   `src/lib/bookingStatus.ts` holds the ladder). It moves the booking **one
   status step back**:

   | From | To | What it is for |
   |---|---|---|
   | `DONE` | `ONGOING` | the technician marked the work done by mistake — the booking leaves the Billing Dashboard, reappears in the appointment grid as *Ongoing*, the technician screen unlocks again (materials, supporters, recipe), the work is corrected and marked done again, and only then is it billed |
   | `ONGOING` | `CONFIRMED` | the check-in itself was wrong: `tbl_bookingtxndetail.CheckInTime` is cleared again, so the technician additions lock until the client is really checked in |

   `CONFIRMED` and `PENDING` have nothing to revert to — stepping further back
   would undo the customer's confirmation, which is a *cancellation*, not a
   correction. The button is only offered while the booking is `DONE` or
   `ONGOING`, and **the revert is refused once the bill is written**
   (`BillingTime` stamped): the money is already in the four bill tables, so a
   finished sale is corrected with a refund, never with a status change.
   The header row is locked for the change, the status write and the
   `CheckInTime` reset happen in one transaction, and every revert is written to
   the activity log with the signed-in user's name.

   *Where the reverted booking shows up.* The technician screen keeps its own
   list of the day and now says **whose** list it is (a picker in the header):
   the signed-in staff user, a technician from the URL (`?technician=<UserId|name>`),
   or **All technicians**. `GET /api/appointments?technician=…` resolves the
   value against `tbl_userdetails` and narrows the day with the same matcher the
   screen uses (primary `TechID`, supporting technicians, provider name); an
   unknown value answers `technician: null` and hides nothing, so a wrong name
   can never empty the screen. The list also refreshes itself (20 s poll plus a
   reload whenever the tab is looked at) and falls back to “all technicians”
   when the selected technician has nothing on that date — which is exactly why
   a booking reverted on the bill screen cannot go missing any more. A card is
   openable while the booking is `ONGOING`, so the technician can reopen the
   reverted job, fix the work and mark it done again.

   *Times are read exactly as the database holds them.* `BookingDate` (and the
   other legacy `DATETIME` columns) hold the **shop's wall clock** —
   “2026-09-16 10:00:00” means ten in the morning, not ten in the morning UTC.
   Reading such a column with `new Date(value).getHours()` added the Node
   server's own timezone on top of it: on a server set to Asia/Colombo a booking
   stored as **10:00 AM** was listed as **3:30 PM** on the technician screen,
   while the bill screen — which reads the same column through `DATE_FORMAT`,
   as text — still showed 10:00 AM. Two screens, one database, two times.
   `src/lib/legacyTime.ts` now reads the value the way MySQL holds it (the
   `HH:MM` inside the text, or the UTC fields of a driver `Date`) and every
   screen that shows an appointment time goes through it — the appointment API,
   the bill screen, the billing dashboard, the bookings list and the main
   dashboard. A stored 10:00 AM is 10:00 AM on every screen, whatever timezone
   the server process runs in.

   *The time on the card is the scheduled time.* `GET /api/appointments` now
   also returns `scheduleStartTime` / `scheduleEndTime` — the earliest start and
   latest end of the booking's own service schedule, the same window the
   technician sees on each service row inside the booking. The technician list
   and the booking's “Time” box read those fields, so a stale header time
   (`BookingDate`, or the legacy `Remarks` time behind it) can no longer make
   the list disagree with the job. Every other screen still uses `timeSlot`
   exactly as before. While the booking is not
   `DONE` the bill screen also disables **Complete Payment** (the API refuses it
   anyway with `409`), and `PATCH /api/appointments` refuses to touch a billed
   booking at all.

8. **“Why does this booking show a different time on the technician screen?”**
   `GET /api/appointments/diagnose?bookingID=BK0000002` (or `?date=2026-09-16`
   for the whole day, `src/app/api/appointments/diagnose/route.ts`) prints, for
   each booking: the stored `BookingDate` **as text** and **as the driver hands
   it over**, the `Remarks` time token, the schedule minutes, the label every
   screen prints, and the timezone the Node process and the database session
   run in. Read-only, admin session required, switchable off with
   `ENABLE_DIAGNOSTICS=false`.

9. **When the database cannot be reached** (`P1001 Can't reach database server …`):
   - `node scripts/check-db.mjs` — reads `DATABASE_URL` from `.env`, opens a bare
     TCP connection to the host, then runs a real query. It separates a network
     problem (host name wrong / database suspended / remote access not allowed /
     port 3306 blocked by the ISP) from a credential problem (user, password,
     database name) and from an unsupported auth plugin, and prints exactly what
     to change. Read-only, nothing is written.
   - `GET /api/health` — the same answer as JSON in the browser, **no login
     required** (when the database is down nobody can sign in, and this is the
     page that says why). It reports host / database / user (never the password),
     the server version, or the error code with a hint.
   - The Billing Dashboard shows the reason as a red card with *Try again* and
     *Check database* buttons instead of an empty list.
   - Shared hosting usually needs `?connection_limit=1&connect_timeout=20` on
     `DATABASE_URL`, and remote access has to be switched on for the client IP.

9. **Item codes are CHAR(15) everywhere** — `tbl_itemmaster.ItemCode` is 15
   characters, and every table that stores a code as a foreign key is 15
   characters too (`tbl_bookingservicedetail.ServiceItemID`,
   `Tbl_BookingServiceItemAddTech.ServiceItemID`,
   `Tbl_BookingServiceRecipe.ServiceItemID`/`RawItemCode`,
   `tbl_recipes.MenuItmID`/`RowItemCode`, `tbl_billdetail.ItemID`).
   Codes are **never cut to 10 characters** any more: two codes such as
   `ITM000000000001` and `ITM000000000002` share their first 10 characters, and
   the old `LEFT(ItemCode, 10)` lookups could name and price the wrong service,
   ingredient or cost — in the booking, the technician material list and the
   bill alike. `src/lib/itemCode.ts` is the single place that normalises and
   matches a code:

   - `itemCode()` trims a value to what the CHAR(15) column can hold (never cuts
     a real code shorter than that).
   - `createItemCodeIndex()` is the lookup used by the booking, technician,
     dashboard, recipe and bill code: an exact code always wins, and the old
     10-character value of a row written **before** the migration still resolves
     through its prefix — but only while that prefix belongs to exactly ONE
     item. A shared prefix resolves to *nothing* instead of to an arbitrary
     (wrong) item.
   - Every write stores the **full** code: `POST /api/bookings` and
     `POST /api/appointmentform` (both used to cut it back to 10 characters
     with `toChar(code, 10)` — the booking detail row kept a legacy value even
     after the migration), the technician extras endpoint, the recipe editor and
     `tbl_billdetail`.
   - The **price is never taken from the browser**: `POST /api/bookings`
     recomputes every line from `tbl_ItemMaster.Retailprice` (log line
     `[PRICE_FIXED]` when a payload disagreed), exactly like the admin
     appointment form. A tampered devtools payload can therefore no longer
     decide what the bill will charge. A service with no `Retailprice` keeps the
     sent price and logs `[PRICE_MISSING]` so the missing master price is
     visible in the server log.
   - `itemCodeJoinSql()` is the SQL predicate behind the booking views,
     appointments, capacity guard and billing reads: `RTRIM` on both sides
     (so it behaves on PAD SPACE and NO PAD collations) and a length guard so an
     empty stored code cannot match everything.

   **Existing database** — run `scripts/migrate-itemcode-char15.sql`
   (phpMyAdmin → SQL → paste → Go). STEP 1 widens the columns (idempotent, no
   data lost), STEP 2 optionally upgrades the rows that still hold the old
   10-character value (only where the match is unambiguous) and STEP 3 lists
   what is left, including item codes that collide on their first 10 characters.
   `node scripts/check-db.mjs` reports the column widths and how many legacy
   rows are left, so the result is visible without reading the schema.
   The application works before and after the migration — it resolves both
   widths — but the full code only fits in the columns once STEP 1 has run.

   **Deleting an item is protected** (`DELETE /api/services/:locCode/:itemCode`):
   an item that is still referenced by booked services, supporting-technician
   rows, booked materials, recipe rows or billed lines cannot be deleted — the
   API answers `409` with the counts, and the Item Master screen offers to
   **deactivate** it instead (`Enable = 0`, `?mode=deactivate`). Deactivating
   hides the item from every picker while every past booking, recipe and bill
   keeps its item name. Only an item nothing points at is physically removed.

10. **Diagnostic endpoints** — `GET /api/billing/diagnose` and
   `GET /api/billing/diagnose/bill` explain a wrong quantity or a bill that does
   not save. Both need the admin session, and both can be switched off for
   normal salon use with `ENABLE_DIAGNOSTICS=false` in `.env` (they then answer
   `404` and touch nothing). Remove the line when a diagnostic answer is needed
   again.

11. **Tests** — `bash scripts/run-billing-tests.sh` runs the pure billing checks
    (tax worksheet, split payments + the payment cap, the bill-table mapping,
    the INV/BK series and the item-code rules: exact code wins, a shared prefix
    never names the wrong item, a legacy prefix still resolves);
    it needs no database.

12. APIs: `GET/PUT /api/bookings/:bookingID/extras`,
   `POST /api/appointments/:bookingID/done`,
   `GET /api/billing/dashboard`, `GET /api/billing/booking/:bookingID`,
   `GET /api/taxes`,
   `POST /api/billing/booking/:bookingID/complete` (all admin session only).

Create the two tables on an existing database with
`scripts/add-booking-extras-tables.sql` (already included in the Prisma
schema, so fresh installs get them via `prisma db push` / migrations), and
widen the item-code columns with `scripts/migrate-itemcode-char15.sql`.

---

## 🧾 Purchase Order / GRN (`/inventory/po`, `/inventory/grn`)

The inventory documents the salon already knew from its desktop application
(SCR_BILLING.pdf pages 3–9), rebuilt on this project's MySQL database and UI.

### 1. The database comes first

Run **`scripts/add-po-grn-tables.sql`** in phpMyAdmin **once** — it creates
`tbl_poheader`, `tbl_podetails`, `tbl_grnheader`, `tbl_grndetails` plus the
recommended `tbl_stocktxn` ledger, and seeds the two new serial counters
(`PO`, `GRN`). The script is safe to run twice.

**Does your database already have these tables** — from the old desktop system,
or from an earlier copy of this script? Then run this once, in the project
folder:

```bash
node scripts/add-po-grn-columns.mjs
```

Most live databases already hold the four tables from the old application. They
are close to what the screens need, but a few columns are not there — typically
`tbl_podetails.LineNo` (the line number inside one PO), `tbl_grnheader.PONO`
(which purchase order a receipt belongs to), `tbl_grndetails.BatchNo` (the batch
number written on the packet — see §6) and `tbl_grndetails.UpdItemPrice`.
Until they exist MySQL refuses the save with `Unknown column 'LineNo' in
'INSERT INTO'`, and the screen says *“missing a column, so nothing was saved.”*

This script brings the tables up to date and **does nothing else**:

- adds exactly the columns that are missing, using the definitions in
  `scripts/add-po-grn-tables.sql` (never drops, renames or retypes anything);
- creates one of the four tables only if it does not exist at all;
- gives rows written by the old system a line number (1, 2, 3 … per document);
- if the received-quantity columns were missing, works out how much of each
  purchase order has already arrived from your confirmed GRNs (and says so
  plainly when the old receipts do not record their purchase order);
- adds the `PO` / `GRN` counters to `tbl_serials` if they are not there;
- prints the primary/unique keys of the line tables — useful to know whether
  the same item may appear twice on one document.

It checks the database first, prints everything it does, and changes nothing on
a second run. It talks to MySQL directly (no Prisma, no rebuild, no restart).

Differences from the original SQL-Server script, all deliberate:

| Original (SQL Server) | Here | Why |
|---|---|---|
| `dbo.`, `[brackets]`, `GO`, `COLLATE`, `ON [PRIMARY]` | removed | MySQL syntax |
| `float` | `DOUBLE` | precision |
| `bit` | `TINYINT(1)` | Prisma maps it to Boolean |
| `ItemCode varchar(50)` / `char(20)` | **`CHAR(15)`** | every item-code column in this project is CHAR(15) |
| no key at all | `PRIMARY KEY` + `LineNo` added | Prisma needs a key; `(LocCode, PONO, LineNo)` also allows the same item on two lines, as the legacy screen did |
| **`DROP TABLE` at the top** | **not included** | it deletes live data |

`UpdItemPrice` on `tbl_grndetails` is the one added column: the GRN may push its
RetailPrice into `tbl_itemmaster`, and the flag records whether the user asked
for that (see §4). `tbl_grnheader.PONO` holds the purchase order a receipt came
from (blank for a direct GRN).

### 1b. How the screens talk to the database

Everything the PO / GRN screens read or write goes through **raw SQL**
(`$queryRaw` / `$executeRaw`, wrapped in the helpers in `src/lib/inventoryServer.ts`)
rather than Prisma model calls. Two reasons, both learned the hard way on a
live machine:

- a running server whose Prisma client was generated *before* these four models
  existed throws `Cannot read properties of undefined (reading 'create')` on
  every save, and regenerating the client is a restart the user should not need
  just to save a purchase order. Raw SQL works with any client state.
- MyISAM/legacy tables created by hand can carry a different collation from the
  ones this script creates, and MariaDB then refuses to compare their key
  columns (`1267 Illegal mix of collations`). Every key comparison therefore
  goes through `keySql(column)` / `keyVal(value)` — never write a bare
  `RTrim(x) = y` in these queries, and keep those helpers out of SELECT lists.
- Tables built from the original SQL-Server DDL often declare the datetime
  columns **NOT NULL**, where `scripts/add-po-grn-tables.sql` allows NULL — and
  then saving answers `1048 Column 'ConDatetime' cannot be null` and the whole
  transaction is rolled back. So the writers **never put NULL into a date
  column**: a half-finished document gets a real timestamp in `ConDatetime`, and
  a blank field is stored as the legacy empty date `1900-01-01` (`EMPTY_DATE`,
  see `isEmptyDate` / `invDateOrEmpty`). Reads map that marker back to blank, so
  the screens still show an empty box. If you touch these writers, keep both
  halves of that rule intact.

### 2. Endpoints

```
GET    /api/inventory/lookups                     locations + suppliers + units + company letterhead
GET    /api/inventory/po            list          (?locCode=, ?status=confirmed|pending, ?q=)
POST   /api/inventory/po            create        (header + lines, one transaction)
GET    /api/inventory/po/:poNo      header+lines  (?locCode= — the key is LocCode+PONO)
PUT    /api/inventory/po/:poNo      replace       (pending orders only)
DELETE /api/inventory/po/:poNo      delete        (pending, nothing received)
POST   /api/inventory/po/:poNo/confirm            Confirmation button
POST   /api/inventory/po/:poNo/email                build the sheet as a PDF and mail it to the supplier
GET    /api/inventory/grn/:grnNo/notify  ?locCode=   who can be told to confirm it + the message
POST   /api/inventory/grn/:grnNo/notify              send that SMS through Text.lk
GET    /api/inventory/grn                           list
POST   /api/inventory/grn                           create (PO-backed or direct)
GET    /api/inventory/grn/open-pos  ?locCode=      confirmed POs with something open
GET    /api/inventory/grn/:grnNo                    header+lines
PUT    /api/inventory/grn/:grnNo                    replace (pending only)
DELETE /api/inventory/grn/:grnNo                    delete (pending only)
POST   /api/inventory/grn/:grnNo/confirm            Confirmation button
GET    /api/inventory/stock-requirements ?locCode=  “Current Stock Requirements”
```

Everything sits behind the signed admin cookie: `src/middleware.ts` protects the
pages and the APIs automatically, and each route reads the actor from the
session (never from the request body).

### 3. Numbers, and what Confirmation means

- PO No (`PO0000001`) and GRN No (`GRN0000001`) come from `tbl_serials` through
  `nextSerialTx` — the same allocator as `BK` / `CUS` / `INV`. Never
  `MAX(...) + 1`, and never `SELECT … FOR UPDATE` around the counter (that
  deadlocks — see the note in `src/lib/serials.ts`).
- **Confirmation is the only place that moves stock.** Until it is pressed, a
  saved GRN is just a document. On confirmation, in ONE transaction:
  1. the item-master row is locked and `StockBalance += GRNQty + FreeQty`,
  2. a ledger row is written to `tbl_stocktxn` (`QtyIn`, balance after),
  3. the PO line is written back (`GRNQty`, `GRNNOs`),
  4. `Retailprice` is pushed into the item master **only when the line asked
     for it** — the bill charges from that column, so it must not drift silently,
  5. the header is stamped `Confirmed='Y'`, `ConUserID`, `ConDatetime`.

  Service items (`tbl_itemmaster.ServiceItem = 1`) are recorded on the document
  but do not touch stock.
- **Over-receipt is refused** (409) at save and again at confirm, with the
  quantity that is still open in the message: `GRNQty > POQty − GRNQty`.
  GRN lines must belong to the purchase order they claim.
- A confirmed document can never be edited or deleted (409). Reversing a receipt
  is a return to the supplier, not an edit.
- Totals are calculated **server-side** by `src/lib/inventoryTotals.ts`
  (`poLineValue`, `poNetTotal`, `grnLineValue`, `grnTotals`) — the browser's
  numbers are only for display. The cost/retail prices on a line are entered
  values (that is what the supplier quoted), but an empty one falls back to
  `tbl_itemmaster`, so a line can never be worth 0 by accident.

### 4. The dropdowns read the database, exactly as it is

`GET /api/inventory/lookups` answers the three lists a PO/GRN screen needs in
one round trip, straight from `tbl_locationmaster`, `tbl_suppliermaster` and
`tbl_unitmaster`:

- CHAR columns are `RTRIM`med, so `LOC0000004` never shows padded;
- **nothing is filtered out** — a row with `Enable = 0` is returned too and the
  screen shows it as “(Inactive)” instead of it silently disappearing;
- the three lists load independently: if one table cannot be read the other two
  still arrive, and the failing one is reported in `errors{}` — the page prints
  that in red above the form instead of showing a very convincing empty
  dropdown.

Item lines use the same `/api/items/search` as the bill screen and the recipe
editor, extended with the cost price (`OverallCost || RawCost`).

### 5. Current Stock Requirements — supplier by supplier, tick what you order

The third tab of the PO screen answers “what must I buy for this branch?” and
then puts the answer on the order:

- **Grouped supplier-wise.** The item master names the supplier each item is
  bought from (`tbl_itemmaster.SupID`), so the tab draws one block per supplier
  — supplier name, how many of its items are short, and how many units are
  suggested in total. Inside a block the worst shortage is first. An item whose
  `SupID` is empty still gets a block, labelled *No supplier on the item
  master*.
- **Tick as many as you like.** There is a tick box per item, one on each
  supplier heading (the whole supplier at once) and one in the table heading
  (everything). The buttons are **Add selected to PO (n)** and **Clear ticks**;
  a note above the table says how many rows are ticked.
- **Only what you ticked goes on the order.** Adding *replaces* the order grid
  with exactly the ticked rows — no leftover lines from before — each with the
  suggested quantity and the master cost price (`OverallCost`, otherwise
  `RawCost`) filled in and still editable. If the form already holds lines, or
  a saved order is open, it asks first.
- **Location and Supplier fill themselves in.** Location is the branch the
  requirements were read for. Supplier comes from the ticked items — and
  because a purchase order is addressed to ONE supplier, a selection that spans
  two suppliers is refused with a message instead of guessing: tick one
  supplier's items (`{ supID, supName }` per row, decided by
  `supplierForSelection` in `src/lib/poRequirements.ts`).
- **The unit column shows the unit NAME.** `tbl_unitmaster` holds the name
  (`UnitDes`) next to the code (`MasterUnitID`), and the screen prints the name
  — in the order grid (a dropdown of names, storing the code) and in the
  requirements table. A code that is not in the unit master is shown as
  “*code* — not in unit master” rather than being blanked out; the stored value
  is always the code, exactly as `tbl_podetails.UnitID` expects.

The rules above are pure functions in `src/lib/poRequirements.ts`
(`groupRequirementsSupplierWise`, `suppliersOf`, `supplierForSelection`,
`requirementLines`) and are covered by section 10 of
`scripts/billing-tests.js`.

### 6. Receiving against a purchase order — one line at a time

Picking a purchase order used to fill the whole grid at once: every open line of
the order appeared, each with its quantity, and the store keeper had to find the
ones the lorry actually brought. Now the order is worked through **line by
line**, exactly like reading the supplier's invoice:

| | |
|---|---|
| **The entry row** | the next line still to be added, on its own row at the bottom of the grid (pale amber, with an **Add** button) |
| **After Add** | that line moves up into the grid as part of the receipt and the entry row changes to the next line of the order |
| **Progress** | a strip above the grid: `PO0000007 · 2 of 5 line(s) added · 3 left to add` |
| **Skip** | this line did not arrive — it goes to the **back** of the queue, so it comes round again |
| **Remove a line from the grid** | it goes back to the **front** of the queue, batch number and all, so it can be added again |

**The keyboard does the work.** The cursor lands on **Cost Price** of the entry
row automatically (cleared out ready to be typed over) — type the price, press
**Enter**, and the focus jumps to the **Add** button — press **Enter** again and
the line is added, the next line arrives and the cursor is back on Cost Price.
Enter works on every box of the entry row, so the whole delivery can be entered
without touching the mouse:

```
Qty  ⏎        (or Batch No ⏎, or Cost Price ⏎ …)
        → Add is focused
⏎
        → added, next line comes, Cost Price is focused again
```

Three details worth knowing:

- **The batch number is a new column on the GRN grid** (`Batch No`, next to
  Unit) — the number printed on the packet, typed per line, saved with the line
  and shown again when the receipt is opened. It is stored in
  `tbl_grndetails.BatchNo` (`VARCHAR(50)`); see §1 for the one-liner that adds
  the column to an existing database. A database without that column still saves
  receipts — only a receipt that actually carries a batch number is refused, and
  the message names the script.
- **The quantity arrives pre-filled** with what is still open on the order, and
  the line reminds you how much was already received (`ordered 10, already
  received 4 · received 0`).
- **A line that is still on the entry row is not in the document.** Pressing
  **Save** while a line is waiting tells you so, by name, in the same message as
  the save: *“…is still on the entry row, so it is NOT in this GRN — press Add
  if it arrived, then Save again.”* Nothing is silently dropped, and nothing is
  silently added.
- The **Unit** column shows the unit NAME (the same rule as the purchase order
  screen); a Direct GRN keeps its plain empty grid with the old `+ Add line`.

The queue itself is plain arithmetic in `src/lib/grnPoEntry.ts`
(`poEntryFields`, `poEntryProgress`, `queueAccept`, `queueSkipFirst`,
`queueRequeue`), covered by section 13 of `scripts/billing-tests.js`.

### 7. Telling an admin that a saved GRN needs confirming

A saved GRN does not move stock: it waits for somebody to press
**Confirmation**. The store keeper saves it at the counter, and the admin who
can confirm it is often somewhere else. So the save now ends with a small popup
— **Message an admin to confirm**:

1. the people who can be texted are listed, **admins first** (their group name in
   `tbl_usergroups` contains “admin”), each with their number;
2. the first one is already picked; a number can be typed instead if the person
   is not a login at all;
3. the message is written out and can be edited before it goes;
4. **Send SMS** — the message goes through Text.lk, and the popup says *Sent to
   Zara Perera ✓*. The same button stays on the toolbar (**Message Admin**) so it
   can be sent again later.

```
SAYO Beauty: GRN GRN0000005 is saved and waiting for Confirmation.
PO0000006 · LANKA HAIR & SKIN CARE SUPPLIES · 36,950.00
MAIN BRANCH - COLOMBO 03 · 2 item line(s) · by Zara Perera
```

Decisions worth knowing:

- **The numbers come from `tbl_userdetails.ContNo`** — the staff master, not a
  new list. Only a Sri Lankan mobile is offered (`077…`, `+94…`, `0094…` all
  normalise to `947XXXXXXXX`); a land line or a number that was never filled in
  is left out of the list, because Text.lk would refuse it. A disabled login is
  left out too.
- **Text.lk, not a Gmail/SMS gateway of its own** — the same account the
  appointment messages already use (`TEXTLK_API_TOKEN`, `TEXTLK_SENDER_ID`). If
  those are empty the popup opens anyway, names the empty keys, and the send is
  refused with **HTTP 503** — nothing is sent half-configured.
- **A confirmed receipt has nothing to announce**: sending is refused (409) once
  `Confirmed = 'Y'`.
- **Every message is written to the activity log** — *“GRN GRN0000005 saved at
  LOC0000001 — asked Zara Perera (077\*\*\*567) by SMS to confirm it”* — so the
  dashboard shows who was told and when.
- The text itself (wording, who is offered, the mobile-number rule) is in
  `src/lib/grnNotify.ts` and is covered by section 14 of
  `scripts/billing-tests.js`.

### 8. The purchase order’s “the goods came” flag (GRNed)

The old desktop program finished every GRN save with

```sql
UPDATE Tbl_POHeader SET GRNed = 'Y' WHERE LocCode = … AND PONO = …
```

Same table, same column: confirming a GRN against an order now leaves that mark
too, so an old report that reads `tbl_poheader.GRNed` agrees with this screen.

- **Y only when the whole order has arrived** — every line has `GRNQty >= POQty`.
  The old program set it on the first receipt, but this screen can receive a
  delivery in several parts, so a part delivery leaves the order open. What
  happened is written in the activity log: *“PO0000002 updated (1 of 2 line(s)
  received — 1 still open)”*.
- **A missing column never blocks anything.** If `tbl_poheader.GRNed` is not on
  the database yet, the confirmation goes through exactly as before and nothing
  is written. Run `node scripts/add-po-grn-columns.mjs` to add the column — it
  also marks the orders that were already completed as received.
- The answer from `POST /api/inventory/grn/:grnNo/confirm` carries it:
  `"poReceived": { "flag": "Y", "words": "all 2 line(s) received" }` — or `null`
  for a direct receipt / a database without the column.

**What was NOT built, and why** (asked and answered on 2026-09-18): the old
program also kept stock in `Tbl_RowItems` (`StkBal`, `RowCost`) with a ledger in
`Tbl_TxnMovement`, and moved item cost through `Tbl_Recipies` / `Tbl_Menuitems`
with a moving average —

```
newCost = ((oldCost × stockOnHand) + (GRNcost × GRNqty)) / (stockOnHand + GRNqty)
```

None of those tables exist on this database (`scripts/check-legacy-tables.mjs`
reports them MISSING) and the old program is no longer in use, so stock stays
where it is — `tbl_itemmaster.StockBalance` + `tbl_stocktxn` — and no cost
average is written. The number series stays this project’s own
(`tbl_serials`, `SeriCode = 'GRN'`). Everything that needs re-deciding is in
`GRN_LEGACY_ALIGNMENT.md`.

### 9. Where a receipt puts the stock — two tables, one number

A confirmed GRN moves stock in **both** places the database keeps it, out of the
same quantity:

| Table | What it holds | Who shows it |
|---|---|---|
| `tbl_itemmaster.StockBalance` | one balance per item per branch | the PO screen, the stock-requirements screen |
| `tbl_itemdetail` (`LocCode, ItemCode, ExpiryDate, ItemQty`) | one row per batch / expiry | **the Item Master screen** — its Stock box and its “Stock (read-only)” column are `SUM(ItemQty)` |
| `tbl_stocktxn` | the ledger: one row per movement | the stock reconciliation / reports |

Before this was wired together, the Item Master screen kept showing a number
that no receipt ever changed — the confirm wrote the item balance and the ledger
only. Now the batch row goes in in the same transaction:

- the quantity is `GRNQty + FreeQty` — exactly what went onto the balance and
  into the ledger, so the three can never disagree;
- the row is matched on **(LocCode, ItemCode, ExpiryDate)** and the quantity is
  added to it, so two receipts of the same batch stay on one row;
- a line with **no expiry date** lands in the `1900-01-01` bucket — the same
  “empty date” convention the purchase tables use;
- a **service line** writes no batch row (it has no stock);
- **if `tbl_itemdetail` is not on the database** the receipt still confirms —
  the balance and the ledger are written, the answer says
  `"itemDetailWritten": false`, and nothing is refused.

Receipts confirmed **before** this change are not backfilled: their goods are in
the item balance and the ledger, but not in the batch table. If the Item Master
screen must agree with the balance on an existing database, ask — a read-only
report of the differences can be produced first, and only then a one-off top-up.

### 10. Printing — the button asks for a copy

**Print** does not print straight away: it asks which of the two legacy copies
is wanted, then builds that sheet and opens the browser's print dialog.

| Copy | Columns | Money on the sheet |
|---|---|---|
| **Standard Copy** | ItemCode · RowItmDes · Unit · Qty · Cost Price · ItemValue | line values **and** the blue **Total** band — the salon's own copy |
| **Supplier Copy** | ItemCode · RowItmDes · Unit · Qty | none: no cost price, no item value, no total, nothing else about money at all |

Both copies are the same sheet otherwise, top to bottom: the letterhead from
`navconfig.logo_text` / `footerconfig` (falling back to the branch, then SAYO),
`Purchase Order` centred, the PO No / PO Date / Due Date then a gap and Print
Date / Print Time / User box on the right, the supplier panel in its pale green
box, the cream table heading with the PO number as its first row, `Deli. Add`,
`Remarks` and the footer with the page number and which copy it is.

A few decisions worth knowing:

- **The sheet is its own component** (`src/components/PoPrintSheet.tsx`) with its
  own stylesheet, rendered on screen but hidden — the print stylesheet reveals
  it and hides the screen (`.po-shell`, the tabs, the dialog, the toasts). So
  what comes out of the printer is the sheet and nothing else, and the form
  itself never has to be squeezed into a print layout.
- **The Unit column prints the unit NAME** (`UnitDes`), the same name the screen
  shows; the stored code is untouched.
- **Dates print the legacy way** — `10-Aug-2026`, `10:07:22 pm` — never through
  the machine's locale, and the Print Date/Time is the wall clock at the moment
  the button was pressed (frozen in the print job, so re-rendering cannot change
  what is about to be printed).
- **Money** is `16,850.00` — thousands separators, two decimals, exactly like the
  legacy sheet; the Total is the sum of the printed ItemValue column.
- **Nothing but the sheet reaches the paper.** The browser's own print header and
  footer (the date, the page title across the top, the `192.168.1.100:3000/… 1/1`
  at the foot, the print dialog's “Headers and footers” option) is drawn in the
  page margin — so the print stylesheet uses **`@page { margin:0 }`** and the
  sheet carries its own 10mm of white space instead. With no margin there is
  nowhere for the browser to draw its lines, and the sheet still stays clear of
  the printer's non-printable edge. (The tab title is `SAYO — Salon Management`
  either way; it is no longer `Create Next App`.)
- The year of the day is **not** re-read from the database at print time: an
  unsaved order prints `(not saved)` in the PO NO line, so nobody files a sheet
  under a number that was never issued.

### 11. E-mailing the sheet to the supplier

The order sheet does not only go to the printer — there is a second, separate
button, **Email to Supplier**, next to **Print**. It opens a small box, and when
it is sent the server builds the *same sheet as a PDF* and mails it to the
address saved against the supplier the order belongs to.

| Field in the box | What it does |
|---|---|
| **To** | already filled with the supplier's address from the supplier master; it can be typed over (several addresses: separate them with `,` or `;`) |
| **Copy** | Standard Copy / Supplier Copy — the same two sheets as the print dialog. **Supplier Copy is the default here**, because the mail is going to the supplier and it carries no cost price, no item value and no total |
| **Subject** | `Purchase Order PO0000007 — MAIN BRANCH - COLOMBO 03` (editable) |
| **Message** | a short covering note, editable; it never mentions money |
| **Attachment** | `PO0000007.pdf` — one page, A4, named after the PO |

The address list is read exactly as the supplier master stores it
(`Emails`, `Tbl_SupplierMaster`): `;`, `,`, spaces and `<>()` are all accepted
and several addresses are kept. If nothing valid is saved for that supplier the
button says so on the spot instead of sending the order nowhere.

Two things the sheet keeps from the print button: **Supplier Copy never shows
money anywhere** — not in the table, not in the total band, not in the e-mail
text — and the PDF is **always a single page**: it is laid out position by
position with pdfkit, every line measured and trimmed to its column, so a long
item name gets an `…` instead of pushing the rows down and starting a second
page.

**Settings** — the mail is sent through the SMTP account in the project's `.env`
file (the same file that already holds `DATABASE_URL` and `AUTH_SECRET`; Next.js
reads `.env.local` too, but `.env` is what this project uses):

```ini
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false          # optional; 587 is not a secure port
SMTP_USER=sayo.worksofficial@gmail.com
SMTP_PASS=xxxxxxxxxxxxxxxx  # a Gmail App Password, not the account password
SMTP_FROM="SAYO Beauty <sayo.worksofficial@gmail.com>"
```

**`pdfkit` is a new package** — the e-mail attachment is built with it. If the app
does not start and the browser/console says
`Module not found: Can't resolve 'pdfkit'`, the project was updated but the
packages were not installed yet:

```bash
cd E:\sayo_admin\sayo-admin
npm install
```

(`npm install pdfkit @types/pdfkit` does the same thing if you would rather not
replace `package.json`.) `npm install` is needed after every update that adds a
file under `src/` **and** a new package — a source-only copy is not enough.
`nodemailer` was already a dependency, `pdfkit` is the one that is new.

The values are read when the server starts, so **restart** (`npm run dev`, or
stop and start `npm start` / `node server.mjs` / `node server.js` — whichever one
your hosting uses) after adding them — no rebuild is needed. The same goes for
`TRUST_PROXY` / `SAYO_IP_SOCKET_ONLY` from §4.

If one of those is empty the screen says exactly which keys are missing and the
mail is not attempted — nothing is sent half-configured, and the same message is
returned as HTTP **503** by
`POST /api/inventory/po/:poNo/email` with the empty key names in `missingEnv`.
The Gmail App Password needs 2-step verification on the account; the ordinary
account password will be refused.

### 12. Files

```
scripts/add-po-grn-tables.sql              the SQL to run (tables + serials + ledger)
prisma/schema.prisma                       4 models: Tbl_POHeader / Tbl_PODetails / Tbl_GRNHeader / Tbl_GRNDetails
src/lib/inventoryTotals.ts                 all PO/GRN maths (pure — tested)
src/lib/poRequirements.ts                  Stock Requirements rules (grouping, supplier pick, tick → lines)
src/lib/grnPoEntry.ts                      receiving one PO line at a time (pure — tested)
src/lib/grnNotify.ts                       the “tell an admin to confirm” wording + who may be told (pure — tested)
src/lib/poReceiptState.ts                  when an order counts as received (GRNed) (pure — tested)
src/lib/itemDetailStock.ts                 the batch/expiry stock row (tbl_itemdetail) (pure — tested)
scripts/check-legacy-tables.mjs            read-only: which old desktop tables exist on your database
src/lib/sms.ts                             Text.lk sending (appointments, registrations, GRN notifications)
src/app/api/inventory/grn/[grnNo]/notify    GET who can be told · POST send the SMS
src/lib/poPrint.ts                         printed-copy rules + date/time/money formatting (pure — tested)
src/components/PoPrintSheet.tsx            the printed sheet itself (both copies) + PO_PRINT_CSS
src/lib/poEmail.ts                         supplier addresses, subject/body wording, SMTP settings (pure — tested)
src/lib/poPdf.ts                           the same sheet as a one-page A4 PDF (pdfkit — server only)
src/lib/companyLetterhead.ts               letterhead shared by the print sheet and the PDF
src/app/api/inventory/po/[poNo]/email      builds the PDF and sends it through SMTP
src/lib/inventoryServer.ts                 validation, “does it exist”, actor from the cookie
src/app/api/inventory/**                   the endpoints above
src/app/inventory/po/page.tsx              PURCHASE ORDER (Find · Details · Stock Requirements)
src/app/inventory/grn/page.tsx             GOOD RECIVED NOTE (+ Direct GRN, + COST AND RETAIL PRICE popup)
src/components/ItemSuggestInput.tsx        the item-name box with the never-clipped suggestion panel
```

## 🌱 Sample salon catalogue (`scripts/add-salon-sample-data.mjs`)

One run fills a database with a working salon catalogue in English, in this
order — units first, because everything else refers to them:

| Step | Table | What is written |
|---|---|---|
| 0 | — | creates any of the tables below that do not exist yet (never alters one that does) |
| 1 | `tbl_unitmaster`, `tbl_unitsub`, `tbl_unitconversion` | 20 units (PIECE, BOTTLE, TUBE, JAR, LITRE, KG …), 10 sub units, 11 conversions (1 BOX = 12 PIECE …) |
| 2 | `tbl_locationmaster` | 4 branches with real Sri Lankan addresses (Colombo 03, Kandy, Galle, Negombo) |
| 3 | `tbl_suppliermaster` | 12 local trade suppliers (hair colour, skin care, nails, disposables, equipment, herbal) |
| 4 | `tbl_itemcategory1…4` | 18 item types + service groups, 25 brands, 10 usage areas, 5 price segments |
| 5 | `tbl_itemmaster` | **500 items** (`ServiceItem = 0`) — shampoo, colour, keratin, facials, wax, nails, makeup, barber, consumables, tools, spa, bridal — each carrying the supplier it is bought from (`SupID`) |
| 6 | `tbl_itemmaster` | **50 services** (`ServiceItem = 1`) — cuts, colour, keratin, facials, threading, waxing, nails, bridal, spa, each with a duration and an LKR price |

```bash
node scripts/add-salon-sample-data.mjs                 # the whole catalogue
node scripts/add-salon-sample-data.mjs --locCode=LOC0000001   # one branch only
node scripts/add-salon-sample-data.mjs --dry-run       # connect, report, write nothing
node scripts/add-salon-sample-data.mjs --plan          # no database at all: show what it would write
```

* **Where the items go.** `tbl_itemmaster` is keyed by `LocCode + ItemCode`
  (one row per branch — the same thing the Item Master screen does when a
  service is saved), so 500 items × 4 branches = 2000 rows. Prices are the
  same everywhere; adjust per branch in the screen afterwards.
* **Safe to re-run, safe next to real data.** Every insert is
  `INSERT IGNORE` on the app's own keys, so nothing existing is updated,
  duplicated or deleted. Nothing outside these tables is touched.
* **Old table layouts are handled.** If a table has extra `NOT NULL` columns
  that carry no default (common in databases from the old desktop system), a
  safe value is filled in and the script prints exactly which columns those
  were — it never renames, retypes or drops anything.
* **Every item names the supplier it is bought from.** The brand decides which
  of the 12 suppliers, deterministically, so a second run assigns exactly the
  same one — that is what lets the Purchase Order screen list its Current Stock
  Requirements supplier by supplier and fill a supplier in by itself. Runs from
  before this existed left the column empty (`0`), so the script also fills the
  supplier in on the codes it owns while it is still blank — never on any other
  row, and never over a supplier somebody has already set. (Services keep no
  supplier: a haircut is not bought in.)
* **Prices are built, not invented at random.** Each product line has a real
  cost and retail price for its standard size; bigger packs (1 LTR against
  250 ML) are scaled from it with the usual bulk discount, then rounded to a
  shop price. Item codes use the reserved block `ITM000000001001` …
  `ITM000000001500` (services `ITM000000002001` … `ITM000000002050`), which
  the app never generates by itself.

## 🔢 Serial numbers (`Tbl_Serials`)

Every auto-generated code takes its number from one small table instead of
being calculated inside the API code by scanning the transaction tables
(`MAX(existing BK…) + 1`).

```
SeriCode   char(10)   prefix of the series, e.g. "BK", "CUS"
SeriNo     char(10)   the last number that was issued, e.g. "0000042"
SeriDate   date       the day that number was issued
```

### Series in use

| `SeriCode` | Used for      | First ID issued | Accepted variants |
|------------|---------------|-----------------|-------------------|
| `BK`       | Booking ID    | `BK0000001`     | `B`, `BOOK`, `BOOKING` |
| `CUS`      | Customer code | `CUS0000001`    | `C`, `CUST`, `CUSTOMER` |
| `INV`      | Bill number   | `INV0000001`    | `I`, `INVOICE`, `BILL`, `BILLNO` |
| `PO`       | Purchase order| `PO0000001`     | `P`, `PORDER`, `PURCHASE` |
| `GRN`      | Goods received| `GRN0000001`    | `G`, `GR`, `GOODSREC` |

**A database that names a series differently keeps working.** Older databases
often hold the invoice counter as `I` (`SeriCode` is `char(10)` and the old
screens printed `I0000042`). The allocator looks the row up by the canonical
code first and by the variants second, uses the existing counter (and its own
number of digits — a 6-digit legacy counter keeps 6 digits), and only creates a
row when the series is genuinely new. If an old empty row sits next to the live
one, the row that has already issued numbers wins, so a bill number that is
already in `tbl_billheader` is never handed out twice.

### How a number is issued

1. read `SeriNo` for the code &nbsp;→&nbsp; `0000042`
2. add one &nbsp;→&nbsp; `43`
3. the new ID is `SeriCode` + the padded number &nbsp;→&nbsp; **`BK0000043`**
4. write `0000043` back to the row and stamp `SeriDate` with today

Steps 1–4 are a **single `UPDATE`** (`src/lib/serials.ts`). InnoDB holds an
exclusive lock on the counter row for that statement, so two bookings saved at
the very same instant queue behind each other instead of racing.

> **Do not add a `SELECT … FOR UPDATE` or an `INSERT IGNORE` in front of it.**
> An earlier version did, and it deadlocked under load: `INSERT IGNORE` takes a
> shared lock, the following `FOR UPDATE` needs an exclusive one, and two
> transactions end up holding the lock the other is waiting for.

Gaps in the sequence are normal. If a booking is rolled back after the number
was taken (conflict, validation error, network drop) that number is skipped.

### Files

| File | Role |
|---|---|
| `src/lib/serials.ts` | the allocator — `nextSerialTx()`, `peekSerial()`, `ensureSerialRow()` |
| `scripts/add-serials-table.sql` | creates the table, seeds the counters, backfills them |
| `scripts/test-serials.ts` | test suite for the allocator |
| `prisma/schema.prisma` | `model Tbl_Serials` |

### Adding a series to a database that already has data

Run `scripts/add-serials-table.sql` once. It is idempotent and it *backfills*
each counter from the highest code already stored, so the allocator can never
hand out a code that a row is already using:

```bash
npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/test-serials.ts
# or with more concurrency:
CONCURRENT=150 npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/test-serials.ts
```

### Adding a brand new series

1. Add the code to `SERIAL_CODES` in `src/lib/serials.ts`.
2. Insert its starting row:

   ```sql
   INSERT IGNORE INTO tbl_serials (SeriCode, SeriNo, SeriDate)
   VALUES ('BILL', '0000000', NULL);
   ```

3. Call it from the same transaction that writes the record:

   ```ts
   const billNo = await nextSerialTx(tx, SERIAL_CODES.bill);
   ```
