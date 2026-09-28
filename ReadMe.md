# 🪙 CampusCoin — Smart Spending, Student Style

> **The Ultimate Student-First Personal Finance Manager & Campus Budgeting Companion**  
> Complete web application featuring expense tracking, roommate bill-splitting, natural language logging, survival mode allowances, subscription leak detection, side income discovery, and administrative control.

---

## 📌 Table of Contents
1. [What is CampusCoin? (Website Kia Hai?)](#-1-what-is-campuscoin-website-kia-hai)
2. [Technology Stack (Kis Cheez Par Bani Hai?)](#-2-technology-stack-kis-cheez-par-bani-hai)
3. [Step-by-Step Setup & How to Open (Kaise Open Hogi / Kia Karna Hoga?)](#-3-step-by-step-setup--how-to-open-kaise-open-hogi--kia-karna-hoga)
4. [Default Demo Credentials (Emails & Passwords)](#-4-default-demo-credentials-emails--passwords)
5. [Complete A-to-Z Features Guide (Kia Kia Hai Is Kay Under?)](#-5-complete-a-to-z-features-guide-kia-kia-hai-is-kay-under)
6. [Administrator Control Panel (`/control`)](#-6-administrator-control-panel-control)
7. [System Architecture & Folder Layout](#-7-system-architecture--folder-layout)
8. [Automated Testing & Code Quality](#-8-automated-testing--code-quality)
9. [Troubleshooting & FAQs](#-9-troubleshooting--faqs)

---

## 📖 1. What is CampusCoin? (Website Kia Hai?)

**CampusCoin** ek specialized, student-centric financial management platform hai jo university aur college students ki uniquely challenging financial life ko manage karne ke liye design kiya gaya hai. 

Aam budget apps complex business accounts ya generic tracking ke liye hoti hain. Lekin CampusCoin student-specific masail hal karta hai:
- **Hostel & Roommate Bill Splitting**: Mess bills, groceries, aur outing expenses ko dosto mein divide karna aur settle karna.
- **End-of-Month Survival Mode**: Mahine ke aakhir mein pocket money khatam hone se pehle daily allowance calculate karna taake paisay khatam na hon.
- **Quick-Text Logger**: Ek jumlay mein kharch likhna (e.g. *"yaar canteen par 350 kharch kiye"*), bina kisi lambay form ko fill kiye.
- **Subscription Leak Vault**: Wo recurring subscriptions jo aap bhool chuke hain aur har mahine paisay cut rahe hain unko pakarna.
- **Micro-Savings Jar & Wishlist**: Khawaishat ki list banayein aur jab koi faltu kharch avoid karein tou wo raqam jar mein save karein.
- **Student Side Income & Growth Guides**: Students ke liye verified side earnings ke tareeqay aur saving guides.

---

## 💻 2. Technology Stack (Kis Cheez Par Bani Hai?)

CampusCoin modern, scalable, aur industry-standard technologies par banaya gaya hai:

| Layer | Technology | Details |
|---|---|---|
| **Frontend Framework** | **React 18** + **Vite** | Ultra-fast HMR, client-side routing via React Router DOM v6 |
| **Styling & Design System** | **Vanilla CSS Design Tokens** | Custom glassmorphism, obsidian & emerald theme, dynamic animations (`client/src/styles/campuscoin.css`) |
| **Backend API** | **Node.js 24** + **Express.js 4 (ESM)** | RESTful API architecture, role-based middleware, security headers (Helmet), Rate Limiting |
| **Database Engine** | **MongoDB / Mongoose 8** | Flexible document modeling with 23 collections, atomic transactions, and audit logs |
| **Zero-Config Local DB** | **In-Memory MongoDB Server** | `mongodb-memory-server` with disk persistence in `server/db/data/` (no external installation needed!) |
| **Charts & Visuals** | **Chart.js** | Interactive donut charts, bar graphs, and line trends with table view toggles |
| **Reporting & Export** | **PDFKit** + **HTML2Canvas** | Server-side direct PDF generation and client-side statement/receipt exports |
| **Authentication & Security** | **Express-Session** + **BCryptJS** | Cookie-based sessions with `HttpOnly` and `SameSite=Lax`, salted password hashing |
| **Localization (i18n)** | **Multi-Language Engine** | 14 languages supported (Urdu, English, Hindi, Arabic, Spanish, French, German, etc.) with RTL support |

---

## 🚀 3. Step-by-Step Setup & How to Open (Kaise Open Hogi / Kia Karna Hoga?)

CampusCoin ko run karne ke liye cloud database ya heavy setup ki **koi zaroorat nahi hai**. Is mein built-in local database aur automatic data seeding included hai.

### Prerequisites:
- **Node.js** (v18 ya latest v24 recommended)
- **Git** ya project folder extraction

---

### Step 1: Dependencies Install Karein
Apne computer par terminal / PowerShell open karein aur project root directory mein jayen:

```powershell
# 1. Server dependencies install karein
cd server
npm install

# 2. Client dependencies install karein
cd ../client
npm install
```

---

### Step 2: Backend Server Run Karein
Server folder mein reh kar local development command run karein:

```powershell
cd server
$env:SEED='1'; npm run dev:local
```
*(Mac / Linux users: `SEED=1 npm run dev:local`)*

> **Kia hoga?**
> - Built-in zero-config local database automatically start ho jayega.
> - Demo accounts (Admin, Aisha, Bilal, test records) auto-seed ho jayenge.
> - Backend server `http://localhost:5000` par live ho jayega.
> - Data `server/db/data/` folder mein safe rahega aur restarts par delete nahi hoga.

---

### Step 3: Frontend Client Run Karein
Ek **doosra terminal window** open karein aur client start karein:

```powershell
cd client
npm run dev
```

> **Kia hoga?**
> - Vite development server launch ho jayega.
> - Terminal par link show hoga: **`http://localhost:5173`**
> - Browser mein **`http://localhost:5173`** open karein!

---

## 🔑 4. Default Demo Credentials (Emails & Passwords)

Test karne aur grading ke liye ready-made accounts seeded hain:

| Role | Name | Email | Password | Portal / URL | Description |
|---|---|---|---|---|---|
| **Administrator** | System Admin | `admin@campuscoin.test` | `Admin@12345` | `http://localhost:5173/control/login` | Full admin rights, user management, categories, announcements, deleted bin |
| **Student** | Aisha Khan | `aisha@campuscoin.test` | `Student@12345` | `http://localhost:5173/login` | Active student account with rich 6-month transaction history, budgets, and roommate group |
| **Student** | Bilal Ahmed | `bilal@campuscoin.test` | `Student@12345` | `http://localhost:5173/login` | Roommate student account linked in split-bill groups |
| **Student (Fresh)** | New Student | `newuser@campuscoin.test` | `Student@12345` | `http://localhost:5173/login` | Completely fresh, empty student profile to test onboarding from scratch |

> 💡 **Notice**:
> - Students `/login` se sign in karte hain.
> - Administrators `/control/login` ke dedicated portal se enter hote hain.

---

## 🌟 5. Complete A-to-Z Features Guide (Kia Kia Hai Is Kay Under?)

CampusCoin ke andar total 14 core modules aur tools shamil hain:

### 1. 📊 Interactive Dashboard & Financial Summary
- **Current Balance Card**: Saare wallets ka live net total display karta hai.
- **Monthly Income & Expense Overview**: Total earnings aur spendings ka live tally.
- **Spending Donut Chart**: Category-wise (Food, Transport, Hostel, Academics, Entertainment) visual breakup.
- **Recent Activity Ledger**: Last logged transactions with instant edit/delete.

### 2. 💳 Multi-Wallet Pocket System
- Student ke paas multiple pockets hotay hain: **Cash Pocket**, **Bank Account**, aur **Mobile Wallet (EasyPaisa/JazzCash)**.
- **Wallet Transfers**: Cash bank mein transfer karein ya mobile wallet se cash nikaalein bina personal income/expense ledger ko corrupt kiye.

### 3. ⚡ Quick-Text Logger (Natural Language + Voice)
- Lambay forms fill karne ki zaroorat nahi!
- Bas type karein: *"yaar canteen par 350 kharch kiye"* ya *"hostel rent 12000 paid"*.
- AI regex parser automatically amount (`350`), category (`Food`), aur date detect kar leta hai.
- **Voice Dictation**: Microphone icon press kar ke bol kar kharch record karein.

### 4. 🎯 Category Budgets & Smart Alerts
- Har category ke liye monthly target set karein (e.g., Food: $250 / PKR 25,000).
- Progress bar show karta hai kitna percent use ho chuka hai.
- **Smart Alerts**: 80% limit touch hone par warning bell trigger hoti hai; 100% exceed hone par danger notification milti hai.

### 5. 👥 Roommate Groups & Split Bills
- Hostel dosto ya project partners ke sath group banayein.
- **Bill Splitting**: Mess bill, Wi-Fi bill, ya dinner expense add karein. Choose karein kin dosto mein split hona hai.
- **Settlement Engine**: Kaun kis ko kitnay paisay owe karta hai, one-tap zero settlement se hisaab barabar karein.
- **Group Double-Entry Journal & Ledger**: Professional debit-credit tracking.
- **Group Trial Balance & Bank Reconciliation**: Unbalanced transactions check karne ke liye.
- **Group Chat with Poll Cards**: Group ke andar live chat aur poll cards (*"Chai at 4pm? 350 per head"*).

### 6. 🚨 Survival Mode (End-of-Month Savior)
- Jab pocket money kam reh jaye tou **Survival Mode** toggle on karein.
- System bache hue paison ko mahine ke bache hue dino par divide karta hai.
- Student ko ek strict **Daily Spending Allowance** milti hai taake wo month-end par borrow karne se bach sake.

### 7. 🎁 Secret Wishlist & Micro-Savings Jar
- Apni pasandida cheezon ki wishlist banayein (e.g., Laptop, Shoes, Gaming Headset).
- Jab bhi aap koi faltu kharch avoid karein (e.g. coffee bahar se nahi pee), tou wo saved amount apne virtual **Savings Jar** mein deposit karein aur progress bar barhta dekhein.

### 8. 🔒 Subscription Leak Vault
- NetFlix, Spotify, Gym, Cloud storage jaise recurring payments ko track karta hai.
- Unused subscriptions ko detect kar ke alert deta hai: *"Aapne pichle 3 hafton se yeh use nahi kiya, cancel kar ke paisay bachayein!"*

### 9. 💼 Curated Student Side Income Directory
- Students ke liye verified freelancing gigs, tutoring, campus jobs, aur micro-tasks ki list.
- Har idea ke sath effort rating, expected payout, aur verified source linked hota hai.

### 10. 📈 Savings Options & Financial Literacy Guide
- Bank accounts, Fixed Deposits, aur inflation-protection schemes ki reference table.
- Risk ratings (Low, Medium, High) ke sath students ko invest karne aur paisay bachane ki guidelines.

### 11. 💱 Live Currency Drawer & Global Switcher
- Dashboard ke balance card par currency icon dabayein.
- Live exchange rates calculate karein (USD, EUR, GBP, PKR, INR, AED, SAR, etc.).
- **Apply to Entire Website**: Poori website ki currency ko one-click mein convert karein.

### 12. 📑 Visual Analytics & PDF/CSV Reports
- Date range filter ke sath custom spending reports.
- One-click **PDF Statement Download** (professional print-ready format).
- Bank statements ka **CSV Bulk Import** with column mapping.

### 13. 🌍 14 Languages Support (Multi-Language Engine)
- English, Urdu (اردو), Hindi (हिंदी), Arabic (العربية), French, German, Spanish, Portuguese, Russian, Chinese, Japanese, Persian, Indonesian, Turkish.
- Right-to-Left (RTL) complete support for Urdu & Arabic.

### 14. 🎨 Tactile Glassmorphism Dual Theme
- **Obsidian Dark Mode** (Default): Glowing emerald highlights, frosted glass cards, dynamic hero animations, aurora lighting.
- **Pristine Light Mode**: Clean, high-contrast, modern aesthetic.

---

## 🛡️ 6. Administrator Control Panel (`/control`)

Administrator login (`admin@campuscoin.test` / `Admin@12345`) ke zariye system manage hota hai:
1. **User Management**: Sabhi students ke accounts dekhna, active status monitor karna, aur abusive users ko suspend/block karna.
2. **Category Manager**: Global expense categories add karna, icons choose karna, aur shared defaults set karna.
3. **Announcements Broadcast**: Poori website ke top par campus announcements ya notifications banner chalana.
4. **Deleted Records Bin (Recycle Bin)**: Students ke soft-deleted transactions ko audit karna aur zaroorat parne par restore karna.
5. **System Health**: Active sessions aur database storage monitoring.

---

## 📁 7. System Architecture & Folder Layout

```
CampusCoin/
├── client/                     # Frontend Application (React 18 + Vite)
│   ├── src/
│   │   ├── components/         # Reusable UI widgets, modals, charts, navigation
│   │   │   ├── art/            # Vector Art & Glassmorphism SVGs (AuthArt, FaqArt, HeroShowcase)
│   │   │   ├── landing/        # Landing page sections & feature showcases
│   │   │   └── layout/         # Topbar, Sidebar, Footer, Modals
│   │   ├── pages/              # Main Route Screens (Dashboard, Transactions, Groups, Budgets, Vault)
│   │   │   └── control/        # Dedicated Admin Control Panel pages
│   │   ├── i18n/               # 14 Language translation dictionaries
│   │   └── styles/             # Master CSS Design System (campuscoin.css)
│   ├── index.html              # HTML5 entry point
│   └── vite.config.js          # Vite build & proxy configuration
│
├── server/                     # Backend API (Node.js 24 + Express ESM)
│   ├── src/
│   │   ├── config/             # DB connection & environment configuration
│   │   ├── models/             # 23 Mongoose Data Schemas (User, Transaction, Budget, Group, etc.)
│   │   ├── routes/             # API routing endpoints (/api/auth, /api/transactions, etc.)
│   │   ├── services/           # Business logic, ledger arithmetic, NLP parsers, currency FX
│   │   ├── middleware/         # Auth guards, role verification, CSRF, rate-limiters
│   │   └── scripts/            # Database seeder (dev-local.js)
│   ├── db/data/                # Persistent local database files
│   └── tests/                  # Automated test suites
│
└── ReadMe.md                   # Complete Project Documentation
```

---

## 🧪 8. Automated Testing & Code Quality

Project mein comprehensive automated test suites shamil hain:

```powershell
# Backend unit & integration tests run karne ke liye:
cd server
npm test

# Client CSS hooks verification run karne ke liye:
cd client
node scripts/check-css-hooks.mjs
```

---

## ❓ 9. Troubleshooting & FAQs

#### Q1: Server start karte waqt "Port 5000 already in use" ka error aaye tou?
- Kisi aur process ne port 5000 occupy kiya hua hai. Terminal mein run karein:
  `Get-Process -Id (Get-NetTCPConnection -LocalPort 5000).OwningProcess | Stop-Process -Force`

#### Q2: Data reset kar ke fresh demo data dobara kaise layein?
- `server/db/data/` folder ko delete karein aur terminal mein run karein:
  `cd server; $env:SEED='1'; npm run dev:local`

#### Q3: Kya bina internet ke website chal sakti hai?
- **Haan!** Local development server, in-memory database, icons, aur fonts sab local bundle mein packaged hain. Kisi external cloud connection ki zaroorat nahi.

---

**Developed with ❤️ for Students Worldwide.**  
*CampusCoin — Your Money. Your Campus Life. Your Control.*
