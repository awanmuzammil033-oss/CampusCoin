# Campus Coin — Database Design

MongoDB collections for the MERN build of Campus Coin. Money is stored as
**Decimal128** (base-10 arithmetic, no floating-point drift in totals) and
converted to a plain two-decimal number only at the JSON edge. Dates are UTC;
"month" fields are always the 1st of the month so uniqueness and lookups stay
exact. Every user-owned collection carries a `user` ObjectId and every query
in the application is scoped by it.

Legend: **R** = required · **U** = unique · type shown as MongoDB/BSON type.

---

## 1. `users`

| Field | Type | R | U | Notes / enum |
|---|---|---|---|---|
| `_id` | ObjectId | ✔ | ✔ | default `_id` |
| `name` | String | ✔ | | max 100, trimmed |
| `email` | String | ✔ | ✔ | max 254, stored lower-cased — the login identifier |
| `passwordHash` | String | ✔ | | bcrypt hash, `select:false` (never read by default) |
| `role` | String | | | enum `student` \| `admin`, default `student` |
| `isActive` | Boolean | | | default `true`; admins flip it to disable an account (ADM-3) |
| `academicYear` | String | | | max 30, default `""` |
| `monthlyAllowanceBaseline` | Decimal128 | | | nullable |
| `monthlySavingsGoal` | Decimal128 | | | nullable |
| `theme` | String | | | enum `light` \| `dark`, default `light` (UX-1) |
| `fontScale` | Number | | | 1–4, default 2 (UX-2) |
| `resetTokenHash` | String | | | nullable, `select:false` — hash of the emailed reset token |
| `resetTokenExpires` | Date | | | nullable, `select:false` — token dies after 1 hour |
| `createdAt` / `updatedAt` | Date | ✔ | | schema timestamps |

**Indexes**

| Keys | Options |
|---|---|
| `email` | unique |

---

## 2. `categories`

Two flavours: **defaults** (`user: null`, `isDefault: true`, admin-managed)
and **personal** (owned by one student). `nameKey` is the lower-cased name,
which makes every uniqueness check casing-proof without a regex.

| Field | Type | R | U | Notes / enum |
|---|---|---|---|---|
| `user` | ObjectId \| null | | | `null` ⇒ default category; refs `users` |
| `name` | String | ✔ | | max 60, trimmed |
| `nameKey` | String | ✔ | | max 60, lower-cased |
| `type` | String | ✔ | | enum `income` \| `expense` |
| `isDefault` | Boolean | | | default `false` |
| `icon` | String | | | max 30, icon hint for picker chips |
| `isActive` | Boolean | | | default `true`; `false` = soft-removed (history still reads) |
| `createdAt` / `updatedAt` | Date | ✔ | | schema timestamps |

**Indexes**

| Keys | Options |
|---|---|
| `user`, `nameKey`, `type` | unique, partial — only rows where `user` is an ObjectId (personal categories) |
| `nameKey`, `type` | unique, partial — only rows where `user` is absent |

> Default rows store `user: null`, so they fall outside both partial indexes;
> their case-insensitive uniqueness is enforced in the application layer
> (`routes/control.js` and `services/defaults.js`) before any write.

---

## 3. `transactions`

The ledger. Rows are never hard-deleted: `isDeleted` flips to `true` and every
change is mirrored into `transactionhistories` (TXN-4). `amount` is always
strictly positive — `type` carries the sign's meaning.

| Field | Type | R | U | Notes / enum |
|---|---|---|---|---|
| `user` | ObjectId | ✔ | | refs `users` |
| `category` | ObjectId | ✔ | | refs `categories` |
| `amount` | Decimal128 | ✔ | | > 0, two decimals |
| `type` | String | ✔ | | enum `income` \| `expense`, must equal `category.type` |
| `description` | String | | | max 255, default `""` |
| `suggestedCategory` | ObjectId \| null | | | category the suggestion assistant proposed while typing; the person always decides |
| `suggestionSource` | String | | | enum `history` \| `keywords` \| `remote`, default `null` |
| `date` | Date | ✔ | | the day the entry belongs to |
| `recurringRule` | ObjectId \| null | | | refs `recurringrules` when auto-generated |
| `isDeleted` | Boolean | | | default `false` — soft delete |
| `flag` | String | | | enum `none` \| `large` \| `duplicate`, default `none` (SYS-3) |
| `createdAt` / `updatedAt` | Date | ✔ | | schema timestamps |

