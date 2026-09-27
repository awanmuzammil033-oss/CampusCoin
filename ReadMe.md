# Campus Coin — ReadMe

**Smart Spending, Student Style** — a student-first budget and expense tracker.
One web application: students log income and expenses, see where the money goes,
set category budgets, read monthly insights and saving tips; administrators
manage the shared categories, tip templates, announcements and accounts.

**Five tools that make it more than a ledger:** roommate groups that split a
mess bill between exactly the people it was for, settle it back to zero, and
talk about it in a group chat where anyone can post a poll card — "chai at 4pm,
350 a head?" — and tick themselves in as the total moves; a one-sentence
expense logger, a
"survival mode" daily allowance for the end of the month, a private wishlist fed
by a micro-savings jar, and a subscription vault that names the payments you
are still making for things you stopped using.

**Four utility rooms on top of that:** a currency drawer that opens from the
dashboard's balance card — pre-filled with your own balance, and one button
to show the whole site in another currency — a reference table of savings and
Fixed Deposit rates, an educational guide to
saving and investing with the risk level of every option written down, and a
curated library of ways to earn on the side — each with a trending badge and a
source where the claim has one.

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
npm test          # every suite, one in-memory MongoDB each:
                  #   auth, sessions & the password reset
                  #   transactions & the audit trail
                  #   budget alert boundaries
                  #   CSV import safety
                  #   roommate groups, splits & settlements
                  #   wishlist & the savings jar
                  #   subscription vault
                  #   quick-text logger & survival-mode arithmetic
                  #   savings & FD reference table (admin CRUD, validation)
                  #   side-income library (the citation rule)
                  #   growth guide (the nudge is a key, never a sentence)
                  #   currency converter (cache, fallback, refusal)
                  #   group chat, poll cards & a bill's own member set
                  #   group roles and the four capabilities
                  #   the group's books: journal, trial balance, reconciliation
                  #   the spending card and the scanned payment
```

```powershell
cd client
node scripts/check-css-hooks.mjs   # every class hook the app asks for has a rule
```

**That last one is not a test suite, and it exists because a test could not have
caught the bug it was written for.** Three sections of the landing page shipped
with no CSS at all for any of their thirty class hooks, so they rendered as
run-on text - "How this month readsThree words, and the rule behind each" - in
the middle of a section that is supposed to be a card. The build was green, every
key existed, the text was on the page and the browser checks passed: all of them
are perfectly happy with text that exists. Only a person looking at the screen saw
it. The check reads every `className` in the client and asks the stylesheet
whether it knows the name; anything with no rule has to be on the allow-list with
a reason next to it, so the list cannot grow quietly into a list that checks
nothing.

Each test file gets its own in-memory MongoDB, so tests never touch real data
and need no setup. The converter suite never reaches the network: the upstream
fetch is injectable, and the tests supply their own.

## 5. Project layout

```
CampusCoin/
├── server/                     the API
│   ├── src/
│   │   ├── config/             env + database connection
│   │   ├── models/             23 collections (see db/schema.md)
│   │   ├── services/           business logic, one module per feature:
│   │   │                       ledger, alerts, budgets, categoriser, insight,
│   │   │                       forecast, importer, reports, tips, vault,
│   │   │                       wishlist, quickText, survival, accounts,
│   │   │                       fxRates, bankRates, incomeIdeas, growMoney,
│   │   │                       groups, groupChat, groupLedger,
│   │   │                       spendingInsights, qrpay
│   │   ├── routes/             thin HTTP layer, one file per area
│   │   ├── middleware/         sessions, role guards, CSRF, rate limits, errors
│   │   └── scripts/            seed, recurring generator, dev-local
│   └── tests/                  node:test + supertest suites
├── client/                     the React app
│   └── src/
│       ├── components/         layout, charts, modals, forms, toasts,
│       │                       GroupChat, GroupLedger, SpendingInsightsCard,
│       │                       QrPaySheet, CurrencyDrawer, VoiceInput,
│       │                       NotificationPanel
│       ├── art/                HeroWaves, HeroShowcase, AuthArt, FaqArt, CatsArt
│       ├── pages/              the student screens, plus pages/control (admin)
│       │                       and the three group-books pages:
│       │                       GroupJournalPage, GroupTrialBalancePage,
│       │                       GroupReconcilePage
│       ├── i18n/               14 dictionaries + pending/ (English sources)
│       ├── styles/             design tokens & components (campuscoin.css)
│       └── scripts/            check-css-hooks: every hook has a rule
├── db/schema.md                collections, fields, indexes, relationships
└── docs/                       PRD, architecture, design, phases (spec pack)
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
  and the entry can be undone from the same confirmation. **Dictation is
  available where the browser supports it** and hidden where it does not, and
  what it hears goes through exactly the same reader, confirmation and undo.
