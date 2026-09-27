/**
 * MoneyJourney — the dark strip that shows where money goes over a month, and the
 * one place on the landing page that reads left to right like a sentence.
 *
 * Five stages, five arrows. The arrows are the whole idea: allowance in, spending
 * out, a budget to hold the line, savings that stay put, and a goal that fills.
 * A picture with the stages side by side and nothing between them says "these are
 * five things"; with the arrows it says "this is the order it happens in".
 *
 * TWO RULES THIS FILE KEEPS:
 *
 *  1. NO FIGURES. Nothing here is a percentage, a promise, or a claim about what
 *     a reader will save. The app's whole argument is that it does not say things
 *     it cannot show, and a marketing strip that invents a number is the fastest
 *     way to lose that. Every line describes a tool, and every tool exists.
 *  2. NO "ASSISTED" WORDING. Each stage names what the tool does in one plain
 *     sentence, with no product of its own invented for the sentence.
 *
 * The motion is transform-only: the dot on each arrow travels, the cards lift a
 * pixel on hover, and nothing repaints. The stylesheet owns the keyframes so one
 * `prefers-reduced-motion` block switches the whole strip off.
 */
import { useLocale } from '../../locale.jsx';
import Icon from '../Icon.jsx';

/* The five stages, in the order the money actually moves. */
const STAGES = [
  {
    key: 'income',
    icon: 'plusCircle',
    tone: 's1',
    lineKey: 'home.journey.incomeBody',
  },
  {
    key: 'spend',
    icon: 'cart',
    tone: 's2',
    lineKey: 'home.journey.spendBody',
  },
  {
    key: 'budget',
    icon: 'target',
    tone: 's3',
    lineKey: 'home.journey.budgetBody',
  },
  {
    key: 'savings',
    icon: 'jar',
    tone: 's4',
    lineKey: 'home.journey.savingsBody',
  },
  {
    key: 'goal',
    icon: 'flag',
    tone: 's5',
    lineKey: 'home.journey.goalBody',
  },
];

export default function MoneyJourney() {
  const { t } = useLocale();

  return (
    <div className="lp2-journey">
      <ol className="lp2-journey-track">
        {STAGES.map((stage, i) => (
          <li className="lp2-journey-step" key={stage.key}>
            <div className="lp2-journey-card lp-reveal" style={{ transitionDelay: `${i * 90}ms` }}>
              <span className={`lp2-journey-ico ${stage.tone}`}>
                <Icon name={stage.icon} size={22} />
              </span>
              <strong>{t(`home.journey.${stage.key}`)}</strong>
              <span className="lp2-journey-body">{t(stage.lineKey)}</span>
            </div>

            {/* The arrow is a separate element, not a border on the card, so it
                can carry a dot that travels - and so the last one is simply not
                drawn rather than being an arrow to nothing. */}
            {i < STAGES.length - 1 && (
              <span className="lp2-journey-arrow" aria-hidden="true">
                <span className="lp2-journey-dot" />
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
