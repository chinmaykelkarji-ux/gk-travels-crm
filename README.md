# GK Travels — Operations CRM

> A professional, enterprise-grade Travel Operations CRM built for modern travel agencies. Manage trips, bookings, customers, finance, and operations — all in one place.

![GK Travels CRM](https://img.shields.io/badge/GK%20Travels-Operations%20CRM-2563EB?style=for-the-badge&logoColor=white)
![Status](https://img.shields.io/badge/Status-Live-059669?style=for-the-badge)
![Stack](https://img.shields.io/badge/Stack-HTML%20%7C%20CSS%20%7C%20JS-F59E0B?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-6B7280?style=for-the-badge)

---

## 🌐 Live Demo

🔗 **[View Live on Vercel →](https://gk-travels-crm.vercel.app)**

---

## 📸 Overview

GK Travels CRM is a full-featured, single-file travel ERP system designed for customized tour operators. It replaces spreadsheets and fragmented tools with a centralized, fast, and elegant operations platform — comparable to Zoho, HubSpot, or Travelopro — with zero backend or build step required.

---

## ✨ Features

### 📊 Dashboard
- Live KPI metrics — Revenue, Profit, Customer Dues, Supplier Dues
- Today's departures & departing-this-week alerts
- Overdue balance alerts with direct action buttons
- Operations snapshot — check-ins, visa tracking, vouchers, open tasks
- Recent bookings feed & activity timeline

### 🧳 Trip Files
- Create and manage complete trip files per customer
- Internal tabs: Overview · Flights · Hotels · Payments · Itinerary · Tasks · Timeline
- Auto-generates reminders, tasks, and customer profile on trip creation
- Finance tracking per trip — selling price, GST, supplier cost, profit margin

### 🎫 Bookings (8 Types)

| Type | Fields |
|------|--------|
| ✈ Flight | Airline, PNR, Route, Class, Departure, Arrival, Selling Price, Supplier Cost |
| 🚆 Train | Train No., PNR, Class, Route, Schedule |
| 🚌 Bus | Operator, Type, Route, Seat Numbers |
| 🏨 Hotel | Hotel Name, Check-in/out, Room Type, Meal Plan |
| 🚗 Cab | Pickup/Drop, Driver, Vehicle Type |
| 📋 Visa | Country, Type, Application, Appointment, Submission Dates |
| 🛡 Insurance | Provider, Policy, Coverage Dates, Sum Insured |
| 🗺 Activity | Name, Location, Date, Duration, Operator |

Each booking includes: Finance tab (Selling Price, GST, Advance, Supplier Cost, Profit), Documents, Timeline, Status Workflow, WhatsApp sharing, Voucher & Invoice printing.

### 👥 Leads & Sales Pipeline
- Capture leads with source, destination, budget, travel dates
- Pipeline stages: New → Contacted → Quoted → Negotiating → Won / Lost
- One-click promote lead → Trip File + Customer profile
- WhatsApp follow-up integration

### 👤 Customers
- Full customer profiles with passport, preferences, contact details
- Linked trip history and booking history
- Document storage per customer

### 💰 Finance
- **Overview** — Total revenue, collected, pending, supplier dues
- **Customer Ledger** — All customer payments with status
- **Supplier Ledger** — All supplier payments and pending dues
- **Trip P&L** — Per-trip profit and loss breakdown
- **Booking Finance** — All 8 booking types with financial details
- **Monthly Report** — 6-month revenue, cost, profit comparison

### ⚡ Operations Hub (3 Tabs)
- **Action Items** — Live queue: flights, hotels, visa, transfers, balances
- **Tasks** — Team task management with priority and assignment
- **Reminders** — Smart auto-generated alerts based on trip timelines

### 🔔 Smart Reminders Engine
- Auto-generates reminders on trip/booking creation
- Web check-in alerts (24hrs before departure)
- Balance due alerts (5 days before departure)
- Visa follow-up and departure day notifications

### 🔍 Global Search
- Search across trips, customers, bookings, leads by name, ID, PNR, or destination

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Markup | HTML5 |
| Styling | Tailwind CSS (CDN) + Custom Design System |
| Logic | Vanilla JavaScript (ES6+, modular) |
| Icons | Lucide Icons |
| Fonts | Inter + Manrope (Google Fonts) |
| Storage | localStorage (browser-based) |
| Deployment | Vercel / GitHub Pages |

> **No build step. No backend. No dependencies to install.** Just open `index.html` in a browser.

---

## 🗂 Project Structure

```
gk-travels-crm/
├── index.html                  # App shell — sidebar, header, modals
├── assets/
│   ├── css/
│   │   └── app.css             # Design system (navy sidebar, blue accent)
│   └── js/
│       ├── data.js             # Data store — all entities, finance logic, localStorage
│       ├── workflow.js         # Cascade engine + global search
│       ├── app.js              # Router, navigation, global UI functions
│       └── modules/
│           ├── dashboard.js    # KPIs, departures, activity feed
│           ├── leads.js        # Sales pipeline, kanban, lead forms
│           ├── trips.js        # Trip files, detail view, tabbed layout
│           ├── bookings.js     # All 8 booking types with full finance
│           ├── customers.js    # Customer profiles and history
│           ├── finance.js      # 6-tab finance center
│           ├── operations.js   # Operations hub (actions + tasks + reminders)
│           ├── tasks.js        # Task management
│           ├── reminders.js    # Smart reminder engine
│           ├── documents.js    # Document center
│           └── export.js       # Print vouchers, invoices, WhatsApp share
└── README.md
```

---

## 🚀 Getting Started

### Option 1 — Open Directly
```bash
# Clone the repo
git clone https://github.com/chinmaykelkarji-ux/gk-travels-crm.git

# Open in browser — no install needed
open index.html
```

### Option 2 — Run with Live Server (VS Code)
1. Install the **Live Server** extension in VS Code
2. Right-click `index.html` → **Open with Live Server**

### Option 3 — Deploy to Vercel
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/chinmaykelkarji-ux/gk-travels-crm)

---

## 🏗 Architecture

### Cascade Engine
Every action triggers an automatic workflow:
- **Create Trip** → generates reminders + tasks + customer profile
- **Promote Lead** → creates trip + customer + tasks + reminders
- **Add Booking** → links to trip timeline + creates supplier payment + recalculates finance
- **Mark Payment** → updates balance + clears tasks + updates ledger

### Finance Logic
```
totalPayable  = sellingPrice + gstAmount
balanceDue    = totalPayable - paidAmount
grossProfit   = sellingPrice - supplierCost
marginPct     = (netProfit / sellingPrice) × 100
```

### Entity ID Formats
| Entity | Format |
|--------|--------|
| Trips | `GK-2026-0001` |
| Leads | `L-2026-0001` |
| Bookings | `BK-2026-0001` |
| Customers | `CUS-2026-0001` |
| Tasks | `T-001` |
| Payments | `PAY-001` |
| Supplier Payments | `SP-001` |

---

## 🎨 Design System

| Token | Value | Usage |
|-------|-------|-------|
| Sidebar | `#0F172A` | Deep navy background |
| Accent | `#2563EB` | Buttons, links, active states |
| Page BG | `#F1F5F9` | Slate blue-gray |
| Card | `#FFFFFF` | Pure white with subtle shadow |
| Success | `#059669` | Paid, confirmed, approved |
| Warning | `#D97706` | Pending, due, in-progress |
| Danger | `#DC2626` | Overdue, urgent, rejected |

**Fonts:** Inter (body) · Manrope (headings, IDs, brand)

---

## 🗺 Roadmap

- [ ] User authentication & role-based access (Admin / Agent / Manager)
- [ ] Cloud database integration (Supabase / Firebase)
- [ ] WhatsApp Business API for automated messages
- [ ] Real-time push notifications
- [ ] PDF invoice & voucher generator
- [ ] Itinerary builder with day-by-day planner
- [ ] Supplier contact database
- [ ] Analytics & revenue forecasting dashboard
- [ ] Mobile app (React Native)
- [ ] Multi-branch / multi-agency support

---

## 👨‍💻 Author

**Chinmay Kelkar**

Built as a production-grade travel operations management platform for scalable tourism businesses.

🔗 [GitHub](https://github.com/chinmaykelkarji-ux) · [Live Demo](https://gk-travels-crm.vercel.app)

---

## 📄 License

MIT License — free to use, modify, and distribute.

---

<div align="center">
  <strong>GK Travels Operations CRM</strong><br/>
  Built with ❤️ for the travel industry
</div>
