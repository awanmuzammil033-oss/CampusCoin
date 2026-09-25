import Icon from '../Icon.jsx';

/**
 * HeroPhoneArt — the hero's right-hand illustration, drawn entirely in SVG.
 *
 * It used to be a stack of divs with emoji inside, which
 * meant Windows rendered it differently from the design board, the icons
 * could not be recoloured and the whole mock broke the moment a translation
 * got longer. Now the phone, the dashboard inside it and the three floating
 * cards are one vector: sharp at any size, theme-proof, and the labels still
 * come from the active language through `t`.
 *
 * The component is decorative: the whole thing is aria-hidden and the hero
 * already carries a real text description for screen readers.
 */
const C = {
  body: '#04211a',
  screen: '#0a2e23',
  card: 'rgba(255,255,255,0.055)',
  cardLine: 'rgba(167,243,208,0.16)',
  text: '#eafff5',
  dim: 'rgba(234,255,245,0.62)',
  mint: '#34d399',
  amber: '#fbbf24',
};

function Donut({ rows, cx, cy, r }) {
  const circ = 2 * Math.PI * r;
  let used = 0;
  return (
    <g transform={`rotate(-90 ${cx} ${cy})`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="13" />
      {rows.map((row) => {
        const len = (row.pct / 100) * circ;
        const el = (
          <circle
            key={row.key}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={row.color}
            strokeWidth="13"
            strokeDasharray={`${Math.max(0, len - 2.5)} ${circ}`}
            strokeDashoffset={-(used / 100) * circ}
            strokeLinecap="butt"
          />
        );
        used += row.pct;
        return el;
      })}
    </g>
  );
}

export default function HeroPhoneArt({ t, legend }) {
  return (
    <svg className="lp2-phone-svg" viewBox="0 0 640 690" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="phoneBody" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#0a3a2c" />
          <stop offset="1" stopColor="#031a14" />
        </linearGradient>
        <linearGradient id="phoneScreen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b3427" />
          <stop offset="1" stopColor="#072319" />
        </linearGradient>
      </defs>

      {/* ---------------------------- the phone ---------------------------- */}
      <rect x="168" y="14" width="272" height="596" rx="38" fill="url(#phoneBody)" stroke="rgba(167,243,208,0.22)" strokeWidth="1.5" />
      <rect x="180" y="26" width="248" height="572" rx="30" fill="url(#phoneScreen)" />
      <rect x="262" y="36" width="84" height="11" rx="5.5" fill="#031a14" />

      {/* app bar */}
      <circle cx="206" cy="80" r="14" fill={C.mint} />
      <text x="206" y="85" textAnchor="middle" fontSize="15" fontWeight="700" fill="#04211a">C</text>
      <text x="228" y="85" fontSize="12.5" fontWeight="600" fill={C.text}>{t('app.name')}</text>
      <circle cx="402" cy="80" r="13" fill="rgba(255,255,255,0.14)" />
      <Icon name="user" size={15} x="394.5" y="72.5" strokeWidth={1.9} />

      <text x="198" y="126" fontSize="14" fontWeight="700" fill={C.text}>{t('home.mockGreeting')}</text>
      <text x="198" y="142" fontSize="9.5" fill={C.dim}>{t('home.mockGreetingSub')}</text>

      {/* total balance */}
      <rect x="196" y="156" width="216" height="78" rx="15" fill={C.card} stroke={C.cardLine} />
      <Icon name="lock" size={11} x="209" y="168" strokeWidth={2} />
      <text x="224" y="178" fontSize="9.5" fill={C.dim}>{t('home.mockTotal')}</text>
      <text x="209" y="206" fontSize="21" fontWeight="700" fill="#ffffff">$1,240.50</text>
      <rect x="352" y="180" width="50" height="20" rx="10" fill="rgba(16,185,129,0.22)" />
      <text x="377" y="194" textAnchor="middle" fontSize="10" fontWeight="700" fill="#6ee7b7">+12%</text>

      {/* balance / expense */}
      <rect x="196" y="244" width="104" height="66" rx="13" fill={C.card} stroke={C.cardLine} />
      <Icon name="cash" size={13} x="207" y="254" strokeWidth={2} />
      <text x="207" y="282" fontSize="8.5" fill={C.dim}>{t('home.mockBalance')}</text>
      <text x="207" y="299" fontSize="12.5" fontWeight="700" fill={C.text}>$1,800.00</text>

      <rect x="308" y="244" width="104" height="66" rx="13" fill={C.card} stroke={C.cardLine} />
      <Icon name="trendDown" size={13} x="319" y="254" strokeWidth={2} />
      <text x="319" y="282" fontSize="8.5" fill={C.dim}>{t('home.mockExpense')}</text>
      <text x="319" y="299" fontSize="12.5" fontWeight="700" fill={C.text}>$559.50</text>

      {/* spending overview */}
      <rect x="196" y="320" width="216" height="184" rx="15" fill={C.card} stroke={C.cardLine} />
      <Icon name="chart" size={11} x="208" y="332" strokeWidth={2} />
      <text x="223" y="342" fontSize="9.5" fill={C.dim}>{t('home.mockOverview')}</text>
      <Donut rows={legend} cx={250} cy={414} r={36} />
      {legend.map((row, i) => (
        <g key={row.key}>
          <rect x="300" y={378 + i * 20} width="7" height="7" rx="2" fill={row.color} />
          <text x="312" y={385 + i * 20} fontSize="8.5" fill={C.dim}>{t(row.key)}</text>
          <text x="400" y={385 + i * 20} fontSize="8.5" fontWeight="700" fill={C.text}>{row.pct}%</text>
        </g>
      ))}
      {/* bottom tabs */}
      {[
        { icon: 'home', x: 224, label: t('home.mockTabHome'), on: true },
        { icon: 'repeat', x: 274, label: t('nav.transactions'), on: false },
        { icon: 'target', x: 324, label: t('nav.budgets'), on: false },
        { icon: 'more', x: 374, label: t('home.mockMore'), on: false },
      ].map((tab) => (
        <g key={tab.icon} opacity={tab.on ? 1 : 0.55}>
          <Icon name={tab.icon} size={15} x={tab.x - 7.5} y="546" strokeWidth={tab.on ? 2.1 : 1.8} />
          <text x={tab.x} y="576" textAnchor="middle" fontSize="7" fontWeight={tab.on ? 700 : 500} fill={tab.on ? C.mint : C.dim}>
            {tab.label}
          </text>
        </g>
      ))}

      {/* ------------------------ floating glass cards --------------------- */}
      <g className="lp2-float-svg f1">
        <rect x="446" y="40" width="180" height="100" rx="18" fill="rgba(4,32,25,0.86)" stroke="rgba(167,243,208,0.3)" />
        <rect x="460" y="56" width="34" height="34" rx="11" fill="rgba(251,191,36,0.18)" />
        <Icon name="coin" size={19} x="467.5" y="63.5" strokeWidth={2} />
        <text x="504" y="70" fontSize="15" fontWeight="700" fill={C.text}>+$500</text>
        <text x="504" y="86" fontSize="9" fill={C.dim}>{t('home.floatAllowanceT')}</text>
        <text x="504" y="102" fontSize="8.5" fill="rgba(234,255,245,0.45)">{t('home.floatAllowanceD')}</text>
      </g>

      <g className="lp2-float-svg f2">
        <rect x="466" y="250" width="168" height="112" rx="18" fill="rgba(4,32,25,0.86)" stroke="rgba(167,243,208,0.3)" />
        <rect x="480" y="266" width="32" height="32" rx="11" fill="rgba(52,211,153,0.16)" />
        <Icon name="burger" size={17} x="487.5" y="273.5" strokeWidth={1.9} />
        <text x="522" y="286" fontSize="12" fontWeight="700" fill={C.text}>{t('home.floatFoodT')} 72%</text>
        <rect x="480" y="310" width="140" height="8" rx="4" fill="rgba(255,255,255,0.1)" />
        <rect x="480" y="310" width="101" height="8" rx="4" fill={C.mint} />
        <text x="480" y="338" fontSize="9" fill={C.dim}>$180 / $250</text>
      </g>

      <g className="lp2-float-svg f3">
        <rect x="452" y="486" width="182" height="100" rx="18" fill="rgba(4,32,25,0.86)" stroke="rgba(167,243,208,0.3)" />
        <rect x="466" y="502" width="34" height="34" rx="11" fill="rgba(52,211,153,0.16)" />
        <Icon name="bulb" size={18} x="474" y="510" strokeWidth={1.9} />
        <text x="510" y="518" fontSize="14" fontWeight="700" fill={C.text}>{t('home.floatSaveT')}</text>
        <text x="510" y="536" fontSize="9" fill={C.dim}>{t('home.floatSaveW')}</text>
        <text x="510" y="553" fontSize="8.5" fill="rgba(234,255,245,0.45)">{t('home.floatSaveS')}</text>
      </g>

      {/* the handwritten nudge from the board */}
      <g className="lp2-hand-svg">
        <text x="150" y="646" fontSize="17" fontStyle="italic" fontWeight="600" fill="rgba(234,255,245,0.82)">
          {t('home.handSteps')}
        </text>
        <path d="M300 660 C 340 676, 392 664, 416 630" fill="none" stroke="rgba(167,243,208,0.7)" strokeWidth="2.4" strokeLinecap="round" />
        <path d="m404 630 14 -3 -4 14" fill="none" stroke="rgba(167,243,208,0.7)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
