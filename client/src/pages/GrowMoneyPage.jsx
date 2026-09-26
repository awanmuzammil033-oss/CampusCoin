import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Page from '../components/Page.jsx';
import Icon from '../components/Icon.jsx';
import { api } from '../api.js';
import { money } from '../money.js';
import { useLocale } from '../locale.jsx';
import { uiLang } from '../dates.js';

/**
 * Grow your money — the investment-basics library (ADV-4).
 *
 * What a savings account, a fixed deposit and a mutual fund are, what each one
 * costs you in trade-offs, and which of them sits at which risk level.
 *
 * Three rules keep this page on the right side of its brief, and all three are
 * enforced here rather than promised in a comment:
 *
 *  1. NO ADVICE, NOTHING PRODUCT-SPECIFIC. No fund is named, no ticker, no
 *     rate, no bank, no promise of a return. The copy is definitions and
 *     general principles only. Even the sentences the server picks live in the
 *     dictionaries — the API hands over a KEY and a number, never a
 *     recommendation (see services/growMoney.js).
 *  2. THE NOTICE IS NOT DISMISSIBLE. There is no close button on it and no
 *     "don't show again": the brief requires the page to say out loud that it
 *     is general information, so it says it at the top and again under the
 *     nudge, where the personal number is.
 *  3. COLOUR IS NEVER THE MESSAGE. Every risk chip prints the word as well as
 *     the colour, and the legend spells out what each level means (design.md
 *     §3). Read the page in greyscale and nothing is lost.
 *
 * Every visible string goes through t(); the only data out of the API is the
 * student's own surplus and a translation key.
 */

/**
 * The legend tones. `cls`/`style` are the second signal only — the chip always
 * carries the word next to the colour, and the meaning line sits underneath, so
 * nothing here depends on seeing a hue.
 */
const RISK_TONE = {
  low: { cls: 'pill pill-income', icon: 'shield' },
  medium: { cls: 'pill pill-suggest', icon: 'hourglass' },
  high: {
    cls: 'pill',
    style: { background: 'var(--cc-danger-soft)', color: 'var(--cc-danger)' },
    icon: 'warning',
  },
};

/** Nudge placeholders that are amounts: formatted in the display currency. */
const MONEY_VARS = new Set(['amount']);

/**
 * The four sentences the service can choose between. t() prints a key back
 * unchanged when a dictionary has no entry for it, so an unrecognised key would
 * put a raw key on screen; the service has exactly these four branches, which
 * makes this a guard against a half-finished deploy rather than a real branch.
 */
const NUDGE_KEYS = new Set([
  'grow.nudge.surplus',
  'grow.nudge.tight',
  'grow.nudge.noSurplus',
  'grow.nudge.nothingLogged',
]);

/**
 * The three concepts, in reading order from least to most risk. Every field is
 * a key or a route — there is no English in this table, so a translation is all
 * it takes to publish the page in fourteen languages.
 */
const CONCEPTS = [
  {
    id: 'savings',
    icon: 'bank',
    risk: 'low',
    titleKey: 'grow.concept.savings.title',
    whatKey: 'grow.concept.savings.what',
    pointKeys: [
      'grow.concept.savings.point1',
      'grow.concept.savings.point2',
      'grow.concept.savings.point3',
      'grow.concept.savings.point4',
    ],
    lockInKey: 'grow.concept.savings.lockIn',
    readMoreKey: 'grow.readMoreRates',
    readMore: '/savings-options',
  },
  {
    id: 'fd',
    icon: 'lock',
    risk: 'low',
    titleKey: 'grow.concept.fd.title',
    whatKey: 'grow.concept.fd.what',
    pointKeys: [
      'grow.concept.fd.point1',
      'grow.concept.fd.point2',
      'grow.concept.fd.point3',
      'grow.concept.fd.point4',
    ],
    lockInKey: 'grow.concept.fd.lockIn',
    readMoreKey: 'grow.readMoreRates',
    readMore: '/savings-options',
  },
  {
    id: 'fund',
    icon: 'chartUp',
    risk: 'high',
    titleKey: 'grow.concept.fund.title',
    whatKey: 'grow.concept.fund.what',
    pointKeys: [
      'grow.concept.fund.point1',
      'grow.concept.fund.point2',
      'grow.concept.fund.point3',
      'grow.concept.fund.point4',
    ],
    lockInKey: 'grow.concept.fund.lockIn',
    readMoreKey: 'grow.concept.fund.readMore',
    readMore: null,
  },
];

/** The legend order, low to high, mirroring RISK_LEVELS in the service. */
const LEGEND = ['low', 'medium', 'high'];

/** "September 2026" out of the server's YYYY-MM, in the interface language. */
function monthTitle(monthKey) {
  const [year, month] = String(monthKey || '').slice(0, 7).split('-').map(Number);
  if (!year || !month) return '';
  return new Date(year, month - 1, 1).toLocaleDateString(uiLang(), { month: 'long', year: 'numeric' });
}

