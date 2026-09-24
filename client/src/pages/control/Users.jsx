import { useEffect, useRef, useState } from 'react';

import Page from '../../components/Page.jsx';
import FormField from '../../components/FormField.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Pagination from '../../components/Pagination.jsx';
import { api, qs } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useToast } from '../../components/Toast.jsx';

function dayLabel(value) {
  if (!value) return '—';
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
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
      push(enabling ? `${row.email} can sign in again.` : `${row.email} has been disabled.`);
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
      push(`Reset link sent to ${row.email}.`);
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
      trail={[{ label: 'Control', to: '/control' }, { label: 'Users' }]}
      title="Users"
      subtitle="Accounts only — never the entries behind them."
    >
      <div className="card mb-3">
        <div style={{ maxWidth: 380 }}>
          <FormField label="Search by name or email" htmlFor="control-user-search">
            {(a) => (
              <input
                id="control-user-search"
                type="search"
                className="input"
                placeholder="e.g. aisha or @campus.edu"
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
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </div>
      )}

      {!data && !error && (
        <div className="card" role="status">
          <div className="skeleton" style={{ height: 44, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 44, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 44 }} />
          <p className="smallish muted mb-0 mt-3">Loading accounts…</p>
        </div>
      )}

      {data && rows.length === 0 && (
        <div className="card">
          <EmptyState
            icon="👥"
            title={searched ? 'No accounts match that search' : 'No accounts yet'}
            action={
              searched ? (
                <button type="button" className="btn btn-secondary mt-2" onClick={() => setSearch('')}>
                  Clear search
                </button>
              ) : undefined
            }
          >
            {searched ? 'Try part of a name or the domain part of an address.' : 'Registered students appear here.'}
          </EmptyState>
        </div>
      )}

      {data && rows.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-scroll">
            <table className="table">
              <caption className="visually-hidden">Student accounts</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Status</th>
                  <th scope="col">Joined</th>
                  <th scope="col">Actions</th>
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
                        {isMe && <span className="pill" style={{ marginLeft: 8 }}>You</span>}
                      </td>
                      <td>{row.email}</td>
                      <td>{active ? <span className="pill pill-income">Active</span> : <span className="pill">Disabled</span>}</td>
                      <td className="num">{dayLabel(row.createdAt || row.joinedAt)}</td>
                      <td>
                        <div className="d-flex gap-2 flex-wrap">
                          <button
                            type="button"
                            className={`btn btn-sm ${active ? 'btn-danger-outline' : 'btn-secondary'}`}
                            disabled={busyId === row.id || isMe}
                            title={isMe ? 'You cannot disable your own account' : undefined}
                            onClick={() => toggleDisabled(row)}
                          >
                            {busyId === row.id && <span className="spinner" aria-hidden="true" />}
                            {active ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={sendingTo === row.id || !active}
                            onClick={() => sendReset(row)}
                            aria-label={`Send a password reset link to ${row.email}`}
                          >
                            {sendingTo === row.id && <span className="spinner" aria-hidden="true" />}
                            {sendingTo === row.id ? 'Sending…' : 'Send reset link'}
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
        <span aria-hidden="true"> ℹ️</span> No transaction details are shown here — student entries stay private
        to each account.
      </p>
    </Page>
  );
}
