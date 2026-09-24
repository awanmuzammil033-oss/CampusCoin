import PDFDocument from 'pdfkit';
import { formatMoney } from '../utils/money.js';
import { parseMonth, monthLabel } from './reports.js';

/**
 * The printable monthly report (REP-5), built with pdfkit in Helvetica so it
 * prints crisply on any campus printer. It only lays out numbers that were
 * already aggregated by services/reports.js — no querying happens here.
 *
 * buildReportPdf resolves with a complete Buffer, never a half-written file:
 * the route can therefore turn a failure into a clean JSON error *before*
 * any download headers exist.
 */

const HEAD_H = 20; // table header band height
const ROW_H = 17; // one-line table row
const COL_GAP = 10; // space between columns

export function buildReportPdf({ user, month, categoryRows = [], trendRows = [], dailyRows = {} }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      // Buffered pages let us stamp "Page x of y" once the total is known.
      bufferPages: true,
      info: { Title: 'Campus Coin — Monthly Report', Author: 'Campus Coin' },
    });

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      writeReport(doc, { user, month, categoryRows, trendRows, dailyRows });
    } catch (err) {
      doc.end();
      return reject(err);
    }
    doc.end();
  });
}

/* --------------------------------- content -------------------------------- */

function writeReport(doc, { user, month, categoryRows, trendRows, dailyRows }) {
  const start = parseMonth(month); // already a Date when the route parsed it
  const width = pageWidth(doc);

  pageHeader(doc, width, start, user);
  monthHeadline(doc, width, trendRows);

  heading(doc, 'Spending by category');
  const catCols = categoryColumns(width);
  drawTable(doc, catCols, categoryCells(doc, catCols, categoryRows), 'No expenses were recorded this month.');

  heading(doc, 'Income and expense — last 6 months');
  drawTable(doc, trendColumns(width), trendRows.map(trendCell), 'No entries in these months yet.');

  heading(doc, 'Daily summary');
  drawTable(doc, summaryColumns(width, 'Day'), dayCells(dailyRows), 'No entries on any day this month.');

  heading(doc, 'Weekly summary');
  drawTable(doc, summaryColumns(width, 'Week'), (dailyRows.weeks || []).map(weekCell), 'No entries in any week this month.');

  stampFooters(doc);
}

function pageHeader(doc, width, start, user) {
  const left = doc.page.margins.left;
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#16211F');
  doc.text('Campus Coin — Monthly Report', left, doc.y, { width });

  doc.moveDown(0.35);
  doc.font('Helvetica').fontSize(11).fillColor('#5B6B67');
  doc.text(`${monthLabel(start)} · ${user.name}`, { width });
  doc.text(`Generated on ${generatedOn()}`, { width });
  doc.fillColor('#16211F');

  // A thin rule under the title block — enough structure to look printed,
  // little enough ink to stay friendly to cartridge budgets.
  doc.save()
    .moveTo(left, doc.y + 6)
    .lineTo(left + width, doc.y + 6)
    .lineWidth(0.75)
    .strokeColor('#DDE5E2')
    .stroke()
    .restore();
  doc.y += 15;
}

