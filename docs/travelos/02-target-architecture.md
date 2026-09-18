# TravelOS — Target Architecture, Data Model and Module Map

Covers items H (target architecture), I (proposed database model) and J (module dependency map) of the brief. Read `01-audit.md` first; every decision below answers a finding there.

---

## H. Target architecture

### H.1 Guiding decisions

| Decision | Choice | Why |
|---|---|---|
| Stack | Keep React 18 + Vite, Express 5, Prisma + Neon Postgres, Vercel | Working, known to the owner, cheap. Nothing in the spec needs a new runtime |
| Source of truth | **Server only.** Every ID, status transition, financial figure and timestamp is computed in a service and returned to the client | Fixes D1/D2/D11, E3, bugs 5/6/9 |
| Client data layer | TanStack Query per resource with server pagination/filtering; the Zustand god-store is retired module by module (strangler pattern) | `@tanstack/react-query` is already installed; no big-bang rewrite |
| API shape | REST under `/api/v2/<module>` with zod-validated bodies, typed responses, uniform error envelope `{ error: { code, message, fields? } }` | v1 routes stay until each module is cut over, then are deleted |
| Validation | zod schemas in `src/shared/contracts/<module>.ts` shared by client forms and server routes | One definition; the server never trusts the client |
| Authorisation | Permission strings resolved from DB-backed roles per organisation; enforced in middleware **and** in services (row-level checks for DRIVER/CUSTOMER) | Fixes D9, E1, E2 |
| Audit | One `AuditLog` writer (`core/audit`) called from every service mutation with `actor`, `source` (human/ai/system), entity, before/after | Fixes E4 |
| Background work | Durable `Job` + `OutboxEvent` tables processed by an idempotent tick endpoint (`POST /api/jobs/tick`, secured by `CRON_SECRET`) called by Vercel Cron every minute; each tick does bounded work (< 20 s) | Works on Vercel today; a resident worker can call the same tick later |
| Files | Private object storage (Vercel Blob or S3-compatible such as Cloudflare R2) behind the API; downloads via short-lived signed URLs minted after a permission check; never public paths | Fixes E14; spec §37 |
| AI | `core/ai/AiProvider` interface with two adapters: Anthropic Claude (documents, vision, tool use — `claude-fable-5-1` for extraction and copilot, `claude-haiku-4-5-20251001` for classification) and the existing Gemini adapter (prose). Every AI result is validated by zod and stored with confidence before any user sees it | Spec §21–26, §42 |
| Multi-tenancy | `organizationId` on every business table from Phase 1, enforced by a Prisma client extension; one `Organization` row (`gk-travels`) initially | Spec §36; retrofitting later is far more expensive |
| Migrations | `prisma migrate` becomes the only way the schema changes, after a one-time drift reconciliation and baseline | Fixes D6 |
| Money & time | `Decimal(14,2)` for money, `DateTime`/`@db.Date` for dates, enums for statuses, `cuid()` primary keys + per-organisation human display numbers | Fixes D14/D15 |

### H.2 Layered view

```
┌──────────────────────────────────────────────────────────────────────────┐
│ SPA (React)                                                              │
│  app/            routes, shell, providers                                │
│  features/<mod>/ pages, components, hooks (TanStack Query), forms(zod)   │
│  design-system/  tokens, primitives (Table, DataList, DetailHeader,      │
│                  Form, Drawer, StatusPill, Money, DateTime, EmptyState)  │
│  shared/contracts/  zod schemas + TS types shared with the API           │
└──────────────┬───────────────────────────────────────────────────────────┘
               │ /api/v2  (cookie session, JSON, signed download URLs)
┌──────────────▼───────────────────────────────────────────────────────────┐
│ API (Express on Vercel function; same code runs as a long-lived server)  │
│  core/  auth · rbac · tenant · validation · errors · audit · events      │
│         jobs · storage · ai · numbering · money · tax                    │
│  modules/<domain>/  routes.ts → service.ts → repo.ts (Prisma)            │
│         schemas.ts (zod) · events.ts (emits) · handlers.ts (consumes)    │
│  jobs/  tick runner: outbox dispatch, automation rules, document pipeline│
└──────────────┬───────────────────────────────────────────────────────────┘
               │ Prisma (tenant-scoped client extension)
┌──────────────▼───────────────────────────────────────────────────────────┐
│ Neon Postgres  │  Object storage (private)  │  Providers: Claude/Gemini, │
│                │                            │  WhatsApp BSP, SMTP         │
└──────────────────────────────────────────────────────────────────────────┘
```

