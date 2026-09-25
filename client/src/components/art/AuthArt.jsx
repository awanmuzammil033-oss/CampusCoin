import Icon from '../Icon.jsx';

/**
 * AuthArt — the left-hand illustration on the three form pages
 * (student sign-in, registration, control-panel sign-in).
 *
 * A centred form with a dead left half looked unfinished on a laptop, so on
 * desktop every auth page now reads as two panels: story on the left, form on
 * the right. Each variant draws its own scene, all of them vectors that follow
 * the theme through CSS custom properties.
 */
function LoginArt() {
  return (
    <>
      <g className="a-phone">
        <rect x="150" y="66" width="132" height="228" rx="22" />
        <rect x="160" y="80" width="112" height="200" rx="15" className="a-screen" />
        <rect x="196" y="72" width="40" height="6" rx="3" className="a-notch" />
        <rect className="a-bar" x="172" y="96" width="88" height="9" rx="4.5" />
        <rect className="a-bar" x="172" y="116" width="60" height="7" rx="3.5" />
        <rect className="a-bar strong" x="172" y="140" width="88" height="34" rx="10" />
        <rect className="a-bar" x="172" y="184" width="40" height="28" rx="9" />
        <rect className="a-bar" x="220" y="184" width="40" height="28" rx="9" />
        <rect className="a-bar" x="172" y="222" width="88" height="42" rx="10" />
      </g>
      <g className="a-float a-float-1">
        <circle cx="286" cy="120" r="26" />
        <Icon name="coin" size={24} x="274" y="108" />
      </g>
      <g className="a-float a-float-2">
        <circle cx="132" cy="196" r="24" />
        <Icon name="shield" size={21} x="121.5" y="185.5" />
      </g>
      <g className="a-spark">
        <path d="M292 214c2 11 5 14 16 16-11 2-14 5-16 16-2-11-5-14-16-16 11-2 14-5 16-16Z" />
      </g>
      <g className="a-key">
        <circle cx="196" cy="326" r="20" />
        <rect x="214" y="320" width="54" height="9" rx="4.5" />
        <rect x="252" y="320" width="8" height="17" rx="4" />
        <rect x="236" y="320" width="8" height="14" rx="4" />
      </g>
    </>
  );
}

function RegisterArt() {
  return (
    <>
      {/* student bust: head, shoulders and a mortarboard that sits ON the head
          (drawing it across the face is what made the first pass unreadable) */}
      <g className="a-person">
        <circle cx="216" cy="172" r="27" />
        <path d="M158 270c0-32 26-54 58-54s58 22 58 54z" />
        <path d="M216 116l40 19-40 19-40-19z" />
        <path d="M197 141h38v9h-38z" />
        <path d="M254 136v24" />
      </g>
      <g className="a-float a-float-1">
        <rect x="56" y="96" width="112" height="40" rx="14" />
        <Icon name="checkCircle" size={21} x="70" y="105.5" />
        <rect className="a-bar" x="98" y="111" width="54" height="9" rx="4.5" />
      </g>
      <g className="a-float a-float-2">
        <rect x="266" y="200" width="112" height="40" rx="14" />
        <Icon name="lock" size={20} x="280" y="210" />
        <rect className="a-bar" x="306" y="215" width="56" height="9" rx="4.5" />
      </g>
      <g className="a-coin">
        <circle cx="118" cy="272" r="22" />
        <text className="a-c" x="118" y="279" textAnchor="middle" fontSize="20" fontWeight="700">$</text>
      </g>
      <g className="a-coin small">
        <circle cx="162" cy="304" r="14" />
        <text className="a-c" x="162" y="309" textAnchor="middle" fontSize="14" fontWeight="700">$</text>
      </g>
      <g className="a-spark">
        <path d="M322 96c1.8 10 4.6 12.8 14.5 14.5C324.6 112.3 321.8 115 322 125c-1.8-10-4.6-12.8-14.5-14.5C317.4 108.8 320 106 322 96Z" />
      </g>
      <g className="a-spark small">
        <path d="M92 186c1.2 6.8 3 8.6 9.8 9.8-6.8 1.2-8.6 3-9.8 9.8-1.2-6.8-3-8.6-9.8-9.8 6.8-1.2 8.6-3 9.8-9.8Z" />
      </g>
    </>
  );
}

function AdminArt() {
  return (
    <>
      <g className="a-board">
        <rect x="88" y="84" width="256" height="176" rx="20" />
        <rect className="a-bar strong" x="108" y="106" width="92" height="11" rx="5.5" />
        <rect className="a-bar" x="108" y="128" width="60" height="8" rx="4" />
        <rect className="a-bar" x="252" y="106" width="72" height="30" rx="10" />
        <rect className="a-bar" x="108" y="158" width="216" height="10" rx="5" />
        <rect className="a-bar" x="108" y="180" width="216" height="10" rx="5" />
        <rect className="a-bar accent" x="108" y="202" width="140" height="10" rx="5" />
        <rect className="a-bar" x="108" y="224" width="96" height="10" rx="5" />
        {[38, 62, 48, 84, 70].map((h, i) => (
          <rect key={i} className="a-bar accent" x={108 + i * 22} y={238 - h * 0.34} width="12" height={h * 0.34} rx="4" />
        ))}
      </g>
      <g className="a-float a-float-1">
        <rect x="252" y="52" width="118" height="46" rx="16" />
        <Icon name="shield" size={22} x="266" y="64" />
        <rect className="a-bar" x="296" y="68" width="58" height="9" rx="4.5" />
        <rect className="a-bar" x="296" y="82" width="38" height="7" rx="3.5" />
      </g>
      <g className="a-float a-float-2">
        <circle cx="112" cy="286" r="26" />
        <Icon name="users" size={23} x="100.5" y="274.5" />
      </g>
      <g className="a-spark">
        <path d="M320 292c2 11 5 14 16 16-11 2-14 5-16 16-2-11-5-14-16-16 11-2 14-5 16-16Z" />
      </g>
    </>
  );
}

const VARIANTS = { login: LoginArt, register: RegisterArt, admin: AdminArt };

/** variant: 'login' | 'register' | 'admin' */
export default function AuthArt({ variant = 'login' }) {
  const Art = VARIANTS[variant] || LoginArt;
  return (
    <div className={`auth-art auth-art-${variant}`} aria-hidden="true">
      <svg viewBox="0 0 432 380" focusable="false">
        <circle className="a-halo" cx="216" cy="190" r="170" />
        <Art />
      </svg>
    </div>
  );
}
