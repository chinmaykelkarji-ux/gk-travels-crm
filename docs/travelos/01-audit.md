# TravelOS — Phase 0 Audit of the existing GK Travels CRM

Date: 2026-09-18 · Branch: `claude/travelos-operating-system-581b62` · Base commit: `0e1b3518`
Scope: full repository read, Prisma schema, every Express route and service, the Zustand store, the frontend modules, and a **read-only** inspection of the live Neon database.

This document covers items A–G of the brief (architecture, feature inventory, database, technical debt, security, UX, performance) plus the concrete bug list, the capability gap against the TravelOS specification, and migration risks. The target architecture (H–J) is in `02-target-architecture.md`; the migration strategy, roadmap, risks and testing plan (K–N) are in `03-migration-and-roadmap.md`.

---

## 0. Executive summary

The CRM is a real, working system with a surprisingly strong finance core (GST invoicing, credit/debit notes, numbering sequences, a transactional finance service) sitting on top of a fragile "load everything into the browser and write whole objects back" data layer. Three generations of code coexist:

| Generation | Where | Pattern | Status |
|---|---|---|---|
| Gen 0 — Supabase era | `src/backend/{supabase,repositories,services,api}`, `supabase/`, `index.legacy.html`, `assets/js` | Supabase client + repositories + TanStack Query | Dead code (2,400 LOC). Still bundled. |
| Gen 1 — "legacy CRM" | `src/store/index.ts`, `src/modules/{trips,bookings,customers,leads,quotations,itineraries,vouchers,vendors,receivables}`, matching routes | Client generates IDs, computes finance, and PUTs entire entities; server upserts whatever it receives | Working, used daily, but the source of most integrity and security defects |
| Gen 2 — "operations layer" | `Enquiry`, `SalesQuote`, `TripService`, `OutboxEvent`, `MessageLog`, `dashboard/today`, `financeService`, `invoiceService`, AI services | Server-computed, Prisma relations, enums, Decimal, permissions | Solid direction; incomplete and disconnected from Gen 1 (two quotation engines, two "line item" concepts, two notification systems) |

The live database is tiny (9 customers, 1 trip, 8 bookings, 2 invoices, 12 MB), so data preservation is straightforward and the migration can be structural rather than surgical. The biggest risks are not the data volume but (1) the client-as-source-of-truth pattern, (2) eleven routers with no authorisation beyond "logged in", (3) schema drift between Neon and git, and (4) background workers that never run in production because Vercel is serverless.

Verdict: **evolve, do not rewrite.** Keep the stack (React/Vite, Express, Prisma, Neon, Vercel), keep the finance and GST core, keep the Gen 2 direction, and migrate Gen 1 module by module behind a server-authoritative API.

---

## A. Existing architecture audit

### A.1 Stack (verified from `package.json`, configs and code)

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18.3, Vite 5, TypeScript 5.5 (strict), Tailwind 3.4, Radix primitives (12 wrappers in `src/shared/components/ui`), lucide, framer-motion, react-hook-form + zod (2 forms), recharts, xlsx | `@supabase/supabase-js` and `@tanstack/react-query` are still dependencies and manual vendor chunks although effectively unused |
| State | One Zustand store, `src/store/index.ts` (2,031 lines) | Holds 20 entity arrays for the whole company |
| API | Express 5.2, Prisma 5.22, `cookie-parser`, `cors`, `bcryptjs`, `jsonwebtoken`, `nodemailer`, `axios`, `@google/generative-ai` | 29 routers mounted in `server/src/app.ts` |
| Database | Neon Postgres (ap-southeast-1), single `neondb` | 34 tables, 12 enums, 18 foreign keys |
| Auth | Email + bcrypt (cost 12), JWT (30 days) in an HttpOnly `gkcrm_session` cookie, `sameSite: lax` | Role enum: `ADMIN`, `BOOKING`, `OPERATIONS`, `ACCOUNTS` |
| AI | Gemini `gemini-2.5-flash-lite` via `server/src/lib/gemini.ts` | Text generation only (messages, itinerary prose); returns 503 when unconfigured |
| Messaging | WhatsApp BSP (Gupshup-style REST) and SMTP | Both unconfigured in production; all 20 `message_logs` rows are `FAILED: WHATSAPP_BSP_URL not configured` |
| Deployment | Vercel: static `dist/` + one serverless function `api/index.ts` (30 s max) that exports the Express app | `server/src/index.ts` (local only) is the only place `startOutboxWorker()` / `startSchedulerWorker()` run |
| Tooling | `npm run build` = `prisma generate && tsc && vite build`; `tsconfig.json` includes only `src/` | No tests, no lint script, no CI. `tsconfig.server.json` exists but is not part of the build |

### A.2 Runtime topology

```
Browser (SPA) ──/api──▶ Vercel function api/index.ts ──▶ Express app ──▶ Prisma ──▶ Neon
      │                                   (no workers, no cron, no file storage)
      └─ Zustand store hydrated once from GET /api/data/all (20 tables, nested includes)

Local dev: Vite :3000 proxies /api → tsx watch server/src/index.ts :3001 (+ setInterval workers)
```

