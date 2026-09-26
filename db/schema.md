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
| `currency` | String | | | 3-letter code, default `USD` — the DISPLAY currency |
| `ledgerCurrency` | String | | | 3-letter code, default `USD` — what the student's amounts are denominated in |
| `language` | String | | | BCP-47 tag, default `en` |
| `jarBalance` | Decimal128 | | | default 0 — micro-savings jar (WISH-2) |
| `survivalMode.enabled` | Boolean | | | default `false` (SURV-1) |
| `survivalMode.since` | Date | | | nullable — when the mode was switched on |
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

## 14. `groups`

A pot of shared money (GRP-1): a hostel room, a rented flat, a project team.
The owner is always `members[0]` — every split calculation keys off that
position, so the array order is part of the contract and is never reshuffled.
A roommate who has not signed up yet is still a member, with `user: null` and
just a name and email, which is what lets a bill be split before they register.

| Field | Type | R | U | Notes / enum |
|---|---|---|---|---|
| `name` | String | ✔ | | maxlength 60 |
| `owner` | ObjectId | ✔ | | refs `users` |
| `members` | Array | ✔ | | `{ user, name, email, addedAt }`; `user` nullable |
| `currency` | String | | | 3-letter code, default `USD` |
| `archived` | Boolean | | | default false |

**Indexes**

| Keys | Options |
|---|---|
| `owner`, `archived` | |
| `members.user`, `archived` | every read starts with "which groups am I in?" |
| `members.email` | finding the groups a roommate was invited to, on sign-in |

## 15. `groupexpenses`

One shared bill (GRP-2). The split is worked out **once, on the server, at
write time** and stored as money in `split`; the balance board then sums those
inside MongoDB, so the figures always add up to the bill. `shares` keeps what
the person asked for (a weight for `shares`, an amount for `exact`); it is the
request, not the answer. Uneven equal splits give the remainder cents to the
earliest members in order, so 100.00 split three ways is 33.34 + 33.33 + 33.33.

A bill is not always the whole group’ `includedIndexes` names the members it
is for, and the same remainder rule is applied over that set only, so the odd
cent still goes to the earliest person who was ticked. A bill written before
this field existed has none, and "no set" is read as everybody — that is the only
thing it could have meant, and nothing is recomputed from it either way:
`split` stays the answer of record.

| Field | Type | R | U | Notes / enum |
|---|---|---|---|---|
| `group` | ObjectId | ✔ | | refs `groups` |
| `title` | String | ✔ | | maxlength 80 |
| `amount` | Decimal128 | ✔ | | |
| `paidByIndex` | Number | ✔ | | position in `group.members`, always inside `includedIndexes` |
| `includedIndexes` | Array | | | the members this bill is between; **absent on a bill written before the field existed**, which reads back as everybody |
| `splitType` | String | | | enum `equal` \| `shares` \| `exact` |
| `shares` | Array | | | `{ memberIndex, value }` — the request |
| `split` | Array | | | `{ memberIndex, amount }` Decimal128 — the answer |
| `category` | ObjectId | | | refs `categories`, nullable |
| `date` | Date | ✔ | | |
| `note` | String | | | maxlength 200 |
| `createdBy` | ObjectId | ✔ | | refs `users` |

**Indexes**

| Keys | Options |
|---|---|
| `group`, `date` | descending on `date` |

## 16. `groupsettlements`

A settlement (GRP-3): "Bilal paid Aisha 45.00 cash". Settling moves money off
two balances without touching the bills behind them, and the row is the receipt.
Rows are never edited — a wrong settlement is settled the other way and the
history stays readable.

| Field | Type | R | U | Notes / enum |
|---|---|---|---|---|
| `group` | ObjectId | ✔ | | refs `groups` |
| `fromIndex` | Number | ✔ | | position in `group.members` |
| `toIndex` | Number | ✔ | | position in `group.members` |
| `amount` | Decimal128 | ✔ | | |
| `note` | String | | | maxlength 200 |
| `by` | ObjectId | ✔ | | refs `users` |
| `date` | Date | | | default now |

