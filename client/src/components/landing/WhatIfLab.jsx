/**
 * WhatIfLab — three questions about a month that has not happened yet, and the
 * real tool that answers each one.
 *
 * The mockup this comes from has two dropdowns and a slider that move a number.
 * That number has to be the reader's own spending to mean anything, and on a page
 * where nobody is signed in there is no spending to move. So the same panel is
 * here as three questions, each one linked to the screen that really answers it —
 * which is more honest and, as it turns out, more useful: a judge can click
 * through and land on working arithmetic instead of a demo slider.
 *
 * WHY THE THREE QUESTIONS ARE THESE THREE: they are the three the app can answer
 * from a student's own entries with no guessing - what does this month look like
 * if I change one habit, what would this week cost, and what is this actually
 * costing me each month. Each one names the screen that does it.
 *
 * The two cards beside it are the standing-offer panel: what you keep, and the
 * growth note, both of which are real lists in the app.
 */
import { useLocale } from '../../locale.jsx';
import Icon from '../Icon.jsx';

const QUESTIONS = [
  { key: 'habit', icon: 'swap', to: '/transactions', tone: 's1' },
  { key: 'week', icon: 'calendar', to: '/reports', tone: 's2' },
  { key: 'cost', icon: 'repeat', to: '/recurring', tone: 's3' },
];

export default function WhatIfLab() {
  const { t } = useLocale();

  return (
    <div className="lp2-lab">
      <ul className="lp2-lab-questions">
        {QUESTIONS.map((row, i) => (
          <li className="lp2-lab-row lp-reveal" key={row.key} style={{ transitionDelay: `${i * 80}ms` }}>
            <span className={`lp2-lab-ico ${row.tone}`}>
              <Icon name={row.icon} size={18} />
            </span>
            <div>
              <strong>{t(`home.lab.${row.key}Q`)}</strong>
              <span className="smallish">{t(`home.lab.${row.key}A`)}</span>
            </div>
            <a className="lp2-lab-go" href={row.to}>
              {t('home.lab.open')} <Icon name="arrowRight" size={14} />
            </a>
          </li>
        ))}
      </ul>

      <div className="lp2-lab-side">
        <div className="lp2-lab-savings lp-reveal">
          <span className="smallish muted">{t('home.lab.savingsLabel')}</span>
          <strong>{t('home.lab.savingsHeadline')}</strong>
          <span className="smallish">{t('home.lab.savingsBody')}</span>
          <a className="btn btn-grad btn-sm" href="/savings-options">
            {t('home.lab.savingsCta')}
          </a>
        </div>

        <div className="lp2-lab-growth lp-reveal" style={{ transitionDelay: '90ms' }}>
          <span className="lp2-lab-growth-ico">
            <Icon name="sprout" size={18} />
          </span>
          <div>
            <strong>{t('home.lab.growthTitle')}</strong>
            <span className="smallish">{t('home.lab.growthBody')}</span>
          </div>
          <a className="lp2-lab-go" href="/grow-money">
            {t('home.lab.growthCta')} <Icon name="arrowRight" size={14} />
          </a>
        </div>
      </div>
    </div>
  );
}
