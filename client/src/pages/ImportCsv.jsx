import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Page from '../components/Page.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { money } from '../money.js';

const MAX_BYTES = 1024 * 1024;

function dayLabel(value) {
  const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * CSV import (TXN-8) in three honest steps: pick a file, read the preview
 * with every problem spelled out per line, then confirm. Nothing is written
 * until the person presses Confirm.
 */
export default function ImportCsv() {
  const navigate = useNavigate();
  const { push } = useToast();
  const [preview, setPreview] = useState(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [focusRing, setFocusRing] = useState(false);
  const inputRef = useRef(null);

  async function onPick(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');

    // Friendly guards before anything leaves the browser (≤1 MB, .csv only).
    if (!/\.csv$/i.test(file.name)) {
      setError('Only .csv files can be imported — export your sheet as CSV first.');
      event.target.value = '';
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('That file is larger than 1 MB — please split it into smaller batches.');
      event.target.value = '';
      return;
    }

    setFileName(file.name);
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const data = await api.upload('/api/transactions/import/preview', body);
      setPreview(data);
    } catch (err) {
      setError(err.message);
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!preview?.rows?.length) return;
    setBusy(true);
    try {
      const data = await api.post('/api/transactions/import/confirm', { rows: preview.rows });
      push(`${data.imported} entries imported.`);
      navigate('/transactions');
    } catch (err) {
      setError(err.message);
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setPreview(null);
    setFileName('');
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  const ready = preview?.ready ?? preview?.rows?.length ?? 0;
  const problems = preview?.problems ?? preview?.errors?.length ?? 0;

  return (
    <Page
      trail={[
        { label: 'Transactions', to: '/transactions' },
        { label: 'Import from CSV' },
      ]}
      title="Import from CSV"
      subtitle="Bring in a semester of history without typing it all again."
      actions={
        <a className="btn btn-secondary" href="/api/transactions/import/template">
          Download template
        </a>
      }
    >
      {!preview && (
        <div className="card" style={{ maxWidth: 640 }}>
          <h2>Step 1 · Choose your file</h2>
          <p className="muted">
            The file needs five columns: <code>date, type, category, amount, description</code>, with dates
            written as <code>2026-09-01</code>. Download the template to see the exact shape — one bad line
            never throws away the good ones; problems are listed line by line before anything is saved.
          </p>

          <div className="field" style={{ position: 'relative' }}>
            <label
              className="btn btn-primary"
              htmlFor="csv-file"
              style={focusRing ? { outline: '3px solid var(--cc-focus)', outlineOffset: 2 } : undefined}
            >
              Choose a CSV file
            </label>
            <input
              id="csv-file"
              ref={inputRef}
              type="file"
              accept=".csv"
              className="visually-hidden"
              onChange={onPick}
              onFocus={() => setFocusRing(true)}
              onBlur={() => setFocusRing(false)}
            />
            <div className="field-help">.csv only · up to 1 MB · UTF-8 text.</div>
          </div>

          {fileName && !busy && (
            <p className="smallish muted mb-0">
              Selected: <strong>{fileName}</strong>
            </p>
          )}

          {busy && (
            <div className="d-flex align-items-center gap-2 muted mt-3" role="status" aria-live="polite">
              <span className="spinner" aria-hidden="true" />
              Reading your file…
            </div>
          )}

          {error && (
            <div className="field-error mt-3" role="alert">
              <span aria-hidden="true">⚠</span>
              <span>{error}</span>
            </div>
          )}
        </div>
      )}

      {preview && (
        <div className="card">
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
            <h2 className="mb-0">Step 2 · Check the preview</h2>
            <span className="smallish muted">From {fileName}</span>
          </div>

          <div className="d-flex gap-2 flex-wrap mb-3">
            <span className="pill pill-income num">✔ {ready} ready</span>
            <span className={problems ? 'pill pill-expense num' : 'pill num'}>
              {problems ? '⚠' : '·'} {problems} {problems === 1 ? 'problem' : 'problems'}
            </span>
            <span className="pill num">{preview.total ?? ready + problems} rows in file</span>
          </div>

          {preview.errors?.length > 0 && (
            <div className="mb-3">
              <h3>Lines that need a fix</h3>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {preview.errors.map((err, i) => (
                  <li key={`${err.line}-${i}`} className="field-error">
                    <span aria-hidden="true">⚠</span>
                    <span>
                      Line {err.line || '—'}: {err.message}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="smallish muted mb-0 mt-2">
                Fix those lines in your file and upload again — the rows below can still be imported now.
              </p>
            </div>
          )}

          {preview.rows?.length === 0 ? (
            <EmptyState icon="📄" title="Nothing ready to import">
              Every line needs a fix first. Correct them in the spreadsheet and start over.
            </EmptyState>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <caption className="visually-hidden">Rows that will be imported</caption>
                <thead>
                  <tr>
                    <th scope="col">Line</th>
                    <th scope="col">Date</th>
                    <th scope="col">Type</th>
                    <th scope="col">Category</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {(preview.rows || []).map((row) => (
                    <tr key={row.line}>
                      <td className="num">{row.line}</td>
                      <td className="num text-nowrap">{dayLabel(row.date)}</td>
                      <td>
                        <span className={row.type === 'income' ? 'pill pill-income' : 'pill pill-expense'}>
                          {row.type === 'income' ? '+ Income' : '− Expense'}
                        </span>
                      </td>
                      <td>{row.category}</td>
                      <td className="num">{money(row.amount)}</td>
                      <td>{row.description || <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="d-flex gap-2 flex-wrap mt-4">
            <button
              type="button"
              className="btn btn-primary"
              onClick={confirmImport}
              disabled={busy || preview.rows?.length === 0}
            >
              {busy && <span className="spinner" aria-hidden="true" />}
              {busy ? 'Importing…' : 'Confirm import'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={startOver} disabled={busy}>
              Start over
            </button>
          </div>

          {error && (
            <div className="field-error mt-3" role="alert">
              <span aria-hidden="true">⚠</span>
              <span>{error}</span>
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
