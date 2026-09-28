import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Page from '../components/Page.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Progress from '../components/Progress.jsx';
import ChartCard from '../components/ChartCard.jsx';
import QuickTextCard from '../components/QuickTextCard.jsx';
import SurvivalCard from '../components/SurvivalCard.jsx';
import CurrencyDrawer, { CurrencyTrigger } from '../components/CurrencyDrawer.jsx';
import Icon from '../components/Icon.jsx';
import CategoryIcon from '../components/CategoryIcon.jsx';
import { categoryColor } from '../chartColors.js';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { money } from '../money.js';
import { useLocale } from '../locale.jsx';

/**
 * The home screen once signed in: this month's money at a glance, the two
 * widgets from the brief, the charts, and a way back into logging an entry.
 */
export default function Dashboard() {
  const { t, language, plural, currency } = useLocale();
  const { user } = useAuth();
  // Month/day names follow the active language ('September 2026' in en, 'Eylül 2026' in tr).
  const monthLabel = () => new Date().toLocaleDateString(language || 'en', { month: 'long', year: 'numeric' });
  const dayLabel = (value) => {
    const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return '';
    return new Date(y, m - 1, d).toLocaleDateString(language || 'en', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const { push } = useToast();
  const [summary, setSummary] = useState(null);
  // the currency drawer is opened from the balance card
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [charts, setCharts] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all([api.get('/api/dashboard/summary'), api.get('/api/dashboard/charts')])
      .then(([nextSummary, nextCharts]) => {
        if (!alive) return;
        setSummary(nextSummary);
        setCharts(nextCharts);
        setError('');
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.message);
        push(err.message, 'error');
      });
    return () => {
      alive = false;
    };
  }, [push]);

  const firstName = (user?.name || 'there').trim().split(' ')[0];
  const loading = !summary && !error;
  const nothingYet = summary && Number(summary.income) === 0 && Number(summary.expense) === 0;

  const doughnutRows = charts?.doughnut || [];
  const trendRows = charts?.trend || [];

  const doughnutData = {
    labels: doughnutRows.map((r) => r.category),
    datasets: [{
      data: doughnutRows.map((r) => Number(r.total)),
      // one colour per category — Food's slice is Food's colour (design.md §5)
      backgroundColor: doughnutRows.map((r) => categoryColor(r.category)),
    }],
  };
  const trendData = {
    labels: trendRows.map((r) => r.label),
    datasets: [
      { label: t('ui.income'), data: trendRows.map((r) => Number(r.income)), backgroundColor: 'var(--cc-income)' },
      { label: t('ui.expense'), data: trendRows.map((r) => Number(r.expense)), backgroundColor: 'var(--cc-expense)' },
    ],
  };

  return (
    <Page
      trail={[{ label: t('nav.dashboard') }]}
      loading={loading}
      title={
        <>
          {t('dash.hi', { name: firstName })} <Icon name="hand" size={22} />
        </>
      }
      subtitle={monthLabel()}
      actions={
        <>
          <Link className="btn btn-secondary" to="/transactions/new?type=income">
            {t('dash.addIncome')}
          </Link>
          <Link className="btn btn-primary" to="/transactions/new?type=expense">
            {t('dash.addExpense')}
          </Link>
        </>
      }
    >
      {error && (
        <div className="field-error mb-3" role="alert">
          <Icon name="warning" />
          <span>{t('dash.errorSafe', { msg: error })}</span>
        </div>
      )}

      {loading && (
        <div className="d-grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <div className="card">
            <div className="skeleton" style={{ height: 16, width: '40%', marginBottom: 14 }} />
            <div className="skeleton" style={{ height: 44, width: '60%', marginBottom: 14 }} />
            <div className="skeleton" style={{ height: 18, width: '80%' }} />
          </div>
          <div className="card">
            <div className="skeleton" style={{ height: 16, width: '40%', marginBottom: 14 }} />
            <div className="skeleton" style={{ height: 12, marginBottom: 10 }} />
            <div className="skeleton" style={{ height: 12, width: '70%' }} />
          </div>
        </div>
      )}

      {/* mounted once, outside the summary block: it is closed until the
          balance card asks for it, and the amount it opens with is a prop */}
      <CurrencyDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} balance={summary?.balance ?? 0} />

      {summary && (
        <div className="dash-stack">
          {/* 1 - where the money stands */}
          <div className="card dash-balance">
            <div className="card-title">
              <span>{t('dash.balanceMonth', { month: monthLabel() })}</span>
            </div>

            <div className="dash-balance-main">
              <div>
                <div className="balance-display">{money(summary.balance)}</div>
              </div>
              {/* the converter lives here, in the space the card already had */}
              <CurrencyTrigger
                balance={money(summary.balance)}
                currency={currency}
                onOpen={() => setDrawerOpen(true)}
              />
            </div>

            <div className="d-flex gap-4 mt-2 flex-wrap">
              <div>
                <div className="amount-income num">+ <Icon name="trendUp" /> {money(summary.income)}</div>
                <div className="smallish muted">{plural('dash.incomeCount', summary.counts?.income ?? 0, { n: summary.counts?.income ?? 0 })}</div>
              </div>
              <div>
                <div className="amount-expense num">- <Icon name="trendDown" /> {money(summary.expense)}</div>
                <div className="smallish muted">{plural('dash.expenseCount', summary.counts?.expense ?? 0, { n: summary.counts?.expense ?? 0 })}</div>
              </div>
            </div>
          </div>

          {/* 2 - the goal that balance is measured against */}
          {summary.savingsGoal && (
            <div className="card">
              <div className="card-title">
                <span>{t('dash.savingsGoal')}</span>
                <Link className="btn btn-ghost btn-sm" to="/profile">
                  {t('dash.adjust')}
                </Link>
              </div>
              <Progress
                variant="goal"
                pct={summary.savingsGoal.pct}
                label={t('dash.savedOf', { saved: money(summary.savingsGoal.saved), goal: money(summary.savingsGoal.goal) })}
              />
              <p className="smallish muted mb-0 mt-3">
                {summary.savingsGoal.saved >= summary.savingsGoal.goal
                  ? t('dash.goalReached', { amount: money(summary.savingsGoal.saved - summary.savingsGoal.goal) })
                  : t('dash.toGo', { amount: money(summary.savingsGoal.goal - summary.savingsGoal.saved) })}
              </p>
            </div>
          )}

          {/* 3 - say it in a sentence */}
          <QuickTextCard />

          {/* 4 - how many days of spending are left */}
          <SurvivalCard />

          {/* 5 - the standout tools. On a phone the sidebar is gone and the
              bottom bar has no room for six tabs, so the dashboard is where
              they live: one tap from every screen. */}
          <section className="dash-tools" aria-label={t('dash.toolsTitle')}>
            <div className="dash-tools-head">
              <h2 className="mb-1">
                <Icon name="sparkles" /> {t('dash.toolsTitle')}
              </h2>
              <p className="smallish muted mb-0">{t('dash.toolsSub')}</p>
            </div>
            <div className="dash-tools-grid">
              {[
                { to: '/groups', icon: 'users', title: t('nav.groups'), body: t('dash.toolsGroups') },
                { to: '/wishlist', icon: 'gift', title: t('nav.wishlist'), body: t('dash.toolsWishlist') },
                { to: '/vault', icon: 'shield', title: t('nav.vault'), body: t('dash.toolsVault') },
              ].map((tool) => (
                <Link key={tool.to} to={tool.to} className="dash-tool">
                  <span className="dash-tool-ico">
                    <Icon name={tool.icon} />
                  </span>
                  <span className="dash-tool-body">
                    <span className="dash-tool-title">{tool.title}</span>
                    <span className="smallish muted">{tool.body}</span>
                  </span>
                  <Icon name="arrowRight" className="dash-tool-arrow" />
                </Link>
              ))}
            </div>
          </section>

          {/* 6 - where the money actually went */}
          <div className="card">
            <div className="card-title">
              <span>{t('dash.topCategory')}</span>
            </div>
            {summary.topCategory ? (
              <div className="d-flex align-items-center gap-3">
                <span className="txn-ico">
                  <CategoryIcon name={summary.topCategory.icon} />
                </span>
                <div className="flex-grow-1">
                  <div style={{ fontWeight: 600 }}>{summary.topCategory.name}</div>
                  <div className="num">{money(summary.topCategory.amount)}</div>
                </div>
                <span className="pill pill-expense num">{t('dash.pctOfSpending', { pct: summary.topCategory.share })}</span>
              </div>
            ) : (
              <p className="muted mb-0">{t('dash.noExpensesYet')}</p>
            )}
          </div>

          {/* 7 - the limits against that spending */}
          <div className="card">
            <div className="card-title">
              <span>{t('dash.budgetVsActual')}</span>
              <Link className="btn btn-ghost btn-sm" to="/budgets">
                {t('dash.manageBudgets')}
              </Link>
            </div>
            {summary.budgets?.length ? (
              <div className="d-grid gap-3">
                {summary.budgets.map((b) => (
                  <Progress
                    key={b.id}
                    pct={b.pct}
                    label={t('dash.budgetRow', { category: b.category.name, spent: money(b.spent), limit: money(b.limit) })}
                  />
                ))}
              </div>
            ) : (
              <p className="muted mb-0">{t('dash.noLimits', { month: monthLabel() })}</p>
            )}
          </div>

          {nothingYet ? (
            <div className="card">
              <EmptyState
                icon="wallet"
                title={t('dash.emptyTitle')}
                action={
                  <div className="d-flex gap-2 justify-content-center flex-wrap mt-2">
                    <Link className="btn btn-primary" to="/transactions/new?type=expense">
                      {t('dash.emptyLogExpense')}
                    </Link>
                    <Link className="btn btn-secondary" to="/transactions/new?type=income">
                      {t('dash.emptyAddIncome')}
                    </Link>
                  </div>
                }
              >
                {t('dash.emptyBody')}
              </EmptyState>
            </div>
          ) : (
            <>
              {/* 8 and 9 - the charts follow the same order as everything
                  above, so the page never asks the eye to jump sideways */}
                <ChartCard
                title={t('dash.chartSpending')}
                type="doughnut"
                data={charts ? doughnutData : { labels: [], datasets: [] }}
                loading={!charts}
                emptyText={t('dash.chartSpendingEmpty')}
                table={{
                  columns: [t('ui.category'), t('ui.amount')],
                  rows: doughnutRows.map((r) => [r.category, money(r.total)]),
                }}
              />
              <ChartCard
                title={t('dash.chartTrend')}
                type="bar"
                data={charts ? trendData : { labels: [], datasets: [] }}
                loading={!charts}
                emptyText={t('dash.chartTrendEmpty')}
                table={{
                  columns: [t('ui.month'), t('ui.income'), t('ui.expense')],
                  rows: trendRows.map((r) => [r.label, money(r.income), money(r.expense)]),
                }}
              />


              <section>
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <h2 className="mb-0"><Icon name="bulb" /> {t('dash.tipsTitle')}</h2>
                  <Link className="btn btn-ghost btn-sm" to="/tips">
                    {t('dash.seeAllTips')}
                  </Link>
                </div>
                {summary.tips?.length ? (
                  <div className="d-grid gap-2">
                    {summary.tips.map((tip) => (
                      <div className="card tip-card" key={tip.id}>
                        <div className="d-flex align-items-start gap-3">
                          <p className="flex-grow-1 mb-0">{tip.text}</p>
                          {tip.potentialSavings > 0 && (
                            <span className="tip-saving">{t('ui.saveApprox', { amount: money(tip.potentialSavings) })}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted mb-0">{t('dash.tipsEmpty')}</p>
                )}
              </section>

              {summary.recent?.length > 0 && (
                <section className="mt-4">
                  <h2 className="mb-2">{t('dash.recentlyEdited')}</h2>
                  <div className="card" style={{ padding: 0 }}>
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {summary.recent.map((row, i) => (
                        <li key={`${row.id}-${i}`}>
                          <Link
                            to={`/transactions/${row.id}/edit`}
                            className="txn-row"
                            style={{ color: 'inherit', textDecoration: 'none' }}
                          >
                            <span className="txn-ico">
                              <Icon name="receipt" />
                            </span>
                            <span className="txn-main">
                              <span className="txn-desc">{row.description || t('dash.untitled')}</span>
                              <span className="txn-meta">
                                {row.category || t('dash.uncategorised')} · {dayLabel(row.date)}
                              </span>
                            </span>
                            <span
                              className={`txn-amount ${row.type === 'income' ? 'amount-income' : 'amount-expense'}`}
                            >
                              {row.type === 'income' ? '+' : '−'} <Icon name={row.type === 'income' ? 'trendUp' : 'trendDown'} />{' '}
                              {money(row.amount)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </Page>
  );
}
