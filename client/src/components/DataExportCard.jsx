import { useCallback, useEffect, useRef, useState } from 'react';

import Icon from './Icon.jsx';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import { useLocale } from '../locale.jsx';

/**
 * The four files in every archive. They are file NAMES, not words: they are not
 * translated, because a translated "transactions.csv" is a file nobody can open
 * and a spreadsheet does not care what language the person looking at it speaks.
 */
const FILES = ['transactions.csv', 'categories.csv', 'budgets.csv', 'profile.json'];

/** How often the card asks the server how the job is getting on. */
const POLL_MS = 1200;
/** A safety stop, so a job that never leaves `running` cannot poll forever. */
const MAX_POLLS = 90;

/** The server sends a machine code; the wording is the dictionary's job. */
const ERROR_KEYS = {
  build_failed: 'export.errorBuildFailed',
  expired: 'export.errorExpired',
  interrupted: 'export.errorInterrupted',
};

/**
 * "Download my data" (NEW-1).
 *
 * THE GENERATION IS NOT INLINE, so this card never sits on one long spinner.
 * Pressing the button starts a job and the card goes on drawing itself; a tick
 * later it asks the server how the job is doing and the screen says queued,
 * packing, ready or failed. The first version of this feature would have awaited
 * the whole build - which is fine for a demo with nine transactions and is
 * exactly what a student with four years of entries concludes is broken after
 * thirty seconds.
 *
 * A DOWNLOAD LINK IS SPENT THE MOMENT IT IS USED. The card therefore treats the
 * link as gone the instant it is clicked and offers another one, rather than
 * leaving a button that quietly 404s the second time. The link is the only thing
 * protecting the file, so the card also says what it is worth: one use, this
 * account only, and a fixed number of hours.
 */
export default function DataExportCard() {
  const { t, language } = useLocale();
  const { push } = useToast();

  const [job, setJob] = useState(null);
  const [link, setLink] = useState(null);
  const [linkHours, setLinkHours] = useState(null);
  const [linkSpent, setLinkSpent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const polls = useRef(0);

  const day = useCallback(
    (value) => {
      const d = value ? new Date(value) : null;
      if (!d || Number.isNaN(d.getTime())) return '';
      return d.toLocaleDateString(language || 'en', { day: 'numeric', month: 'short', year: 'numeric' });
    },
    [language]
  );

  const adopt = useCallback((data) => {
    polls.current = 0;
    setJob(data.job);
    setLink(data.download?.url || null);
    setLinkHours(data.download?.expiresInHours ?? null);
    setLinkSpent(false);
  }, []);

  // On mount: the newest job this account has, so a page reload does not look
  // like a fresh account with no history.
  useEffect(() => {
    let alive = true;
    api
      .get('/api/export')
      .then((data) => {
        if (!alive) return;
        const newest = data.jobs?.[0] || null;
        setJob(newest);
        // A link is only ever handed out by a status read, so a reload has to
        // ask for one - a link held in component state would be a spent one.
        if (newest?.status === 'ready') {
          api
            .get(`/api/export/${newest.id}`)
            .then((full) => alive && adopt(full))
            .catch(() => {});
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [adopt]);

  // The poll. It lives in an effect rather than inside the click handler, so a
  // card the student navigates away from stops asking on its own.
  useEffect(() => {
    if (!job || (job.status !== 'queued' && job.status !== 'running')) return undefined;
    if (polls.current >= MAX_POLLS) return undefined;
    const timer = setTimeout(() => {
      polls.current += 1;
      api
        .get(`/api/export/${job.id}`)
        .then(adopt)
        .catch((err) => setError(err.message));
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [job, adopt]);

  async function start() {
    setBusy(true);
    setError('');
    try {
      adopt(await api.post('/api/export', {}));
    } catch (err) {
      setError(err.message);
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function newLink() {
    if (!job?.id) return;
    setBusy(true);
    setError('');
    try {
      adopt(await api.get(`/api/export/${job.id}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const working = busy || job?.status === 'queued' || job?.status === 'running';
  const statusKey = job?.status === 'failed' ? ERROR_KEYS[job.errorCode] : null;

  return (
    <section className="card cc-export-card" aria-labelledby="cc-export-title">
      <h3 className="cc-export-title" id="cc-export-title">
        <Icon name="download" /> {t('export.title')}
      </h3>

      <p className="cc-export-body">{t('export.body')}</p>

      <div className="cc-export-actions">
        <button type="button" className="btn btn-secondary" onClick={start} disabled={working}>
          {working && <span className="spinner" aria-hidden="true" />}
          {busy ? t('export.starting') : t('export.start')}
        </button>
        {job && <span className="cc-export-last">{t('export.lastRun', { date: day(job.requestedAt) })}</span>}
      </div>

      {job ? (
        <p className="cc-export-status" role="status" aria-live="polite">
          {job.status === 'queued' && t('export.queued')}
          {job.status === 'running' && t('export.running')}
          {job.status === 'ready' &&
            `${t('export.ready')} ${t('export.readyBody', {
              count: job.counts.transactions,
              deleted: job.counts.deleted,
            })}`}
          {job.status === 'failed' && (
            <>
              <Icon name="warning" size={16} /> {t(statusKey || 'export.failed')}
            </>
          )}
        </p>
      ) : (
        <p className="cc-export-status">{t('export.neverRun')}</p>
      )}

      {job?.status === 'ready' && (
        <div className="cc-export-download">
          {link && !linkSpent ? (
            <a
              className="btn btn-primary cc-export-link"
              href={link}
              onClick={() => setLinkSpent(true)}
              download
              rel="noreferrer"
            >
              <Icon name="download" /> {t('export.download')}
            </a>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={newLink} disabled={busy}>
              {t('export.newLink')}
            </button>
          )}
          <span className="cc-export-note">
            {linkSpent ? t('export.linkSpent') : t('export.expires', { hours: linkHours ?? 24 })}
          </span>
        </div>
      )}

      {job?.status === 'ready' && job.currency && (
        <p className="cc-export-note">{t('export.currencyNote', { code: job.currency })}</p>
      )}

      <div className="cc-export-files">
        <span className="cc-export-filesTitle">{t('export.files')}</span>
        <ul className="cc-export-filesList">
          {FILES.map((name) => (
            <li key={name} className="cc-export-file">
              <code>{name}</code>
            </li>
          ))}
        </ul>
        <p className="cc-export-note">{t('export.filesNote')}</p>
        <p className="cc-export-note">{t('export.oneTime')}</p>
      </div>

      {error && (
        <p className="cc-export-error" role="alert">
          <Icon name="warning" size={16} />
          <span>{error}</span>
        </p>
      )}
    </section>
  );
}