Rules that the code review enforces:

1. Routes only parse, authorise and call one service function. No Prisma in routes.
2. Services own transactions, numbering, state machines, finance math (via `core/money` and `modules/finance/calc`), audit and event emission.
3. Repos are thin Prisma wrappers that always receive the tenant-scoped client.
4. Nothing under `src/` (SPA) is imported by the server except `src/shared/contracts/**` and `src/shared/calc/**` (pure, dependency-free). The current `src/shared/utils/{finance,gst}.ts` move to `src/shared/calc/` with tests.
5. Every mutation returns the full updated resource; the client replaces its cache with the response — never with its own optimistic guess for financial fields.

### H.3 Cross-cutting services (`server/src/core`)

| Service | Responsibility | Replaces |
|---|---|---|
| `auth` | Sessions (JWT in HttpOnly cookie, 12 h access + 30 d refresh with server-side session row for revocation), login rate limiting, password policy | `middleware/auth.ts` |
| `rbac` | `Role`, `Permission`, `RolePermission` tables; `requirePermission('trips:write')`; `scope()` helpers for DRIVER (own assignments) and CUSTOMER (own records) | three permission maps |
| `tenant` | Reads `organizationId` from the session; Prisma extension injects `where.organizationId` on every model that has it and rejects cross-tenant writes | — |
| `validation` | `validate(schema)` middleware; strips unknown keys; typed `req.valid` | ad-hoc `sanitize()` |
| `errors` | `AppError(code, status, message, fields)`; global handler maps Prisma codes (P2002→409, P2003→409, P2025→404) and hides internals | `String(err)` responses |
| `audit` | `audit.record({ actor, source, action, entity, before, after })` inside the caller's transaction | `lib/activity.ts` (kept, renamed) |
| `events` | `emit(type, payload, { idempotencyKey })` → `OutboxEvent`; handlers registered per module; delivered by the job tick | `services/outbox.ts` (kept) |
| `jobs` | `Job` table (type, payload, state, attempts, runAfter, lockedUntil); `tick()` claims with `FOR UPDATE SKIP LOCKED`, runs handlers with a per-job time budget | `workers/*` (retired) |
| `storage` | `put(file) → StoredObject`, `signedUrl(objectId, ttl)`, MIME/size allow-lists, virus-scan hook | none |
| `ai` | `AiProvider` interface: `extractStructured(doc, schema)`, `classify(doc, labels)`, `complete(prompt)`, `runTools(session)`; Anthropic + Gemini adapters; every call logged to `AiAction` | `lib/gemini.ts` (becomes an adapter) |
| `numbering` | `next(orgId, docType, financialYear)` with a `SELECT … FOR UPDATE` on `NumberingSequence`; display numbers for trips/customers/quotes/bookings/invoices | `quoteNumber.ts`, `nextTripId()`, client `id.ts` |
| `money` / `tax` | `Money` helpers on Decimal; `TaxRule` lookup (`applyTax(amount, ruleId)`) so GST rates and modes are configuration | hard-coded 5 %/18 % defaults |

### H.4 Frontend architecture

- `src/features/<module>/` — `pages/`, `components/`, `api.ts` (typed fetchers), `hooks.ts` (queries/mutations with cache keys `['org', orgId, 'trips', …]`), `forms/` (zod + react-hook-form using shared contracts).
- `src/design-system/` — tokens (neutral surfaces, one accent, semantic status colours), typography scale, density rules, and the primitives listed in H.2. No gradients; borders and spacing carry hierarchy. Dark mode via existing `darkMode: ['class']`.
- Workspaces instead of modules: **Trip Control Centre** (`/trips/:id` with overview, travellers, itinerary, stays, transport, activities, tickets, documents, finance, tasks, comms, timeline), **Customer 360** (`/customers/:id`), **Sales Pipeline** (`/sales` — leads, enquiries, quotations in one board), **Finance** (`/finance` — receivables, payables, expenses, invoices, GST), **Operations Today** (`/ops`).
- Navigation collapses to: Dashboard · Sales · Customers · Trips · Operations · Suppliers · Finance · Documents · Reports · Settings. Legacy screens stay reachable under `/legacy/*` until each is retired.
- Global search calls `/api/v2/search?q=` (server-side, permission-filtered); Ctrl+K stays.
- Mutations: `useMutation` → invalidate → replace with server response; errors surface inline in the form and as a toast, including 403.
- Mobile: list/detail primitives collapse to cards; the driver and customer surfaces are separate lightweight routes (`/driver`, `/portal`) sharing the design system.

