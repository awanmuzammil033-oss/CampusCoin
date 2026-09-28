import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import env, { isProd } from './config/env.js';
import { sessionOptions, touchSession } from './middleware/session.js';
import { issueCsrf, checkCsrf } from './middleware/csrf.js';
import { notFound, errorHandler } from './middleware/errors.js';

import authRoutes from './routes/auth.js';
import categoryRoutes from './routes/categories.js';
import transactionRoutes from './routes/transactions.js';
import csvImportRoutes from './routes/csvImport.js';
import recurringRoutes from './routes/recurring.js';
import budgetRoutes from './routes/budgets.js';
import notificationRoutes from './routes/notifications.js';
import dashboardRoutes from './routes/dashboard.js';
import tipRoutes from './routes/tips.js';
import reportRoutes from './routes/reports.js';
import suggestionRoutes from './routes/suggest.js';
import insightRoutes from './routes/insights.js';
import bookmarkRoutes from './routes/bookmarks.js';
import quickTextRoutes from './routes/quickText.js';
import survivalRoutes from './routes/survival.js';
import groupsRoutes from './routes/groups.js';
import qrpayRoutes from './routes/qrpay.js';
import walletRoutes from './routes/wallets.js';
import groupChatRoutes from './routes/groupChat.js';
import groupLedgerRoutes from './routes/groupLedger.js';
import wishlistRoutes from './routes/wishlist.js';
import vaultRoutes from './routes/vault.js';
import subscriptionRoutes from './routes/subscriptions.js';

// NEW-1: a queued export of the whole account, and the deletion grace period.
import exportRoutes from './routes/dataExport.js';
import deletionRoutes from './routes/accountDeletion.js';
// NEW-5: the day-by-day calendar of one month, with the bands the server cut.
import heatmapRoutes from './routes/spendingHeatmap.js';
// NEW-7: a one-person invite code. The group half and the public half are one
// file and two exports - they share a service, and the public read must not be
// able to reach the student door the group half sits behind.
import groupInviteRoutes, { publicInvites } from './routes/groupInvites.js';
// NEW-8: one month of totals, shared with one named person, and taken back.
import guardianRoutes from './routes/guardian.js';
// NEW-10: a code of your own, and what it earned.
import referralRoutes from './routes/referrals.js';
import fxRoutes from './routes/fx.js';
import growMoneyRoutes from './routes/growMoney.js';
import savingsOptionsRoutes from './routes/savingsOptions.js';
import savingsOptionsAdminRoutes from './routes/savingsOptionsAdmin.js';
import sideIncomeRoutes from './routes/sideIncome.js';
import sideIncomeAdminRoutes from './routes/sideIncomeAdmin.js';
import controlRoutes from './routes/control.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------- core plumbing ------------------------------- */

app.set('trust proxy', 1); // correct client IPs behind the host's proxy in production
app.use(helmet({ contentSecurityPolicy: false })); // SPA serves its own markup and scripts
app.use(
  cors({
    origin: isProd
      ? env.appUrl
      : [
          env.appUrl,
          'http://localhost:5173',
          'http://127.0.0.1:5173',
          'http://localhost:5174',
          'http://127.0.0.1:5174',
          'http://localhost:5175',
          'http://127.0.0.1:5175',
        ],
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(session(sessionOptions()));
app.use(touchSession);
app.use(issueCsrf);
app.use(checkCsrf);

/* --------------------------------- API -------------------------------------- */

app.get('/api/health', (req, res) => res.json({ ok: true, name: 'campuscoin' }));
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/transactions/import', csvImportRoutes);
app.use('/api/recurring', recurringRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/tips', tipRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api', suggestionRoutes);
app.use('/api/insights', insightRoutes);
// a scanned payment code: read it, price it, and record it as an expense
app.use('/api/qr', qrpayRoutes);
// the pockets the money is actually in, and the movements between them
app.use('/api/wallets', walletRoutes);
app.use('/api/bookmarks', bookmarkRoutes);
app.use('/api/quick-text', quickTextRoutes);
app.use('/api/survival', survivalRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/groups', groupsRoutes);
// the chat hangs off the group, so it inherits the group isolation
app.use('/api/groups/:id/chat', groupChatRoutes);
// the group own books: a journal that has to balance, the trial balance that
// proves it does, and the bank reconciliation that explains the difference
app.use('/api/groups/:id/ledger', groupLedgerRoutes);
app.use('/api/vault', vaultRoutes);
app.use('/api/subscriptions', subscriptionRoutes);

// NEW-1. The deletion router mounts at /api rather than at a prefix of its own:
// it carries both halves of one state machine, the student door and the staff
// door, and one mount is what keeps those two paths from drifting apart.
app.use('/api', deletionRoutes);
app.use('/api/export', exportRoutes);
// NEW-5.
app.use('/api/heatmap', heatmapRoutes);
// NEW-7. The nested half first, then the public read. The public one is mounted
// at a flat path precisely so it cannot inherit the group router middleware.
app.use('/api/groups/:id/invites', groupInviteRoutes);
app.use('/api/invites', publicInvites);
// NEW-8 and NEW-10.
app.use('/api/guardian', guardianRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/fx', fxRoutes);
app.use('/api/grow-money', growMoneyRoutes);
// Reference data, not personal records: readable signed out, written by staff.
app.use('/api/savings-options', savingsOptionsRoutes);
app.use('/api/side-income', sideIncomeRoutes);
app.use('/api/control/savings-options', savingsOptionsAdminRoutes);
app.use('/api/control/side-income', sideIncomeAdminRoutes);
app.use('/api/control', controlRoutes);

/* --------------------------- built client (prod) ----------------------------- */
// In production Express also serves the compiled React app, so the whole
// deployment is one process behind one URL.
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => (err ? next() : undefined));
});

/* ------------------------------- errors ------------------------------------- */

app.use('/api', notFound);
app.use(errorHandler);

export default app;
