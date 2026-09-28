import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import EmptyState from './EmptyState.jsx';
import CategoryIcon from './CategoryIcon.jsx';
import { useToast } from './Toast.jsx';
import { useAuth } from '../auth.jsx';
import { useLocale } from '../locale.jsx';
import { api, qs } from '../api.js';
import { money } from '../money.js';
import { uiLang } from '../dates.js';

/**
 * What-if savings simulator (NEW-13).
 *
 * "If you cut these categories by these amounts, here is what a month adds up
 * to, and here is when your goal lands." It is a PLANNER, and the whole design
 * is about keeping that word true:
 *
 *  1. IT IS A PROJECTION, NOT A BALANCE. Nothing here has happened. The figure
 *     sits in a dashed panel, is labelled a projection, and is printed in the
 *     plain text colour - never in --cc-income, the green the app uses for money
 *     that actually arrived. Two sentences under it say so outright, and the
 *     second one says the thing a student most needs to hear: spending less
 *     does not raise income, it stops spending.
 *  2. NOTHING IS INVENTED. Every spend on screen came from
 *     GET /api/insights/spending for the month the page is showing, and the
 *     goal and what is already saved came off the session copy of the account
 *     (monthlySavingsGoal / jarBalance). This file derives percentages and
 *     differences and nothing else - it never adds a spend that is not there.
 *  3. THE BASIS IS ONE MONTH AND SAYS SO. The figures are worked out from a
 *     single month, and the dictionary names the month and warns what an
 *     unrepresentative month does to a plan. A month with a birthday or a
 *     hostel deposit in it is not anybody's normal.
 *  4. WHOLE CENTS THROUGHOUT. Every amount becomes an integer number of cents
 *     on the way in and stays one. The month count is a single integer
 *     division and is rounded exactly once, in monthsToTenths().
 *
 * It lives on the budgets page because that is the page it converts into: the
 * second exit writes real limits over the ones the table above it is showing.
 * No route of its own - the placement rule is "only make a separate page where
 * genuinely needed", and a planner whose whole point is what it writes to the
 * budgets table does not need one.
 */

/* ------------------------------- constants -------------------------------- */

/**
 * The cap is a promise, not a slider decoration. 50% is about the largest cut a
 * person can plausibly make to one category; a slider that runs to 100% invites
 * a student to plan on a number they will not live.
 */
const MAX_CUT = 50;

/**
 * A saved plan has no server model - it is a set of category/percentage pairs
 * for a month that has not happened - so it is kept where this app already
 * keeps small per-device preferences: localStorage, under a `cc.` key. The
 * version is in the KEY as well as in the payload, so a future change of shape
 * reads nothing instead of reading a blob it cannot use, and the whole read is
 * inside a try because storage throws in private windows.
 */
const STORE_KEY = 'cc.whatif.scenario.v1';
const STORE_VERSION = 1;

/**
 * The month's own figures put one row under the literal id "none" for spending
 * logged with no category. There is no budget to write against that row, so it
 * never becomes a slider - it gets a line of its own instead.
 */
const OBJECT_ID = /^[a-f0-9]{24}$/i;

/** A "YYYY-MM" the server will accept, so a bad prop fails here, not there. */
const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/* --------------------------------- money ---------------------------------- */

/**
 * One number out of the API, whatever shape it arrived in. The two money
 * columns on the account are Decimal128, which JSON-encodes as
 * { $numberDecimal: "4000.00" }; the month's figures are plain numbers.
 * Anything unreadable is zero, and zero is a real value everywhere below, so a
 * bad field can never become NaN and poison a total.
 */