### A.3 Data flow pattern (the defining architectural fact)

1. `AppShell` mounts → `fetchAll()` → `GET /api/data/all` (`server/src/routes/data.ts`) returns every trip, lead, customer, passenger, booking, payment, task, reminder, vendor, vendor payment, quotation (+items), itinerary (+days), voucher, receivable (+entries), communication, invoice/CN/DN (+items), company settings, and the last 500 activity rows — to every role.
2. Screens read from the store. Nothing is paginated or filtered server-side.
3. Mutations are optimistic: the store patches state, **generates the ID client-side by scanning the in-memory array** (`src/shared/utils/id.ts`), recomputes finance client-side (`calcTripFinance`), then fires `POST`/`PUT` with the **entire entity** and ignores the result except for a toast on failure (`onMutationError`, which deliberately stays silent on 401/403).
4. Routes `upsert` on the client-supplied `id` after stripping only `createdAt`/`updatedAt` (`sanitize`/`strip` in 11 routers). The server does not validate, recompute, or own anything for Gen 1 entities except activity-log side effects.

Consequences: any two browsers can generate the same ID; a stale tab overwrites newer server state (including balances written by `financeService.recordPayment`); permission failures are invisible to the user; and "what has this customer paid" has four candidate sources of truth (`Trip.paidAmount`, `Payment` rows, `Receivable.totalReceived`, `FinancialTransaction`).

### A.4 Backend structure

- `server/src/app.ts` — CORS allowlist, cookie parser, JSON body limit 10 MB, request logger, 29 routers, 404, global handler that returns `err.message` to the client.
- `server/src/middleware/auth.ts` — `requireAuth`, `requireRole`; JWT secret enforced (≥32 chars) since `0e1b3518`.
- `server/src/lib/permissions.ts` — static `resource:action` strings per role; `requirePermission`.
- Routers with **no** permission checks beyond `requireAuth` (11 of 29): `activity`, `bookings`, `communications`, `data`, `itineraries`, `leads`, `passengers`, `tasks`, `vendors`, `vouchers`, and `trips` (only `DELETE` is gated).
- Well-built services: `services/invoiceService.ts` (925 lines; transactional numbering, GST split, receivable linkage, freeze dates), `services/financeService.ts` (transactional payment/payable recording with ledger + activity), `lib/activity.ts` (single activity writer with before/after). These are the parts to keep.
- Business logic imported from the frontend tree by relative path (`../../../src/shared/utils/{finance,gst,id,date,taskEngine}.js`) — works, but couples the server to the SPA's folder layout and forbids React imports in those files.
- Workers (`workers/outboxWorker.ts`, `workers/schedulerWorker.ts`) implement payment reminders (7/3/1 days), supplier confirmation alerts, departure reminders and booking confirmations via an idempotent outbox. **They never execute in production** (see A.1). The 13 `outbox_events` rows were produced by a local run in June.

### A.5 Frontend structure

- `src/App.tsx` — 50 lazy routes; guards are role lists (`RoleGuard allowed={['ADMIN','ACCOUNTS']}`), not permissions.
- Three permission vocabularies coexist: `src/backend/auth/permissions.ts` (`trips:view`, used by `usePermission` in `AuthContext`), `src/shared/hooks/usePermissions.ts` (`trips:read`, mirrors the server, used by `PermissionGate` and the sidebar), and route-level role arrays. They disagree with each other and with the server.
- Giant files: `store/index.ts` 2,031, `TripDetail.tsx` 1,465, `Customers.tsx` 1,453, `Bookings.tsx` 1,172, `Analytics.tsx` 984, `QuotationDetail.tsx` 949, `Dashboard.tsx` 901.
- Finance math still lives in 8 screen files (`Math.round(...*100)/100` and GST arithmetic in `Dashboard`, `InvoiceBuilder`, `CreditDebitNoteForm`, `QuotationBuilder`, `Quotations`, `SalesQuoteBuilder`, `SalesQuoteList`, `TripDetail`).
- Hard-coded staff list (`defaultStaff`: Priya Singh, Arjun Patel, Deepak Verma) in the store is what task assignment offers, not the real `users` table.
- `AuthContext` hard-codes `orgId: 'gktravel'`.

### A.6 Type-check and build state

| Check | Result today |
|---|---|
| `tsc -p tsconfig.json` (frontend) | Clean |
| `tsc -p tsconfig.server.json` (server + api) | **73 errors** — `salesQuote.ts` 28, `enquiry.ts` 13, `trips.ts` 5, `receivables.ts` 4, `quotations.ts` 4; mostly `TS2322` (Decimal / `string | string[]` params) and `TS2551` |
| Tests | None. No test runner installed |
| CI | None. Deploy = push to GitHub → Vercel build |

---

## B. Current feature inventory

Legend: **Working** = used in production and behaves; **Partial** = exists but incomplete or inconsistent; **Broken** = fails or silently loses data; **Dead** = unreachable or unused.