**Indexes**

| Keys | Options |
|---|---|
| `group`, `date` | descending on `date` |

## 17. `groupmessages`

A line in a group’s chat (GRP-4), in two kinds. A `text` message is a sentence; a `poll`
card is a question ("chai at 4pm, 350 a head?") that every member answers on
their own row. `senderIndex` is a **position** rather than a user id, because a
member may not have an account — the group chat is reachable by everybody in the
group, signed up or not.

The card is a snapshot of who was asked: `responses` is seeded with one row per
member at the moment it is posted, and a member who joins later does not grow
old cards — they can answer the cards posted after they arrived. `yes: null` is
a real state, not an absent row, because "has not answered" is exactly what a
card needs to be able to show. The running total is never stored: it is
`rate × yesCount` in whole cents, worked out on read, so it can never
drift from the answers.

| Field | Type | R | U | Notes / enum |
|---|---|---|---|---|
| `group` | ObjectId | ✔ | | refs `groups` |
| `kind` | String | ✔ | | enum `text` \| `poll` |
| `text` | String | | | maxlength 1000, empty for a card |
| `senderIndex` | Number | ✔ | | position in `group.members` |
| `poll.category` | String | | | enum `chai` \| `transport` \| `food` \| `outing` \| `shopping` \| `other` — a **key**, never prose |
| `poll.location` | String | | | maxlength 120 |
| `poll.purpose` | String | | | maxlength 120 |
| `poll.date` | String | | | `YYYY-MM-DD` |
| `poll.time` | String | | | `HH:MM` |
| `poll.rate` | Decimal128 | | | per person, in the group’s currency |
| `poll.note` | String | | | maxlength 200 |
| `poll.responses` | Array | | | `{ memberIndex, yes, at }`, `yes` nullable, one row per member at post time |

**Indexes**

| Keys | Options |
|---|---|
| `group`, `createdAt` | the room is read in order |
## 18. `wishitems`

One thing on the secret wishlist (WISH-1). The money that fills it is **not a
transaction** — it sits in the micro-savings jar on the account
(`users.jarBalance`) so it can never reach the income/expense ledger, the
charts or the reports. `status` follows the arithmetic and cannot be asserted
by the client.

| Field | Type | R | U | Notes / enum |
|---|---|---|---|---|
| `user` | ObjectId | ✔ | | refs `users` |
| `title` | String | ✔ | | maxlength 80 |
| `note` | String | | | maxlength 200 |
| `targetAmount` | Decimal128 | ✔ | | |
| `savedAmount` | Decimal128 | | | default 0 |
| `icon` | String | | | the emoji the student picked, default 🎁 |
| `status` | String | | | enum `saving` \| `achieved` \| `paused` |
| `targetDate` | Date | | | soft "by when", nullable |
| `achievedAt` | Date | | | nullable |

**Indexes**

| Keys | Options |
|---|---|
| `user`, `status`, `createdAt` | descending on `createdAt` |

## 19. `jarmovements`

Every rupee into and out of the jar (WISH-2): the audit trail behind
`users.jarBalance` and `wishitems.savedAmount`. A withdrawal is guarded inside
the update query (`jarBalance: { $gte: amount }`), so two racing withdrawals
cannot both take the last coin and the jar can never go negative.

| Field | Type | R | U | Notes / enum |
|---|---|---|---|---|
| `user` | ObjectId | ✔ | | refs `users` |
| `kind` | String | ✔ | | enum `deposit` \| `withdraw` |
| `amount` | Decimal128 | ✔ | | always positive |
| `wishItem` | ObjectId | | | refs `wishitems`, nullable |
| `note` | String | | | maxlength 140 |
| `date` | Date | | | default now |

**Indexes**

| Keys | Options |
|---|---|
| `user`, `date` | descending on `date` |

## 20. `bankrates`

