/**
 * FaqArt — the picture that fills the right half of the FAQ section.
 *
 * A student asks, Campus Coin answers. Flat vector, warm colours and a person,
 * the same drawing language as the rest of the site's illustrations — the
 * first pass here was outlined geometry in theme colours and looked like a
 * placeholder next to a real picture.
 */
const SKIN = '#f3c9a2';
const HAIR = '#3b2f2a';
const SHIRT = '#6366f1';
const SHIRT_DARK = '#4f46e5';
const PANTS = '#33465c';
const MINT = '#34d399';
const MINT_LIGHT = '#a7f3d0';
const AMBER = '#fbbf24';
const AMBER_DARK = '#f59e0b';
const CORAL = '#fb7185';
const PAPER = '#ffffff';
const LINE = '#dcd7cd';

export default function FaqArt() {
  return (
    <svg className="faq-art" viewBox="0 0 440 400" aria-hidden="true" focusable="false">
      <circle cx="220" cy="200" r="168" fill="#e0f2fe" />
      <circle cx="86" cy="86" r="24" fill={AMBER} opacity="0.45" />
      <circle cx="372" cy="120" r="16" fill={CORAL} opacity="0.4" />

      {/* the question */}
      <g>
        <rect x="18" y="36" width="188" height="76" rx="22" fill={PAPER} stroke={LINE} strokeWidth="2" />
        <path d="M70 112l-9 20 26-20z" fill={PAPER} stroke={LINE} strokeWidth="2" />
        <circle cx="56" cy="74" r="18" fill={AMBER} />
        <path
          d="M50 68.5a6.5 6.5 0 0 1 12 1.4c0 4.4-6 5.6-6 9.1"
          stroke="#7c4a03"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="56" cy="84" r="2" fill="#7c4a03" />
        <rect x="86" y="62" width="102" height="10" rx="5" fill="#d7d3cb" />
        <rect x="86" y="84" width="70" height="10" rx="5" fill="#e7e3db" />
      </g>

      {/* the answer */}
      <g>
        <rect x="196" y="140" width="226" height="104" rx="22" fill={PAPER} stroke={LINE} strokeWidth="2" />
        <path d="M330 244l-10 20 26-20z" fill={PAPER} stroke={LINE} strokeWidth="2" />
        <circle cx="228" cy="172" r="17" fill={MINT} />
        <path d="M228 165c-4.2 4-5.4 6-5.4 8.8a5.4 5.4 0 0 0 10.8 0c0-2.8-1.2-4.8-5.4-8.8z" fill="#fff" />
        <rect x="256" y="160" width="140" height="10" rx="5" fill={MINT_LIGHT} />
        <rect x="256" y="182" width="116" height="10" rx="5" fill="#e7e3db" />
        <rect x="256" y="204" width="86" height="10" rx="5" fill="#eef0ee" />
      </g>

      {/* trust chips */}
      <g>
        <rect x="26" y="196" width="126" height="40" rx="20" fill={PAPER} stroke={LINE} strokeWidth="2" />
        <circle cx="50" cy="216" r="14" fill={MINT_LIGHT} />
        <path d="M50 208.5l5.5 5.5-5.5 5.5-5.5-5.5z" fill={SHIRT_DARK} />
        <rect x="74" y="212" width="64" height="8" rx="4" fill="#d7d3cb" />
      </g>
      <g>
        <rect x="36" y="248" width="112" height="40" rx="20" fill={PAPER} stroke={LINE} strokeWidth="2" />
        <circle cx="60" cy="268" r="14" fill="#fde68a" />
        <rect x="55" y="262" width="10" height="12" rx="2.5" fill="#7c4a03" />
        <path d="M57 262v-3a3 3 0 0 1 6 0v3" stroke="#7c4a03" strokeWidth="2.4" fill="none" />
        <rect x="82" y="264" width="54" height="8" rx="4" fill="#e7e3db" />
      </g>
      <g>
        <rect x="24" y="300" width="104" height="40" rx="20" fill={PAPER} stroke={LINE} strokeWidth="2" />
        <circle cx="48" cy="320" r="14" fill="#fbcfe8" />
        <circle cx="48" cy="320" r="7" fill="none" stroke="#9d174d" strokeWidth="2.4" />
        <rect x="70" y="316" width="46" height="8" rx="4" fill="#e7e3db" />
      </g>

      {/* the student asking */}
      <g>
        <ellipse cx="188" cy="366" rx="88" ry="10" fill="#0f766e" opacity="0.12" />
        <circle cx="182" cy="286" r="24" fill={SKIN} />
        <path
          d="M158 288c0-16 11-26 24-26s24 10 24 26c-4-8-12-12-24-12s-20 4-24 12z"
          fill={HAIR}
        />
        <path d="M131 366c0-28 15-48 33-48h-6c18 0 33 20 33 48z" fill="none" />
        <path d="M158 322c0-17 12-28 24-28s24 11 24 28v22h-48z" fill={SHIRT} />
        <path d="M158 322c4 13 12 19 24 19s20-6 24-19c-6 8-14 12-24 12s-18-4-24-12z" fill={SHIRT_DARK} />
        <rect x="164" y="342" width="18" height="26" rx="8" fill={PANTS} />
        <rect x="188" y="342" width="18" height="26" rx="8" fill={PANTS} />
        <rect x="160" y="364" width="26" height="10" rx="5" fill="#1f2937" />
        <rect x="185" y="364" width="26" height="10" rx="5" fill="#1f2937" />
        {/* arm holding the phone the question came from */}
        <path d="M206 336c14 2 22 8 26 16l-13 8c-3-6-9-10-17-12z" fill={SKIN} />
        <g transform="rotate(-10 236 318)">
          <rect x="220" y="288" width="34" height="56" rx="9" fill={PAPER} stroke={LINE} strokeWidth="2" />
          <rect x="226" y="296" width="22" height="38" rx="5" fill={AMBER} opacity="0.35" />
          <path d="M237 308c-2.4 2.4-3.2 3.4-3.2 5.2a3.2 3.2 0 0 0 6.4 0c0-1.8-.8-3-3.2-5.2z" fill="#7c4a03" />
          <circle cx="237" cy="322" r="6.5" stroke="#7c4a03" strokeWidth="2" fill="none" />
        </g>
      </g>

      {/* coins + sparkles */}
      <g transform="translate(288 300)">
        <ellipse cx="0" cy="26" rx="17" ry="6" fill={AMBER_DARK} />
        <ellipse cx="0" cy="22" rx="17" ry="6" fill={AMBER} />
        <ellipse cx="20" cy="10" rx="13" ry="5" fill={AMBER_DARK} />
        <ellipse cx="20" cy="7" rx="13" ry="5" fill={AMBER} />
        <text x="20" y="10" textAnchor="middle" fontSize="9" fontWeight="700" fill="#7c4a03">$</text>
      </g>
      <g transform="translate(330 236)" fill={AMBER}>
        <path d="M0 14c1.4 7 3 8.6 10 10-7 1.4-8.6 3-10 10-1.4-7-3-8.6-10-10 7-1.4 8.6-3 10-10Z" />
        <path d="M22 20c.9 4.4 1.9 5.4 6.3 6.3-4.4.9-5.4 1.9-6.3 6.3-.9-4.4-1.9-5.4-6.3-6.3 4.4-.9 5.4-1.9 6.3-6.3Z" opacity="0.6" />
      </g>
    </svg>
  );
}