| Area | Screen(s) | Backend | Data owner | Status | Notes |
|---|---|---|---|---|---|
| Login / session | `LoginPage` | `auth.ts` | server | Working | `Signup`, `ForgotPassword`, `ResetPassword` pages exist but are not routed; `ResetPasswordPage` still imports Supabase |
| Dashboard | `Dashboard.tsx` | none (store) | client | Partial | KPIs computed in the browser from the store; disagree with `/api/analytics` by construction (revenue = Σ `Trip.paidAmount` vs Σ payments) |
| Ops Dashboard | `OperationsDashboard.tsx` | `dashboard.ts /today` | server | Working | Today's flights/hotels/vehicles/pending confirmations from `TripService`; 5-minute refresh; WhatsApp actions fail (unconfigured) |
| Daily Ops | `DailyOps.tsx` | `trip-services/upcoming` + store | mixed | Partial | Mixes legacy `Booking` and `TripService` sources |
| Operations (tasks + reminders) | `Operations.tsx` | `tasks.ts` | mixed | Partial | Reminders are regenerated client-side on every hydration and never persisted; the `Reminder` table is only written by quotation conversion |
| Trips | `Trips.tsx`, `TripDetail.tsx` (tabs: overview, travel, finance, bookings, vouchers, services, timeline), `TripForm`, `TripTimeline`, `AiItineraryBuilder` | `trips.ts`, `trip-services`, `ai.ts` | client (trip) / server (services) | Partial | Create from header modal; statuses `draft→quotation→confirmed→in_progress→completed`; no hotels/vehicles/drivers/documents/tasks tabs; `documents` is a JSON array that no UI writes |
| Bookings (8 types) | `Bookings.tsx`, `BookingDetail.tsx` | `bookings.ts` | client | Working (legacy) | Flight/train/bus/hotel/cab/visa/insurance/activity/other with per-type `detail` JSON; service-margin mode with GST on fee only; no permissions; overlaps `TripService` |
| Customers | `Customers.tsx` (list, segments, detail with finance, quick-create) | `customers.ts` | client | Partial | Passport/PAN fields are silently dropped until the pending migration runs; duplicate detection is name/phone equality at lead conversion only; no family/group, history is derived from `tripIds` JSON |
| Passengers | inside `TripDetail` travel tab and forms | `passengers.ts` | client | Partial | 0 rows in production; no permissions |
| Leads | no dedicated screen (`/leads` route absent from `App.tsx`) | `leads.ts` | client | Dead-ish | Store still has `createLead/convertLead`; 0 rows; conversion bypasses `canConfirmTrip` and runs three optimistic writes without a transaction |
| Enquiries | `EnquiryPipeline.tsx` (kanban) | `enquiry.ts` | server | Working | Requires an existing customer; statuses `NEW…LOST`; 7 rows |
| Sales Quotes | `SalesQuoteList.tsx`, `SalesQuoteBuilder.tsx` | `salesQuote.ts` | server | Partial | Line items with supplier + markup; `taxAmount` is hard-coded 0 (no GST); convert creates Trip + `TripService` rows + outbox `BOOKING_CONFIRMED`; quote number uses `count()+1` (duplicates after delete) |
| Quotations (legacy) | `Quotations.tsx`, `QuotationBuilder.tsx`, `QuotationDetail.tsx`, print | `quotations.ts` | client + server | Working | GST, inclusions/exclusions, internal approval workflow, duplicate, convert → Trip + auto tasks (`taskEngine`) + reminders; 1 row |
| Itineraries | `Itineraries.tsx`, `ItineraryBuilder.tsx`, `ItineraryDetail.tsx`, print | `itineraries.ts` | client + server | Working | Day rows (morning/afternoon/evening, hotel, meals, transfers, activities); no customer-vs-internal note split; no permissions |
| Vouchers | `Vouchers.tsx`, `VoucherForm.tsx`, `VoucherDetail.tsx`, print | `vouchers.ts` | client | Working | 7 voucher types in one 80-column table; DB has 21 extra pricing columns from an unmerged branch |
| Vendors + vendor payments | `Vendors.tsx`, `VendorDetail.tsx`, forms | `vendors.ts` | client + server | Working | Bank details in plain JSON; deleting a vendor deletes its payables; no permissions |
| Receivables | `Receivables.tsx`, `ReceivableForm`, `RecordReceiptForm` | `receivables.ts` | client | Partial | Entries recalc balances client-side then `persistTripBalance` PUTs the trip; `customer-ledger` endpoint 500s (view missing) but is unused |
| Invoices / Credit notes / Debit notes / GST reports | `Invoices*`, `CreditNotes`, `DebitNotes`, `CreditDebitNote*`, `GstReports`, print | `invoices.ts`, `creditNotes.ts`, `debitNotes.ts`, `gstReports.ts`, `invoiceService.ts` | server | Working | Best-built module: FY numbering, CGST/SGST/IGST, freeze date, receivable linkage, cancel vs delete guards |
| Analytics | `Analytics.tsx` | `analytics.ts` | server | Working | Gated `reports:read`; groups customers by name string; revenue definition differs from dashboard |
| Global search | `GlobalSearch.tsx` (Ctrl+K) | none | client | Partial | Trips, customers, bookings, vouchers only; substring match in memory |
| Settings | `Settings.tsx` (company master, data import/export, users) | `companySettings.ts`, `users.ts` | server | Working | Import runs through the optimistic store (no dry-run, no row-level validation report beyond parse errors) |
| Users | `UserManagement.tsx` | `users.ts` | server | Working | Admin-only; 10 users live (5 admins) |
| Messaging | `AiMessagePanel`, `GmailButton`, ops actions | `messaging.ts`, `communications.ts`, `whatsapp.ts`, `email.ts`, `messageTemplates.ts` | server | Partial | Endpoints work; providers unconfigured; templates are hard-coded functions |
| AI | `AiItineraryBuilder`, `AiMessagePanel` | `ai.ts`, `aiMessageService.ts`, `aiItineraryService.ts` | server | Working (when key set) | Prose generation from DB facts; no extraction, no tools, no audit of AI output |
| Print/PDF | `/print/{itinerary,invoice,voucher,quotation}/:id` | none | client | Working | Each print page calls `fetchAll()` (whole DB) before rendering |
| Automation | `outboxWorker`, `schedulerWorker` | — | server | Dead in prod | Never scheduled on Vercel |

