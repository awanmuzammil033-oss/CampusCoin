import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import Page from '../components/Page.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { money } from '../money.js';
import { useLocale } from '../locale.jsx';
import { dayLabel, uiLang } from '../dates.js';

const ACTIONS = {
  create: { icon: 'plus', label: 'hist.created' },
  update: { icon: 'pencil', label: 'hist.edited' },
  delete: { icon: 'trash', label: 'hist.deleted' },
  restore: { icon: 'repeat', label: 'hist.restored' },
};

// Field labels come from the shared table vocabulary.
const FIELD_KEYS = { amount: 'ui.amount', category: 'ui.category', description: 'ui.description', date: 'ui.date', type: 'ui.type' };

// Only these fields can change — everything else about an entry is fixed.
const FIELDS = ['amount', 'category', 'description', 'date', 'type'];

/** Read one field out of a before/after snapshot, the way a person would. */
function showValue(field, snapshot, names, t) {
  const value = snapshot?.[field];
  if (value === undefined || value === null || value === '') return '—';
  if (field === 'amount') return money(value);
  if (field === 'date') return dayLabel(value);
  if (field === 'type') return value === 'income' ? t('ui.income') : t('ui.expense');
  if (field === 'category') {
    return snapshot.categoryName || names[String(value)] || t('hist.categoryShort', { id: String(value).slice(-4) });
  }
  return String(value);
}

/**
 * Full audit trail (TXN-4): one row per action, showing only the fields
 * that actually changed, with the old value struck through.
 */
export default function TransactionHistory() {
  const { t } = useLocale();
  const { id } = useParams();
  const { push } = useToast();
  const [rows, setRows] = useState(null);
  const [names, setNames] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;

    api
      .get(`/api/transactions/${id}/history`)
      .then((data) => alive && setRows(data.rows || []))
      .catch((err) => {
        if (!alive) return;
        setError(err.message);
        push(err.message, 'error');
      });

    // History stores the category id; the names make the "before" column readable.
    api
      .get('/api/categories')
      .then((d) => {
        if (!alive) return;
        const map = {};
        [...(d.income || []), ...(d.expense || [])].forEach((c) => {
          map[c.id] = c.name;
        });
        setNames(map);
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [id, push]);

  return (
    <Page
      trail={[
        { label: t('nav.transactions'), to: '/transactions' },
        { label: t('hist.entryHistory') },
      ]}
      title={t('hist.entryHistory')}
      subtitle={t('hist.subtitle')}
      actions={
        <Link className="btn btn-ghost" to="/transactions">
          <Icon name="arrowLeft" /> {t('tx.backPlain')}
        </Link>
      }
    >
      {error && (
        <div className="field-error mb-3" role="alert">
          <Icon name="warning" />
          <span>{error}</span>
        </div>
      )}

      {!rows && !error && (
        <div className="card" role="status">
          <div className="skeleton" style={{ height: 70, marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 70, marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 70 }} />
          <p className="smallish muted mb-0 mt-3">{t('hist.loading')}</p>
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="card">
          <EmptyState icon="history" title={t('hist.emptyTitle')} action={
            <Link className="btn btn-secondary mt-2" to="/transactions">
              {t('tx.backPlain')}
            </Link>
          }>
            {t('hist.emptyBody')}
          </EmptyState>
        </div>
      )}

      {rows && rows.length > 0 && (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {rows.map((row) => {
            const action = ACTIONS[row.action] || { icon: 'info', label: row.action };
            const before = row.before || null;
            const after = row.after || null;
            const changed = FIELDS.filter((field) => String(before?.[field]) !== String(after?.[field]));

            return (
              <li key={row.id} className="card mb-3">
                <div className="d-flex align-items-center gap-3">
                  <span className="txn-ico">
                    <Icon name={action.icon} />
                  </span>
                  <div>
                    <strong>{t(action.label)}</strong>{' '}
                    <span className="smallish muted">
                      {new Date(row.changedAt).toLocaleString(uiLang(), {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>

                {changed.length === 0 ? (
                  <p className="smallish muted mb-0 mt-2">{t('hist.nothingChanged')}</p>
                ) : (
                  <div className="d-grid gap-1 mt-3">
                    {changed.map((field) => (
                      <div key={field} className="d-flex gap-2 align-items-baseline flex-wrap smallish">
                        <span className="muted" style={{ minWidth: 96 }}>
                          {t(FIELD_KEYS[field])}
                        </span>
                        <s className="muted">{showValue(field, before, names, t)}</s>
                        <Icon name="arrowRight" />
                        <strong>{showValue(field, after, names, t)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Page>
  );
}