### H.5 Document intelligence pipeline

```
upload ─▶ validate (MIME, size, virus hook) ─▶ storage.put ─▶ Document row (status UPLOADED)
   ─▶ job: classify (Claude Haiku on first pages / text) ─▶ DocumentType + confidence
   ─▶ job: extract (Claude Fable 5.1 with PDF/vision, zod schema per DocumentType)
   ─▶ DocumentExtraction row: fields[{path, value, confidence, sourcePage}] (status EXTRACTED | NEEDS_REVIEW | FAILED)
   ─▶ job: match (traveller by name/PNR, trip by dates/customer, vendor by GSTIN) ─▶ ExtractionProposal
   ─▶ UI review: side-by-side original vs proposed changes, per-field accept/edit ─▶ approve
   ─▶ service applies changes in one transaction ─▶ AuditLog(source=AI, approvedBy) ─▶ Document linked to entities
```

Extraction schemas are registered per document type in `modules/documents/schemas/<type>.ts` (flight ticket, train ticket, bus ticket, hotel confirmation, activity voucher, vehicle voucher, supplier invoice, customer invoice, payment receipt, insurance, passport page, other). Adding a type = one schema file + one mapping function. Fields below a confidence threshold are marked "Unable to confidently identify"; nothing is written without approval. The original file is immutable; re-extraction creates a new `DocumentExtraction` version.

### H.6 AI copilot

- Tool registry in `modules/copilot/tools/` with two kinds: `read` (`search_trips`, `get_customer_summary`, `get_outstanding_receivables`, `get_trip_profitability`, `list_due_vendor_payments`, …) and `write` (`create_task`, `draft_message`, `create_followup`, `propose_trip_update`, …).
- Each tool declares required permissions; the copilot session runs **as the user** and cannot exceed their role. Write tools produce a proposal the user confirms; sensitive writes (money, invoices, cancellations, external sends) are never executed by the model.
- Every tool call and result is stored in `AiAction` (session, tool, input, output, approvedBy). Insights (`/api/v2/insights`) are computed by deterministic queries; the model only phrases them.

### H.7 Automation engine

- `AutomationRule` (event, conditions JSON, actions JSON, enabled) evaluated by the job tick when an `OutboxEvent` is delivered; `AutomationRun` records each execution with outcome and errors.
- Built-in events: `quotation.accepted`, `booking.created`, `payment.received`, `payment.overdue`, `trip.starts_in_days(n)`, `service.unconfirmed_within_hours(n)`, `document.extracted`.
- Built-in actions: `create_booking_from_quotation`, `create_trip`, `create_payment_schedule`, `create_tasks(template)`, `notify(users|customer, template)`, `send(channel, template)`.
- The existing scheduler rules become seeded `AutomationRule` rows, so the owner can see and switch them.

### H.8 Deployment and environments

- Vercel keeps serving SPA + API. Add `vercel.json` cron: `*/1 * * * *` → `/api/jobs/tick`; `maxDuration` 60 for the tick and document routes (Pro plan) or chunked 25 s budgets on Hobby.
- Neon branches: `main` (prod), `staging` (Vercel preview deployments point here), ephemeral branches for migration rehearsal.
- GitHub Actions: typecheck (SPA + server), lint, unit tests, API tests against a Neon branch, build. Vercel deploys only on green.
- Secrets only in Vercel env; `.env.example` documents them; seed scripts read credentials from env.

---

## I. Proposed database model

### I.1 Conventions

- Every business table: `id String @id @default(cuid())`, `organizationId`, `createdAt`, `updatedAt`, `createdById?`, `updatedById?`, `deletedAt?` (soft delete on customers, travellers, trips, bookings, quotations, documents, vendors, hotels, vehicles, drivers).
- Human numbers are separate columns (`displayNumber`, e.g. `TR-10482`, `Q-2026-0042`) generated by `core/numbering` per organisation; existing Gen 1 primary keys (`GK-2026-0001`, `CUS-2026-0003`) are **kept as `id`** on existing rows and copied into `displayNumber` — no PK rewrite, no broken links.
- Money `Decimal @db.Decimal(14,2)`; rates `Decimal @db.Decimal(6,3)`; dates `DateTime @db.Date` for calendar dates, `DateTime` for instants; statuses as enums.
- Indexes: `(organizationId, <status>)`, `(organizationId, <date>)`, FK columns, `(organizationId, phoneNormalized)` unique on customers.