/** A risk chip: the word is always on screen, the colour only repeats it. */
function RiskChip({ t, level }) {
  const tone = RISK_TONE[level] || RISK_TONE.low;
  return (
    <span className={tone.cls} style={tone.style}>
      <Icon name={tone.icon} size={13} /> {t(`grow.risk.${level}`)}
    </span>
  );
}

export default function GrowMoneyPage() {
  const { t } = useLocale();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .get('/api/grow-money')
      .then((payload) => {
        if (alive) {
          setData(payload);
          setError('');
        }
      })
      .catch((err) => {
        // The library below is a dictionary, not a payload — it stays readable
        // even when the one number cannot be fetched, so the failure is shown
        // inside the nudge panel instead of replacing the page.
        if (alive) setError(err.message);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Page trail={[{ label: t('grow.title') }]} title={t('grow.title')} subtitle={t('grow.subtitle')}>
      {/* the brief's own requirement, so it is fixed: no way to dismiss it */}
      <section
        className="card mb-3"
        style={{ borderInlineStart: '4px solid var(--cc-accent)' }}
        role="note"
        aria-label={t('grow.notice.title')}
      >
        <div className="card-title">
          <span>
            <Icon name="shield" /> {t('grow.notice.title')}
          </span>
          <span className="pill pill-suggest">
            <Icon name="info" size={13} /> {t('grow.notice.pill')}
          </span>
        </div>
        <p className="mb-2">{t('grow.notice.body')}</p>
        <ul className="smallish muted mb-0" style={{ paddingInlineStart: 18 }}>
          <li>{t('grow.notice.line1')}</li>
          <li>{t('grow.notice.line2')}</li>
          <li>{t('grow.notice.line3')}</li>
        </ul>
      </section>

      <div className="d-grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 330px), 1fr))' }}>
        <NudgePanel t={t} data={data} error={error} />
        <RiskLegend t={t} levels={data?.riskLevels} />
      </div>

      <section className="card mt-3">
        <div className="card-title">
          <span>
            <Icon name="book" /> {t('grow.concepts.title')}
          </span>
        </div>
        <p className="muted smallish mb-3">{t('grow.concepts.intro')}</p>
        <div className="d-grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' }}>
          {CONCEPTS.map((concept) => (
            <ConceptCard key={concept.id} t={t} concept={concept} />
          ))}
        </div>
      </section>

      <section className="card mt-3">
        <div className="card-title">
          <span>
            <Icon name="target" /> {t('grow.start.title')}
          </span>
        </div>
        <p className="muted smallish mb-3">{t('grow.start.intro')}</p>
        <ol className="d-grid gap-2 mb-0" style={{ paddingInlineStart: 20 }}>
          {['grow.start.step1', 'grow.start.step2', 'grow.start.step3', 'grow.start.step4'].map((key) => (
            <li key={key} className="smallish">
              {t(key)}
            </li>
          ))}
        </ol>
      </section>

      <section className="card mt-3" style={{ borderInlineStart: '4px solid var(--cc-danger)' }}>
        <div className="card-title">
          <span>
            <Icon name="ban" /> {t('grow.not.title')}
          </span>
        </div>
        <ul className="d-grid gap-2 mb-0" style={{ listStyle: 'none', margin: 0, padding: 0 }} role="list">
          {['grow.not.line1', 'grow.not.line2', 'grow.not.line3'].map((key) => (
            <li key={key} className="d-flex align-items-start gap-2 smallish">
              <Icon name="close" size={14} />
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card mt-3 mb-4">
        <div className="d-flex align-items-start gap-2 flex-wrap justify-content-between">
          <div className="flex-grow-1">
            <div className="card-title">
              <span>
                <Icon name="sparkles" /> {t('grow.more.title')}
              </span>
            </div>
            <p className="muted smallish mb-0">{t('grow.more.body')}</p>
          </div>
          <Link className="btn btn-secondary btn-sm" to="/side-income">
            <Icon name="arrowRight" size={15} /> {t('grow.more.cta')}
          </Link>
        </div>
      </section>
    </Page>
  );
}

/**
 * The nudge panel: the student's own month, the sentence the server chose, and
 * the line that hands the decision back to them.
 *
 * The sentence is looked up by the key in the payload with the numbers filled
 * in — the page never writes a recommendation of its own, and it never adds
 * money up: the figure printed here is exactly the one the service computed.
 */
function NudgePanel({ t, data, error }) {
  if (error) {
    return (
      <section className="card h-100">
        <div className="card-title">
          <span>
            <Icon name="warning" /> {t('grow.nudge.title')}
          </span>
        </div>
        <p className="smallish mb-2">{t('grow.nudge.unavailable')}</p>
        <p className="smallish muted mb-0">{t('grow.nudge.yourChoice')}</p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="card h-100" role="status">
        <div className="skeleton" style={{ height: 16, width: '45%', marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 40, width: '60%', marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 14, width: '80%' }} />
        <p className="smallish muted mb-0 mt-3">{t('grow.nudge.loading')}</p>
      </section>
    );
  }

  const amount = money(data.surplus);
  const known = NUDGE_KEYS.has(data.nudge?.key);
  // An unknown key falls back to the "your choice" line, which is true in every
  // case and needs no number — never to the key itself.
  const sentenceKey = known ? data.nudge.key : 'grow.nudge.yourChoice';
  const vars = Object.fromEntries(
    Object.entries(data.nudge?.vars || {}).map(([name, value]) => [name, MONEY_VARS.has(name) ? money(value) : value])
  );

  return (
    <section className="card h-100">
      <div className="card-title">
        <span>
          <Icon name="piggy" /> {t('grow.nudge.title')}
        </span>
        <span className="pill">
          <Icon name="info" size={13} /> {t('grow.nudge.generalPill')}
        </span>
      </div>

      <p className="smallish muted mb-1">{t('grow.nudge.caption', { month: monthTitle(data.monthKey) })}</p>
      {/* clamp, not a fixed size: a five-figure surplus in a converted currency
          must not push the card wider than a 360px screen */}
      <p className="num mb-2" style={{ fontSize: 'clamp(1.5rem, 7vw, 2rem)', fontWeight: 700, lineHeight: 1.1 }}>
        {amount}
      </p>

      <p className="mb-2">{t(sentenceKey, vars)}</p>

      {/* the working, so the figure above can be checked rather than trusted */}
      {data.entries > 0 && (
        <p className="smallish muted mb-2">
          <Icon name="info" size={14} />{' '}
          {t('grow.nudge.working', { income: money(data.income), expense: money(data.expense) })}
        </p>
      )}

      {!data.entries && (
        <Link className="btn btn-ghost btn-sm mb-2" to="/transactions">
          <Icon name="plus" size={15} /> {t('grow.nudge.addEntry')}
        </Link>
      )}

      {known && (
        <p className="smallish muted mb-0">
          <Icon name="shield" size={14} /> {t('grow.nudge.yourChoice')}
        </p>
      )}
    </section>
  );
}

/**
 * The legend: three rungs, each with the word, the colour and one line saying
 * what it means. `levels` comes from the service so the order on screen is the
 * order the server exports; the wording is still the dictionary's.
 */
function RiskLegend({ t, levels }) {
  const order = Array.isArray(levels) && levels.length ? levels.map((rung) => rung.level) : LEGEND;

  return (
    <section className="card h-100">
      <div className="card-title">
        <span>
          <Icon name="scale" /> {t('grow.legend.title')}
        </span>
      </div>
      <p className="smallish muted mb-3">{t('grow.legend.intro')}</p>
      <ul className="d-grid gap-3 mb-0" style={{ listStyle: 'none', margin: 0, padding: 0 }} role="list">
        {order.map((level) => (
          <li key={level} className="d-flex align-items-start gap-2 flex-wrap">
            <RiskChip t={t} level={level} />
            <span className="smallish flex-grow-1">{t(`grow.risk.${level}Meaning`)}</span>
          </li>
        ))}
      </ul>
      <p className="smallish muted mb-0 mt-3">{t('grow.legend.colourNote')}</p>
    </section>
  );
}

/** One concept: what it is, what to know, how long the money is tied up. */
function ConceptCard({ t, concept }) {
  return (
    <article className="card">
      <div className="d-flex align-items-start justify-content-between gap-2 flex-wrap mb-2">
        <h2 className="mb-0 d-flex align-items-center gap-2" style={{ fontSize: '1.0625rem' }}>
          <span className="txn-ico">
            <Icon name={concept.icon} />
          </span>
          {t(concept.titleKey)}
        </h2>
        <RiskChip t={t} level={concept.risk} />
      </div>

      <p className="mb-3">{t(concept.whatKey)}</p>

      <h3 className="smallish muted mb-1" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {t('grow.goodToKnow')}
      </h3>
      <ul className="smallish d-grid gap-1 mb-3" style={{ paddingInlineStart: 18 }}>
        {concept.pointKeys.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ul>

      <p className="smallish mb-2">
        <strong>{t('grow.lockInLabel')}</strong> {t(concept.lockInKey)}
      </p>

      {concept.readMore ? (
        <Link className="btn btn-ghost btn-sm" to={concept.readMore}>
          <Icon name="arrowRight" size={15} /> {t(concept.readMoreKey)}
        </Link>
      ) : (
        <p className="smallish muted mb-0 d-flex align-items-center gap-1">
          <Icon name="info" size={14} /> {t(concept.readMoreKey)}
        </p>
      )}
    </article>
  );
}
