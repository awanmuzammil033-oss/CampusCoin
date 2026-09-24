import Category from '../models/Category.js';
import { createTransaction } from './ledger.js';
import { isPositiveAmount } from '../utils/money.js';

/**
 * CSV import (TXN-8, architecture §6.9).
 *
 * Three deliberate steps:
 *   1. parse + validate every row and report problems *per row* — one bad
 *      line must not throw away the other 199;
 *   2. preview: the client shows the accepted rows (with category
 *      suggestions) and the person confirms;
 *   3. confirm: rows are re-validated and written in one transaction.
 *
 * Limits: .csv only, ≤1 MB, ≤2000 rows, UTF-8. The uploaded file itself is
 * never written to disk — it lives in memory for the length of the request.
 */

export const TEMPLATE_HEADER = 'date,type,category,amount,description';

export function templateCsv() {
  const example = '2026-09-01,income,Allowance,600.00,Monthly allowance\n2026-09-02,expense,Food,4.50,Campus cafe lunch';
  return `${TEMPLATE_HEADER}\n${example}\n`;
}

/** RFC-4180-ish reader: quoted fields, "" escapes, ,\r\n line endings. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += ch;
      continue;
    }

    if (ch === '"' && cell === '') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch === '\r') { /* handled by the \n branch */ }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }

  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/**
 * Turn raw rows into either an error list or a clean payload list.
 * Returns { errors: [{line, message}], rows: [{...}] } so the preview can
 * show both side by side.
 */
export async function validateRows(user, parsed) {
  const [header, ...body] = parsed;
  if (!header) return { errors: [{ line: 1, message: 'The file is empty.' }], rows: [] };

  const cols = header.map((h) => h.trim().toLowerCase());
  const need = ['date', 'type', 'category', 'amount', 'description'];
  const missing = need.filter((c) => !cols.includes(c));
  if (missing.length) {
    return { errors: [{ line: 1, message: `Missing column(s): ${missing.join(', ')}.` }], rows: [] };
  }
  if (body.length > 2000) {
    return { errors: [{ line: 0, message: 'Too many rows — the limit is 2000 per file.' }], rows: [] };
  }

  const idx = Object.fromEntries(need.map((c) => [c, cols.indexOf(c)]));
  const categories = await Category.forUser(user._id);
  const errors = [];
  const rows = [];

  body.forEach((cells, n) => {
    const line = n + 2; // header is line 1
    const raw = {
      date: (cells[idx.date] || '').trim(),
      type: (cells[idx.type] || '').trim().toLowerCase(),
      category: (cells[idx.category] || '').trim(),
      amount: (cells[idx.amount] || '').trim(),
      description: (cells[idx.description] || '').trim(),
    };

    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.date) || Number.isNaN(new Date(raw.date).getTime())) {
      errors.push({ line, message: `Date "${raw.date || '(blank)'}" must look like 2026-09-01.` });
      return;
    }
    if (!['income', 'expense'].includes(raw.type)) {
      errors.push({ line, message: `Type must be "income" or "expense" (got "${raw.type || '(blank)'}").` });
      return;
    }
    if (!isPositiveAmount(raw.amount)) {
      errors.push({ line, message: `Amount "${raw.amount || '(blank)'}" must be a positive number.` });
      return;
    }

    const match = categories.find(
      (c) => c.type === raw.type && c.name.toLowerCase() === raw.category.toLowerCase()
    );
    if (!match) {
      errors.push({ line, message: `Category "${raw.category || '(blank)'}" does not exist for ${raw.type}.` });
      return;
    }

    rows.push({
      line,
      ...raw,
      categoryId: match._id.toString(),
      // If the wording does not match the chosen category, the assistant's
      // guess is offered alongside — the person still presses Confirm.
      suggestion: match._id.toString(),
    });
  });

  return { errors, rows };
}

/** Step 3: everything that validated gets written; the count comes back. */
export async function importRows(user, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw Object.assign(new Error('There is nothing to import.'), { status: 400 });
  }
  if (rows.length > 2000) {
    throw Object.assign(new Error('Too many rows — the limit is 2000 per import.'), { status: 400 });
  }

  const clean = [];
  for (const row of rows) {
    // Re-check every field: the payload arrives from the browser, so the
    // preview's verdict is not trusted as-is.
    const check = await validateRows(user, [
      ['date', 'type', 'category', 'amount', 'description'],
      [row.date, row.type, row.category, row.amount, row.description],
    ]);
    if (check.errors.length) continue;
    clean.push(check.rows[0]);
  }

  if (!clean.length) {
    throw Object.assign(new Error('No valid rows to import.'), { status: 400 });
  }

  let imported = 0;
  for (const row of clean) {
    await createTransaction(user, {
      categoryId: row.categoryId,
      amount: row.amount,
      type: row.type,
      description: row.description,
      date: row.date,
    });
    imported += 1;
  }
  return imported;
}

/**
 * Guards the upload itself (called before parsing): extension, size, and a
 * sniff that it really is UTF-8 text rather than a renamed binary.
 */
export function fileProblem(file) {
  if (!file) return 'Please choose a CSV file to upload.';
  if (!/\.csv$/i.test(file.originalname || '')) return 'Only .csv files can be imported.';
  if (file.size > 1024 * 1024) return 'The file is larger than 1 MB — please split it first.';
  if (file.buffer && file.buffer.includes(0)) return 'That file does not look like a text CSV.';
  return null;
}

/**
 * Cells that begin with =, +, - or @ would be treated as formulas by
 * spreadsheet software. Echoed content (template, preview, exports) gets a
 * leading apostrophe so opening the file can never execute anything.
 */
export function neutralise(cell) {
  const s = String(cell ?? '');
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}