### B.1 Live data snapshot (read-only, 2026-09-18)

| Table | Rows | Table | Rows |
|---|---|---|---|
| users | 10 (5 ADMIN, 2 BOOKING, 2 OPERATIONS, 1 ACCOUNTS) | customers | 9 |
| trips | 1 (`in_progress`, `customerId` invalid) | bookings | 8 (4 flight, 4 train, all `issued`) |
| enquiries | 7 | sales_quotes / items | 4 / 10 |
| quotations / items | 1 / 1 | itineraries / days | 1 / 9 |
| vouchers | 5 | invoices / line items | 2 issued / 12 |
| receivables / entries | 2 / 1 | financial_transactions | 32 (31 RECEIVABLE, 1 PAYMENT_RECEIVED) |
| payments | 0 | vendors / vendor_payments | 0 / 0 |
| activity_logs | 319 (100% have `userId`, 98% have before/after) | message_logs | 20 (all FAILED) |
| outbox_events | 13 (all SENT, June 2026, local run) | leads / passengers / trip_services | 0 / 0 / 0 |
| numbering_sequences | INV 5, CN 2, DN 0 (FY 2026-27) | database size | 12 MB |

Activity history shows 15 invoices created and 13 deleted, 3 credit notes created and 3 deleted — evidence that deletion was being used as "undo" before the guards added in `0e1b3518`.

---

## C. Database analysis

### C.1 Shape

34 tables, 12 enums, **18 foreign keys**. Every other cross-entity link is an unenforced string or JSON column:

- `Trip.customerId`, `Booking.customerId/refId`, `Payment.customerId/bookingId`, `Receivable.customerId/bookingId/tripId/invoiceId`, `Voucher.tripId/customerId/vendorId`, `Quotation.customerId/convertedTripId`, `Lead.converted*`, `Task.customerId/bookingId`, `VendorPayment.tripId`, `Itinerary.tripId/quotationId`, `Invoice.customerId/receivableId`.
- JSON arrays acting as relations: `Customer.tripIds`, `Trip.passengerIds`, `Booking.passengerIds`, `Itinerary.passengerIds`, `Voucher.passengerIds`, `Invoice.bookingIds/tripIds`.
- Denormalised snapshots that drift: `Trip.customer/phone/email`, `Booking.customerName`, `Quotation.customer*`, `Receivable.customerName`, `VendorPayment.vendorName/tripName`. `analytics/customers` groups by `Trip.customer` (a name), so a renamed customer becomes two customers.

### C.2 Type inconsistencies between generations

| Concern | Gen 1 tables | Gen 2 tables |
|---|---|---|
| Money | `Float` | `Decimal(10,2)` |
| Dates | `String` `YYYY-MM-DD` (`departure`, `createdDate`, `date`, `dueDate`…) plus `createdAt DateTime` | `DateTime` |
| Status | free `String` with defaults (`'draft'`, `'pending'`) | enums (`ServiceStatus`, `EnquiryStatus`, `SalesQuoteStatus`) |
| IDs | client-generated human IDs (`GK-2026-0001`) as primary keys | `cuid()` + a display number (`quoteNumber`) |
| Ownership | client computes cached aggregates | server computes |

### C.3 Cached aggregates and ledgers

- `Trip.{taxableAmount,gstAmount,totalPayable,paidAmount,balanceDue,supplierCost,grossMargin,marginPct}` and `Booking.{…}` are written by the browser.
- `financeService.recordPayment` also writes `Trip.paidAmount/balanceDue` server-side; the next whole-entity `PUT /trips/:id` from any open tab overwrites it.
- `FinancialTransaction` is append-only but nothing reverses it when a `Payment`, `Receivable` or `VendorPayment` is deleted, so ledger-based figures (`cashInflow`, `gstLiability` in `analytics/overview`) diverge from table-based figures.
- `Payment.status` is `'received'`/`'paid'` from the store but `'completed'` from `financeService`; analytics filters on `'received'`, so server-recorded payments are excluded from revenue.

### C.4 JSON blobs

