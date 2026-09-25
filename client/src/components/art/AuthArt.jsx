import Icon from '../Icon.jsx';

/**
 * AuthArt — the illustration on the left of the three form pages.
 *
 * Style: flat vector, warm and colourful, with a person in it — the same kind
 * of picture the rest of the site uses (see the campus scene on the landing
 * page), not a set of grey geometry. The first pass here was boxes and bars in
 * the theme colours; it read as a placeholder next to a real illustration, so
 * the scenes were redrawn as people doing the thing the page is about.
 *
 * Every shape is a vector with its own colour, so the drawing does not change
 * when the site flips to dark theme.
 */
const SKIN = '#f3c9a2';
const SKIN_DARK = '#e0ab7f';
const HAIR = '#3b2f2a';
const SHIRT = '#14b8a8';
const SHIRT_DARK = '#0f8f83';
const PANTS = '#33465c';
const MINT = '#34d399';
const MINT_LIGHT = '#a7f3d0';
const AMBER = '#fbbf24';
const AMBER_DARK = '#f59e0b';
const CORAL = '#fb7185';
const PAPER = '#ffffff';
const LINE = '#dcd7cd';

/** A potted plant, reused by all three scenes. */
function Plant({ x, y, scale = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M22 40c0-16 8-26 18-30-6 10-8 20-8 30z" fill="#22c55e" />
      <path d="M40 40c2-18 12-28 24-32-10 10-14 20-14 32z" fill="#16a34a" />
      <path d="M30 42c-14-4-20-14-20-26 12 4 20 12 22 26z" fill="#4ade80" />
      <path d="M14 42h40l-4 30a4 4 0 0 1-4 3.5H22a4 4 0 0 1-4-3.5z" fill={AMBER} />
      <path d="M11 38h46v8H11z" fill={AMBER_DARK} />
    </g>
  );
}

function Coins({ x, y, scale = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cx="0" cy="26" rx="17" ry="6" fill={AMBER_DARK} />
      <ellipse cx="0" cy="22" rx="17" ry="6" fill={AMBER} />
      <ellipse cx="20" cy="10" rx="13" ry="5" fill={AMBER_DARK} />
      <ellipse cx="20" cy="7" rx="13" ry="5" fill={AMBER} />
      <text x="20" y="10" textAnchor="middle" fontSize="9" fontWeight="700" fill="#7c4a03">$</text>
    </g>
  );
}

function Sparkles({ x, y, scale = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} fill={AMBER}>
      <path d="M0 14c1.4 7 3 8.6 10 10-7 1.4-8.6 3-10 10-1.4-7-3-8.6-10-10 7-1.4 8.6-3 10-10Z" />
      <path d="M22 20c.9 4.4 1.9 5.4 6.3 6.3-4.4.9-5.4 1.9-6.3 6.3-.9-4.4-1.9-5.4-6.3-6.3 4.4-.9 5.4-1.9 6.3-6.3Z" opacity="0.65" />
    </g>
  );
}

/** Head + hair, reused so every face in the app looks like the same family. */
function Head({ x, y, r = 24, long = false }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={SKIN} />
      <path
        d={`M${x - r} ${y + 2}c0-${r + 2} ${r * 0.42}-${r + 6} ${r}-${r + 6}s${r} ${r * 0.4} ${r} ${r + 6}c-4-7-10-11-19-11-8 0-14 4-19 11z`}
        fill={HAIR}
      />
      {long && (
        <path
          d={`M${x - r - 1} ${y - 4}c-3 16-2 28 2 40h${r * 2 + 4}c4-12 5-25 2-40-4 8-10 12-20 12-8 0-13-4-16-12z`}
          fill={HAIR}
        />
      )}
      <circle cx={x - r * 0.35} cy={y + 2} r="2" fill="#2b211c" />
      <circle cx={x + r * 0.35} cy={y + 2} r="2" fill="#2b211c" />
      <path d={`M${x - 5} ${y + 10}q5 4 10 0`} stroke="#b4795a" strokeWidth="2" fill="none" strokeLinecap="round" />
    </g>
  );
}