function amountOf(value) {
  if (value === null || value === undefined || value === '') return 0;
  const raw =
    typeof value === 'object' ? value.$numberDecimal ?? value.value : value;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Whole cents. Every money figure in this file is an integer from here on. */
function toCents(value) {
  return Math.round(amountOf(value) * 100);
}

/** Cents back out for money() / the server, without a float on the way. */
function fromCents(cents) {
  return Math.trunc(cents) / 100;
}

/** A whole percent as a symbol: 30 -> "30%". The sign is not a word. */
function percentText(pct) {
  return `${pct}%`;
}

/**
 * "1234" cents as "12.34" - built from the integer, so no float ever reaches
 * the server's /^\d+(\.\d{1,2})?$/ check on a budget limit.
 */
function limitText(cents) {
  const c = Math.max(0, Math.trunc(cents));
  return `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
}

/* ------------------------------- arithmetic ------------------------------- */

/**
 * A cut percentage, always a whole number, never above the cap. Applied to the
 * slider, to a restored plan and to anything read back out of storage, because
 * a cap that only the control respects is not a cap.
 */
function clampCut(pct) {
  const n = Math.trunc(Number(pct));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n > MAX_CUT ? MAX_CUT : n;
}

/** Cents cut from one category, rounded to the cent and never below zero. */
function cutOf(spendCents, pct) {
  return Math.max(0, Math.round((spendCents * clampCut(pct)) / 100));
}

/**
 * TENTHS OF A MONTH, from whole cents only.
 *
 * `remaining / saving` in floats is how a screen ends up saying 7.0000001
 * months, so the division is done in integers and rounded exactly once, here,
 * half up - one decimal place, because a plan rounded to a whole month would
 * say "6 months" for anything from 5.5 to 6.49 and a person buying a laptop
 * cannot act on that.
 *
 * Returns null when there is nothing to divide by. That is the zero-saving
 * case, and it is the reason this returns a nullable: the caller must never be
 * holding a month count it is about to divide again.
 *
 * remainingCents * 10 stays far inside Number.MAX_SAFE_INTEGER at any goal a
 * student could type.
 */
function monthsToTenths(remainingCents, savingCents) {
  if (!(savingCents > 0)) return null; // no cut adds anything: no month count
  if (!(remainingCents > 0)) return 0; // already there
  return Math.floor((remainingCents * 10 + Math.floor(savingCents / 2)) / savingCents);
}

/** The month count as the app would print it, at most one decimal. */
function monthsText(tenths) {
  try {
    return new Intl.NumberFormat(uiLang(), { maximumFractionDigits: 1 }).format(tenths / 10);
  } catch {
    return String(tenths / 10);
  }
}

/* --------------------------------- storage -------------------------------- */

/**
 * Read a saved plan, or null for "there is nothing usable here".
 *
 * Every way this can go wrong is checked rather than trusted: storage that
 * throws (private window, storage disabled), text that is not JSON, JSON that
 * is not an object, a version this build does not know, a month that is not a
 * month, cuts that are not an object, a category id that is not an id, and a
 * stored percentage outside the cap. A stored 90 comes back as 50.
 */
function readScenario() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const blob = JSON.parse(raw);
    if (!blob || typeof blob !== 'object' || Array.isArray(blob)) return null;
    if (blob.v !== STORE_VERSION) return null;
    if (typeof blob.month !== 'string' || !MONTH_KEY.test(blob.month)) return null;
    if (!blob.cuts || typeof blob.cuts !== 'object' || Array.isArray(blob.cuts)) return null;
    const cuts = {};
    Object.entries(blob.cuts).forEach(([id, pct]) => {
      if (!OBJECT_ID.test(id)) return;
      const n = Number(pct);
      if (!Number.isFinite(n) || n <= 0) return;
      cuts[id] = clampCut(n);
    });
    return { month: blob.month, cuts };
  } catch {
    return null;
  }
}

/** Keep the plan on this device. Returns whether the device took it. */
function writeScenario(month, cuts) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ v: STORE_VERSION, month, cuts }));
    return true;
  } catch {
    return false;
  }
}

function clearScenario() {
  try {
    localStorage.removeItem(STORE_KEY);
    return true;
  } catch {
    return false;
  }
}

/* ---------------------------------- plan ---------------------------------- */

/**
 * What the "make these my limits" button will send, in order.
 *
 * The number is the money LEFT AFTER THE CUT, never the spend the cut was
 * measured from. That is the whole point of the second exit and the easiest
 * thing in this feature to get backwards: writing the original would set a
 * limit that permits exactly the behaviour the student asked to stop.
 *
 * A cut that rounds away to nothing is left out - there is no limit to write -
 * and the row on screen already says the cut comes to 0.00, so nothing is
 * hidden by dropping it.
 */
function planFor(rows, cuts) {
  // The cap: one write per slider on screen, and no more. A plan row is derived
  // from a slider row, so this can only ever bite if the two ever disagree -
  // which is exactly when a bound on the number of POSTs is worth having.
  const cap = rows.length;
  return rows
    .filter((row) => cuts[row.id] > 0)
    // the percentage is clamped here as well as in cutOf, because this one is
    // shown in the confirmation and written into the saved plan
    .map((row) => ({ id: row.id, name: row.name, pct: clampCut(cuts[row.id]), cents: cutOf(row.cents, cuts[row.id]) }))
    .filter((row) => row.cents > 0)
    .slice(0, cap);
}

/**
 * One POST per planned category, one at a time, each result recorded whatever
 * the others did. Sequential on purpose: a partial save has to be able to say
 * WHICH categories saved, and a burst of parallel writes would bury that in
 * whichever rejection happened to land first.
 */
async function writeBudgets(month, plan) {
  const results = [];
  for (const row of plan) {
    try {
      await api.post('/api/budgets', { categoryId: row.id, month, limitAmount: limitText(row.cents) });
      results.push({ id: row.id, name: row.name, ok: true, limit: row.cents });
    } catch (err) {
      results.push({ id: row.id, name: row.name, ok: false, limit: row.cents, reason: err.message });
    }
  }
  return results;
}

/* --------------------------------- helpers -------------------------------- */

/** "2026-09" as "September 2026", in the interface's language. */
function monthWords(key) {
  const [y, m] = String(key || '').slice(0, 7).split('-').map(Number);
  if (!y || !m) return '';
  return new Date(y, m - 1, 1).toLocaleDateString(uiLang(), { month: 'long', year: 'numeric' });
}

/* -------------------------------- component ------------------------------- */

export default function WhatIfSimulator({ month, onWritten }) {
  const { t, plural } = useLocale();
  const { user } = useAuth() || {};
  const { push } = useToast();

  const [data, setData] = useState(null); // the month's own figures
  const [cats, setCats] = useState([]); // the active expense categories
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0); // drives the retry button
  const [cuts, setCuts] = useState({}); // categoryId -> whole percent
  const [loadedFromDevice, setLoadedFromDevice] = useState(false);
  const [hasStored, setHasStored] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [writing, setWriting] = useState(false);
  const [report, setReport] = useState(null); // the last write, per category

  const restoreDone = useRef(false);
  const usable = MONTH_KEY.test(String(month || ''));

  /*
   * The month's figures and the category list are two questions, asked together
   * because the tool needs both before it can draw one row. The category list is
   * a convenience - it supplies the icons and the count of categories left out
   * - so a failure there must not take the sliders down with it: the month's
   * own payload already carries the ids, names and amounts the arithmetic needs.
   */
  useEffect(() => {
    if (!usable) {
      setError('month');
      setLoading(false);
      return undefined;
    }
    let alive = true;
    setLoading(true);
    Promise.allSettled([
      api.get(`/api/insights/spending${qs({ month })}`),
      api.get('/api/categories'),
    ]).then(([spending, categories]) => {
      if (!alive) return;
      if (spending.status === 'fulfilled') {
        setData(spending.value);
        setError('');
      } else {
        setData(null);
        setError(spending.reason?.message || 'error');
      }
      setCats(
        categories.status === 'fulfilled'
          ? (categories.value?.expense || []).filter((c) => c && c.isActive !== false)
          : []
      );
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [month, attempt, usable]);

  /*
   * The slider rows, from the server's own figures. A category with no money in
   * this month gets NO ROW at all, and the rule is applied the same way every
   * time: a slider over an empty category reads 0.00 at every position, so
   * every position is identical and the control carries no information while
   * still looking like a real part of the plan. The count of what was left out
   * is said below the list, so hiding is visible rather than silent.
   *
   * The server already sent these biggest-first; filtering does not disturb it.
   */
  const rows = useMemo(() => {
    const list = Array.isArray(data?.categories) ? data.categories : [];
    return list
      .filter((row) => row && OBJECT_ID.test(String(row.id)))
      .map((row) => ({ id: String(row.id), name: row.name, cents: toCents(row.total) }))
      .filter((row) => row.cents > 0);
  }, [data]);

  const iconById = useMemo(
    () => new Map(cats.map((c) => [String(c.id), c.icon])),
    [cats]
  );

  /* Spending logged with no category: real money, but no budget can be written
     against it, so it is named rather than silently left out of the sum. */
  const unfiledCents = useMemo(() => {
    const list = Array.isArray(data?.categories) ? data.categories : [];
    const row = list.find((item) => item && String(item.id) === 'none');
    return row ? toCents(row.total) : 0;
  }, [data]);

  /*
   * A plan saved on this device is put back once per mount, and only onto the
   * categories the server actually sent this month - a stored cut for a
   * category that has no row here simply has nothing to apply to. The month it
   * was saved against is not a filter: a plan is a set of cuts, and the figures
   * it is applied to are whatever month the page is showing.
   */
  useEffect(() => {
    if (restoreDone.current || rows.length === 0) return;
    restoreDone.current = true;
    const stored = readScenario();
    if (!stored) return;
    const next = {};
    let applied = 0;
    rows.forEach((row) => {
      if (stored.cuts[row.id]) {
        next[row.id] = stored.cuts[row.id];
        applied += 1;
      }
    });
    setHasStored(true);
    if (applied > 0) {
      setCuts(next);
      setLoadedFromDevice(true);
    }
  }, [rows]);

  function setCut(id, value) {
    setCuts((current) => ({ ...current, [id]: clampCut(value) }));
    // An edit is an edit of the plan, so the result of the last write is stale.
    setReport(null);
  }

  /* --------------------------- the projection ---------------------------- */

  const plan = useMemo(() => planFor(rows, cuts), [rows, cuts]);
  const saveCents = plan.reduce((total, row) => total + row.cents, 0);

  // Straight off the session copy of the account, which Profile refreshes after
  // every save - so a student who sets a goal and comes back gets the month
  // count without this tool keeping a second, staler copy of the account.
  const goalCents = toCents(user?.monthlySavingsGoal);
  const savedCents = toCents(user?.jarBalance);
  const remainingCents = goalCents - savedCents;
  const tenths = monthsToTenths(remainingCents, saveCents);

  /*
   * Four answers, in this order, and the order is the point. A goal that is
   * already passed is said before the zero-saving case, because a plan that
   * cuts nothing does not un-reach a goal that is already met. The month count
   * is never printed for a number of days' worth of saving - under one month
   * gets the two figures that say it exactly instead of a decimal that would
   * read as a rounding error.
   */
  let monthsLine;
  if (goalCents <= 0) {
    monthsLine = t('sim.goalMissing');
  } else if (remainingCents <= 0) {
    monthsLine = t('sim.monthsMet', { amount: money(fromCents(-remainingCents)) });
  } else if (saveCents <= 0) {
    monthsLine = t('sim.monthsNone');
  } else if (tenths !== null && tenths < 10) {
    monthsLine = t('sim.monthsUnder', {
      months: monthsText(tenths),
      save: money(fromCents(saveCents)),
      remaining: money(fromCents(remainingCents)),
    });
  } else {
    monthsLine = t('sim.monthsAbout', {
      months: monthsText(tenths),
      save: money(fromCents(saveCents)),
    });
  }

  /* ------------------------------ the exits ------------------------------ */

  function savePlan() {
    const kept = {};
    plan.forEach((row) => {
      kept[row.id] = row.pct;
    });
    if (!writeScenario(month, kept)) {
      push(t('sim.saveFailed'), 'error');
      return;
    }
    setHasStored(true);
    setLoadedFromDevice(false);
    push(t('sim.savedToast'));
  }

  function forgetPlan() {
    if (!clearScenario()) {
      push(t('sim.saveFailed'), 'error');
      return;
    }
    setHasStored(false);
    setLoadedFromDevice(false);
    setCuts({});
    setReport(null);
    push(t('sim.clearedToast'));
  }

  async function applyPlan() {
    setWriting(true);
    setConfirming(false);
    let results;
    try {
      results = await writeBudgets(month, plan);
    } finally {
      setWriting(false);
    }
    setReport(results);
    const done = results.filter((row) => row.ok).length;
    // A partial save is not a save, and the screen must not say it was: the
    // toast is an error and the per-category list below says which ones.
    if (done === results.length) {
      push(plural('sim.writeAllOk', done, { n: done }));
    } else if (done === 0) {
      push(plural('sim.writeNone', results.length), 'error');
    } else {
      push(t('sim.writePartial', { done, total: results.length }), 'error');
    }
    // The table on the page behind this card is reading limits that may have
    // just changed, so it is asked to reload whatever the outcome was.
    onWritten?.();
  }

  /* -------------------------------- render -------------------------------- */

  const monthText = monthWords(month);
  const hidden = Math.max(0, cats.length - rows.length);
  const reportDone = report ? report.filter((row) => row.ok).length : 0;
  const reportAllOk = Boolean(report) && reportDone === report.length;

  return (
    <section className="card cc-sim mt-3" aria-labelledby="cc-sim-title">
      <div className="card-title">
        <span id="cc-sim-title">
          <Icon name="percent" /> {t('sim.title')}
        </span>
      </div>
      <p className="smallish muted">{t('sim.subtitle')}</p>

      {error === 'month' ? (
        <div className="field-error mb-3" role="alert">
          <Icon name="warning" />
          <span>{t('sim.errorMonth')}</span>
        </div>
      ) : (
        <>
          {error && (
            <div className="field-error mb-3" role="alert">
              <Icon name="warning" />
              <span>{t('sim.errorTitle')}</span>
              <button type="button" className="btn btn-ghost btn-sm ms-auto" onClick={() => setAttempt((n) => n + 1)}>
                {t('sim.retry')}
              </button>
            </div>
          )}

          {loading && (
            <div className="card" role="status">
              <div className="skeleton" style={{ height: 16, width: '45%', marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 40, width: '60%', marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 14, width: '80%' }} />
              <p className="smallish muted mb-0 mt-3">{t('sim.loading')}</p>
            </div>
          )}

          {!loading && !error && rows.length === 0 && (
            <EmptyState icon="chart" title={t('sim.emptyTitle', { month: monthText })}>
              {t('sim.emptyBody')}
            </EmptyState>
          )}

          {!loading && !error && rows.length > 0 && (
            <>
              <ul className="cc-sim-list" style={{ listStyle: 'none', margin: '0 0 16px', padding: 0, display: 'grid', gap: 14 }}>
                {rows.map((row) => {
                  const pct = clampCut(cuts[row.id] ?? 0);
                  const cut = cutOf(row.cents, pct);
                  const left = Math.max(0, row.cents - cut);
                  const inputId = `cc-sim-cut-${row.id}`;
                  return (
                    <li key={row.id} className="cc-sim-row" data-cut={pct > 0}>
                      <div className="cc-sim-row-head">
                        <span className="txn-ico" style={{ width: 28, height: 28 }}>
                          <CategoryIcon name={iconById.get(row.id)} size={15} />
                        </span>
                        <label className="cc-sim-row-label" htmlFor={inputId}>
                          {row.name}
                        </label>
                        <span className="num cc-sim-row-pct">{percentText(pct)}</span>
                      </div>
                      <input
                        id={inputId}
                        className="cc-sim-range"
                        type="range"
                        min={0}
                        max={MAX_CUT}
                        step={1}
                        value={pct}
                        onChange={(event) => setCut(row.id, event.target.value)}
                        aria-describedby={`${inputId}-figures`}
                        aria-valuetext={t('sim.valueText', {
                          pct: percentText(pct),
                          cut: money(fromCents(cut)),
                          left: money(fromCents(left)),
                          spent: money(fromCents(row.cents)),
                        })}
                      />
                      <p className="smallish cc-sim-row-figures" id={`${inputId}-figures`}>
                        {t('sim.figures', {
                          spent: money(fromCents(row.cents)),
                          cut: money(fromCents(cut)),
                          left: money(fromCents(left)),
                        })}
                      </p>
                    </li>
                  );
                })}
              </ul>

              {/*
                THE PROJECTION. A dashed panel rather than a card, a "projection"
                pill, the figure in the plain text colour instead of the green
                the app uses for money that arrived, and two sentences that say
                the whole thing out loud. Nothing in here is styled like a
                balance, because nothing in here is one.
              */}
              <div className="cc-sim-projection" role="group" aria-labelledby="cc-sim-projection-title">
                <div className="cc-sim-proj-head">
                  <span className="smallish" id="cc-sim-projection-title">
                    <Icon name="clock" size={14} /> {t('sim.projTitle')}
                  </span>
                  <span className="pill">{t('sim.projPill')}</span>
                </div>

                <div className="cc-sim-proj-live" aria-live="polite">
                  <p className="num cc-sim-proj-figure">{money(fromCents(saveCents))}</p>
                  <p className="cc-sim-proj-if">{t('sim.projIf')}</p>
                  <div className="cc-sim-goal">
                    {goalCents > 0 && (
                      <p className="smallish">
                        {t('sim.goalOf', {
                          goal: money(fromCents(goalCents)),
                          saved: money(fromCents(savedCents)),
                          remaining: money(fromCents(remainingCents)),
                        })}
                      </p>
                    )}
                    <p className="smallish">{monthsLine}</p>
                    {goalCents <= 0 && (
                      <Link className="btn btn-ghost btn-sm" to="/profile">
                        <Icon name="arrowRight" size={15} /> {t('sim.goalCta')}
                      </Link>
                    )}
                  </div>
                </div>

                <p className="smallish cc-sim-proj-note">{t('sim.projNotYet')}</p>
                <p className="smallish cc-sim-proj-note">{t('sim.projNoIncome')}</p>

                <div className="cc-sim-basis">
                  <p className="smallish muted">
                    <Icon name="info" size={14} /> {t('sim.basis', { month: monthText })}
                  </p>
                  <p className="smallish muted">{t('sim.basisWhy')}</p>
                  {hidden > 0 && (
                    <p className="smallish muted">{plural('sim.hidden', hidden, { n: hidden })}</p>
                  )}
                  {unfiledCents > 0 && (
                    <p className="smallish muted">
                      {t('sim.uncategorised', { amount: money(fromCents(unfiledCents)) })}
                    </p>
                  )}
                </div>
              </div>

              <div className="cc-sim-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setConfirming(true)}
                  disabled={plan.length === 0 || writing}
                >
                  {writing && <span className="spinner" aria-hidden="true" />}
                  <Icon name="check" size={16} /> {t('sim.writeBtn')}
                </button>
                <button type="button" className="btn btn-secondary" onClick={savePlan} disabled={plan.length === 0}>
                  <Icon name="bookmark" size={16} /> {t('sim.saveBtn')}
                </button>
                {hasStored && (
                  <button type="button" className="btn btn-ghost" onClick={forgetPlan}>
                    <Icon name="trash" size={16} /> {t('sim.clearBtn')}
                  </button>
                )}
              </div>
              {plan.length === 0 && <p className="smallish muted">{t('sim.moveFirst')}</p>}

              {/*
                The device note is on the screen, not in a toast that goes away:
                a plan saved on a phone that cannot be found on a laptop is a
                plan the student was never told about.
              */}
              <p className="smallish muted cc-sim-save-note">
                <Icon name="info" size={14} /> {loadedFromDevice ? t('sim.restoredNote') : t('sim.savedNote')}
              </p>

              {/*
                The per-category result, kept in the card rather than left in a
                toast, because a toast is gone in four seconds and a limit that
                did not save is exactly the thing that has to survive it. The
                server's own sentence is shown under a failed row: it is the
                reason the write was refused, not a friendlier invention of one.
              */}
              {report && (
                <div
                  className="cc-sim-report"
                  role={reportAllOk ? 'status' : 'alert'}
                  aria-live="polite"
                >
                  <p className="cc-sim-report-head">
                    {reportAllOk
                      ? plural('sim.writeAllOk', report.length, { n: report.length })
                      : t('sim.writePartial', { done: reportDone, total: report.length })}
                  </p>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                    {report.map((row) => (
                      <li key={row.id} className="cc-sim-report-row" data-ok={row.ok}>
                        <Icon name={row.ok ? 'checkCircle' : 'warning'} size={15} />
                        <span>
                          {row.ok
                            ? t('sim.writeRowOk', { name: row.name, limit: money(fromCents(row.limit)) })
                            : t('sim.writeRowFailed', { name: row.name })}
                        </span>
                        {!row.ok && row.reason && <span className="smallish muted">{row.reason}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/*
        The confirm, because a write here REPLACES a limit the student set on
        purpose and every one of the numbers in it is the number that will be
        stored. Escape closes it, the shared Modal handles that.
      */}
      {confirming && (
        <Modal
          title={t('sim.writeConfirmTitle', { month: monthText })}
          onClose={() => setConfirming(false)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>
                {t('sim.cancel')}
              </button>
              <button type="button" className="btn btn-primary" onClick={applyPlan}>
                {t('sim.writeConfirmBtn')}
              </button>
            </>
          }
        >
          <p className="smallish mb-2">
            {plural('sim.writeConfirmBody', plan.length, { n: plan.length, month: monthText })}
          </p>
          {/* the one sentence in the app that is worth getting backwards, so it
              is on its own line rather than buried in the paragraph above */}
          <p className="smallish mb-2">
            <strong>{t('sim.writeConfirmNote')}</strong>
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {plan.map((row) => (
              <li key={row.id} className="cc-sim-report-row" data-ok="true">
                <Icon name="check" size={15} />
                <span>
                  {t('sim.writeRow', {
                    name: row.name,
                    pct: percentText(row.pct),
                    limit: money(fromCents(row.cents)),
                  })}
                </span>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </section>
  );
}
