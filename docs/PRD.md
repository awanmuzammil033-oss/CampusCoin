# Campus Coin — Product Requirements Document (PRD)

> **Source of truth:** `CampusCoin_End-to-End_Web_Solutions_SRS.pdf` (v1.0, Aptech TechWiz 7, theme *NextGen BudgetBee*).
> Every requirement below carries an ID and the SRS section it comes from. If this file and the SRS ever disagree, the SRS wins.

---

## 1. Product Summary

**Campus Coin** ("Smart Spending, Student Style") is a lightweight, responsive, student-first web app for logging income and expenses, seeing where money goes, and getting plain-language guidance on saving more. No bank linking, no payments, no real money movement.

| Item | Value |
|---|---|
| Category | End-to-End Web Solutions |
| Users | Students (registered), Administrator (direct-access login) |
| Data entry | Manual entry or CSV import only |
| AI | **Optional**, advisory only, always user-overridable |

### 1.1 Problem
Students receive money from irregular sources (allowance, part-time work, scholarships, gifts) but rarely track it. Generic finance apps target salaried adults, are complex or paywalled, and ignore student categories (canteen, hostel, textbooks, transport, subscriptions, outings).

### 1.2 Goals
1. Log a transaction in under 10 seconds (first-time user included).
2. Show category-wise, trend and budget views that update immediately.
3. Give personalised, ranked saving tips from the student's *own* history.
4. Optionally auto-categorise expenses and write a friendly monthly insight.
5. Give admins oversight of categories, users, templates and usage stats.

### 1.3 Non-Goals (out of scope per SRS §1.5)
- Bank integration, bank-account verification, real payment processing.
- Certified financial advice (all AI output is a *suggestion*).
- Mobile native apps (responsive web only).

---

## 2. Personas

| Persona | Description | Key needs |
|---|---|---|
| **Aisha, 1st-year student** | Gets a monthly allowance, no budgeting habit | Fast logging, simple charts, gentle tips |
| **Bilal, 3rd-year student** | Allowance + tutoring income + subscriptions | Budgets per category, alerts, monthly report export |
| **Admin (campus finance-literacy coordinator)** | Runs the platform | Manage default categories, tip templates, users; see usage stats |

---

## 3. Functional Requirements

Priority: **M** = mandatory (must ship), **O** = optional in SRS (ship after all M items), **A** = extra polish.

### 3.1 User Authentication & Management (SRS §1.6)
| ID | Requirement | Pri |
|---|---|---|
| AUTH-1 | Student registration (name, email, password) with validation; email unique | M |
| AUTH-2 | Student login/logout on the public login page | M |
| AUTH-3 | **Separate, direct-access admin login** at its own URL (not linked from student navigation) | M |
| AUTH-4 | Secure session management (HttpOnly/SameSite cookies, idle timeout, logout invalidates session) | M |
| AUTH-5 | Password recovery/reset via emailed **tokenised link** (time-limited, single-use) | M |
| AUTH-6 | Editable profile: name, academic year, monthly allowance baseline, savings goal | M |
| AUTH-7 | Optional bulk import of historical transactions from CSV | O (see TXN-8) |

**Acceptance:** a user can only ever read/write their own data; disabled users cannot log in; reset links expire and cannot be reused.

### 3.2 Category Management
| ID | Requirement | Pri |
|---|---|---|
| CAT-1 | Default **income** categories: Allowance, Part-time Job, Scholarship, Gift, Other Income | M |
| CAT-2 | Default **expense** categories: Food, Transport, Hostel/Rent, Academics (books, tuition, stationery), Subscriptions (streaming, apps), Entertainment (movies, outings), Miscellaneous | M |
| CAT-3 | Under **"Manage Own Categories"**, a user can add / edit / delete personal categories with type income or expense | M |
| CAT-4 | Users cannot edit/delete default categories; deleting a personal category that has transactions must offer *reassign to…* (never orphan data) | M |
| CAT-5 | Category names unique per user per type (case-insensitive) | M |

