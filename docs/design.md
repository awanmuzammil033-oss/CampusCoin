# Campus Coin — Design Specification

Visual and UX rules for every page. Requirements live in `PRD.md`; structure lives in `architecture.md`.
**Hard rule (SRS):** no ready-made website templates. Build these tokens and components by hand on top of Bootstrap's grid/utilities.

---

## 1. Design Principles
1. **Fast first.** The primary action (add a transaction) is always ≤2 clicks away.
2. **Plain language.** "You spent $42 more on Food than usual" — not "variance +18.4%".
3. **Calm, student-friendly, trustworthy.** Money apps should feel steady, not stressful. Alerts inform; they don't scold.
4. **Never colour alone.** Every red/green/amber state also has an icon, sign (+/−) or text label.
5. **AI is a helper.** Suggestions are labelled *"Suggested"*, always editable, always dismissible.

**Brand idea:** a coin. Deep teal (trust, calm) + coin gold (reward/savings). Logo = simple coin circle with a "C".

---

## 2. Design Tokens (CSS custom properties in `campuscoin.css`)

### 2.1 Colour
| Token | Light | Dark | Use |
|---|---|---|---|
| `--cc-bg` | `#F6F8F7` | `#0E1514` | Page background |
| `--cc-surface` | `#FFFFFF` | `#16201E` | Cards, modals |
| `--cc-surface-2` | `#EEF3F1` | `#1D2B28` | Table stripes, inputs |
| `--cc-text` | `#16211F` | `#E8F0EE` | Body text |
| `--cc-muted` | `#5B6B67` | `#9DB0AB` | Secondary text |
| `--cc-border` | `#DDE5E2` | `#26332F` | Dividers |
| `--cc-primary` | `#0F766E` | `#2DD4BF` | Buttons, links, active nav |
| `--cc-primary-hover` | `#0B5D57` | `#5EEAD4` | Hover |
| `--cc-accent` | `#F5B400` | `#FBBF24` | Coin highlights, pinned tips |
| `--cc-income` | `#15803D` | `#4ADE80` | Income amounts (prefix **+**, ↑ icon) |
| `--cc-expense` | `#C2410C` | `#FB923C` | Expense amounts (prefix **−**, ↓ icon) |
| `--cc-warning` | `#B45309` | `#FBBF24` | Budget ≥80% |
| `--cc-danger` | `#B91C1C` | `#F87171` | Budget ≥100%, errors |
| `--cc-focus` | `#1D4ED8` | `#93C5FD` | Focus ring (3px) |

All text/background pairs must meet **WCAG AA (4.5:1)**; verify with a contrast checker and record results in the report.

**Chart palette (colour-blind-safe, 8 categories):** `#0F766E #F5B400 #C2410C #2563EB #7C3AED #DB2777 #65A30D #64748B` — segments also get direct labels/legend with values.

### 2.2 Typography
- Font: **Inter** (self-hosted or Google Fonts) → fallback `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- Sizes in `rem` so the **font-size adjuster** works: root font-size = `14px / 16px / 18px / 20px` for `font_scale` 1–4 (default 2 = 16px).
| Style | Size | Weight |
|---|---|---|
| Display (balance) | 2.25rem | 700 |
| H1 | 1.75rem | 700 |
| H2 | 1.375rem | 600 |
| H3 | 1.125rem | 600 |
| Body | 1rem | 400 |
| Small/help | 0.875rem | 400 |
- Line-height 1.5; max line length ~70 characters; numbers use `font-variant-numeric: tabular-nums`.

### 2.3 Spacing, radius, elevation, motion
- Spacing scale (rem): 0.25, 0.5, 0.75, 1, 1.5, 2, 3.
- Radius: 12px cards, 8px inputs/buttons, 999px pills.
- Shadow: `0 1px 2px rgba(0,0,0,.06), 0 4px 12px rgba(0,0,0,.05)` (none in dark; use border).
- Motion: 150–250 ms ease-out; page/card fade-in; progress bars animate width. **Respect `prefers-reduced-motion`** (disable animations).

---

## 3. Layout & Responsiveness
| Breakpoint | Layout |
|---|---|
| ≥1200px | Left sidebar (240px) + content; dashboard in 12-col grid |
| 768–1199px | Collapsible sidebar (icon rail) |
| <768px | Top bar + **bottom tab bar** (Home, Add ➕, Reports, Budgets, More); cards stack; tables become card lists |

- Floating **➕ Add** button on mobile; on desktop, "Add Income / Add Expense" buttons in the dashboard header.
- Tap targets ≥ 44×44px. Test at 360, 768, 1280 px.

**Global chrome:** top bar (logo, notifications bell with unread count, theme toggle 🌙/☀️, font-size A− A+, profile menu) → breadcrumbs → page title → content.

---

## 4. Sitemap (must also appear on the Home page — SRS §1.9)

```
Home (/)  ── Sitemap block, features, Login / Register
├── Register
├── Login
│   └── Forgot password → Email sent → Reset link → New password → Done
├── Dashboard
│   ├── Quick Add Income / Quick Add Expense
│   ├── Saving tips (top 3) → All Tips
│   └── Notifications
├── Transactions
│   ├── List (search & filter)
│   ├── Add / Edit / Delete / History
│   ├── Recurring entries
│   └── Import CSV
├── Categories → Manage Own Categories
├── Budgets
├── Reports
│   ├── Category-wise (month)
│   ├── Income vs Expense (6 months)
│   ├── Daily / Weekly summary
│   └── Export PDF / Image · Share by email
├── Insights (monthly history) → Insight detail
├── Tips (active / pinned / dismissed)
├── Bookmarks & Notes
├── Profile & Settings (theme, font size)
└── Admin (separate entry /control/login)
    ├── Stats
    ├── Default Categories
    ├── Tip & Announcement Templates
    └── Users
