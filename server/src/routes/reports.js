import { Router } from 'express';
import { requireStudent } from '../middleware/auth.js';
import { emailProblem, sendMail } from '../services/accounts.js';
import {
  categoryReport,
  trendReport,
  dailyWeeklyReport,
  filteredSummary,
  parseMonth,
  monthKey,
  monthLabel,
} from '../services/reports.js';
import { buildReportPdf } from '../services/pdf.js';
import { formatMoney } from '../utils/money.js';

const router = Router();
router.use(requireStudent);

const TABS = ['category', 'trend', 'daily', 'filtered'];

/* -------------------------------- read (REP-1..4) --------------------------- */

/**
 * One endpoint serves the four report tabs: ?tab= picks the payload, every
 * other query value is just that tab's own input. An unknown tab falls back
 * to "category" so an old bookmark still opens the page instead of erroring.
 */
router.get('/', async (req, res, next) => {
  try {
    const tab = TABS.includes(req.query.tab) ? req.query.tab : 'category';
    let payload;

    if (tab === 'trend') {
      // Anchoring the trend to ?month= keeps an export for March showing the
      // six months that end in March; with no month it ends with this one.
      payload = await trendReport(req.user, { month: req.query.month });
    } else if (tab === 'daily') {
      payload = await dailyWeeklyReport(req.user, { month: req.query.month });
    } else if (tab === 'filtered') {
      payload = await filteredSummary(req.user, {
        from: req.query.from,
        to: req.query.to,
        categoryId: req.query.category,
        type: req.query.type,
      });
    } else {
      payload = await categoryReport(req.user, { month: req.query.month });
    }

    res.json({ tab, ...payload });
  } catch (err) {
    return sendProblem(res, next, err);
  }
});

/* -------------------------------- export (REP-5) ---------------------------- */

/**
 * The one and only place in the app that produces a download (REP-5). It runs
 * only when a student clicks "Export PDF" — nothing anywhere else may push a
 * file at the browser on its own.
 */
router.get('/export/pdf', async (req, res, next) => {
  try {
    const month = parseMonth(req.query.month); // junk month → friendly 400 here
    const [category, trend, daily] = await Promise.all([
      categoryReport(req.user, { month }),
      trendReport(req.user, { month }),
      dailyWeeklyReport(req.user, { month }),
    ]);

    // Fully built before the first header: a failure becomes a plain JSON
    // error instead of a half-written file landing in someone's downloads.
    const pdf = await buildReportPdf({
      user: req.user,
      month,
      categoryRows: category.rows,
      trendRows: trend.rows,
      dailyRows: { days: daily.days, weeks: daily.weeks },
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="campuscoin-report-${monthKey(month)}.pdf"`,
    });
    res.send(pdf);
  } catch (err) {
    return sendProblem(res, next, err);
  }
});

/* --------------------------------- share (BKM-2) ---------------------------- */

/**
 * Email the month summary as plain text. Deliberately no attachment and no
 * generated file here: REP-5 keeps downloads on the explicit export button
 * alone, and a short text summary is what the share form promises.
 */
router.post('/share', async (req, res, next) => {
  try {
    // No month in the body means "share this month"; a malformed one is a
    // clear validation error rather than a surprise default.
    const month = parseMonth(req.body?.month);
    const to = String(req.body?.email || '').trim().toLowerCase();
    const emailIssue = emailProblem(to);
    if (emailIssue) throw badRequest(emailIssue);

    const note = String(req.body?.message || '').trim().slice(0, 500);
    const report = await categoryReport(req.user, { month });
    const label = monthLabel(month);

    await sendMail({
      to,
      subject: `Your Campus Coin report for ${label}`,
      text: shareText({ user: req.user, label, report, note }),
    });

    res.json({ ok: true, email: to, month: monthKey(month) });
  } catch (err) {
    return sendProblem(res, next, err);
  }
});

/* --------------------------------- helpers ---------------------------------- */

/**
 * Input problems (400) answer with the service's own plain-language wording;
 * anything else — a bug, a database hiccup — still travels to the shared
 * error handler via next(err), which keeps its wording generic on purpose.
 */
function sendProblem(res, next, err) {
  if (err.status === 400) return res.status(400).json({ error: err.message });
  return next(err);
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

/** The shared report mail: friendly, brief, non-judgmental (design.md §7),
 *  with the personal note at the end the way a person would sign a message. */
function shareText({ user, label, report, note }) {
  const lines = [
    'Hi,',
    '',
    `Here is your Campus Coin summary for ${label}.`,
    '',
    `  Income:    ${money(report.totals.income)}`,
    `  Expenses:  ${money(report.totals.expense)}`,
    `  Saved:     ${money(report.totals.balance)}`,
    '',
  ];

  const top = report.rows.filter((row) => row.amount > 0).slice(0, 3);
  if (top.length) {
    lines.push('Where the money went:');
    top.forEach((row, i) => {
      const place = `${i + 1}. ${row.name}`.padEnd(22);
      lines.push(`  ${place}${money(row.amount).padStart(11)}   (${Math.round(row.pct)}%)`);
    });
  } else {
    lines.push('No expenses were recorded this month.');
  }

  if (note) lines.push('', `Message from ${user.name}:`, note);

  lines.push(
    '',
    `Shared by ${user.name} · Campus Coin`,
    'Figures are your own recorded entries.',
    'Smart Spending, Student Style'
  );
  return lines.join('\n');
}

/** Currency symbol is a display choice, so it is added at this edge — the
 *  figures themselves were already rounded once by the reports service. */
function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return `$${formatMoney(0)}`;
  return n < 0 ? `-$${formatMoney(Math.abs(n))}` : `$${formatMoney(n)}`;
}

export default router;