- **Survival mode stores only the switch** — the daily allowance is recomputed
  from the ledger on every read, so it can never go stale.
- **The vault explains itself** — every threshold it uses is in one exported
  object, and each verdict ships the reason in the language the student picked.
- **The converter never invents a rate** — the 💱 button on the dashboard’s
  balance card opens a drawer that starts from the balance already on screen,
  and every figure in it is the server’s answer from a six-hour cache of the
  free Frankfurter feed. Currencies that feed does not carry (PKR, BDT, NPR,
  NGN …) come from a dated table shipped with the app and are labelled as a
  snapshot in the currency list, so the drawer always says which figures are
  live and which are not. "Apply to Entire Website" changes the display
  currency the whole app reads — the stored amounts never move, and the
  drawer refuses to apply a currency you are already in. A pair the
  table cannot answer is refused, never guessed, and no rate is ever written to
  a record.
- **A bill names its own people** — the group screen asks who a bill is between
  before it asks how much, and the payer has to be one of them, because a bill
  split between two people and paid by a third is a question nobody can answer
  a month later. The split is computed over the ticked members only, and the
  rule for the odd cent is the same one the whole module has always used: whole
  cents, and the leftover to whoever lost the most to the floor.
- **A roommate’s email is a promise the app keeps** — add somebody by email
  before they have an account and the group waits for them. The moment they
  register or sign in, that membership is filled in and the group appears on
  their dashboard with no action from them.
- **The group chat is a real screen** — `/groups/:groupId/chat`, addressable and
  linkable, with a member avatar and name on every message. The + button posts
  one of six poll cards; each member has their own row to tick, the running
  total is the server’s number, and tapping the same tick again takes the
  answer back.
- **"Home" means your dashboard** — inside the app the breadcrumb goes to the
  place you work, not to the marketing page; signed out it is still the landing
  page, which is the only home there is.
- **The rate and idea libraries are reference, never advice** — the savings
  table carries a non-dismissible disclaimer, the growth guide is definitions
  and risk levels with no product named, and its nudge is a translation key plus
  the student's own surplus, so there is no sentence in the code that could
  tell anybody what to buy. A trending side-income idea cannot be published
  without a source.
- **Accessibility** — skip link, visible labels, 44 px touch targets, focus
  rings, light/dark theme, 4-step text size, reduced-motion support, and every
  chart/table pair in both directions.
- **One column, in order** — the dashboard reads top to bottom: balance, goal,
  quick text, survival mode, the tools, then the detail. Cards keep their own
  height, so a tall card never stretches its neighbour.