function generatedOn() {
  return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** The month's three headline figures. The trend table always ends with the
 *  month being reported (the route builds it that way), so the summary line
 *  needs no extra query of its own. */
function monthHeadline(doc, width, trendRows) {
  const thisMonth = trendRows[trendRows.length - 1];
  if (!thisMonth) return;
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#16211F');
  doc.text(
    `Income: ${money(thisMonth.income)}     Expenses: ${money(thisMonth.expense)}     Saved: ${money(thisMonth.balance)}`,
    { width }
  );
}

function heading(doc, text) {
  roomFor(doc, 64); // never start a heading on the last lines of a page
  doc.moveDown(0.7);
  doc.font('Helvetica-Bold').fontSize(12.5).fillColor('#0F766E');
  doc.text(text, { width: pageWidth(doc) });
  doc.fillColor('#16211F');
  doc.moveDown(0.35);
}

/* --------------------------------- tables --------------------------------- */

function drawTable(doc, columns, rows, emptyNote) {
  if (!rows.length) {
    doc.font('Helvetica').fontSize(10).fillColor('#5B6B67');
    doc.text(emptyNote, { width: pageWidth(doc) });
    doc.fillColor('#16211F');
    return;
  }

  roomFor(doc, HEAD_H + ROW_H * 2);
  let y = tableHead(doc, columns, doc.y);
  const left = doc.page.margins.left;

  for (const row of rows) {
    if (y + ROW_H > doc.page.maxY()) {
      // A new page keeps the header band with it, so page 3 still explains
      // which number is which.
      doc.addPage();
      y = tableHead(doc, columns, doc.y);
    }
    doc.font('Helvetica').fontSize(9.5).fillColor('#16211F');
    let x = left;
    for (const col of columns) {
      doc.text(String(row[col.key] ?? ''), x, y + 4, { width: col.width, align: col.align || 'left', lineBreak: false });
      x += col.width + COL_GAP;
    }
    y += ROW_H;
  }
  // Hand the flowing cursor back below the table — x too, or the next
  // heading would size itself from the last cell's column instead of the
  // page's left margin.
  doc.x = left;
  doc.y = y + 6;
}

function tableHead(doc, columns, y) {
  const left = doc.page.margins.left;
  doc.rect(left, y, pageWidth(doc), HEAD_H).fill('#EEF3F1');
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#5B6B67');
  let x = left;
  for (const col of columns) {
    doc.text(col.label, x, y + 6, { width: col.width, align: col.align || 'left', lineBreak: false });
    x += col.width + COL_GAP;
  }
  doc.fillColor('#16211F');
  return y + HEAD_H;
}

function roomFor(doc, points) {
  if (doc.y + points > doc.page.maxY()) doc.addPage();
}

function pageWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

/* -------------------------------- columns --------------------------------- */

function categoryColumns(width) {
  const amount = 92;
  const pct = 74;
  const change = 148;
  return [
    { key: 'name', label: 'Category', width: width - amount - pct - change - 3 * COL_GAP },
    { key: 'amount', label: 'Amount', width: amount, align: 'right' },
    { key: 'pct', label: '% of total', width: pct, align: 'right' },
    { key: 'change', label: 'vs last month', width: change, align: 'right' },
  ];
}

function trendColumns(width) {
  const figure = 130;
  return [
    { key: 'month', label: 'Month', width: width - 2 * figure - 2 * COL_GAP },
    { key: 'income', label: 'Income', width: figure, align: 'right' },
    { key: 'expense', label: 'Expense', width: figure, align: 'right' },
  ];
}

function summaryColumns(width, firstLabel) {
  const figure = 130;
  return [
    { key: 'label', label: firstLabel, width: width - 2 * figure - 2 * COL_GAP },
    { key: 'expense', label: 'Expense', width: figure, align: 'right' },
    { key: 'income', label: 'Income', width: figure, align: 'right' },
  ];
}

/* --------------------------------- cells ---------------------------------- */

function categoryCells(doc, columns, rows) {
  // Measure with the font the row will actually use — a personal category
  // name may be long, and one line per row keeps the table aligned.
  doc.font('Helvetica').fontSize(9.5);
  return rows.map((row) => ({
    name: fitToWidth(doc, row.name, columns[0].width),
    amount: money(row.amount),
    pct: `${row.pct}%`,
    change: changeText(row),
  }));
}

function trendCell(row) {
  return { month: row.label, income: money(row.income), expense: money(row.expense) };
}

function dayCells(dailyRows) {
  const days = dailyRows.days || [];
  // Only days with activity: thirty mostly-zero lines would bury the days
  // that actually matter (the JSON feed zero-fills; the printed page need not).
  return days
    .filter((row) => row.expense > 0 || row.income > 0)
    .map((row) => ({ label: row.label, expense: money(row.expense), income: money(row.income) }));
}

function weekCell(row) {
  return { label: row.label, expense: money(row.expense), income: money(row.income) };
}

/** "vs last month": a signed amount and percentage, or "New" for a category
 *  with no spending last month. Signs carry the direction — colour is never
 *  the only signal (design.md §1). */
function changeText(row) {
  if (row.prevAmount === 0) return 'New';
  const sign = row.change > 0 ? '+' : row.change < 0 ? '-' : '';
  const pct = row.changePct === null ? '' : ` (${sign}${Math.abs(row.changePct)}%)`;
  if (sign === '') return `${money(row.change)}${pct}`;
  return `${sign}${money(Math.abs(row.change))}${pct}`;
}

/* ------------------------------- formatting ------------------------------- */

/** Display choice made at the edge: two decimals with a "$" in front, a
 *  leading "-" instead when the figure is below zero. */
function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return `$${formatMoney(0)}`;
  return n < 0 ? `-$${formatMoney(Math.abs(n))}` : `$${formatMoney(n)}`;
}

function fitToWidth(doc, text, width) {
  let fitted = String(text);
  if (doc.widthOfString(fitted) <= width) return fitted;
  while (fitted.length > 1 && doc.widthOfString(`${fitted}…`) > width) {
    fitted = fitted.slice(0, -1);
  }
  return `${fitted}…`;
}

/* --------------------------------- footers -------------------------------- */

/** Page numbers plus the polite reminder, stamped onto every buffered page at
 *  the very end — by then the total page count is known. */
function stampFooters(doc) {
  const range = doc.bufferedPageRange();
  const left = doc.page.margins.left;
  const width = pageWidth(doc);
  const bottom = doc.page.margins.bottom;

  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    // Drop the bottom margin while stamping: text that starts below it would
    // otherwise make pdfkit append one more (empty) page per footer.
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 34;
    doc.font('Helvetica').fontSize(8.5).fillColor('#5B6B67');
    doc.text('Figures are your own recorded entries.', left, y, { width: width - 100, lineBreak: false });
    doc.text(`Page ${i + 1} of ${range.count}`, left + width - 95, y, { width: 95, align: 'right', lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
  doc.fillColor('#16211F');
}
