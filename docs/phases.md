# Campus Coin — Build Phases

Work **one phase at a time**. Finish the "Done when" checks, commit, then move on.
Each phase lists tasks (tick them off), acceptance checks, and a starter prompt for your AI assistant (Cursor).
Requirement IDs refer to `PRD.md`; structure/algorithms are in `architecture.md`; visuals in `design.md`.

> **How to prompt:** always start with *"Read .cursorrules, PRD.md, architecture.md, design.md and phases.md. We are on Phase N."* Then paste the phase prompt. After the AI writes code, **read it, run it, change it** until you can explain it — judges will ask.

---

## Phase 0 — Setup & Repo
- [ ] Install Python 3.12, MySQL 8, Git, VS Code/Cursor
- [ ] Create virtualenv, `pip install django mysqlclient pillow reportlab matplotlib whitenoise python-dotenv django-axes`
- [ ] `django-admin startproject campuscoin`, create apps: `core accounts ledger budgets reports insights control` under `apps/`
- [ ] Split settings (`base/dev/prod`), `.env` + `.env.example`, `.gitignore`
- [ ] Copy the 5 doc files + create empty `AI_USAGE.md`
- [ ] Git init, first commit
**Done when:** `runserver` shows a blank home page; DB connection works; `.env` not in git.
**Prompt:** *"Set up the Django project structure exactly as in architecture.md §3 with split settings and MySQL config from env vars. No features yet."*

## Phase 1 — Data Model, Migrations & Seed
- [ ] Models: User(custom), Category, Transaction, TransactionHistory, RecurringRule, Budget, Notification, Insight, TipTemplate, UserTip, Announcement, CategoryCorrection, RecentActivity (architecture §4)
- [ ] Constraints & indexes (unique keys, CHECK amount > 0, `(user,date)` index)
- [ ] `for_user()` queryset manager on all user-owned models
- [ ] Migration to seed **default categories** (CAT-1, CAT-2) and starter tip templates
- [ ] Generate `db/schema.sql` (`python manage.py sqlmigrate` or `mysqldump --no-data`)
**Done when:** all migrations apply on a fresh DB; defaults exist; model tests pass.
**Prompt:** *"Implement the models in architecture.md §4 with the listed constraints, indexes and a for_user() manager. Add a data migration for default categories."*

## Phase 2 — Authentication, Profile, Sessions (AUTH-1…6)
- [ ] Register, login, logout (email login), disabled-user block
- [ ] **Separate admin login** at `/control/login/` (role check)
- [ ] Session settings (secure cookies, idle timeout), login rate-limit
- [ ] Password reset flow via tokenised link (console email in dev)
- [ ] Profile page: name, academic year, monthly allowance baseline, savings goal
- [ ] `base.html` skeleton with navbar, breadcrumbs block, theme/font-scale from user settings
**Done when:** register → login → edit profile → reset password works end to end; reset link is single-use; admin can't log in via the student page and vice-versa.
**Prompt:** *"Build Phase 2 per PRD §3.1 and architecture §7. Use Django auth with a custom email-login User. Include tests for reset token reuse and disabled users."*

## Phase 3 — Category Management (CAT-1…5)
- [ ] Category list showing default + personal (grouped Income / Expense)
- [ ] **Manage Own Categories**: add / edit / delete with duplicate-name validation
- [ ] Delete with **reassign** flow if transactions exist; defaults are read-only
**Done when:** user can't touch defaults or other users' categories; deleting a used category never orphans data.
**Prompt:** *"Implement PRD §3.2 in the categories app: CRUD for personal categories, reassign-on-delete, and tests for cross-user access."*

## Phase 4 — Transactions & Recurring (TXN-1…8)
- [ ] Quick-add form (income/expense, defaults date=today), server validation
- [ ] List with search, filters, pagination
- [ ] Edit / soft-delete / restore + **TransactionHistory** rows on every change; history page
- [ ] Recurring rules CRUD + `generate_recurring` management command (idempotent) + catch-up on login
- [ ] CSV import: template download → preview with row errors → confirm → bulk insert (limits per architecture §6.9)
**Done when:** history shows before/after for edits; recurring generates once per period; bad CSV rows are reported not crashed.
**Prompt:** *"Implement PRD §3.4 following architecture §6.2 and §6.9. Put logic in ledger/services.py and importer.py, keep views thin, add tests."*

