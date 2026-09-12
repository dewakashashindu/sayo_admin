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

## 3. Run

```bash
npm install
npx prisma generate
npm run dev      # or: npm run build && npm start
```

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
   check-in stamp and flips the header status to `DONE`.
4. **Billing** — the appointment screen only shows "Go to Bill" for `DONE`
   bookings (checked-in bookings without done show a disabled button).
   The bill automatically pulls the technician additions:
   - used materials appear as extra bill lines priced at the item-master
     **retail price** (Qty × Retailprice),
   - supporting technicians appear in the first service line's supporters
     field ("Service staff").
5. APIs: `GET/PUT /api/bookings/:bookingID/extras` (admin session required),
   `POST /api/appointments/:bookingID/done` (admin session required).

Create the two tables on an existing database with
`scripts/add-booking-extras-tables.sql` (already included in the Prisma
schema, so fresh installs get them via `prisma db push` / migrations).