`Trip.timeline/itinerary/documents`, `Booking.detail` (typed per booking type only in TypeScript), `TripService.details`, `Customer.documents/preferences`, `Vendor.bankDetails` (sensitive, unencrypted, readable by every role through `/api/data/all`), `Lead.timeline`, `ActivityLog.before/after/metadata`. `TravelDocument` supports a `base64` field, so files can be embedded in the row (10 MB body limit) — no UI does this today, and no file storage exists.

### C.5 Constraints, cascades, deletion

- No soft delete anywhere except `User.isActive`.
- Cascades: `VendorPayment → Vendor` (deleting a vendor destroys financial history), `TripService → Trip`, item tables → parent documents, `ReceivableEntry → Receivable`.
- `TripService.supplierId → Vendor` has no `onDelete`, so deleting a vendor referenced by a service throws P2003 → HTTP 500 rather than 409.
- `Booking` delete leaves `Receivable.bookingId`, `Payment.bookingId`, `Task.bookingId` dangling.
- No tenant column on any table; `CompanySettings` is a singleton `id='default'`; `NumberingSequence` is keyed by `(docType, financialYear)` only.

### C.6 Migration state and drift (verified against Neon)

- `_prisma_migrations` contains **one** row (`20260608170000_activity_approval_communication`) while `prisma/migrations/` has 14 folders. `prisma migrate deploy` would replay `init` and fail.
- `prisma migrate diff` (live → schema) wants to **drop 21 `vouchers` columns** that exist only in the database: `amountPaid, balanceDue, cgstAmount, costPrice, customerAddress, customerCompany, customerGstin, grandTotal, gstType, igstAmount, items, paymentMethod, paymentStatus, placeOfSupplyStateCode, sellingPrice, sgstAmount, showPricing, subtotal, totalDiscount, totalGstAmount, voucherDate` — remnants of the unmerged voucher-pricing branch. `prisma db push` is therefore destructive.
- Declared in the schema but **absent** in the database: 20 indexes (`payments_*`, `bookings_*`, `tasks_*`, `leads_*`, `trips_*`, `customers_phone/email`).
- Absent in both: `customers.passportNo/passportExpiry/passportCountry/panNumber` (migration `20260917000000` not applied; fields commented out in the schema), the `customer_ledger_balances` view (migration `20260610000000` not applied — `GET /api/receivables/customer-ledger` returns 500).

### C.7 Integrity findings in live data

- The only trip has a `customerId` that does not match any customer.
- One duplicate customer phone number.
- `customers.documents` and `trips.documents` are empty everywhere (the feature was never used).

---

## D. Technical debt (prioritised)

| # | Debt | Severity | Why it matters |
|---|---|---|---|
| D1 | Client is the source of truth for Gen 1 entities (IDs, finance, balances, statuses) | Critical | Root cause of overwrites, races, silent data loss, and the four-way disagreement on "paid amount" |
| D2 | `GET /api/data/all` hydrates the whole company into every session | Critical | Security (see E), performance ceiling, and it makes server-side filtering/pagination impossible |
| D3 | Two quotation engines (`Quotation` w/ GST + approval; `SalesQuote` w/ suppliers, no GST) and two enquiry concepts (`Lead`, `Enquiry`) | High | Staff see "Quotations" and "Sales Quotes" in the same sidebar; conversion paths differ; only one can be the TravelOS quotation engine |
| D4 | Two trip-line-item models (`Booking` 8-type legacy vs `TripService` enum) | High | Trip finance, dashboards and vouchers read different tables |
| D5 | Two notification systems (client `Reminder` generation vs `OutboxEvent`/`MessageLog`) and two activity writers | High | Bell badge, Operations page and the (non-running) scheduler disagree |
| D6 | Schema/DB drift and abandoned `prisma migrate` history | High | Every schema change is manual SQL; `db push` is destructive |
| D7 | Server not type-checked in the build (73 errors) | High | Runtime 500s only visible in Vercel logs |
| D8 | No tests, no CI, no lint | High | Finance and GST logic is untested; regressions are found by the owner |
| D9 | Three permission vocabularies + role arrays on routes | High | Permissions cannot be reasoned about; UI and API disagree |
| D10 | Background workers only run under `tsx watch` locally | High | Reminders/alerts/automation are dead in production |
| D11 | Mass-assignment `upsert(req.body)` in 11 routers | High | Any authenticated user can set any column, including `invoiceId`, balances, `createdBy` |
| D12 | Dead Gen 0 code (Supabase repositories/services/queries, `supabase/`, `index.legacy.html`, `assets/js`) still compiled and bundled | Medium | 2,400 LOC of confusion; `ResetPasswordPage` still imports Supabase |
| D13 | Giant components (7 files > 900 lines) with finance math inline | Medium | Blocks the module-by-module migration; violates the "no finance in UI" rule already stated in `finance.ts` |
| D14 | String dates and Float money in Gen 1 | Medium | Sorting/filtering by date is string comparison; rounding drift |
| D15 | Human-readable IDs as primary keys generated by scanning arrays | Medium | Race → `P2002` → 500; cannot shard or multi-tenant |
| D16 | Hard-coded staff list, hard-coded agency name/phone/city in prompts and templates, env-var agency details duplicated with `CompanySettings` | Medium | Not tenant-ready; wrong data on documents |
| D17 | Repo hygiene: committed `.set/`, `.set(1)/`, `.vscode/`, `schema_output.txt` (UTF-16 dump), `ai_check.mjs` (contains a password), `tmp-test-template.xlsx`, `index.legacy.html`, `assets/js` | Low | Noise and one credential in history |
| D18 | `README.md` describes the 2025 vanilla-JS app | Low | Misleads anyone onboarding |