A reference row on the public "Compare savings options" page (ADV-3): what one
bank published for one product, on one date. It is **shared reference data, not a
personal record** — there is no `user`, and no student's money is involved, which
is why the read is open to a signed-out visitor and only the write is behind the
administrator door. The page that shows it carries a disclaimer that cannot be
dismissed, and `sourceNote` exists so the figure can be traced to the bank it
came from rather than floating free.

| Field | Type | R | U | Notes / enum |
|---|---|---|---|---|
| `bank` | String | ✔ | | maxlength 60, trim |
| `accountType` | String | ✔ | | enum `savings` \| `fd` |
| `ratePercent` | Number | ✔ | | 0–100, at most 2 decimals |
| `minAmount` | Decimal128 | | | default 0; shown as "none published" |
| `tenureMonths` | Number | | | 1–120 for a deposit, nullable |
| `region` | String | | | maxlength 60 |
| `note` | String | | | maxlength 200 |
| `sourceNote` | String | | | maxlength 200 — where the figure came from |
| `isActive` | Boolean | | | default true; a retired row stays for the record |

**Indexes**

| Keys | Options |
|---|---|
| `accountType`, `ratePercent` | descending on `ratePercent` — the page sorts by rate |
| `isActive` | the public read filters on it |

## 21. `incomeideas`

One entry in the side-income library (ADV-5): a way students earn on the side,
with what it costs to start and where the claim came from. Like `bankrates` this
is shared reference data. The rule that makes it defensible in front of judges is
in the service, not the database: an entry marked **trending** must carry a
source (`sourceUrl` or `sourceNote`), so a badge can never point at nothing.

| Field | Type | R | U | Notes / enum |
|---|---|---|---|---|
| `title` | String | ✔ | | maxlength 90 |
| `category` | String | ✔ | | enum `part-time` \| `freelance` \| `reselling` \| `services` |
| `summary` | String | ✔ | | maxlength 300 |
| `howItWorks` | String | | | maxlength 1200 |
| `typicalEffort` | String | | | maxlength 120, plain words |
| `startupCost` | String | | | maxlength 120, plain words |
| `isTrending` | Boolean | | | default false; needs a source |
| `sourceUrl` | String | | | maxlength 300, http(s) only when present |
| `sourceNote` | String | | | maxlength 200 |
| `icon` | String | | | maxlength 16, an emoji |
| `isActive` | Boolean | | | default true |
| `sortOrder` | Number | | | default 0 |

**Indexes**

| Keys | Options |
|---|---|
| `isActive`, `isTrending`, `sortOrder` | descending on `isTrending` — trending first, then editorial order |

---

## 22. Relationships

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
| `groups` | `owner` | `users` | the member at position 0 |
| `groups` | `members.user` | `users` | nullable — a roommate may not have an account yet |
| `groupexpenses` | `group` | `groups` | one shared bill |
| `groupexpenses` | `createdBy` / `category` | `users` / `categories` | who logged it, what it was for |
| `groupsettlements` | `group` | `groups` | a payment between two member positions |
| `groupsettlements` | `by` | `users` | who recorded the settlement |
| `groupmessages` | `group` | `groups` | one line in a group’s chat |
| `wishitems` | `user` | `users` | the owner of the wish |
| `jarmovements` | `user` / `wishItem` | `users` / `wishitems` | one movement, optionally for one wish |

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

Shared money lives beside the personal ledger rather than inside it. A **group**
lists its members (position 0 is always the owner), holds **groupexpenses** whose
split was resolved on the server and stored as money, and records money changing
hands as **groupsettlements** — so "who owes whom" is a sum of stored facts, not
a guess. Saving for something is a **wishitem** filled from the savings jar on
the account, with every movement written to **jarmovements**; neither ever
touches `transactions`, which is what keeps saved money from looking like
spending.

Reading order for a month of one student's data:
`users → budgets/transactions (month) → insights/usertips/notifications`.