```
Implement the sitemap block as a nested `<nav aria-label="Sitemap">` list of real links (login-gated links go to login then redirect).

**Breadcrumb examples:** `Home › Dashboard` · `Home › Transactions › Edit #128` · `Home › Reports › March 2026` · `Control › Users › Bilal`.

---

## 5. Components

| Component | Spec |
|---|---|
| **Button** | Primary (teal fill), Secondary (outline), Danger (red outline), Ghost. Min height 44px. Icon + label. Loading state shows spinner and disables button |
| **Form field** | Visible `<label>` above input; help text below; error text in `--cc-danger` with ⚠ icon and `aria-describedby`; never placeholder-only labels |
| **Amount input** | Numeric, `inputmode="decimal"`, currency symbol prefix, big font on mobile |
| **Category picker** | Grid of icon chips (type-filtered); AI-suggested chip gets a ✨ "Suggested" badge and is pre-selected but changeable |
| **Balance card** | Display-size balance; Income (↑ green) and Expense (↓ orange) sub-figures; savings-goal ring |
| **Budget progress bar** | Label "Food · $24 of $30 (80%)"; coin-gold "under budget" / red "over budget" + icon (✔ / ⛔, ⏳ on goals); `role="progressbar"` with aria-values |
| **Tip card** | Lightbulb icon, one-sentence tip, "Save ~$12" chip, actions: 📌 Pin · 🔖 Bookmark · ✕ Dismiss. Pinned = gold left border |
| **Insight card** | Month, narrative paragraph, flagged-category chips (↑ 40%), advice line, disclaimer, bookmark + note |
| **Notification item** | Icon by kind, message, time, unread dot; click marks read |
| **Transaction row** | Date · category chip · description · signed amount; ⚠ badge for large/duplicate; kebab menu (Edit, History, Delete) |
| **Chart wrapper** | Title, skeleton loader while fetching, Chart.js canvas, "View as table" toggle, empty state |
| **Empty state** | Friendly illustration/icon + one sentence + primary action (e.g. "Log your first expense") |
| **Toast/alert** | Success (auto-dismiss 4 s), error (persistent), `aria-live="polite"` |
| **Modal** | Focus trapped, Esc closes, returns focus; used for delete confirmation |
| **Skeleton/spinner** | Shown for charts and insight generation ("Crunching your numbers…") |

---

## 6. Page Wireframes (low-fidelity)

### 6.1 Home (public)
```
┌──────────────────────────────────────────────────────────┐
│ (C) Campus Coin                       [Login] [Register] │
├──────────────────────────────────────────────────────────┤
│  Smart Spending, Student Style                           │
│  Track allowance & expenses. Get simple tips.            │
│  [Get started free]   [I have an account]                │
├──────────────────────────────────────────────────────────┤
│  ✔ Fast logging   ✔ Budgets & alerts   ✔ Monthly insight │
├──────────────────────────────────────────────────────────┤
│  SITEMAP                                                 │
│  Account: Register · Login · Reset password              │
│  Money: Dashboard · Transactions · Categories · Budgets  │
│  Understand: Reports · Insights · Tips · Bookmarks       │
│  Settings: Profile · Theme · Font size                   │
├──────────────────────────────────────────────────────────┤
│  Footer: About · Privacy · "Suggestions are not advice"  │
└──────────────────────────────────────────────────────────┘
```

