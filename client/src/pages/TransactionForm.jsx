import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import Page from '../components/Page.jsx';
import FormField from '../components/FormField.jsx';
import { api, qs } from '../api.js';
import { useToast } from '../components/Toast.jsx';

const ICONS = {
  wallet: '👛', cup: '☕', bus: '🚌', book: '📚', gift: '🎁', film: '🎞️',
  play: '🎮', house: '🏠', dots: '⋯', award: '🏆', briefcase: '💼', 'plus-circle': '➕',
};
function glyph(name) {
  return ICONS[name] || '🏷️';
}

/** Local calendar day, so "today" never lands on yesterday after midnight UTC. */
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * One screen for both quick-add (TXN-1) and edit (TXN-4).
 * The description can offer a category, but the pick is always the person's
 * to make — the suggestion is preselected only until they choose something else.
 */
export default function TransactionForm() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { push } = useToast();
  const creating = !id;

  const [form, setForm] = useState({
    amount: '',
    description: '',
    type: searchParams.get('type') === 'income' ? 'income' : 'expense',
    categoryId: '',
    date: todayISO(),
    repeat: false,
    frequency: 'monthly',
  });
  const [categories, setCategories] = useState([]);
  const [suggestion, setSuggestion] = useState(null);
  const [override, setOverride] = useState(false); // the person picked a category themselves
  const [amountError, setAmountError] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!creating);
  const latestSuggestion = useRef(null);

  useEffect(() => {
    let alive = true;
    api
      .get('/api/categories')
      .then((d) => {
        if (alive) setCategories([...(d.income || []), ...(d.expense || [])]);
      })
      .catch(() => setFormError('Categories could not be loaded — refresh the page to pick one.'));

    if (!creating) {
      api
        .get(`/api/transactions/${id}`)
        .then(({ transaction }) => {
          if (!alive) return;
          setForm((f) => ({
            ...f,
            amount: String(transaction.amount),
            description: transaction.description || '',
            type: transaction.type,
            categoryId: transaction.category?.id || transaction.category || '',
            date: String(transaction.date || '').slice(0, 10),
          }));
          setOverride(true); // an existing entry never gets re-suggested over
        })
        .catch((err) => {
          if (alive) {
            setFormError(err.message);
            push(err.message, 'error');
          }
        })
        .finally(() => alive && setLoading(false));
    }

    return () => {
      alive = false;
    };
  }, [id, creating, push]);

  // Category suggestion while the description is being typed (rule-based,
  // labelled "Suggested"): debounced, advisory, and silent if unavailable.
  useEffect(() => {
    if (!creating) return undefined;
    const text = form.description.trim();
    if (text.length < 3) {
      setSuggestion(null);
      latestSuggestion.current = null;
      return undefined;
    }

    const timer = setTimeout(() => {
      api
        .get(`/api/suggest-category${qs({ q: text })}`)
        .then((data) => {
          const pick = data.category || data.suggestion || data;
          const categoryId = pick.id || pick.categoryId || pick._id;
          if (!categoryId) {
            setSuggestion(null);
            return;
          }
          const next = {
            id: categoryId,
            name: pick.name || 'this category',
            type: pick.type || null,
            source: data.source || pick.source || 'history',
          };
          latestSuggestion.current = next;
          setSuggestion(next);
        })
        .catch(() => {
          /* the helper is optional — typing must never wait on it */
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [form.description, creating]);

  // Preselect a fresh suggestion while the choice is still untouched.
  useEffect(() => {
    if (!suggestion || override || !creating) return;
    setForm((f) => {
      const match = categories.find((c) => c.id === suggestion.id);
      if (!match) return f;
      return {
        ...f,
        categoryId: match.id,
        type: suggestion.type || f.type,
      };
    });
  }, [suggestion, override, categories, creating]);

  const options = categories.filter((c) => c.type === form.type && c.isActive !== false);

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function pickCategory(categoryId) {
    setOverride(true);
    setField('categoryId', categoryId);
  }

  function switchType(type) {
    setOverride(true);
    setForm((f) => ({ ...f, type, categoryId: '' }));
  }

  /** The "(change)" affordance: hand control back to the person. */
  function changeSuggestion() {
    setOverride(true);
    document.getElementById('category-select')?.focus();
  }

  function resetForAnother() {
    setForm((f) => ({ ...f, amount: '', description: '', date: todayISO() }));
    setSuggestion(null);
    latestSuggestion.current = null;
    setOverride(false);
    document.getElementById('amount')?.focus();
  }

  async function save(event, addAnother) {
    event.preventDefault();
    setAmountError('');
    setFormError('');

    if (!form.amount || Number(form.amount) <= 0 || Number.isNaN(Number(form.amount))) {
      setAmountError('Amount must be more than 0.');
      return;
    }
    if (!form.categoryId) {
      setFormError('Please choose a category.');
      return;
    }

    setBusy(true);
    try {
      const payload = {
        amount: form.amount,
        type: form.type,
        categoryId: form.categoryId,
        description: form.description,
        date: form.date,
      };

      if (creating) {
        if (latestSuggestion.current) {
          payload.suggestedCategory = latestSuggestion.current.id;
          payload.suggestionSource = latestSuggestion.current.source;
        }
        await api.post('/api/transactions', payload);

        if (form.repeat) {
          await api.post('/api/recurring', {
            type: form.type,
            amount: form.amount,
            categoryId: form.categoryId,
            frequency: form.frequency,
            description: form.description,
            startDate: form.date,
          });
          push(`Will repeat ${form.frequency}ly.`);
        }

        push('Entry saved.');
        if (addAnother) resetForAnother();
        else navigate('/transactions');
      } else {
        await api.patch(`/api/transactions/${id}`, payload);
        push('Changes saved.');
        navigate('/transactions');
      }
    } catch (err) {
      if (/amount/i.test(err.message)) setAmountError(err.message);
      else setFormError(err.message);
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Page trail={[{ label: 'Transactions', to: '/transactions' }, { label: 'Loading…' }]} title="Entry">
        <div className="card" role="status">
          <div className="skeleton" style={{ height: 18, width: '30%', marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 44, marginBottom: 18 }} />
          <div className="skeleton" style={{ height: 44, marginBottom: 18 }} />
          <div className="skeleton" style={{ height: 44 }} />
          <p className="smallish muted mb-0 mt-3">Loading the entry…</p>
        </div>
      </Page>
    );
  }

  return (
    <Page
      trail={[
        { label: 'Transactions', to: '/transactions' },
        { label: creating ? 'New entry' : 'Edit entry' },
      ]}
      title={creating ? (form.type === 'income' ? 'Add income' : 'Add expense') : 'Edit entry'}
      subtitle={creating ? 'Five fields, ten seconds — the rest is optional.' : 'Changes are kept in the entry history.'}
    >
      <div className="card" style={{ maxWidth: 640 }}>
        <form onSubmit={(e) => save(e, false)} noValidate>
          {formError && (
            <div className="field-error mb-3" role="alert">
              <span aria-hidden="true">⚠</span>
              <span>{formError}</span>
            </div>
          )}

          <FormField label="Amount" htmlFor="amount" error={amountError}>
            <div className="amount-wrap">
              <span className="amount-prefix" aria-hidden="true">$</span>
              <input
                id="amount"
                className={`input ${amountError ? 'input-error' : ''}`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setField('amount', e.target.value)}
                aria-invalid={Boolean(amountError)}
                aria-describedby={amountError ? 'amount-error' : undefined}
              />
            </div>
          </FormField>

          <FormField label="Description" htmlFor="description" help="What was it for? A few words are plenty.">
            {(a) => (
              <input
                id="description"
                className="input"
                type="text"
                maxLength={255}
                autoComplete="off"
                placeholder="e.g. campus cafe lunch"
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                {...a}
              />
            )}
          </FormField>

          {suggestion && (
            <div className="d-flex align-items-center gap-2 flex-wrap" style={{ marginTop: -8, marginBottom: 14 }} role="status">
              <span className="pill pill-suggest">✨ Suggested: {suggestion.name}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={changeSuggestion}
                aria-label={`Change the suggested category ${suggestion.name}`}
              >
                (change)
              </button>
            </div>
          )}

          <div className="field">
            <span
              id="type-label"
              style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 6 }}
            >
              Type
            </span>
            <div className="chip-grid" role="group" aria-labelledby="type-label">
              <button
                type="button"
                className="chip"
                aria-pressed={form.type === 'income'}
                onClick={() => switchType('income')}
              >
                + Income
              </button>
              <button
                type="button"
                className="chip"
                aria-pressed={form.type === 'expense'}
                onClick={() => switchType('expense')}
              >
                − Expense
              </button>
            </div>
          </div>

          <div className="field">
            <span
              id="category-label"
              style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 6 }}
            >
              Category
            </span>
            <div className="chip-grid" role="group" aria-labelledby="category-label">
              {options.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="chip"
                  aria-pressed={form.categoryId === c.id}
                  onClick={() => pickCategory(c.id)}
                >
                  <span aria-hidden="true">{glyph(c.icon)}</span>
                  {c.name}
                </button>
              ))}
              {options.length === 0 && <span className="muted smallish">No categories for this type yet.</span>}
            </div>
          </div>

          <FormField label="…or pick from list" htmlFor="category-select">
            {(a) => (
              <select
                id="category-select"
                className="input"
                value={form.categoryId}
                onChange={(e) => pickCategory(e.target.value)}
                {...a}
              >
                <option value="">Choose a category</option>
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <FormField label="Date" htmlFor="date">
            {(a) => (
              <input
                id="date"
                type="date"
                className="input"
                value={form.date}
                onChange={(e) => setField('date', e.target.value)}
                {...a}
              />
            )}
          </FormField>

          {creating && (
            <>
              <FormField label="Repeat this entry" htmlFor="repeat">
                {(a) => (
                  <input
                    id="repeat"
                    type="checkbox"
                    checked={form.repeat}
                    onChange={(e) => setField('repeat', e.target.checked)}
                    {...a}
                  />
                )}
              </FormField>

              {form.repeat && (
                <FormField
                  label="How often"
                  htmlFor="frequency"
                  help="Starting from the date above — the next occurrence fills itself in."
                >
                  {(a) => (
                    <select
                      id="frequency"
                      className="input"
                      value={form.frequency}
                      onChange={(e) => setField('frequency', e.target.value)}
                      {...a}
                    >
                      <option value="weekly">Every week</option>
                      <option value="monthly">Every month</option>
                    </select>
                  )}
                </FormField>
              )}
            </>
          )}

          <div className="d-flex gap-2 flex-wrap mt-3">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy && <span className="spinner" aria-hidden="true" />}
              {busy ? 'Saving…' : 'Save'}
            </button>
            {creating && (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={(e) => save(e, true)}>
                Save &amp; add another
              </button>
            )}
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => navigate(-1)}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </Page>
  );
}