function LoginArt() {
  return (
    <>
      <circle cx="206" cy="170" r="152" fill="#ffe9d2" />
      <circle cx="322" cy="96" r="26" fill={AMBER} opacity="0.5" />
      <Sparkles x={330} y={44} />

      {/* speech bubble: welcome back */}
      <g>
        <rect x="20" y="34" width="164" height="66" rx="20" fill={PAPER} stroke={LINE} strokeWidth="2" />
        <path d="M62 100l-8 18 24-18z" fill={PAPER} stroke={LINE} strokeWidth="2" />
        <circle cx="56" cy="66" r="16" fill={MINT} />
        <path d="m48 66 6 6 11-12" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="84" y="56" width="82" height="9" rx="4.5" fill="#d7d3cb" />
        <rect x="84" y="76" width="56" height="9" rx="4.5" fill="#e7e3db" />
      </g>

      {/* student, phone in hand */}
      <g>
        <ellipse cx="200" cy="300" rx="96" ry="11" fill="#0f766e" opacity="0.12" />
        <Head x={196} y={140} r={25} long />
        <path d="M170 178c0-16 12-26 26-26s26 10 26 26v46h-52z" fill={SHIRT} />
        <path d="M170 178c4 14 14 20 26 20s22-6 26-20v-2c-6 8-14 12-26 12s-20-4-26-12z" fill={SHIRT_DARK} />
        <path d="M186 224h20v8h-20z" fill={SKIN_DARK} />
        <rect x="178" y="230" width="21" height="56" rx="10" fill={PANTS} />
        <rect x="206" y="230" width="21" height="56" rx="10" fill={PANTS} />
        <rect x="174" y="282" width="28" height="12" rx="6" fill="#1f2937" />
        <rect x="203" y="282" width="28" height="12" rx="6" fill="#1f2937" />
        {/* arm + phone */}
        <path d="M226 196c14 4 22 12 24 22l-14 6c-2-8-8-13-18-16z" fill={SKIN} />
        <g transform="rotate(-8 252 176)">
          <rect x="232" y="140" width="40" height="66" rx="9" fill={PAPER} stroke={LINE} strokeWidth="2" />
          <rect x="238" y="148" width="28" height="46" rx="5" fill={MINT_LIGHT} />
          <path d="m244 170 6 6 11-12" stroke={SHIRT_DARK} strokeWidth="3.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="244" y="186" width="16" height="4" rx="2" fill="#9ca3af" />
          <circle cx="252" cy="199" r="2.6" fill="#9ca3af" />
        </g>
      </g>

      <Plant x={310} y={196} scale={0.95} />
      <Coins x={62} y={252} />
    </>
  );
}

function RegisterArt() {
  return (
    <>
      <circle cx="210" cy="168" r="152" fill="#e0f2fe" />
      <circle cx="86" cy="96" r="22" fill={CORAL} opacity="0.35" />
      <Sparkles x={318} y={40} scale={0.9} />

      {/* welcome ribbon */}
      <g>
        <rect x="228" y="30" width="150" height="52" rx="18" fill={PAPER} stroke={LINE} strokeWidth="2" />
        <path d="M262 82l-8 16 22-16z" fill={PAPER} stroke={LINE} strokeWidth="2" />
        <circle cx="258" cy="56" r="15" fill={CORAL} />
        <path d="M258 47.5c-3 4.4-5 6.6-5 9.6a5 5 0 0 0 10 0c0-3-2-5.2-5-9.6z" fill="#fff" />
        <rect x="284" y="48" width="80" height="9" rx="4.5" fill="#d7d3cb" />
        <rect x="284" y="66" width="52" height="9" rx="4.5" fill="#e7e3db" />
      </g>

      {/* new graduate */}
      <g>
        <ellipse cx="196" cy="302" rx="98" ry="11" fill="#0f766e" opacity="0.12" />
        <Head x={196} y={150} r={25} />
        {/* mortarboard */}
        <path d="M196 106l46 20-46 20-46-20z" fill="#1f2a44" />
        <path d="M164 132h64v10h-64z" fill="#111a2e" />
        <path d="M242 126v22" stroke="#111a2e" strokeWidth="3" strokeLinecap="round" />
        <circle cx="242" cy="151" r="5" fill={AMBER} />
        {/* gown */}
        <path d="M168 190c0-18 13-30 28-30s28 12 28 30v54h-56z" fill={SHIRT} />
        <path d="M186 240h20l10 58h-40z" fill={SHIRT_DARK} />
        <rect x="176" y="296" width="22" height="10" rx="5" fill="#1f2937" />
        <rect x="194" y="296" width="22" height="10" rx="5" fill="#1f2937" />
        {/* form card + arm */}
        <path d="M226 206c14 2 22 8 26 16l-13 8c-3-6-9-10-17-12z" fill={SKIN} />
        <g transform="rotate(-7 250 190)">
          <rect x="222" y="156" width="60" height="70" rx="10" fill={PAPER} stroke={LINE} strokeWidth="2" />
          <rect x="232" y="168" width="40" height="8" rx="4" fill={MINT} />
          <rect x="232" y="184" width="28" height="6" rx="3" fill="#d7d3cb" />
          <rect x="232" y="196" width="34" height="6" rx="3" fill="#e7e3db" />
          <circle cx="252" cy="214" r="2.6" fill={AMBER} />
        </g>
      </g>

      <Plant x={44} y={196} scale={0.95} />
      <Coins x={300} y={262} />
    </>
  );
}