### 3.3 Personalised Dashboard
| ID | Requirement | Pri |
|---|---|---|
| DASH-1 | Personalised greeting, current-month balance (income vs expense), quick-add buttons (Add Income / Add Expense) | M |
| DASH-2 | Saving tips & highlights based on the user's own history (top few) | M |
| DASH-3 | Widgets: **This Month's Top Category**, **Budget vs. Actual** | M |
| DASH-4 | Charts: category doughnut, 6-month income-vs-expense bars | M |
| DASH-5 | Loading indicators / smooth transitions while charts & insights render | M |

### 3.4 Income & Expense Logging
| ID | Requirement | Pri |
|---|---|---|
| TXN-1 | Quick-add form: type, amount (>0), category, date (default today), description | M |
| TXN-2 | Income categories and expense categories as listed in CAT-1/CAT-2 | M |
| TXN-3 | **Recurring entries** (e.g. monthly allowance, subscriptions): weekly/monthly rules that auto-generate transactions | M |
| TXN-4 | Edit and delete transactions **while retaining full history** (soft delete + audit log of every change) | M |
| TXN-5 | Transaction list with search, filters (date range, category, type), pagination | M |
| TXN-6 | Server-side validation; amounts stored as `DECIMAL(12,2)` | M |
| TXN-7 | Undo-friendly delete (confirmation dialog; deleted items recoverable from history) | A |
| TXN-8 | CSV import: template download, preview, per-row validation errors, batch category suggestions, confirm-then-save | O |

### 3.5 Optional AI-Driven Expense Categorisation Assistant
| ID | Requirement | Pri |
|---|---|---|
| AI-1 | As the user types a description, suggest a category (e.g. "Campus Cafe" → Food) | O |
| AI-2 | **Learns from the user's corrections** to improve later suggestions | O |
| AI-3 | Manual override always allowed; suggestion stored in `ai_suggested_category` | O |
| AI-4 | Batch suggestions during CSV import | O |
| AI-5 | UI labels output as *"Suggested"*, never as fact | M (if AI shipped) |

### 3.6 Monthly Reports
| ID | Requirement | Pri |
|---|---|---|
| REP-1 | Category-wise report of monthly spending | M |
| REP-2 | Income-vs-expense report for the **last six months** | M |
| REP-3 | Daily and weekly spending summaries for the current month | M |
| REP-4 | Filters: date range, category, income source | M |
| REP-5 | Export monthly report as **PDF or image** (only on explicit click; no automatic downloads) | M |

### 3.7 Optional AI-Generated Monthly Spending Insights
| ID | Requirement | Pri |
|---|---|---|
| INS-1 | Short plain-language narrative of the month's notable patterns | O |
| INS-2 | Flag categories growing above the user's *own* trend (e.g. "Food delivery spending rose 40% this month") | O |
| INS-3 | Simple actionable advice tied to the flag (weekly cap, cheaper alternative) | O |
| INS-4 | Store **insight history** so past months can be reviewed | O |
| INS-5 | Advisory disclaimer shown with every insight | M (if shipped) |

### 3.8 Personalised Saving Tips Engine
| ID | Requirement | Pri |
|---|---|---|
| TIP-1 | Generate tips from the database by comparing current spending vs. historical averages and budget goals | M |
| TIP-2 | **Rank by potential savings impact**; show top few on the dashboard | M |
| TIP-3 | User can **dismiss** or **pin** a tip | M |

### 3.9 Budget Goals & Alerts
| ID | Requirement | Pri |
|---|---|---|
| BUD-1 | Set a monthly budget per category (e.g. Food: 30 USD) | M |
| BUD-2 | Real-time progress bars (green → amber ≥80% → red ≥100%) | M |
| BUD-3 | In-app notification when a category **nears** (≥80%) or **exceeds** (≥100%) its budget; one notification per threshold per month (no spam) | M |

### 3.10 Bookmarking, Notes & Sharing
| ID | Requirement | Pri |
|---|---|---|
| BKM-1 | Bookmark a saving tip or monthly insight (with optional personal note) | M |
| BKM-2 | Export monthly report / savings summary as PDF, or share by email | M |