- **The group has books of its own** — the split board answers "who owes
  whom", and the journal answers a different question: where the group's own
  money is. Every entry is double-entry, and `SUM(debit) = SUM(credit)` is
  checked in whole cents before anything is written — an unbalanced entry is
  refused by name, with both totals, and the form will not let you save one
  either. An entry is never edited: to correct it you *post the reverse*, and
  the mirror is a new entry with the original left exactly as it was. The
  **trial balance** is the proof, and it says so in one line — "Debits and
  credits agree: X = X" — or, if something reached the books without going
  through the journal, a red "out by X" rather than a quiet correction. The
  **bank reconciliation** puts the group's figure beside a real statement
  line by line, auto-pairs what it can within ±5 days, and closes only when
  `statement balance = book balance + unbooked` and nothing is left
  unclassified. The honest way to explain a difference is to book the missing
  entry, or to say the line is not the group's, or to mark a book line as
  still in transit — not to close the session over it.
  All three screens print money in the **group's own currency, unconverted**:
  a statement is a document in one currency and a trial balance is a document
  in one currency, and comparing them is the whole job.

- **Four roles, and the buttons follow them** — inside a group the owner is
  an admin by position, and the others are a treasurer (bills, settlements,
  journal entries, the reconciliation), an auditor (reads everything and can
  raise a **flag** on a bill or an entry, changing nothing) or a member (sees
  the group and its history, adds nothing). The role editor is a column on the
  members list rather than a screen of its own, and a control the server would
  refuse is not drawn at all — a member who has not signed up yet gets a word
  and the reason, not a dropdown that would error. A flag is a question, not a
  complaint: it never blocks anybody from spending their own money.

- **The spending card reads a month that is over** — the card under the
  filters says where the money went and what stands out, and it opens on the
  newest month that actually has entries rather than on last month if last
  month is empty. The server sends **facts only** — totals, counts, shares,
  an id — and the client writes the words from the dictionary, which is the
  only reason a tip can exist in fourteen languages and mean the same thing in
  all of them. Where a figure is planning arithmetic rather than a measurement
  it is labelled "about", and the footer says which two lines those are.

- **A payment code is read, priced, and then recorded** — the camera asks for
  permission and, if there is no camera or the permission is refused, says
  which of the three happened and offers the same code pasted by hand, because
  both go through the same reader. Three formats are understood: the app's own
  `campuscoin://pay`, the UPI string a real counter prints, and a JSON payload.
  A code in another currency is converted with the same cached table the
  converter drawer uses, and **a pair that table cannot price is refused, not
  guessed** — a payment is the worst place to invent a rate. Nothing is paid
  until you press Pay. The code's own amount and currency are kept on the
  transaction as the receipt, next to the rate and the day it was good for, and
  the balance is never a stored number: recording the expense *is* the
  deduction, and the balance that comes back is the same arithmetic the
  dashboard does.
- **Sign in, register and the staff door open on this page, never on a page of
  their own** — the three forms are a state of the landing page (held in the URL,
  so Back and a refresh both behave), and the navbar and the footer stay exactly
  where they were. Nothing is re-rendered behind them, and **the header keeps its
  own dark glass in every state**: it used to be transparent until you scrolled,
  which looked good over the dark hero and made every word in the bar invisible
  the moment a white form appeared underneath it. A navbar that has to repaint
  itself when the content changes is exactly what this one must not do, so it
  carries its backing always and scrolling only adds a shadow. The cross-links
  inside the forms ("create an account", the staff door) swap the panel rather
  than navigating, and typing `/login` still works for anybody who wants a page
  of its own.
- **A section that is revealed on scroll is revealed by a watcher that is still
  watching** — the landing sections fade in through an `.lp-reveal` observer. That
  observer used to be created once, on mount, and opening a form unmounts the
  whole landing subtree; when it came back it was a page full of sections at
  opacity 0 — present, scrollable, blank. The observer now re-runs whenever a
  panel opens or closes, and anything already on screen is shown at once rather
  than waiting for a callback.
- **The nav reads the page, it is not a menu of its own** — the link list is
  written in the order the sections are in, because when the two disagreed the
  highlight followed the list and lit up the wrong link. That is why **Insights
  comes before How It Works**, and why **Tools comes before Features**: the
  standout tools and the three rooms were moved up above "manage your money like
  a pro", and the header was left to match rather than left to disagree. A link
  also lands on its own section and not the next one, measured from the header
  rather than from the top of the document.

---