### I.2 Entity catalogue

**Platform**
- `Organization` (name, legal details, currency, timezone, settings JSON) — absorbs `CompanySettings`.
- `User` (+ `organizationId`, `roleId`, `phone`, `avatarUrl`) · `Session` (refresh tokens, revocation) · `Role` (system or custom) · `Permission` (catalogue) · `RolePermission`.
- `TaxRule` (name, rate, mode INCLUDED/EXCLUDED, hsnSac, appliesTo, validFrom/To) · `NumberingSequence` (+`organizationId`, docType, financialYear, lastNumber).
- `MessageTemplate` (channel, key, subject, body with placeholders, isSystem) · `IntegrationConfig` (provider, encrypted credentials, enabled).
- `AuditLog` (unifies `ActivityLog`: actor, source HUMAN|AI|SYSTEM, action, entityType, entityId, before, after, metadata, requestId).
- `Notification` (userId, type, title, body, entity link, readAt, channelStatus JSON).
- `Job`, `OutboxEvent` (kept), `AutomationRule`, `AutomationRun`, `AiAction`.

**CRM & sales**
- `Customer` (existing columns + `phoneNormalized`, `type` INDIVIDUAL|CORPORATE, `preferences` structured JSON, `source`, `referredByCustomerId`) · `CustomerRelationship` (customerId, relatedCustomerId, kind FAMILY|GROUP|COMPANY).
- `Traveller` (rename of `Passenger`; + `customerId`, `type` ADULT|CHILD|INFANT, identity fields).
- `Lead` (rebuilt: name, phone, email, source, stage NEW→CONTACTED→REQUIREMENTS→QUOTATION→NEGOTIATION→CONFIRMED|LOST, `assignedToId`, `followUpAt`, `estimatedValue`, `probability`, `customerId?`, `convertedEnquiryId?`) · `LeadActivity`.
- `Enquiry` (existing + `leadId?`, `adults`, `children`, `infants`, `rooms`, `transportRequirement`, `hotelPreference`, `mealPreference`, `activities` JSON, `specialRequirements`).
- `Quotation` (**one engine**: enquiryId, customerId, `displayNumber`, `version`, status DRAFT→SENT→VIEWED→NEGOTIATION→ACCEPTED|REJECTED|EXPIRED, `approvalStatus`, validUntil, inclusions/exclusions/paymentPolicy/terms, `taxRuleId`, subtotalCost, subtotalSell, discount, taxAmount, total, grossProfit, marginPct, `showCostToCustomer=false`) · `QuotationItem` (category HOTEL|VEHICLE|DRIVER|ACTIVITY|FOOD|TICKET|GUIDE|OTHER, description, supplierId?, hotelId?/vehicleId?/activityId?, qty, unit, costPrice, markupType/markup, sellPrice, taxRuleId?, dayNumber?, internalNote).
- `Booking` (**commercial contract**: quotationId, customerId, tripId, `displayNumber`, status DRAFT→CONFIRMED→CANCELLED, amountTotal, amountPaid (derived, cached by finance service only), `paymentSchedule` rows) · `PaymentScheduleItem` (bookingId, dueDate, amount, label, status).
- `BookingTraveller` (bookingId, travellerId, isLead).

**Trip operations**
- `Trip` (existing + `bookingId?`, `displayNumber`, status PLANNING→CONFIRMING→READY→ONGOING→COMPLETED|CANCELLED, `startDate`, `endDate`, `destination`, `assignedOpsUserId`; **cached finance columns removed** in favour of a `trip_financials` view over the ledger).
- `TripTraveller` (tripId, travellerId).
- `Itinerary` (tripId or quotationId, version, status) · `ItineraryDay` (date, title, location, hotelBookingId?, customerNotes, internalNotes) · `ItineraryItem` (dayId, time, type TRANSFER|ACTIVITY|MEAL|STAY|FLIGHT|FREE|NOTE, title, location/geo, linked service id, customerVisible, imageDocumentId?).
- `Hotel` (vendorId?, name, location, contact, gstin, starRating) · `HotelRoomType` · `HotelRate` (season, mealPlan, cost) · `HotelBooking` (tripId, hotelId, roomTypeId, checkIn, checkOut, rooms, guests, mealPlan, confirmationNo, cost, sell, status REQUESTED→CONFIRMED→CANCELLED, confirmationDocumentId?).
- `Vehicle` (vendorId?, registration, type, capacity, ownerName, documents via links, insuranceExpiry, permitExpiry) · `Driver` (userId?, name, phone, licenceNo, licenceExpiry, defaultVehicleId) · `VehicleAssignment` (tripId, vehicleId, driverId, fromDate, toDate, pickup, drop, cost, sell, status) with an exclusion check on overlapping dates per vehicle/driver.
- `Activity` (providerVendorId, name, location, duration, defaultCost, defaultSell) · `ActivityBooking` (tripId, activityId, date, time, participants, cost, sell, confirmationNo, status).
- `Ticket` (tripId, travellerId?, kind FLIGHT|TRAIN|BUS, carrier, pnr, number, from, to, departAt, arriveAt, seat, baggage, cost, sell, status, documentId?) — replaces legacy flight/train/bus `Booking` rows and `TripService` FLIGHT/BUS.
- `TripService` is retired; VEHICLE/TRANSFER → `VehicleAssignment`, HOTEL → `HotelBooking`, ACTIVITY → `ActivityBooking`, FLIGHT/BUS → `Ticket`, VISA/INSURANCE → `TripExtra` (kind, provider, cost, sell, status, documentId).
- `Task` (existing + `assignedToId` → User, `entityType/entityId`, `origin` MANUAL|AUTOMATION|AI).

