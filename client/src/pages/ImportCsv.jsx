import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Page from '../components/Page.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { money } from '../money.js';
import { useLocale } from '../locale.jsx';
import { dayLabel } from '../dates.js';

const MAX_BYTES = 1024 * 1024;

/**
 * CSV import (TXN-8) in three honest steps: pick a file, read the preview
 * with every problem spelled out per line, then confirm. Nothing is written
 * until the person presses Confirm.
 */
export default function ImportCsv() {
  const navigate = useNavigate();
  const { push } = useToast();
  const { t, plural } = useLocale();
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
      setError(t('imp.csvOnly'));
      event.target.value = '';
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t('imp.tooBig'));
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
      push(plural('imp.imported', data.imported, { n: data.imported }));
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
        { label: t('nav.transactions'), to: '/transactions' },
        { label: t('home.link.importCsv') },
      ]}
      title={t('home.link.importCsv')}
      subtitle={t('imp.subtitle')}
      actions={
        <a className="btn btn-secondary" href="/api/transactions/import/template">
          {t('imp.downloadTemplate')}
        </a>
      }
    >
      {!preview && (
        <div className="card" style={{ maxWidth: 640 }}>
          <h2>{t('imp.step1')}</h2>
          <p className="muted">
            {t('imp.helpF1')} <code>date, type, category, amount, description</code> {t('imp.helpF2')}{' '}
            <code>2026-09-01</code> {t('imp.helpF3')}
          </p>

          <div className="field" style={{ position: 'relative' }}>
            <label
              className="btn btn-primary"
              htmlFor="csv-file"
              style={focusRing ? { outline: '3px solid var(--cc-focus)', outlineOffset: 2 } : undefined}
            >
              {t('imp.chooseFile')}
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
            <div className="field-help">{t('imp.fileHelp')}</div>
          </div>

          {fileName && !busy && (
            <p className="smallish muted mb-0">
              {t('imp.selected')} <strong>{fileName}</strong>
            </p>
          )}

          {busy && (
            <div className="d-flex align-items-center gap-2 muted mt-3" role="status" aria-live="polite">
              <span className="spinner" aria-hidden="true" />
              {t('imp.reading')}
            </div>
          )}

          {error && (
            <div className="field-error mt-3" role="alert">
              <Icon name="warning" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}

      {preview && (
        <div className="card">
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
            <h2 className="mb-0">{t('imp.step2')}</h2>
            <span className="smallish muted">{t('imp.from', { file: fileName })}</span>
          </div>

          <div className="d-flex gap-2 flex-wrap mb-3">
            <span className="pill pill-income num"><Icon name="check" /> {t('imp.ready', { n: ready })}</span>
            <span className={problems ? 'pill pill-expense num' : 'pill num'}>
              {problems ? <Icon name="warning" /> : '·'} {plural('imp.problems', problems, { n: problems })}
            </span>
            <span className="pill num">{plural('imp.rows', preview.total ?? ready + problems, { n: preview.total ?? ready + problems })}</span>
          </div>

          {preview.errors?.length > 0 && (
            <div className="mb-3">
              <h3>{t('imp.fixTitle')}</h3>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {preview.errors.map((err, i) => (
                  <li key={`${err.line}-${i}`} className="field-error">
                    <Icon name="warning" />
                    <span>
                      {t('imp.lineMsg', { line: err.line || '—', message: err.message })}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="smallish muted mb-0 mt-2">
                {t('imp.fixNote')}
              </p>
            </div>
          )}

          {preview.rows?.length === 0 ? (
            <EmptyState icon="fileCsv" title={t('imp.emptyTitle')}>
              {t('imp.emptyBody')}
            </EmptyState>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <caption className="visually-hidden">{t('imp.tableCaption')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('ui.line')}</th>
                    <th scope="col">{t('ui.date')}</th>
                    <th scope="col">{t('ui.type')}</th>
                    <th scope="col">{t('ui.category')}</th>
                    <th scope="col">{t('ui.amount')}</th>
                    <th scope="col">{t('ui.description')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(preview.rows || []).map((row) => (
                    <tr key={row.line}>
                      <td className="num">{row.line}</td>
                      <td className="num text-nowrap">{dayLabel(row.date)}</td>
                      <td>
                        <span className={row.type === 'income' ? 'pill pill-income' : 'pill pill-expense'}>
                          {row.type === 'income' ? t('txf.incomeChip') : t('txf.expenseChip')}
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
              {busy ? t('imp.importing') : t('imp.confirm')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={startOver} disabled={busy}>
              {t('imp.startOver')}
            </button>
          </div>

          {error && (
            <div className="field-error mt-3" role="alert">
              <Icon name="warning" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