---

## E. Security findings

Fixed in `0e1b3518` (kept, verified): JWT secret required; no default admin password; company settings admin-only with allow-list; analytics gated; AI router lazy; invoice delete/cancel guards; customer allow-list.

Open findings, ordered by severity:

| # | Finding | Evidence | Impact |
|---|---|---|---|
| E1 | **Whole-database export to every role.** `GET /api/data/all` returns invoices, receivables, vendor bank details, all customers, all activity — gated only by `requireAuth`. | `server/src/routes/data.ts` | Every per-route permission is bypassed by the bootstrap call; an OPERATIONS login can read all financials and vendor bank accounts |
| E2 | **No authorisation on 11 routers.** OPERATIONS/ACCOUNTS/BOOKING can create, edit and delete bookings, leads, vouchers, tasks, vendors, vendor payments, itineraries, passengers. | `bookings.ts`, `leads.ts`, `vendors.ts`, `vouchers.ts`, `itineraries.ts`, `passengers.ts`, `tasks.ts`, `activity.ts`, `communications.ts`, `trips.ts` GET/POST/PUT | Data destruction and financial tampering by non-admin roles |
| E3 | **Mass assignment via `upsert` on client id.** Any body field is written; posting an existing `id` overwrites that record. `PUT /trips/:id` accepts computed finance fields. | `sanitize()` in 11 routers | Balance/margin/`invoiceId` tampering; overwriting other users' records |
| E4 | **Forgeable audit trail.** `POST /api/activity` does `activityLog.create({ data: req.body })` with no allow-list, no actor enforcement. | `activity.ts:26` | Audit log cannot be trusted |
| E5 | **Mass delete endpoint.** `POST /api/activity/reminders/bulk` runs `reminder.deleteMany({})` then recreates from the body. | `activity.ts:45` | Any user wipes all reminders |
| E6 | **Permission failures hidden from users.** `onMutationError` returns silently on 401/403 while the optimistic state already shows "saved". | `store/index.ts:52` | Users believe edits persisted; they vanish on refresh |
| E7 | Error responses leak internals: global handler returns `err.message`; routes return `String(err)` (Prisma query text, column names). | `app.ts:117`, most routes | Information disclosure |
| E8 | No rate limiting or lockout on `POST /api/auth/login`; bcrypt cost 12 makes it a cheap CPU-exhaustion target. No `helmet`/CSP. | `auth.ts`, `app.ts` | Credential stuffing; function-time exhaustion |
| E9 | 30-day JWT with role embedded, no revocation list; role changes and deactivation only take effect through `/auth/me` checks on reload. | `middleware/auth.ts` | Demoted/removed users retain access on API calls until expiry |
| E10 | CORS allowlist includes four `localhost` origins in production. | `app.ts:46` | Local malicious pages can make credentialed requests if a user is logged in |
| E11 | Sensitive PII readable by all roles: passenger passport numbers (indexed), customer GSTIN, vendor bank details (JSON), company bank details. No field-level access control, no encryption at rest beyond Neon's. | schema | Regulatory and breach exposure |
| E12 | Committed secrets/credentials: `prisma/seed.ts` (admin email + password), `server/src/scripts/seedUsers.ts` (four default passwords), `ai_check.mjs` (login credentials). | repo | Guessable accounts if scripts were ever run against production |
| E13 | `users.ts` PUT changes email without uniqueness handling (P2002 → 500 with details) and admins can promote to any role without a second factor or audit entry. | `users.ts` | Weak admin hygiene; no audit of role changes |
| E14 | File/document path has no storage, no ACL, no MIME/size validation; `TravelDocument.base64` allows embedding arbitrary bytes into JSON columns. | `types/index.ts:171` | If used, unbounded DB growth and no access control |
| E15 | Print routes call `fetchAll()`; a shared print link exposes the entire dataset to whoever holds the session. | `pages/print/*` | Same as E1 |

---

## F. UX findings

Strengths worth keeping: a consistent shell (sidebar groups, header with Ctrl+K search, notification bell), skeleton and empty-state components, print-quality documents (invoice, quotation, itinerary, voucher), the Ops Dashboard's "today" framing, the enquiry kanban, and the invoice builder's guard rails.

Problems, in order of impact on daily work:

1. **Duplicated concepts in navigation.** "Quotations" and "Sales Quotes"; "Bookings" and "Services"; "Operations", "Ops Dashboard" and "Daily Ops" — 20 nav items across 6 groups for one small team. Staff have to know which generation a feature belongs to.
2. **Trip is not a workspace.** `TripDetail` has 7 tabs but no hotels, vehicles, drivers, activities, documents, tasks, communication or profitability views; itinerary and vouchers are separate top-level modules linked by `tripId` strings.
3. **Optimistic writes that lie.** Every save shows success instantly; failures arrive later as a toast (or not at all for 403). Combined with no server validation, users cannot tell what persisted.
4. **No pagination, filtering or sorting server-side.** Lists render whole arrays; search is substring over four entity types; no saved views.
5. **Customer 360 is partial.** Trip history is derived from `Customer.tripIds` JSON; no enquiries/quotes/invoices/communications/feedback tabs; duplicate customers are easy to create (quick-create in forms).
6. **Enquiry requires an existing customer** — the natural first touch (unknown caller) has no path; `Lead` exists in the store but has no screen.
7. **Task assignment uses a fake staff list** instead of real users; reminders regenerate on reload so "sent" state is lost.
8. **Mobile.** Tables are not responsive (99 `sm:` utilities, mostly on padding); the trip form is a modal; no driver/field workflow exists.
9. **Visual direction** drifts from the brief: gradient sidebar and buttons, glass header, rounded-xl everywhere, coloured KPI tiles. Information density is uneven (dashboard sparse, trip finance dense).
10. **Header route titles** are a hard-coded map that misses many routes (`/enquiries`, `/invoices`, `/receivables` fall back to "GK Travels").
11. **Import/export** has no dry-run: rows are created through the optimistic store as they are parsed, so a bad row half-way through leaves partial data.
12. Accessibility: custom dropdowns/popovers built with `div onClick` (header notifications, quick-add) lack keyboard handling and ARIA; focus management only in search.

---

## G. Performance findings

| # | Finding | Evidence | Effect |
|---|---|---|---|
| G1 | Bootstrap loads 20 tables with nested includes on every app load and again on every print page | `data.ts`, `pages/print/*` | Cold start + 20 parallel queries; 15 s client timeout (`apiClient`) will start failing at a few thousand rows |
| G2 | ID generation scans full tables (`findMany(select id)` of all trips/tasks/quotations/vouchers) on the server and full arrays on the client | `trips.ts:13`, `quotations.ts` convert/duplicate, `vouchers.ts` duplicate, `salesQuote.ts` convert | O(n) per create; race-prone |
| G3 | `analytics/monthly` issues 4 queries per month (48 for a year), `yearly` 3 per year | `analytics.ts` | Slow reports; fine at current volume |
| G4 | 20 declared indexes missing in Neon | C.6 | Currently masked by G1 (filtering happens in JS) |
| G5 | Unused heavy dependencies shipped as vendor chunks (`@supabase/supabase-js`, `@tanstack/react-query`; `framer-motion` used lightly) | `vite.config.ts manualChunks` | Larger first load |
| G6 | Prisma on serverless without a pooled connection string (`sslmode=require`, no `pgbouncer=true`) | `.env` | Neon connection limits under concurrent cold starts |
| G7 | Every store mutation re-runs `calcTripFinance` for the trip and `refreshAllReminders()` over all trips; `fetchAll` recalculates all trips on a timeout | `store/index.ts` | Fine now; quadratic-ish as trips grow |
| G8 | `activityLog` capped at 500 rows in bootstrap and in the store — timeline silently truncates | `data.ts`, store | Missing history for older entities |

---

## H0. Concrete bugs found (with locations)

1. `GET /api/receivables/customer-ledger` and `/customer-ledger/:customerId` throw — the `customer_ledger_balances` view was never created (`receivables.ts:44`).
2. `store.convertLead` creates the trip with `status: 'confirmed'` and skips `canConfirmTrip`; three optimistic writes, no transaction.
3. Deleting a `Payment` (`payments.ts DELETE`) does not reverse the `PAYMENT_RECEIVED` ledger row or recompute the trip; `analytics/overview.cashInflow` stays inflated.
4. `salesQuote.ts` convert: every `TripService.serviceDate` is the enquiry departure date; `Trip.totalPayable = totalAmount` with `taxAmount` always 0, so the sales-quote path produces trips with no GST and `gstAmount = 0` while `gstRate` defaults to 5.
5. `quotations.ts` convert-trip and duplicate, `vouchers.ts` duplicate, `trips.ts` POST: ID from max-scan → concurrent creates collide with `P2002` → 500.
6. `PUT /api/trips/:id` accepts client-computed `paidAmount/balanceDue`; overwrites values written by `financeService.recordPayment` (two writers).
7. `bookings.ts DELETE` leaves `Receivable.bookingId`, `Payment.bookingId`, `Task.bookingId` dangling; the store also drops receivables locally but never deletes them server-side.
8. `vendors.ts DELETE` cascades payables; if a `TripService` references the vendor the delete 500s (P2003) instead of 409.
9. `analytics/overview` counts revenue as `Payment.status = 'received'`; `financeService.recordPayment` writes `'completed'` → server-recorded payments are excluded from revenue and monthly trends.
10. Dashboard "pending payments" and the scheduler only consider `status = 'confirmed'`; the store's lifecycle moves trips to `in_progress` (the only live trip), so they drop out of reminders while still unpaid.
11. Frontend permission maps disagree (`trips:view` vs `trips:read`), and route guards use role arrays; e.g. `OPERATIONS` sees Customers (nav uses `customers:read`) but the server denies `customers:write` — the edit "succeeds" locally and vanishes (E6).
12. `generateQuoteNumber()` uses `count()+1`; after any deletion the next quote hits the unique constraint → 500 (`services/quoteNumber.ts`).
13. `invoiceId` is writable by the client on trips and bookings (`trips.ts PUT`, `bookings.ts`), which can unlock or fake the "already invoiced" guard.
14. `ResetPasswordPage.tsx` imports the Supabase client; it is unrouted so it only bloats the bundle, but `src/lib/supabase.ts` re-exports types that no longer match the Prisma schema.
15. `AuthContext` hard-codes `orgId: 'gktravel'`; `queryKeys.ts` and `trip.queries.ts` are dead.
16. `Header` derives urgent trips from `daysUntil(t.departure)` on the client while the bell count comes from client-generated reminders — two different "urgent" definitions.
17. `refreshAllReminders()` discards unsent reminders on every hydration; reminders created server-side by quotation conversion are replaced by the client list on next load.
18. `ImportExport` creates records through optimistic store actions while parsing; an error mid-file leaves partial imports with no rollback.
19. `data.ts` runs `companySettings.upsert` inside a GET — a read endpoint that writes.
20. `itineraries.ts DELETE` is two statements without a transaction.