function AdminArt() {
  return (
    <>
      <circle cx="210" cy="170" r="152" fill="#ede9fe" />
      <circle cx="96" cy="80" r="24" fill={AMBER} opacity="0.4" />
      <Sparkles x={318} y={48} scale={0.85} />

      {/* the dashboard itself */}
      <g>
        <rect x="196" y="70" width="188" height="132" rx="16" fill={PAPER} stroke={LINE} strokeWidth="2" />
        <rect x="212" y="86" width="60" height="8" rx="4" fill={MINT} />
        <rect x="212" y="100" width="38" height="6" rx="3" fill="#d7d3cb" />
        <g>
          <rect x="214" y="164" width="16" height="24" rx="4" fill={MINT} />
          <rect x="238" y="150" width="16" height="38" rx="4" fill="#38bdf8" />
          <rect x="262" y="140" width="16" height="48" rx="4" fill={AMBER} />
          <rect x="286" y="158" width="16" height="30" rx="4" fill={CORAL} />
        </g>
        <circle cx="332" cy="164" r="24" fill="none" stroke={LINE} strokeWidth="7" />
        <path d="M332 140a24 24 0 0 1 21 36" stroke={MINT} strokeWidth="7" fill="none" strokeLinecap="round" />
        <rect x="212" y="120" width="96" height="7" rx="3.5" fill="#e7e3db" />
        <rect x="212" y="134" width="72" height="7" rx="3.5" fill="#eef0ee" />
      </g>

      {/* staff member beside the board */}
      <g>
        <ellipse cx="132" cy="300" rx="82" ry="10" fill="#0f766e" opacity="0.12" />
        <Head x={124} y={150} r={24} />
        <path d="M98 190c0-17 12-28 26-28s26 11 26 28v54H98z" fill="#6366f1" />
        <path d="M98 190c4 13 13 19 26 19s22-6 26-19c-6 8-14 12-26 12s-20-4-26-12z" fill="#4f46e5" />
        <rect x="104" y="242" width="19" height="50" rx="9" fill={PANTS} />
        <rect x="130" y="242" width="19" height="50" rx="9" fill={PANTS} />
        <rect x="100" y="288" width="26" height="11" rx="5.5" fill="#1f2937" />
        <rect x="127" y="288" width="26" height="11" rx="5.5" fill="#1f2937" />
        {/* arm pointing at the board */}
        <path d="M148 200c16 0 28-6 38-16l9 11c-12 13-28 21-47 21z" fill={SKIN} />
        <circle cx="196" cy="182" r="7" fill={SKIN} />
      </g>

      {/* shield + key, the two things the staff door is about */}
      <g transform="translate(28 152)">
        <path d="M22 0 44 8v14c0 14-9 24-22 28-13-4-22-14-22-28V8z" fill={MINT} />
        <path d="m14 24 6 6 12-13" stroke="#fff" strokeWidth="3.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <Plant x={300} y={214} scale={0.8} />
    </>
  );
}

const VARIANTS = { login: LoginArt, register: RegisterArt, admin: AdminArt };

/** variant: 'login' | 'register' | 'admin' */
export default function AuthArt({ variant = 'login' }) {
  const Art = VARIANTS[variant] || LoginArt;
  return (
    <div className={`auth-art auth-art-${variant}`} aria-hidden="true">
      <svg viewBox="0 0 420 340" focusable="false">
        <Art />
      </svg>
    </div>
  );
}
