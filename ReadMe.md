# Campus Coin — ReadMe

**Smart Spending, Student Style** — a student-first budget and expense tracker.
One web application: students log income and expenses, see where the money goes,
set category budgets, read monthly insights and saving tips; administrators
manage the shared categories, tip templates, announcements and accounts.

**Five tools that make it more than a ledger:** roommate groups that split a
mess bill and settle it back to zero, a one-sentence expense logger, a
"survival mode" daily allowance for the end of the month, a private wishlist fed
by a micro-savings jar, and a subscription vault that names the payments you
are still making for things you stopped using.

---

## 1. Stack

| Layer | Choice |
|---|---|
| Database | MongoDB (Schema design in `db/schema.md`) |
| Backend | Node.js 24 + Express 4 (ESM), Mongoose 8 |
| Frontend | React 18 + Vite, custom CSS design system (`client/src/styles/campuscoin.css`) |
| Charts | Chart.js (with a "view as table" alternative for every chart) |
| PDF export | pdfkit · Image export | html2canvas (explicit click only) |
| Sessions | express-session + connect-mongo, HttpOnly / SameSite=Lax cookies |
| Tests | Node built-in test runner + Supertest + in-memory MongoDB |

The stack matches the one approved in the SRS (§1.8: "…like MySQL, MongoDB,
Express.js, React, Node.js … are also valid").

## 2. Assumptions (as listed for the report)

1. **Database engine** — MongoDB was chosen over MySQL because the approved
   stack lists it explicitly; the data model, endpoints and algorithms from
   the SRS are unchanged (see `db/schema.md`).
2. **Development database** — `npm run dev:local` runs a local database with
   no cloud setup at all; files live in `db/data/` and survive restarts
   (delete that folder to start fresh). Production uses the `MONGODB_URI`
   in `.env`.
3. **Email** — password reset and report sharing print the message to the
   server console in development (`EMAIL_BACKEND=console`); real SMTP is a
   configuration change only, no code change.
4. **Category suggestions & monthly narratives** — templates over the
   student's own aggregates are the default. A remote text endpoint may be
   configured with `NARRATIVE_API_KEY` / `NARRATIVE_API_URL`; if it is absent
   or slow (3 s timeout), templates are used. Only aggregated numbers can ever
   be sent — never descriptions or personal details.
5. **Report format** — the written report and demo video are produced by the
   student team per SRS §1.9; this ReadMe covers the software only.

## 3. Running it

```powershell
# 1. install
cd server   && npm install
cd ../client && npm install

# 2. configure (only for a DIFFERENT / cloud database — optional)
copy .env.example .env        # fill MONGODB_URI for a real database
                              # (with no .env at all, every command below
                              #  still works: the on-disk database is used)

# 3a. demo / try-out (no cloud needed, works on a fresh clone)
cd server
$env:SEED='1'; npm run dev:local      # seeds demo accounts, serves :5000,
                                      # data kept in db/data/ across restarts
# npm run dev   /  npm start  behave the same way (dev also reloads on
# file changes); nothing can fail with a "database not running" error.

# 3b. run against your own database (MONGODB_URI set in .env)
npm run seed                          # first time only
npm run dev                           # API on http://localhost:5000

# 4. client (second terminal)
cd client
npm run dev                           # http://localhost:5173
```

Production build: `npm run build` in `client/`, then start the server — Express
serves `client/dist` itself, so one process, one URL.

### Demo credentials (from `phases.md`)

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@campuscoin.test` | `Admin@12345` |
| Student — Aisha (history) | `aisha@campuscoin.test` | `Student@12345` |
| Student — Bilal (history) | `bilal@campuscoin.test` | `Student@12345` |
| Student — empty account | `newuser@campuscoin.test` | `Student@12345` |

Administrator sign-in lives at **`/control/login`** — a separate door from the
student login, and the server refuses the wrong role at each.

## 4. Tests

```powershell
cd server
npm test          # 80 tests across 6 suites:
                  #   auth & sessions · transactions & audit trail
                  #   budget alert boundaries · CSV import safety
                  #   roommate groups, splits & settlements
                  #   wishlist & savings jar · subscription vault
                  #   quick-text logger & survival-mode arithmetic
```

Each test file gets its own in-memory MongoDB, so tests never touch real data
and need no setup.

## 5. Project layout

```
CampusCoin/
├── server/
│   ├── src/
│   │   ├── config/        env + database connection
│   │   ├── models/        18 collections (see db/schema.md)
│   │   ├── services/      business logic: ledger, alerts, tips, reports,
│   │   │                  budgets, categoriser, insight, forecast, importer,
│   │   │                  groups, wishlist, vault, quickText, survival…
│   │   ├── routes/        thin HTTP layer (auth, transactions, control…)
│   │   ├── middleware/    sessions, role guards, CSRF, rate limits, errors
│   │   └── scripts/       seed, recurring generator, dev-local
│   └── tests/             node:test + supertest suites
├── client/
│   └── src/
│       ├── components/    layout, charts, modals, forms, toasts,
│       │                  quick-text + survival-mode cards
│       ├── pages/         student screens + pages/control (admin area)
│       └── styles/        design tokens & components (custom CSS)
├── db/schema.md           collections, fields, indexes, relationships
└── docs/                  PRD, architecture, design, phases (spec pack)
```

## 6. Notable behaviours worth knowing

- **Soft delete only** — transactions move to a bin and can be restored; every
  change writes an audit row (`/transactions/:id/history`).
- **Budget alerts fire once per threshold per month** — a unique index, not a
  timer, stops the bell from ringing twice no matter how often you edit.
- **CSV import is three steps** — upload → preview with per-row errors →
  confirm. The file never touches disk, and formula-like cells are neutralised
  when echoed.
- **Recurring entries are idempotent** — a cursor (`lastGeneratedOn`) only
  moves forward, so running the generator twice creates nothing extra.
- **Shared money never touches the personal ledger** — group bills and
  settlements live in their own collections, and savings-jar money lives on the
  account, so neither can show up in a budget, a chart or a report.
- **The quick-text logger parses, it does not guess** — amount, category and
  date come from the sentence (in any of the 14 languages the app is published
  in, decimal commas included), the reading is shown before anything is saved,
  and the entry can be undone from the same confirmation.
- **Survival mode stores only the switch** — the daily allowance is recomputed
  from the ledger on every read, so it can never go stale.
- **The vault explains itself** — every threshold it uses is in one exported
  object, and each verdict ships the reason in the language the student picked.
- **Accessibility** — skip link, visible labels, 44 px touch targets, focus
  rings, light/dark theme, 4-step text size, reduced-motion support, and every
  chart/table pair in both directions.