**Suppliers & finance**
- `Vendor` (existing; `bankDetails` moved to encrypted columns; `kind` HOTEL|TRANSPORT|ACTIVITY|GUIDE|VISA|OTHER) · `VendorInvoice` (vendorId, tripId?, number, date, dueDate, amount, taxAmount, status, documentId?) · `VendorPayment` (vendorInvoiceId?, vendorId, tripId?, amount, date, mode, reference).
- `CustomerPayment` (rename of `Payment` type=customer: customerId, bookingId?, tripId?, invoiceId?, amount, date, mode, reference, kind ADVANCE|INSTALLMENT|FINAL|REFUND, status RECEIVED|BOUNCED|REFUNDED).
- `Expense` (tripId?, category, vendorId?, amount, taxAmount, date, paidById, receiptDocumentId?, notes).
- `Invoice`, `InvoiceLineItem`, `CreditNote`, `DebitNote` (kept as-is + `organizationId`; `bookingIds/tripIds` JSON → `InvoiceSource` rows).
- `LedgerEntry` (rename of `FinancialTransaction`; + `reversesEntryId?` so deletions/voids post a reversal instead of mutating) — the single source for receivables, payables, cash and profitability.
- Views: `trip_financials` (revenue, cost by category, gross profit, margin), `customer_balances`, `vendor_balances`.

**Documents & communication**
- `Document` (organizationId, type, title, storageKey, mime, size, sha256, status UPLOADED|PROCESSING|EXTRACTED|NEEDS_REVIEW|LINKED|FAILED, expiresAt?, uploadedById, `version`, `previousVersionId?`) · `DocumentLink` (documentId, entityType, entityId, role e.g. CONFIRMATION|TICKET|ID|RECEIPT) · `DocumentAccess` (documentId, roleId or userId, customer-visible flag).
- `DocumentExtraction` (documentId, provider, model, documentType, confidence, fields JSON, rawText?, status, createdAt) · `ExtractionProposal` (extractionId, entityType, entityId?, operation CREATE|UPDATE, changes JSON, status PROPOSED|APPROVED|REJECTED|APPLIED, reviewedById).
- `Communication` (unifies `Communication` + `MessageLog`: channel, direction, templateKey?, recipient, subject, body, status, providerMessageId, error, entity links).
- `Feedback` (tripId, customerId, rating, comments, submittedAt) · `PortalAccess` (customerId, tokenHash, expiresAt, lastUsedAt).

### I.3 Legacy → target mapping