### 6.2 Dashboard
```
Home › Dashboard
Hi, Aisha 👋                       [+ Add Income] [− Add Expense]
┌──────────────── Balance (Sep) ───────────────┐ ┌ Savings goal ┐
│ $312.50                                      │ │   ◔ 62%      │
│ ↑ Income $600.00    ↓ Expenses $287.50       │ │ $124 / $200  │
└──────────────────────────────────────────────┘ └──────────────┘
┌ Top Category ┐ ┌───────── Budget vs Actual ─────────────────┐
│ 🍔 Food      │ │ Food       ████████░░ $24/$30  ⚠ 80%       │
│ $96 (33%)    │ │ Transport  ███░░░░░░░ $12/$40  ✔ 30%       │
└──────────────┘ └────────────────────────────────────────────┘
┌ Spending by category (doughnut) ┐ ┌ Income vs Expense (6 mo) ┐
│            ◯                    │ │  ▮▯  ▮▯  ▮▯  ▮▯  ▮▯  ▮▯ │
└─────────────────────────────────┘ └──────────────────────────┘
💡 Top saving tips
 [Food delivery is up — cap at $8/wk · Save ~$14  📌 🔖 ✕]
 [Subscriptions are 12% of income · Save ~$6      📌 🔖 ✕]
Recently edited: Campus Cafe −$4.50 · Uber −$6.00
```

### 6.3 Quick Add (modal on mobile, page on desktop)
```
Add Expense
Amount   [$ 4.50 ]
Description [Campus Cafe lunch      ]   ✨ Suggested: Food (change)
Category  [🍔 Food*] [🚌 Transport] [🏠 Hostel] [📚 Academics] ...
Date      [2026-09-23]     ☐ Repeat  [Monthly ▾]
[Save]  [Save & add another]  [Cancel]
```

### 6.4 Reports
```
Home › Reports
Filters: [Month ▾] [From–To] [Category ▾] [Income source ▾] [Apply]   [Export PDF] [Export Image] [Email]
Tabs: Category-wise | Income vs Expense (6 mo) | Daily/Weekly
[ chart ]                              [ "View as table" ]
Table: Category · Amount · % of total · vs last month
```

### 6.5 Budgets
```
Budgets — September 2026            [Copy last month]
Category   Limit      Spent    Progress
Food       [$30 ]    $24      ████████░░ 80% ⚠
Transport  [$40 ]    $12      ███░░░░░░░ 30% ✔
[Save budgets]
```

### 6.6 Insights
```
Insights   [Generate for this month]     ← spinner "Crunching your numbers…"
September 2026
"You spent $287 this month, mostly on Food. Food delivery rose 40% vs your usual..."
Flags: [Food ↑40%] [Entertainment ↑22%]
Advice: Try a $8 weekly cap on delivery.
ⓘ Suggestions only — not financial advice.     🔖 Bookmark  📝 Note
History: Aug · Jul · Jun · May ...
```

### 6.7 Admin Control Panel (`/control/`)
```
Control › Overview
[Active users 128] [Transactions 9,412] [Most used: Food, Transport, Subs]
Left menu: Overview · Default Categories · Templates · Announcements · Users
Users table: name · email · status · joined · [Disable] [Send reset]
(No access to individual transaction details)
```

### 6.8 Auth pages
Centered card, brand coin, one primary button, links for alternatives. Password field has **show/hide** toggle and strength hint. Admin login page is visually distinct (labelled "Administrator").

---

## 7. Content & Microcopy
- Tone: friendly, brief, non-judgmental. Use "you". Amounts always with currency symbol and 2 decimals.
- Alerts: "Heads up — you've used 80% of your Food budget." / "You're over your Food budget by $5. Small tweaks next week can balance it."
- AI labels: "✨ Suggested", "Generated summary", plus the disclaimer.
- Empty states: "No expenses yet. Add your first one — it takes 10 seconds."
- Errors: say what to do ("Amount must be more than 0"), never blame.

---

## 8. Accessibility Checklist (verify before submission)
- [ ] Colour contrast ≥ 4.5:1 (text) / 3:1 (UI components) in **both** themes
- [ ] Every input has a label; errors linked with `aria-describedby`
- [ ] Full keyboard operation; logical tab order; visible 3px focus ring
- [ ] Skip-to-content link; landmarks (`header nav main footer`); one `<h1>` per page
- [ ] Charts have text alternatives + data-table toggle
- [ ] Status not conveyed by colour alone
- [ ] Font-size control changes all text (rem-based), layout doesn't break at 20px
- [ ] `prefers-reduced-motion` and `prefers-color-scheme` respected (theme default follows OS until user chooses)
- [ ] `lang="en"`, meaningful `<title>` per page, alt text on images

## 9. Loading, Empty & Error States
- **Loading:** skeleton blocks for cards/charts; spinner + message for insight generation; buttons show progress.
- **Empty:** every list/chart has a designed empty state with an action.
- **Error:** inline form errors; toast for server errors; custom 404/500 pages with a "Back to Dashboard" button.