## Phase 5 — Dashboard (DASH-1…5)
- [ ] Greeting, month balance card, quick-add buttons, savings-goal ring
- [ ] Widgets: This Month's Top Category, Budget vs Actual
- [ ] Charts (doughnut + 6-month bars) via JSON endpoints, skeleton loaders, table fallback
- [ ] Empty states for new users
**Done when:** new user sees helpful empty state; user with data sees correct numbers (verify with a hand-calculated example); charts load < 2 s with 5 000 rows.
**Prompt:** *"Build the dashboard from design.md §6.2 using DB aggregates only (no Python loops over all rows). Use Chart.js with accessible table toggle."*

## Phase 6 — Budgets & Alerts (BUD-1…3)
- [ ] Monthly budget per category page (+ "copy last month")
- [ ] Progress bars with icon + text + colour thresholds
- [ ] Alert service after every expense change; notification bell + list + mark read
**Done when:** crossing 80% and 100% each creates exactly one notification per month; editing a transaction back under the limit does not duplicate alerts.
**Prompt:** *"Implement architecture §6.1 exactly, with unique-key dedupe and unit tests for the 79%/80%/100% boundaries."*

## Phase 7 — Reports & Export (REP-1…5)
- [ ] Category-wise monthly report; 6-month income vs expense; daily & weekly summaries
- [ ] Shared filter form (date range, category, income source)
- [ ] PDF export (ReportLab) and image export (chart PNG); email share
- [ ] Downloads happen **only** on explicit click
**Done when:** report totals equal dashboard totals; exported PDF opens and matches on-screen data; filters combine correctly.
**Prompt:** *"Implement reports per PRD §3.6 and architecture §6.8. One GROUP BY per chart. Add PDF export with ReportLab."*

## Phase 8 — Saving Tips Engine (TIP-1…3, BKM-1)
- [ ] Rule functions from architecture §6.4 rendering admin-editable templates
- [ ] Persist to `user_tips`, rank by potential savings, top 3 on dashboard
- [ ] Dismiss / pin / bookmark (+ note), Tips page, Bookmarks page
**Done when:** with the seed data, tips differ per student and rank correctly; dismissed tip doesn't return this month.
**Prompt:** *"Implement the tips engine as pure functions (input: aggregates, output: candidate tips) plus a persistence layer, and unit-test each rule."*

## Phase 9 — AI Features (Optional: AI-1…5, INS-1…5)
- [ ] Rule/learning categoriser + keyword dictionary + `GET /api/suggest-category/`
- [ ] Debounced UI suggestion with ✨ badge; store `ai_suggested_category`; learn from corrections
- [ ] Batch suggestions in CSV preview
- [ ] Monthly insight generator (template mode) + optional LLM mode via `AI_API_KEY` (aggregates only, 3 s timeout, fallback)
- [ ] Insight history page, bookmark + note, disclaimer text
**Done when:** works with **no API key**; correcting a suggestion changes the next suggestion; every AI output is overridable and labelled advisory.
**Prompt:** *"Implement architecture §6.3 and §6.5. Feature must degrade gracefully if AI_API_KEY is missing or the API errors."*

## Phase 10 — Admin Control Panel (ADM-1…5)
- [ ] Role-guarded `/control/` layout, distinct look
- [ ] Default categories CRUD; tip templates & announcements CRUD (announcements shown to students)
- [ ] Users list: view, disable/enable, send reset link
- [ ] Stats: active users (30 d), total transactions, most-used categories (DB aggregates)
**Done when:** admin can't view any student's transactions; disabling a user kills their access on next request.
**Prompt:** *"Build the custom admin panel per PRD §3.11 (not Django admin) with a role decorator and tests proving no access to student transaction pages."*

## Phase 11 — System Intelligence & UX Polish (SYS-1…3, UX-1…5)
- [ ] Recent viewed/edited transactions; large & duplicate flags (architecture §6.6); forecast bar (§6.7)
- [ ] Dark mode + font-size controls (persisted, no flash)
- [ ] Breadcrumbs on every inner page; **Sitemap block on Home**
- [ ] Loading/empty/error states, 404/500 pages, reduced-motion support
- [ ] Accessibility pass using `design.md` §8 checklist
**Done when:** Lighthouse Accessibility ≥ 90; keyboard-only run-through succeeds; both themes pass contrast.