| Legacy | Target | Migration |
|---|---|---|
| `CompanySettings` singleton | `Organization` | Copy row → `gk-travels` |
| `users.role` enum | `Role` rows ADMIN/BOOKING/OPERATIONS/ACCOUNTS mapped to OWNER/SALES/OPERATIONS/ACCOUNTS + seeded permissions | Data migration; enum kept read-only until cut-over |
| `Passenger` | `Traveller` | Rename table via migration |
| `Lead` (0 rows) | new `Lead` | Recreate |
| `Quotation` + items (1) and `SalesQuote` + items (4) | `Quotation` + `QuotationItem` | Script maps both; legacy tables dropped after verification |
| `Booking` 8-type rows (8: flights/trains) | `Ticket` (+ `TripExtra` for visa/insurance, `HotelBooking`, `VehicleAssignment`, `ActivityBooking` for other types) | Script by `type`; finance fields → ledger entries |
| `TripService` (0) | as above | Nothing to migrate |
| `Trip` cached finance | `trip_financials` view | Columns kept nullable during transition, dropped in Phase 4 |
| `Payment` (0) | `CustomerPayment` / `VendorPayment` | Split by `type` |
| `FinancialTransaction` (32) | `LedgerEntry` | Rename + backfill `organizationId` |
| `ActivityLog` (319) | `AuditLog` | Rename + `source=HUMAN` |
| `Communication` (5) + `MessageLog` (20) | `Communication` | Union |
| `Reminder` (0) | `Notification` + `AutomationRule` | Drop |
| `Voucher` (5) + 21 drift columns | `Voucher` kept as a document generator over `HotelBooking`/`VehicleAssignment`/`Ticket`; drift columns adopted into the schema first, then removed in a reviewed migration | Two-step |
| `Customer.tripIds`, `*.passengerIds`, `Invoice.bookingIds/tripIds` JSON | proper join tables | Backfill script |

---

## J. Module dependency map

```
                         ┌──────────────┐
                         │   platform   │ org · users · roles · tax · numbering · templates · audit · jobs · storage · ai
                         └──────┬───────┘
          ┌─────────────────────┼─────────────────────────────┐
          ▼                     ▼                             ▼
     ┌─────────┐          ┌───────────┐                  ┌──────────┐
     │customers│◀────────▶│   sales   │                  │suppliers │ vendors · hotels · vehicles · drivers · activities
     │travellers│         │leads·enq· │                  └────┬─────┘
     └────┬────┘          │quotations │                       │
          │               └─────┬─────┘                       │
          │                     ▼                             │
          │               ┌───────────┐                       │
          └──────────────▶│ bookings  │◀──────────────────────┘
                          └─────┬─────┘
                                ▼
                          ┌───────────┐     ┌───────────┐     ┌────────────┐
                          │   trips   │────▶│ documents │────▶│ extraction │ (AI)
                          │itinerary· │     └───────────┘     └────────────┘
                          │stays·moves│
                          │tickets·   │     ┌───────────┐
                          │activities │────▶│  finance  │ payments · payables · expenses · invoices · ledger · profitability
                          │tasks      │     └─────┬─────┘
                          └─────┬─────┘           │
                                ▼                 ▼
                          ┌───────────┐     ┌───────────┐     ┌───────────┐
                          │  comms    │◀────│automation │────▶│notifications│
                          └───────────┘     └───────────┘     └───────────┘
                                ▲
                          ┌─────┴─────┐     ┌───────────┐     ┌───────────┐
                          │  copilot  │     │ analytics │     │  portal   │ (customer, driver)
                          └───────────┘     └───────────┘     └───────────┘
```

| Module | Depends on | Emits events | Consumed by |
|---|---|---|---|
| platform | — | `user.created`, `settings.changed` | all |
| customers | platform | `customer.created/merged` | sales, bookings, trips, finance, portal |
| sales (leads, enquiries, quotations) | customers, suppliers (for item catalogues), platform.tax | `lead.stage_changed`, `quotation.sent/accepted/expired` | bookings, automation, analytics |
| bookings | sales, customers | `booking.created/confirmed/cancelled` | trips, finance, automation |
| suppliers | platform | `vendor.updated` | sales, trips, finance |
| trips | bookings, suppliers, customers | `trip.status_changed`, `service.requested/confirmed`, `trip.starts_in_days` (scheduled) | finance, documents, comms, automation, portal |
| documents / extraction | platform.storage, platform.ai, trips, customers, suppliers, finance | `document.uploaded/extracted/approved` | trips, finance, portal |
| finance | bookings, trips, suppliers, platform.tax/numbering | `payment.received/overdue`, `invoice.issued`, `payable.due` | dashboard, analytics, automation, portal |
| comms | platform.templates, customers, trips | `message.sent/failed` | automation, timelines |
| automation | platform.jobs, all events | `automation.ran` | — |
| notifications | automation, tasks | — | shell |
| copilot | platform.ai, read tools from every module, write tools from tasks/comms/sales | `ai.action` | shell |
| analytics | finance, sales, trips (read models) | — | dashboard |
| portal (customer, driver) | trips, documents, finance (read, scoped), comms | `feedback.submitted`, `driver.status_updated` | trips, customers |

Build order follows the arrows: platform → customers/suppliers → sales → bookings → trips → finance → documents/extraction → comms/automation → copilot/analytics → portal.
