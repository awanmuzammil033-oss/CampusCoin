import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

import { useAuth } from './auth.jsx';
import { useLocale } from './locale.jsx';
import { ToastProvider } from './components/Toast.jsx';
import Layout from './components/Layout.jsx';
import Icon from './components/Icon.jsx';

import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import AdminLogin from './pages/AdminLogin.jsx';

// Screens inside the signed-in app are split out of the first bundle so the
// public pages (the ones judges see first) load instantly.
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Transactions = lazy(() => import('./pages/Transactions.jsx'));
const TransactionForm = lazy(() => import('./pages/TransactionForm.jsx'));
const TransactionHistory = lazy(() => import('./pages/TransactionHistory.jsx'));
const DeletedBin = lazy(() => import('./pages/DeletedBin.jsx'));
const ImportCsv = lazy(() => import('./pages/ImportCsv.jsx'));
const RecurringPage = lazy(() => import('./pages/RecurringPage.jsx'));
const Categories = lazy(() => import('./pages/Categories.jsx'));
const Budgets = lazy(() => import('./pages/Budgets.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const Insights = lazy(() => import('./pages/Insights.jsx'));
const Tips = lazy(() => import('./pages/Tips.jsx'));
const Bookmarks = lazy(() => import('./pages/Bookmarks.jsx'));
const WishlistPage = lazy(() => import('./pages/WishlistPage.jsx'));
const GroupsPage = lazy(() => import('./pages/GroupsPage.jsx'));
const VaultPage = lazy(() => import('./pages/VaultPage.jsx'));
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
  return (
    <div className="auth-wrap" role="status" aria-live="polite">
      <div className="d-flex align-items-center gap-2 muted">
        <span className="spinner" aria-hidden="true" />
        {label}
      </div>
    </div>
  );
}

function Screen({ children }) {
  const { t } = useLocale();
  return (
    <Suspense fallback={<CenteredSpinner label={t('ui.loading')} />}>{children}</Suspense>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        {/* public */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />
        <Route path="/control/login" element={<AdminLogin />} />

        {/* administrator panel — separate area, separate guard */}
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
        </Route>

        {/* student app */}
        <Route path="/dashboard" element={<Screen><RequireStudent><Dashboard /></RequireStudent></Screen>} />
        <Route path="/transactions" element={<Screen><RequireStudent><Transactions /></RequireStudent></Screen>} />
        <Route path="/transactions/new" element={<Screen><RequireStudent><TransactionForm /></RequireStudent></Screen>} />
        <Route path="/transactions/import" element={<Screen><RequireStudent><ImportCsv /></RequireStudent></Screen>} />
        <Route path="/transactions/deleted" element={<Screen><RequireStudent><DeletedBin /></RequireStudent></Screen>} />
        <Route path="/transactions/:id/edit" element={<Screen><RequireStudent><TransactionForm /></RequireStudent></Screen>} />
        <Route path="/transactions/:id/history" element={<Screen><RequireStudent><TransactionHistory /></RequireStudent></Screen>} />
        <Route path="/recurring" element={<Screen><RequireStudent><RecurringPage /></RequireStudent></Screen>} />
        <Route path="/categories" element={<Screen><RequireStudent><Categories /></RequireStudent></Screen>} />
        <Route path="/budgets" element={<Screen><RequireStudent><Budgets /></RequireStudent></Screen>} />
        <Route path="/reports" element={<Screen><RequireStudent><Reports /></RequireStudent></Screen>} />
        <Route path="/insights" element={<Screen><RequireStudent><Insights /></RequireStudent></Screen>} />
        <Route path="/tips" element={<Screen><RequireStudent><Tips /></RequireStudent></Screen>} />
        <Route path="/bookmarks" element={<Screen><RequireStudent><Bookmarks /></RequireStudent></Screen>} />
        <Route path="/wishlist" element={<Screen><RequireStudent><WishlistPage /></RequireStudent></Screen>} />
        <Route path="/groups" element={<Screen><RequireStudent><GroupsPage /></RequireStudent></Screen>} />
        <Route path="/vault" element={<Screen><RequireStudent><VaultPage /></RequireStudent></Screen>} />
        <Route path="/profile" element={<Screen><RequireStudent><Profile /></RequireStudent></Screen>} />
        <Route path="/notifications" element={<Screen><RequireStudent><NotificationsPage /></RequireStudent></Screen>} />

        <Route path="*" element={<NotFound />} />
      </Routes>
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
