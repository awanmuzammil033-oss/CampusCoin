import Icon from '../Icon.jsx';

/**
 * FaqArt — the illustration that fills the empty right half of the FAQ
 * section (the questions used to stop at 60% of the width and the rest of the
 * row was dead space).
 *
 * It is a question-and-answer conversation drawn in vectors: a student asks,
 * Campus Coin answers. Colours come from CSS custom properties so the same
 * drawing reads correctly in light and dark theme (see .faq-art in
 * campuscoin.css) — no second asset, no emoji.
 */
export default function FaqArt() {
  return (
    <svg className="faq-art" viewBox="0 0 420 400" aria-hidden="true" focusable="false">
      {/* soft halo */}
      <circle className="a-halo" cx="214" cy="196" r="168" />

      {/* incoming question bubble */}
      <g className="a-bubble a-bubble-in">
        <rect x="34" y="44" width="196" height="74" rx="20" />
        <path d="M62 118l-4 22 26-22z" />
        <Icon name="help" size={26} x="52" y="66" />
        <rect className="a-line" x="88" y="70" width="118" height="9" rx="4.5" />
        <rect className="a-line short" x="88" y="90" width="74" height="9" rx="4.5" />
      </g>

      {/* answer bubble */}
      <g className="a-bubble a-bubble-out">
        <rect x="148" y="150" width="238" height="96" rx="20" />
        <path d="M330 246l16 22-20-22z" />
        <circle className="a-badge" cx="176" cy="178" r="15" />
        <text className="a-c" x="176" y="184" textAnchor="middle" fontSize="15" fontWeight="700">C</text>
        <Icon name="checkCircle" size={12} x="348" y="204" />
        <rect className="a-line" x="200" y="170" width="162" height="9" rx="4.5" />
        <rect className="a-line" x="200" y="190" width="132" height="9" rx="4.5" />
        <rect className="a-line" x="200" y="210" width="96" height="9" rx="4.5" />
      </g>

      {/* trust chips */}
      <g className="a-chip">
        <rect x="34" y="196" width="112" height="34" rx="17" />
        <Icon name="shield" size={15} x="46" y="205.5" />
        <rect className="a-line short" x="68" y="209" width="62" height="8" rx="4" />
      </g>
      <g className="a-chip">
        <rect x="42" y="242" width="92" height="34" rx="17" />
        <Icon name="lock" size={15} x="54" y="251.5" />
        <rect className="a-line short" x="76" y="255" width="44" height="8" rx="4" />
      </g>
      <g className="a-chip">
        <rect x="26" y="288" width="100" height="34" rx="17" />
        <Icon name="coin" size={15} x="38" y="297.5" />
        <rect className="a-line short" x="60" y="301" width="50" height="8" rx="4" />
      </g>

      {/* student + coins */}
      <g className="a-person">
        <circle cx="126" cy="300" r="21" />
        <path d="M96 372c0-19 13-32 30-32s30 13 30 32z" />
        <path d="M126 266l27 13-27 13-27-13z" />
        <path d="M110 286h32v9h-32z" />
      </g>
      <g className="a-coin">
        <circle cx="206" cy="330" r="20" />
        <text className="a-c" x="206" y="337" textAnchor="middle" fontSize="19" fontWeight="700">$</text>
      </g>
      <g className="a-coin small">
        <circle cx="252" cy="352" r="13" />
        <text className="a-c" x="252" y="357" textAnchor="middle" fontSize="13" fontWeight="700">$</text>
      </g>

      {/* sparkles */}
      <g className="a-spark">
        <path d="M330 84c2 10 5 13 15 15-10 2-13 5-15 15-2-10-5-13-15-15 10-2 13-5 15-15Z" />
      </g>
      <g className="a-spark small">
        <path d="M374 140c1.3 6.5 3.2 8.5 9.5 9.5-6.3 1-8.2 3-9.5 9.5-1.3-6.5-3.2-8.5-9.5-9.5 6.3-1 8.2-3 9.5-9.5Z" />
      </g>
    </svg>
  );
}