**Indexes**

| Keys | Options |
|---|---|
| `user`, `date` | descending on `date` — the list view and monthly ranges |
| `user`, `category`, `date` | descending on `date` — per-category reports |
| `user`, `isDeleted`, `date` | descending on `date` — history + bin views |

---

## 4. `transactionhistories`

Append-only audit trail: one row per create / update / delete / restore, with
plain-object snapshots so past changes stay readable even after renames.

| Field | Type | R | U | Notes / enum |
|---|---|---|---|---|
| `transaction` | ObjectId | ✔ | | refs `transactions` |
| `user` | ObjectId | ✔ | | refs `users` (denormalised for cheap scoping) |
| `action` | String | ✔ | | enum `create` \| `update` \| `delete` \| `restore` |
| `before` | Object | | | snapshot before the change, or `null` |
| `after` | Object | | | snapshot after the change, or `null` |
| `changedAt` | Date | | | default now |

**Indexes**

| Keys | Options |
|---|---|
| `user`, `transaction`, `changedAt` | descending on `changedAt` |

---

## 5. `recurringrules`

| Field | Type | R | U | Notes / enum |
|---|---|---|---|---|
| `user` | ObjectId | ✔ | | refs `users` |
| `category` | ObjectId | ✔ | | refs `categories` |
| `type` | String | ✔ | | enum `income` \| `expense` |
| `amount` | Decimal128 | ✔ | | > 0 |
| `description` | String | | | max 255 |
| `frequency` | String | ✔ | | enum `weekly` \| `monthly` |
| `dayOfPeriod` | Number | ✔ | | 1–31; 29–31 clamp to month end |
| `startDate` | Date | ✔ | | first day the rule is live |
| `endDate` | Date | | | nullable — open-ended until paused |
| `lastGeneratedOn` | Date | | | nullable — the generator's cursor; source of truth for "already made" |
| `isActive` | Boolean | | | default `true` |
| `createdAt` / `updatedAt` | Date | ✔ | | schema timestamps |

**Indexes**

| Keys | Options |
|---|---|
| `user`, `isActive` | — daily generator scans active rules per user |

---

## 6. `budgets`

| Field | Type | R | U | Notes / enum |
|---|---|---|---|---|
| `user` | ObjectId | ✔ | | refs `users` |
| `category` | ObjectId | ✔ | | refs `categories` (expense only, app-enforced) |
| `month` | Date | ✔ | | always the 1st of the month, UTC |
| `limitAmount` | Decimal128 | ✔ | | > 0 |
| `createdAt` / `updatedAt` | Date | ✔ | | schema timestamps |

**Indexes**

| Keys | Options |
|---|---|
| `user`, `category`, `month` | unique — one limit per category per month |
| `user`, `month` | — the budgets page |

---

## 7. `notifications`

In-app alerts. The partial unique index is what prevents spam: crossing 80%
or 100% twice in a month can only ever insert one row per threshold per
category. System and announcement notices are excluded on purpose.

| Field | Type | R | U | Notes / enum |
|---|---|---|---|---|
| `user` | ObjectId | ✔ | | refs `users` |
| `kind` | String | ✔ | | enum `budget_near` \| `budget_exceeded` \| `system` \| `announcement` |
| `message` | String | ✔ | | max 400 |
| `category` | ObjectId \| null | | | refs `categories` for budget alerts |
| `month` | Date \| null | | | 1st of the month for budget alerts |
| `isRead` | Boolean | | | default `false` |
| `createdAt` / `updatedAt` | Date | ✔ | | schema timestamps |

