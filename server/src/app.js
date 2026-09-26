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
import groupChatRoutes from './routes/groupChat.js';
import wishlistRoutes from './routes/wishlist.js';
import vaultRoutes from './routes/vault.js';
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
    origin: isProd ? env.appUrl : [env.appUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'],
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
app.use('/api/bookmarks', bookmarkRoutes);
app.use('/api/quick-text', quickTextRoutes);
app.use('/api/survival', survivalRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/groups', groupsRoutes);
// the chat hangs off the group, so it inherits the group isolation
app.use('/api/groups/:id/chat', groupChatRoutes);
app.use('/api/vault', vaultRoutes);
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
