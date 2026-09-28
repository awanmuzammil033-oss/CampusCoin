import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import Icon from '../components/Icon.jsx';
import { SummaryBody } from '../components/GuardianCard.jsx';
import { useLocale } from '../locale.jsx';
import { api } from '../api.js';

/**
 * What the guardian actually sees (NEW-8) — the page a shared link opens.
 *
 * Read-only, deliberately so, and the absence is the design: there is no button
 * that changes anything, no link into the app, no sign-in, no "make your own
 * budget". This is somebody else's money and it is none of this reader's
 * business. The one thing the page does is show three totals for one month and
 * say, in two lines, that it is a summary rather than the whole picture.
 *
 * It therefore does NOT use PublicShell or SmartShell. Both carry the app's
 * header, and the header's business ends in a "Sign in" and a "Get started"
 * button — which is a sign-up prompt on a page about somebody else's spending.
 * The frame below is one card, the brand mark, and a line at the foot.
 *
 * The rendering is `SummaryBody`, the very component the student's preview uses,
 * so the guardian's page cannot show something the student did not agree to.
 */
export default function GuardianViewPage() {
  const { token } = useParams();
  const { t } = useLocale();
  const [summary, setSummary] = useState(null);
  const [problem, setProblem] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setProblem(null);

    api
      .get(`/api/guardian/summary/${encodeURIComponent(token || '')}`)
      .then((res) => {
        if (live) setSummary(res.summary);
      })
      .catch((err) => {
        if (!live) return;
        // A stranger's link, an expired one, a revoked one and a mistyped one
        // are all the same 404 with the same plain answer, so there is nothing
        // to branch on beyond "it did not open" — the server's own message is
        // the heading, which is why it cannot drift from what the API says.
        setProblem({ heading: err.status === 404 ? t(err.message) : t('guard.view.errorTitle'), body: t('guard.view.goneBody') });
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
  }, [token, t]);

  return (
    <div className="cc-guard-page">
      <div className="cc-guard-shell">
        <div className="cc-guard-brand">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span>{t('app.name')}</span>
        </div>

        {loading && (
          <p className="smallish muted" role="status">
            <span className="spinner" aria-hidden="true" /> {t('guard.view.loading')}
          </p>
        )}

        {!loading && problem && (
          <div className="cc-guard-gone">
            <h1>
              <Icon name="info" size={22} /> {problem.heading}
            </h1>
            <p className="smallish muted mb-0">{problem.body}</p>
          </div>
        )}

        {!loading && summary && <SummaryBody summary={summary} />}

        {!loading && summary && (
          <p className="cc-guard-footer smallish">
            <Icon name="lock" size={14} /> {t('guard.view.readOnly')}
          </p>
        )}
      </div>
    </div>
  );
}