### 3.11 Admin Control Panel
| ID | Requirement | Pri |
|---|---|---|
| ADM-1 | Add/edit/remove **default** income/expense categories available to all students | M |
| ADM-2 | Add/edit/remove system-wide **announcement** and **tip templates** | M |
| ADM-3 | User accounts: view, **disable**, **reset** (trigger password reset) | M |
| ADM-4 | Usage stats: active users, total transactions logged, most-used categories | M |
| ADM-5 | Admin does **not** see individual students' transaction details (privacy) | M |

### 3.12 Optional System Intelligence
| ID | Requirement | Pri |
|---|---|---|
| SYS-1 | Track recently viewed / recently edited transactions across sessions | O |
| SYS-2 | Next-month forecast from historical trends | O |
| SYS-3 | Detect & flag unusually large or duplicate transactions | O |

### 3.13 Accessibility & UI Enhancements
| ID | Requirement | Pri |
|---|---|---|
| UX-1 | Dark-mode toggle (persisted per user) | M |
| UX-2 | Font-size adjustment (persisted per user) | M |
| UX-3 | Breadcrumbs on all inner pages | M |
| UX-4 | Smooth transitions and loading indicators for charts/insights | M |
| UX-5 | **Sitemap on the home page** (explicit SRS deliverable, §1.9) | M |

---

## 4. Non-Functional Requirements (SRS §1.7)

| Quality | Concrete target |
|---|---|
| **Safe to use** | No automatic or unnecessary downloads; downloads only on explicit user click; no third-party trackers; CSV uploads validated |
| **Accessibility** | WCAG 2.1 AA contrast, ≥16px base font, visible focus, keyboard-navigable, labelled form fields, ARIA on charts (with data-table fallback) |
| **User-friendliness** | First transaction achievable in ≤3 clicks from the dashboard; empty states explain what to do next |
| **Operability** | Friendly error pages (404/500), no unhandled exceptions, clear form errors |
| **Performance** | Dashboard < 2 s on a typical connection with 5 000 transactions; DB indexes on `(user, date)` and `(user, category, date)`; insight generation off the request path or cached |
| **Scalability** | Stateless app tier, DB-side aggregation (no loading all rows into Python), pagination everywhere |
| **Security** | Hashed passwords, CSRF, per-user query scoping, rate-limited login, secure cookies, secrets in env vars |
| **Availability** | 24/7 target on the hosted deployment; automated DB backup procedure documented |
| **Compatibility** | Latest Chrome, Firefox, Edge, Safari; desktop, tablet, mobile (≥360px) |

---

## 5. Constraints & Assumptions

- Data is entered manually or via CSV (SRS §1.5).
- AI/insights are advisory and overridable; no certified advice.
- Currency defaults to **USD** (matches SRS example); a single `CURRENCY_SYMBOL` setting allows PKR etc.
- Tech stack is one of the SRS-approved options (chosen in `architecture.md`).
- Do **not** use a ready-made website template; UI is custom-built (SRS AI note).

---

## 6. Success Metrics

- 100% of **M** requirements demonstrated in the demo video.
- Zero cross-user data leaks in the security test checklist.
- Lighthouse Accessibility ≥ 90, Performance ≥ 80 on dashboard.
- Test suite passes; seed data shows every feature with realistic content.

---

## 7. Deliverables (SRS §1.9)

1. Working web app (preferably hosted, URL shared).
2. Project report **without source code**: problem definition, design specifications, flowcharts, DFDs, database design, test data, **installation instructions (mandatory)**, **credentials for all user types (mandatory)**.
3. ZIP with `ReadMe.doc` (assumptions) + `.sql` schema/database script.
4. Demo video (`.mp4`) covering **all** functional requirements (mandatory).
5. Sitemap on the home page.

---

## 8. Academic Integrity & Project Quality Guidelines

- All modules and logic must be thoroughly understood and self-authored.
- Custom structured architecture; no third-party premade templates.
- Complete documentation, architecture designs, and test suites must accompany the application.
