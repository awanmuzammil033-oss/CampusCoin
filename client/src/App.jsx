import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

import { useAuth } from './auth.jsx';
import { useLocale } from './locale.jsx';
import { ToastProvider } from './components/Toast.jsx';
import PublicShell from './components/PublicShell.jsx';
import Layout from './components/Layout.jsx';
import Icon from './components/Icon.jsx';
import { PageLoader, PageSkeleton } from './components/PageProgress.jsx';

import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import AdminLogin from './pages/AdminLogin.jsx';

// Screens inside the signed-in app are split out of the first bundle so the
// public pages (the ones judges see first) load instantly.
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Transactions = lazy(() => import('./pages/Transactions.jsx'));
const TransactionForm = lazy(() => import('./pages/TransactionForm.jsx'));
const TransactionHistory = lazy(() => import('./pages/TransactionHistory.jsx'));
const DeletedBin = lazy(() => import('./pages/DeletedBin.jsx'));
const ImportCsv = lazy(() => import('./pages/ImportCsv.jsx'));
const WalletsPage = lazy(() => import('./pages/WalletsPage.jsx'));
const RecurringPage = lazy(() => import('./pages/RecurringPage.jsx'));
const SubscriptionsPage = lazy(() => import('./pages/SubscriptionsPage.jsx'));
const YourDataPage = lazy(() => import('./pages/YourDataPage.jsx'));
const GuardianViewPage = lazy(() => import('./pages/GuardianViewPage.jsx'));
const JoinGroupPage = lazy(() => import('./pages/JoinGroupPage.jsx'));
const Categories = lazy(() => import('./pages/Categories.jsx'));
const Budgets = lazy(() => import('./pages/Budgets.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const Insights = lazy(() => import('./pages/Insights.jsx'));
const Tips = lazy(() => import('./pages/Tips.jsx'));
const Bookmarks = lazy(() => import('./pages/Bookmarks.jsx'));
const WishlistPage = lazy(() => import('./pages/WishlistPage.jsx'));
const GroupsPage = lazy(() => import('./pages/GroupsPage.jsx'));
const VaultPage = lazy(() => import('./pages/VaultPage.jsx'));
const GroupChatPage = lazy(() => import('./pages/GroupChatPage.jsx'));
const GroupJournalPage = lazy(() => import('./pages/GroupJournalPage.jsx'));
const GroupTrialBalancePage = lazy(() => import('./pages/GroupTrialBalancePage.jsx'));
const GroupReconcilePage = lazy(() => import('./pages/GroupReconcilePage.jsx'));
const GrowMoneyPage = lazy(() => import('./pages/GrowMoneyPage.jsx'));
const SavingsOptionsPage = lazy(() => import('./pages/SavingsOptionsPage.jsx'));
const SideIncomePage = lazy(() => import('./pages/SideIncomePage.jsx'));
const ControlSavingsOptionsAdmin = lazy(() => import('./pages/control/SavingsOptionsAdmin.jsx'));
const ControlSideIncomeAdmin = lazy(() => import('./pages/control/SideIncomeAdmin.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage.jsx'));

const ControlLayout = lazy(() => import('./pages/control/ControlLayout.jsx'));
const ControlOverview = lazy(() => import('./pages/control/Overview.jsx'));
const ControlCategories = lazy(() => import('./pages/control/Categories.jsx'));
const ControlTemplates = lazy(() => import('./pages/control/Templates.jsx'));
const ControlAnnouncements = lazy(() => import('./pages/control/Announcements.jsx'));
const ControlUsers = lazy(() => import('./pages/control/Users.jsx'));

function RequireStudent({ children }) {
  const { user, loading } = useAuth();
  const { t } = useLocale();
  const location = useLocation();

  if (loading) return <CenteredSpinner label={t('app.checkingSession')} />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.role !== 'student') return <Navigate to="/control" replace />;
  return <Layout>{children}</Layout>;
}

function RequireAdmin({ children }) {
  const { user, loading } = useAuth();
  const { t } = useLocale();

  if (loading) return <CenteredSpinner label={t('app.checkingSession')} />;
  if (!user) return <Navigate to="/control/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/login" replace />;
  return children;
}

function CenteredSpinner({ label }) {
  return <PageLoader label={label} />;
}

/**
 * For the reference pages that are readable without an account:
 * - Signed-in student  → full Layout (sidebar + bottom tabs + FAB)
 * - Guest / admin      → lightweight PublicShell
 */
function SmartShell({ children }) {
  const { user, loading } = useAuth();
  const { t } = useLocale();
  if (loading) return <CenteredSpinner label={t('app.checkingSession')} />;
  if (user && user.role === 'student') return <Layout>{children}</Layout>;
  return <PublicShell>{children}</PublicShell>;
}

function Screen({ children }) {
  return (
    <Suspense fallback={<PageLoader />}>{children}</Suspense>
  );
}

function TransitionRoutes({ children }) {
  const location = useLocation();

  // Simply render the routes at the real location with no artificial delay.
  // The Suspense fallback inside <Screen> already handles lazy-chunk loading.
  // Adding our own timers on top was causing a 650ms wait on EVERY navigation,
  // including fast redirects like /login → landing page.
  return (
    <Routes location={location}>
      {children}
    </Routes>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <TransitionRoutes>
        {/* public / auth routes */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Home view="login" />} />
        <Route path="/register" element={<Home view="register" />} />
        <Route path="/forgot-password" element={<Home view="forgot-password" />} />
        <Route path="/control/login" element={<Home view="admin" />} />
        {/* Reference libraries: readable before signing in, because a student
            comparing a rate should not have to make an account first. They sit
            outside the signed-in shell, so PublicShell supplies the header and
            the page container that shell would otherwise provide. */}
        <Route
          path="/savings-options"
          element={
            <Screen>
              <SmartShell><SavingsOptionsPage /></SmartShell>
            </Screen>
          }
        />
        <Route
          path="/side-income"
          element={
            <Screen>
              <SmartShell><SideIncomePage /></SmartShell>
            </Screen>
          }
        />

        {/* NEW-7: an invite code's link. A stranger must be able to READ the
            preview, so this is outside RequireStudent - the join itself is
            behind the student door on the server, and this page cannot join
            anybody into anything by being visited. */}
        <Route path="/join/:token" element={<Screen><JoinGroupPage /></Screen>} />
        {/* NEW-8: the shared month. Deliberately outside SmartShell (it would hand
            the guardian the student's own signed-in app) and outside PublicShell
            (it would offer a sign-up prompt, which is the one thing a page about
            somebody else's money must not do). GuardianViewPage renders its own
            bare frame. */}
        <Route path="/guardian/:token" element={<Screen><GuardianViewPage /></Screen>} />
        {/* NEW-10: a friend's referral link. It opens the register panel, because
            the person it was sent to does not have an account yet. The CODE still
            has to reach the form's POST body, and that form is a reserved file -
            see the report rather than working around it. */}
        <Route path="/r/:code" element={<Home view="register" />} />
        {/* administrator panel â€” separate area, separate guard */}
        <Route
          path="/control"
          element={
            <Screen>
              <RequireAdmin>
                <ControlLayout />
              </RequireAdmin>
            </Screen>
          }
        >
          <Route index element={<Screen><ControlOverview /></Screen>} />
          <Route path="categories" element={<Screen><ControlCategories /></Screen>} />
          <Route path="templates" element={<Screen><ControlTemplates /></Screen>} />
          <Route path="announcements" element={<Screen><ControlAnnouncements /></Screen>} />
          <Route path="users" element={<Screen><ControlUsers /></Screen>} />
          {/* the reference data behind the two public libraries */}
          <Route path="savings-options" element={<Screen><ControlSavingsOptionsAdmin /></Screen>} />
          <Route path="side-income" element={<Screen><ControlSideIncomeAdmin /></Screen>} />
        </Route>

        {/* student app */}
        <Route path="/dashboard" element={<Screen><RequireStudent><Dashboard /></RequireStudent></Screen>} />
        <Route path="/transactions" element={<Screen><RequireStudent><Transactions /></RequireStudent></Screen>} />
        <Route path="/transactions/new" element={<Screen><RequireStudent><TransactionForm /></RequireStudent></Screen>} />
        <Route path="/transactions/import" element={<Screen><RequireStudent><ImportCsv /></RequireStudent></Screen>} />
        <Route path="/transactions/deleted" element={<Screen><RequireStudent><DeletedBin /></RequireStudent></Screen>} />
        <Route path="/transactions/:id/edit" element={<Screen><RequireStudent><TransactionForm /></RequireStudent></Screen>} />
        <Route path="/transactions/:id/history" element={<Screen><RequireStudent><TransactionHistory /></RequireStudent></Screen>} />
        <Route path="/wallets" element={<Screen><RequireStudent><WalletsPage /></RequireStudent></Screen>} />
        {/* NEW-1 + NEW-8 + NEW-10: the four account cards, on a page of their own. */}
        <Route path="/your-data" element={<Screen><RequireStudent><YourDataPage /></RequireStudent></Screen>} />
  <Route path="/recurring" element={<Screen><RequireStudent><RecurringPage /></RequireStudent></Screen>} />
  <Route path="/subscriptions" element={<Screen><RequireStudent><SubscriptionsPage /></RequireStudent></Screen>} />
        <Route path="/categories" element={<Screen><RequireStudent><Categories /></RequireStudent></Screen>} />
        <Route path="/budgets" element={<Screen><RequireStudent><Budgets /></RequireStudent></Screen>} />
        <Route path="/reports" element={<Screen><RequireStudent><Reports /></RequireStudent></Screen>} />
        <Route path="/insights" element={<Screen><RequireStudent><Insights /></RequireStudent></Screen>} />
        <Route path="/tips" element={<Screen><RequireStudent><Tips /></RequireStudent></Screen>} />
        <Route path="/bookmarks" element={<Screen><RequireStudent><Bookmarks /></RequireStudent></Screen>} />
        <Route path="/wishlist" element={<Screen><RequireStudent><WishlistPage /></RequireStudent></Screen>} />
        {/* the list and the group itself are one screen; the group is addressable
            so a refresh keeps your place and the back button has something to do. */}
        <Route
          path="/groups/:groupId"
          element={<Screen><RequireStudent><GroupsPage /></RequireStudent></Screen>}
        />
        <Route path="/groups" element={<Screen><RequireStudent><GroupsPage /></RequireStudent></Screen>} />
        <Route path="/vault" element={<Screen><RequireStudent><VaultPage /></RequireStudent></Screen>} />
        {/* the group chat: WhatsApp-style, with the poll cards the "+" button posts */}
        <Route
          path="/groups/:groupId/chat"
          element={<Screen><RequireStudent><GroupChatPage /></RequireStudent></Screen>}
        />

        {/* the group own books, in the order they answer each other: post an
            entry, prove the two columns agree, then reconcile the bank. */}
        <Route
          path="/groups/:groupId/journal"
          element={<Screen><RequireStudent><GroupJournalPage /></RequireStudent></Screen>}
        />
        <Route
          path="/groups/:groupId/trial-balance"
          element={<Screen><RequireStudent><GroupTrialBalancePage /></RequireStudent></Screen>}
        />
        <Route
          path="/groups/:groupId/reconcile"
          element={<Screen><RequireStudent><GroupReconcilePage /></RequireStudent></Screen>}
        />
        {/* the educational guide reads the student's own surplus, so it lives
            inside the signed-in app */}
        <Route path="/grow-money" element={<Screen><RequireStudent><GrowMoneyPage /></RequireStudent></Screen>} />
        <Route path="/profile" element={<Screen><RequireStudent><Profile /></RequireStudent></Screen>} />
        <Route path="/notifications" element={<Screen><RequireStudent><NotificationsPage /></RequireStudent></Screen>} />

        <Route path="*" element={<NotFound />} />
      </TransitionRoutes>
    </ToastProvider>
  );
}

function NotFound() {
  const { t } = useLocale();
  return (
    <div className="auth-wrap">
      <div className="card auth-card" style={{ textAlign: 'center' }}>
        <span style={{ fontSize: '2.5rem' }}><Icon name="info" /></span>
        <h1>{t('app.notFoundTitle')}</h1>
        <p className="muted">{t('app.notFoundBody')}</p>
        <a className="btn btn-primary" href="/">{t('app.backHome')}</a>
      </div>
    </div>
  );
}