---

## I0. Capability gap against the TravelOS specification

| Spec section | Exists today | Gap |
|---|---|---|
| 5 Dashboard command centre | Client KPIs + Ops "today" | Receivables/payables/expenses/profit from the ledger, drill-through, alerts, AI insights |
| 6 Customers | Basic profile, segments | Dedupe, family/group, preferences model, documents, comms history, feedback, referrals |
| 7 Leads | Store actions only | Lifecycle per spec, pipeline view, assignment, follow-ups, conversion to enquiry |
| 8 Enquiries | Kanban with basic fields | Adults/children/rooms/meal/hotel prefs/activities/special requirements; quotation hand-off |
| 9 Quotation engine | Two half-engines | One engine with cost/markup/discount/tax/versions/customer-safe document/status flow per spec |
| 10 Bookings | Legacy 8-type ticket records | Booking as a commercial contract with payment schedule, travellers, vendor requirements |
| 11 Trip workspace | 7-tab detail | Hotels, vehicles, drivers, activities, tickets, documents, tasks, comms, profitability, status flow per spec |
| 12 Itinerary builder | Day rows | Items with time/location/hotel/activity/transport, images, customer vs internal notes, map data |
| 13–16 Hotels, vehicles, drivers, activities | Vendors table only | All four masters, bookings/assignments, conflict checks, driver mobile view |
| 17 Finance | Receivables, invoices, CN/DN, vendor payments, ledger | Payment schedules, expenses, vendor invoices, unified customer payments, consistent status model |
| 18 Trip profitability | Cached margin fields | Ledger-derived cost breakdown by category |
| 19 Tax config | `gstRate` per record, state codes | Configurable tax rules separated from logic |
| 20–23 Document centre + AI extraction | JSON `documents` arrays (unused) | Storage, ACL, versions, classification, extraction schemas, review/approve, audit |
| 24–26 AI copilot, actions, insights | Prose generation | Tool-based read/write actions, permissions, audit |
| 27 Global search | 4 entities in memory | Server search across all entities; NL later |
| 28–29 Communication + automation | Hard-coded templates; dead workers | Template management, provider config, event rules, observable runs |
| 30–31 Customer portal | None | Everything |
| 32 Analytics | Finance/ops basics | Sales funnel, salesperson, vendor performance, customer value |
| 33 RBAC | 4 roles, static strings | Granular permissions, OWNER/SALES/DRIVER/CUSTOMER roles, server enforcement everywhere |
| 34 Audit log | Good server writer | Unified, tamper-proof, source (human/AI/system), covers deletes |
| 35–36 Data model / tenancy | Single-tenant, mixed generations | Organization boundary on all tables |
| 44–45 Notifications, timelines | Reminders/bell, entity timelines for 2 entities | Central notification model; timelines everywhere |
| 46 Import/export | xlsx for 4 entities | Validation preview, row errors, hotels/vehicles/leads |
| 47 Settings | Company master, users | Tax, numbering, templates, providers, automation, document types, AI |

---

## J0. Migration risks specific to this codebase

1. **Two-writer window.** Until a module is fully server-authoritative, the Gen 1 store can overwrite Gen 2 writes. Each module must be cut over atomically (read + write) — no half-migrated entities.
2. **Schema drift.** Adopting `prisma migrate` requires reconciling the 21 voucher columns and baselining; done wrongly it drops columns or blocks deploys.
3. **Serverless constraints.** Document processing, AI extraction and automation need a job runner; Vercel gives 30 s per invocation and no resident process. This shapes the design (chunked jobs + cron), not just the implementation.
4. **Unifying quotations and bookings** changes the meaning of "Booking" for existing users and requires mapping 8 legacy booking rows and 1 quotation.
5. **No tests today** means the finance core (which we keep) has no regression net until Phase 1 adds one.
6. **Production is the only environment.** Every deploy goes to the live URL; there is no staging database.
