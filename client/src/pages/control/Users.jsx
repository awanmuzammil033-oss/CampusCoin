import { useEffect, useRef, useState } from 'react';

import Page from '../../components/Page.jsx';
import FormField from '../../components/FormField.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Icon from '../../components/Icon.jsx';
import Pagination from '../../components/Pagination.jsx';
import { api, qs } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useLocale } from '../../locale.jsx';
import { uiLang } from '../../dates.js';

function dayLabel(value) {
  if (!value) return '—';
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return new Date(y, m - 1, d).toLocaleDateString(uiLang(), { day: '2-digit', month: 'short', year: 'numeric' });
}

function readRows(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.rows || payload?.users || [];
}

/**
 * ADM-3/5: account administration only. Entries are never shown here — the
 * table carries names, statuses and dates, nothing a student typed.
 */
export default function ControlUsers() {
  const { user } = useAuth();
  const { push } = useToast();
  const { t } = useLocale();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState({ q: '', page: 1 });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [sendingTo, setSendingTo] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const firstRender = useRef(true);

  // Debounced search: type freely, one request after 300ms of quiet.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return undefined;
    }
    const timer = setTimeout(() => {
      setQuery((q) => (q.q === search.trim() ? q : { q: search.trim(), page: 1 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let alive = true;
    api
      .get(`/api/control/users${qs(query)}`)
      .then((payload) => {
        if (!alive) return;
        setData(payload);
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
  }, [query, reloadKey, push]);

  async function toggleDisabled(row) {
    const enabling = row.isActive === false;
    setBusyId(row.id);
    try {
      await api.post(`/api/control/users/${row.id}/${enabling ? 'enable' : 'disable'}`);
      push(enabling ? t('ctl.canSignIn', { email: row.email }) : t('ctl.hasBeenDisabled', { email: row.email }));
      setReloadKey((k) => k + 1);
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function sendReset(row) {
    setSendingTo(row.id);
    try {
      await api.post(`/api/control/users/${row.id}/reset`);
      push(t('ctl.resetSent', { email: row.email }));
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setSendingTo(null);
    }
  }

  const rows = data ? readRows(data) : [];
  const pagination = data?.pagination || { page: query.page, pages: 1 };
  const searched = Boolean(query.q);

  return (
    <Page
      trail={[{ label: t('ctl.trail'), to: '/control' }, { label: t('ctl.navUsers') }]}
      title={t('ctl.navUsers')}
      subtitle={t('ctl.usersSubtitle')}
    >
      <div className="card mb-3">
        <div style={{ maxWidth: 380 }}>
          <FormField label={t('ctl.userSearch')} htmlFor="control-user-search">
            {(a) => (
              <input
                id="control-user-search"
                type="search"
                className="input"
                placeholder={t('ctl.userSearchPh')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                {...a}
              />
            )}
          </FormField>
        </div>
      </div>

      {error && (
        <div className="field-error mb-3" role="alert">
          <span><Icon name="warning" /></span>
          <span>{error}</span>
        </div>
      )}

      {!data && !error && (
        <div className="card" role="status">
          <div className="skeleton" style={{ height: 44, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 44, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 44 }} />
          <p className="smallish muted mb-0 mt-3">{t('ctl.loadingAccounts')}</p>
        </div>
      )}

      {data && rows.length === 0 && (
        <div className="card">
          <EmptyState
            icon="users"
            title={searched ? t('ctl.noMatch') : t('ctl.noAccounts')}
            action={
              searched ? (
                <button type="button" className="btn btn-secondary mt-2" onClick={() => setSearch('')}>
                  {t('ctl.clearSearch')}
                </button>
              ) : undefined
            }
          >
            {searched ? t('ctl.tryPart') : t('ctl.registeredHere')}
          </EmptyState>
        </div>
      )}

      {data && rows.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-scroll">
            <table className="table">
              <caption className="visually-hidden">{t('ctl.accountsCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('ui.name')}</th>
                  <th scope="col">{t('ui.email')}</th>
                  <th scope="col">{t('ui.status')}</th>
                  <th scope="col">{t('ctl.joined')}</th>
                  <th scope="col">{t('ui.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isMe = user?.id && row.id === user.id;
                  const active = row.isActive !== false;
                  return (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.name}</strong>
                        {isMe && <span className="pill" style={{ marginLeft: 8 }}>{t('ctl.you')}</span>}
                      </td>
                      <td>{row.email}</td>
                      <td>{active ? <span className="pill pill-income">{t('ctl.active')}</span> : <span className="pill">{t('ctl.disabled')}</span>}</td>
                      <td className="num">{dayLabel(row.createdAt || row.joinedAt)}</td>
                      <td>
                        <div className="d-flex gap-2 flex-wrap">
                          <button
                            type="button"
                            className={`btn btn-sm ${active ? 'btn-danger-outline' : 'btn-secondary'}`}
                            disabled={busyId === row.id || isMe}
                            title={isMe ? t('ctl.noDisableSelf') : undefined}
                            onClick={() => toggleDisabled(row)}
                          >
                            {busyId === row.id && <span className="spinner" aria-hidden="true" />}
                            {active ? t('ctl.disable') : t('ctl.enable')}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={sendingTo === row.id || !active}
                            onClick={() => sendReset(row)}
                            aria-label={t('ctl.sendResetAria', { email: row.email })}
                          >
                            {sendingTo === row.id && <span className="spinner" aria-hidden="true" />}
                            {sendingTo === row.id ? t('ui.sending') : t('auth.sendResetLink')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && (
        <Pagination
          page={pagination.page || 1}
          pages={pagination.pages || 1}
          onPage={(p) => setQuery((q) => ({ ...q, page: p }))}
        />
      )}

      <p className="smallish muted mt-3 mb-0">
        <span> <Icon name="info" /></span> {t('ctl.usersPrivacy')}
      </p>
    </Page>
  );
}