## Phase 12 — Testing, Security & Hardening
- [ ] Unit + integration tests green (`python manage.py test`)
- [ ] Security checklist: cross-user access, session, CSRF, reset abuse, CSV injection, upload limits, admin isolation
- [ ] Performance check with seed of 5 000 transactions; add missing indexes
- [ ] Browser/device matrix: Chrome, Firefox, Edge, Safari; 360/768/1280 px
- [ ] Write test cases + record results (needed for the report)

## Phase 13 — Deployment (hosted URL preferred)
- [ ] Prod settings: `DEBUG=False`, `ALLOWED_HOSTS`, HTTPS, secure cookies, WhiteNoise
- [ ] Deploy (PythonAnywhere/Render), MySQL, run migrations, `collectstatic`, create scheduled jobs
- [ ] Load seed data; smoke-test every feature on the live URL
- [ ] Document backup/restore commands

## Phase 14 — Submission Package (SRS §1.9)
**Seed/demo credentials (MANDATORY in report — change if you like, but list them):**
| Role | Email | Password |
|---|---|---|
| Administrator | `admin@campuscoin.test` | `Admin@12345` |
| Student 1 | `aisha@campuscoin.test` | `Student@12345` |
| Student 2 | `bilal@campuscoin.test` | `Student@12345` |
| Student 3 (empty account for first-time flow) | `newuser@campuscoin.test` | `Student@12345` |

**Checklist**
- [ ] Project report (Word/PDF) **written by you**, containing: Problem Definition · Design Specifications · Flowcharts · Data Flow Diagrams (level 0 & 1) · ER diagram/Database Design · Test Data · **Installation Instructions (mandatory)** · **Credentials (mandatory)** · AI-tools acknowledgment — **no source code inside the report**
- [ ] ZIP: source, `ReadMe.doc` (assumptions), `db/schema.sql` (or SQL scripts), `requirements.txt`, `.env.example`
- [ ] Hosted URL in the ReadMe
- [ ] Demo video `.mp4` (mandatory) showing **every** functional requirement — script below
- [ ] Final test plan & execution report verified
- [ ] Final rehearsal: be able to explain each module, algorithm and DB table aloud

### Demo video script (target 8–12 min)
1. Home page + **sitemap** (0:30)
2. Register, log in, edit profile; show password reset email flow (1:30)
3. Categories: defaults + add/edit/delete personal category (0:45)
4. Quick-add income & expense, smart suggestion + override, recurring entry, edit/delete + history (2:00)
5. CSV import with preview & batch suggestions (1:00)
6. Dashboard: balance, top category, budget vs actual, charts, tips → pin/dismiss/bookmark (1:15)
7. Budgets: set limits, trigger near/exceeded notifications (1:00)
8. Reports: category, 6-month, daily/weekly, filters, PDF + image export, email share (1:15)
9. Insights: generate, history, bookmark + note (0:45)
10. System intelligence: large/duplicate flag, recent activity, forecast (0:45)
11. Dark mode, font size, breadcrumbs, loading states, mobile view (0:45)
12. Admin login: categories, templates, users disable/reset, usage stats (1:15)

### Requirement traceability (tick when demonstrated)
`AUTH-1…7 · CAT-1…5 · DASH-1…5 · TXN-1…8 · AI-1…5 · REP-1…5 · INS-1…5 · TIP-1…3 · BUD-1…3 · BKM-1…2 · ADM-1…5 · SYS-1…3 · UX-1…5`

---

## Suggested Timeline (adjust to your deadline)
| Days | Phases |
|---|---|
| 1–2 | 0, 1, 2 |
| 3–4 | 3, 4 |
| 5–6 | 5, 6, 7 |
| 7–8 | 8, 9, 10 |
| 9 | 11, 12 |
| 10 | 13, 14 (report, video, rehearsal) |

**Cut-line if time runs short:** finish every **M** item first; drop in this order: SYS-2 forecast → LLM mode of insights → batch CSV suggestions → image export. Never drop the sitemap, credentials, install instructions or demo video.
