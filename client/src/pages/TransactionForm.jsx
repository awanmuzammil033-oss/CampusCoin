import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import Page from '../components/Page.jsx';
import FormField from '../components/FormField.jsx';
import Icon from '../components/Icon.jsx';
import CategoryIcon from '../components/CategoryIcon.jsx';
import { api, qs } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { useLocale } from '../locale.jsx';
import { ledgerCurrencySymbol } from '../money.js';

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
  const { t } = useLocale();
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
      .catch(() => setFormError(t('txf.loadError')));

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
            name: pick.name || t('txf.thisCategory'),
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
      setAmountError(t('txf.amountMore'));
      return;
    }
    if (!form.categoryId) {
      setFormError(t('txf.chooseCategory'));
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
          push(form.frequency === 'weekly' ? t('txf.willRepeatWeekly') : t('txf.willRepeatMonthly'));
        }

        push(t('txf.saved'));
        if (addAnother) resetForAnother();
        else navigate('/transactions');
      } else {
        await api.patch(`/api/transactions/${id}`, payload);
        push(t('txf.changesSaved'));
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
      <Page trail={[{ label: t('nav.transactions'), to: '/transactions' }, { label: t('ui.loading') }]} title={t('txf.entryTitle')}>
        <div className="card" role="status">
          <div className="skeleton" style={{ height: 18, width: '30%', marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 44, marginBottom: 18 }} />
          <div className="skeleton" style={{ height: 44, marginBottom: 18 }} />
          <div className="skeleton" style={{ height: 44 }} />
          <p className="smallish muted mb-0 mt-3">{t('txf.loading')}</p>
        </div>
      </Page>
    );
  }

  return (
    <Page
      trail={[
        { label: t('nav.transactions'), to: '/transactions' },
        { label: creating ? t('txf.newEntry') : t('txf.editEntry') },
      ]}
      title={creating ? (form.type === 'income' ? t('txf.addIncome') : t('txf.addExpense')) : t('txf.editEntry')}
      subtitle={creating ? t('txf.subtitleNew') : t('txf.subtitleEdit')}
    >
      <div className="card" style={{ maxWidth: 640 }}>
        <form onSubmit={(e) => save(e, false)} noValidate>
          {formError && (
            <div className="field-error mb-3" role="alert">
              <Icon name="warning" />
              <span>{formError}</span>
            </div>
          )}

          <FormField label={t('ui.amount')} htmlFor="amount" error={amountError}>
            <div className="amount-wrap">
              <span className="amount-prefix" aria-hidden="true">{ledgerCurrencySymbol()}</span>
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

          <FormField label={t('ui.description')} htmlFor="description" help={t('txf.descHelp')}>
            {(a) => (
              <input
                id="description"
                className="input"
                type="text"
                maxLength={255}
                autoComplete="off"
                placeholder={t('txf.descPlaceholder')}
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                {...a}
              />
            )}
          </FormField>

          {suggestion && (
            <div className="d-flex align-items-center gap-2 flex-wrap" style={{ marginTop: -8, marginBottom: 14 }} role="status">
              <span className="pill pill-suggest"><Icon name="sparkles" /> {t('txf.suggested', { name: suggestion.name })}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={changeSuggestion}
                aria-label={t('txf.suggestedAria', { name: suggestion.name })}
              >
                {t('txf.change')}
              </button>
            </div>
          )}

          <div className="field">
            <span
              id="type-label"
              style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 6 }}
            >
              {t('ui.type')}
            </span>
            <div className="chip-grid" role="group" aria-labelledby="type-label">
              <button
                type="button"
                className="chip"
                aria-pressed={form.type === 'income'}
                onClick={() => switchType('income')}
              >
                {t('txf.incomeChip')}
              </button>
              <button
                type="button"
                className="chip"
                aria-pressed={form.type === 'expense'}
                onClick={() => switchType('expense')}
              >
                {t('txf.expenseChip')}
              </button>
            </div>
          </div>

          <div className="field">
            <span
              id="category-label"
              style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 6 }}
            >
              {t('ui.category')}
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
                  <CategoryIcon name={c.icon} /> {c.name}
                </button>
              ))}
              {options.length === 0 && <span className="muted smallish">{t('txf.noCats')}</span>}
            </div>
          </div>

          <FormField label={t('txf.orPick')} htmlFor="category-select">
            {(a) => (
              <select
                id="category-select"
                className="input"
                value={form.categoryId}
                onChange={(e) => pickCategory(e.target.value)}
                {...a}
              >
                <option value="">{t('txf.chooseFromList')}</option>
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <FormField label={t('ui.date')} htmlFor="date">
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
              <FormField label={t('txf.repeat')} htmlFor="repeat">
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
                  label={t('txf.howOften')}
                  htmlFor="frequency"
                  help={t('txf.repeatHelp')}
                >
                  {(a) => (
                    <select
                      id="frequency"
                      className="input"
                      value={form.frequency}
                      onChange={(e) => setField('frequency', e.target.value)}
                      {...a}
                    >
                      <option value="weekly">{t('txf.everyWeek')}</option>
                      <option value="monthly">{t('txf.everyMonth')}</option>
                    </select>
                  )}
                </FormField>
              )}
            </>
          )}

          <div className="d-flex gap-2 flex-wrap mt-3">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy && <span className="spinner" aria-hidden="true" />}
              {busy ? t('ui.saving') : t('ui.save')}
            </button>
            {creating && (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={(e) => save(e, true)}>
                {t('ui.saveAndAnother')}
              </button>
            )}
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => navigate(-1)}>
              {t('ui.cancel')}
            </button>
          </div>
        </form>
      </div>
    </Page>
  );
}