**Indexes**

| Keys | Options |
|---|---|
| `user`, `kind`, `category`, `month` | unique, partial — only `kind ∈ {budget_near, budget_exceeded}` |
| `user`, `isRead`, `createdAt` | descending on `createdAt` — the bell feed |

---

## 8. `insights`

One row per student per month (INS-1..5). Regenerating overwrites the text
but never the bookmark or note.

| Field | Type | R | U | Notes / enum |
|---|---|---|---|---|
| `user` | ObjectId | ✔ | | refs `users` |
| `month` | Date | ✔ | | 1st of the month, UTC |
| `summaryText` | String | ✔ | | the plain-language narrative (≤ 120 words) |
| `tipText` | String | | | default `""` — one actionable suggestion |
| `flags` | Array of subdocuments | | | see below |
| `flags[].category` | String | | | category display name |
| `flags[].pctChange` | Number | | | change vs the previous 3-month average, in percent |
| `flags[].amount` | Number | | | this month's amount, two decimals |
| `source` | String | | | enum `template` \| `remote`, default `template` |
| `isBookmarked` | Boolean | | | default `false` (BKM-1) |
| `note` | String | | | max 500, nullable |
| `createdAt` / `updatedAt` | Date | ✔ | | schema timestamps |

**Indexes**

| Keys | Options |
|---|---|
| `user`, `month` | unique — exactly one insight per student per month |
| `user`, `isBookmarked` | — the bookmarks view |

---

## 9. `tiptemplates`

Admin-managed wording (ADM-2). The tips engine fills `{{placeholders}}` with
its own numbers at generation time, so a coordinator can reword or retire
advice without touching code.

| Field | Type | R | U | Notes / enum |
|---|---|---|---|---|
| `code` | String | ✔ | ✔ | max 40 — the rule's key, e.g. `over_trend` |
| `kind` | String | | | enum `tip` \| `announcement`, default `tip` |
| `title` | String | ✔ | | max 120 |
| `bodyTemplate` | String | ✔ | | max 500, contains `{{placeholders}}` |
| `category` | ObjectId \| null | | | optional ref to `categories` |
| `minSavings` | Decimal128 | | | nullable floor for the rule to fire |
| `isActive` | Boolean | | | default `true` |
| `createdAt` / `updatedAt` | Date | ✔ | | schema timestamps |

**Indexes**

| Keys | Options |
|---|---|
| `code` | unique |

---

## 10. `usertips`

A concrete tip shown to one student for one month (TIP-1..3); unique keys
make the generator safe to re-run.

| Field | Type | R | U | Notes / enum |
|---|---|---|---|---|
| `user` | ObjectId | ✔ | | refs `users` |
| `template` | ObjectId | ✔ | | refs `tiptemplates` |
| `category` | ObjectId \| null | | | refs `categories`; `null` for whole-month rules |
| `month` | Date | ✔ | | 1st of the month |
| `textRendered` | String | ✔ | | max 500 — the template with numbers filled in |
| `potentialSavings` | Decimal128 | | | nullable; drives the ranking |
| `status` | String | | | enum `active` \| `dismissed` \| `pinned`, default `active` |
| `isBookmarked` | Boolean | | | default `false` |
| `note` | String | | | max 500, nullable |
| `createdAt` / `updatedAt` | Date | ✔ | | schema timestamps |

**Indexes**

| Keys | Options |
|---|---|
| `user`, `template`, `category`, `month` | unique, partial — only rows where `category` is an ObjectId |
| `user`, `template`, `month` | unique, partial — only rows where `category` is `null` |
| `user`, `status`, `month` | — the tips page filters |

---

## 11. `announcements`

Campus-wide notices posted by an administrator (ADM-2).

| Field | Type | R | U | Notes / enum |
|---|---|---|---|---|
| `title` | String | ✔ | | max 120 |
| `body` | String | ✔ | | max 1000 |
| `startsAt` | Date | | | default now |
| `endsAt` | Date | | | nullable — `null` means open-ended |
| `isActive` | Boolean | | | default `true` |
| `createdBy` | ObjectId | ✔ | | refs `users` (the admin who posted it) |
| `createdAt` / `updatedAt` | Date | ✔ | | schema timestamps |

**Indexes**

| Keys | Options |
|---|---|
| `isActive`, `startsAt` | descending on `startsAt` — the live feed |

---

## 12. `categorycorrections`

How the suggestion assistant gets better over time (PRD §3.5): every time the
person picks a different category than the one proposed, each meaningful word
of the description gets a vote for the category they chose.

| Field | Type | R | U | Notes / enum |
|---|---|---|---|---|
| `user` | ObjectId | ✔ | | refs `users` |
| `token` | String | ✔ | | max 40, lower-cased word from the description |
| `category` | ObjectId | ✔ | | refs `categories` — the chosen one |
| `count` | Number | | | default 1, min 1 — how often this vote repeated |

**Indexes**

| Keys | Options |
|---|---|
| `user`, `token`, `category` | unique — one row per word per category per person |
| `user`, `token` | — suggestions look a word up across categories |

---

## 13. `recentactivities`

"Recently viewed / edited" across sessions (SYS-1). Only the newest 20 rows
per person are kept.

| Field | Type | R | U | Notes / enum |
|---|---|---|---|---|
| `user` | ObjectId | ✔ | | refs `users` |
| `transaction` | ObjectId | ✔ | | refs `transactions` |
| `action` | String | ✔ | | enum `viewed` \| `edited` |
| `at` | Date | | | default now |

**Indexes**

| Keys | Options |
|---|---|
| `user`, `at` | descending on `at` |

---

## 14. Relationships

| From | Field | To | Meaning |
|---|---|---|---|
| `transactions` | `user` | `users` | every entry belongs to exactly one account |
| `transactions` | `category` | `categories` | the entry is classified under one category |
| `transactions` | `recurringRule` | `recurringrules` | entry was generated by this rule (nullable) |
| `transactionhistories` | `transaction` | `transactions` | audit row for one entry |
| `transactionhistories` | `user` | `users` | audit row, denormalised owner |
| `categories` | `user` | `users` | personal category owner; `null` = shared default |
| `recurringrules` | `user` / `category` | `users` / `categories` | schedule owned by one account |
| `budgets` | `user` / `category` | `users` / `categories` | monthly cap on one category |
| `notifications` | `user` / `category` | `users` / `categories` | alert delivered to one account |
| `insights` | `user` | `users` | one monthly narrative per account |
| `usertips` | `user` / `template` | `users` / `tiptemplates` | a template instantiated for one account and month |
| `usertips` | `category` | `categories` | tip about one category (nullable) |
| `announcements` | `createdBy` | `users` | the administrator who posted it |
| `categorycorrections` | `user` / `category` | `users` / `categories` | one word's vote for one category |
| `recentactivities` | `user` / `transaction` | `users` / `transactions` | activity strip rows |

### Text ER description

One **user** (student or administrator) owns many **transactions**, and each
transaction is classified under exactly one **category** — either a shared
default (`user: null`) or a personal one. Every change to a transaction is
appended to **transactionhistories**, so an entry can be edited or deleted
without losing what it used to say. A user schedules **recurringrules** that
generate transactions over time, sets **budgets** per category per month, and
receives **notifications** when a budget nears or exceeds its limit. Monthly
**insights** and personalised **usertips** are produced per user per month
from aggregates of their own transactions; tips instantiate rows from
admin-managed **tiptemplates**, and administrators also publish
**announcements**. When a user overrides a suggested category, a word-level
vote lands in **categorycorrections**, which later suggestions count. The
**recentactivities** table keeps each user's last twenty viewed or edited
entries for the dashboard strip.

Reading order for a month of one student's data:
`users → budgets/transactions (month) → insights/usertips/notifications`.
