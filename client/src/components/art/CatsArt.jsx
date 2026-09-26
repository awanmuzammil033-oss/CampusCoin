/**
 * CatsArt — the picture that fills the right half of the "Built for student
 * life" section.
 *
 * The section lists the six categories a student's money actually splits into,
 * so the picture is a campus day made of exactly those six: a hostel block with
 * a clock tower, a food cart, the bus, a bench with books, a game controller and
 * a phone playing something — with two students living it. Flat vector with its
 * own bright colours, the same drawing language as AuthArt and FaqArt: no theme
 * tokens, so it looks identical in light and dark mode and never goes muddy on
 * the deep-green landing page.
 *
 * Layout is planned in bands so nothing overlaps: sky above 200, the path the
 * figures stand on from 206-232, the road from 232-268, the front verge below
 * that. The top-right corner is kept pale and empty — the handwritten caption
 * ("Pay for your dreams") sits there, in dark ink so it reads against the sky.
 */

const SKIN = '#f6c9a0';
const SKIN_DEEP = '#e2ab7d';
const HAIR = '#2f2622';
const HAIR_LIGHT = '#63493a';

const SKY_TOP = '#bfe6ff';
const SKY_BOTTOM = '#e9f7ff';
const SUN = '#ffd76e';
const CLOUD = '#ffffff';

const GRASS = '#7cc98a';
const GRASS_DARK = '#4fae6a';
const PATH = '#f2e3ca';
const ROAD = '#59636f';
const ROAD_LIGHT = '#7b8590';

const BRICK = '#e2705a';
const BRICK_DARK = '#c4553f';
const ROOF = '#2f6f8f';
const ROOF_DARK = '#1f5570';
const WINDOW = '#cde9f8';
const DOOR = '#7c5a3a';

const TEE_BLUE = '#3f7fd6';
const TEE_BLUE_DARK = '#2d63b0';
const TEE_MINT = '#2fb89a';
const TEE_MINT_DARK = '#1f9a80';
const PANTS = '#2f3e53';
const SHOE = '#1f2937';

const BUS = '#f7bd45';
const BUS_DARK = '#dd9a24';
const BUS_WINDOW = '#dceffb';
const CART = '#ef5f5f';
const CART_DARK = '#d14646';

const AMBER = '#fbbf24';
const AMBER_DARK = '#d99a06';
const VIOLET = '#8b7cf6';
const PINK = '#f472b6';
const MINT = '#34d399';
const BOOK = '#4f7dd6';
const PAPER = '#ffffff';
const LINE = '#cbd5e1';

export default function CatsArt() {
  return (
    <svg className="lp2-scene" viewBox="0 0 460 300" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="cats-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={SKY_TOP} />
          <stop offset="1" stopColor={SKY_BOTTOM} />
        </linearGradient>
      </defs>

      {/* ------------------------------- sky -------------------------------- */}
      <rect width="460" height="206" fill="url(#cats-sky)" />
      <circle cx="396" cy="66" r="30" fill={SUN} />
      <circle cx="396" cy="66" r="42" fill={SUN} opacity="0.26" />
      <g fill={CLOUD}>
        <path d="M22 54c0-8 6-15 15-15 3-8 10-12 18-12 11 0 20 7 22 17 7 1 12 7 12 14H22z" opacity="0.95" />
        <path d="M232 36c0-6 5-11 11-11 2-6 8-9 14-9 9 0 16 5 17 13 5 1 9 5 9 11h-51z" opacity="0.8" />
      </g>

      {/* -------------------- grass, path, road, verge --------------------- */}
      <rect y="200" width="460" height="100" fill={GRASS} />
      <rect y="206" width="460" height="26" fill={PATH} />
      <rect y="232" width="460" height="36" fill={ROAD} />
      <path d="M0 232h460v5H0z" fill={ROAD_LIGHT} />
      <path d="M0 244h460" stroke="#f8fafc" strokeWidth="3" strokeDasharray="16 15" opacity="0.8" />
      <rect y="268" width="460" height="32" fill={GRASS_DARK} />

      {/* --------------------------- hostel block -------------------------- */}
      <g>
        <rect x="18" y="120" width="148" height="94" rx="5" fill={BRICK} />
        <rect x="18" y="120" width="148" height="14" rx="5" fill={BRICK_DARK} />
        <polygon points="12,122 92,70 172,122" fill={ROOF} />
        <rect x="116" y="74" width="34" height="140" rx="3" fill={BRICK_DARK} />
        <polygon points="111,76 133,44 155,76" fill={ROOF_DARK} />
        <circle cx="133" cy="96" r="12" fill={PAPER} />
        <path d="M133 96v-8M133 96l6 4" stroke="#1f2937" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        <g fill={WINDOW}>
          <rect x="32" y="146" width="19" height="21" rx="3" />
          <rect x="58" y="146" width="19" height="21" rx="3" />
          <rect x="32" y="176" width="19" height="21" rx="3" />
          <rect x="58" y="176" width="19" height="21" rx="3" />
        </g>
        <rect x="90" y="166" width="24" height="48" rx="4" fill={DOOR} />
        <circle cx="108" cy="190" r="2.4" fill="#fde68a" />
        <path d="M84 162h36l-6-10H90z" fill={AMBER} />
        <rect x="30" y="128" width="46" height="14" rx="7" fill="#fde68a" />
        <rect x="37" y="133" width="32" height="4" rx="2" fill="#b45309" />
      </g>

      {/* ------------------------------ trees ------------------------------ */}
      <g>
        <rect x="196" y="176" width="9" height="34" rx="4" fill="#8a5a3b" />
        <circle cx="200" cy="164" r="25" fill={GRASS} />
        <circle cx="186" cy="176" r="16" fill={GRASS_DARK} />
        <rect x="342" y="172" width="9" height="38" rx="4" fill="#8a5a3b" />
        <circle cx="346" cy="158" r="24" fill={GRASS} />
        <circle cx="332" cy="170" r="15" fill={GRASS_DARK} />
      </g>

      {/* --------------------------- food cart ----------------------------- */}
      {/* a striped awning on two poles, a burger on the counter, a green tick
          for the "canteen prices" the app is meant to keep an eye on */}
      <g>
        <rect x="182" y="178" width="64" height="30" rx="5" fill={CART} />
        <path d="M182 198h64l-4 10h-56z" fill={CART_DARK} />
        <rect x="176" y="174" width="76" height="7" rx="3.5" fill="#fde68a" />
        <path d="M178 174l9-20h52l9 20z" fill={CART} />
        <g fill={PAPER} opacity="0.92">
          <path d="M187 154h10l-4 20h-11z" />
          <path d="M207 154h10l-2 20h-10z" />
          <path d="M227 154h10l0 20h-10z" />
        </g>
        <path d="M178 174h70l-3 5h-64z" fill={CART_DARK} />
        <rect x="180" y="152" width="4" height="22" fill="#9aa5b1" />
        <rect x="244" y="152" width="4" height="22" fill="#9aa5b1" />
        <g transform="translate(214 166)">
          <ellipse cx="0" cy="4" rx="12" ry="4.5" fill="#e9a23b" />
          <path d="M-12 4a12 10 0 0 1 24 0z" fill="#f7c66b" />
          <path d="M-8 0a8 6 0 0 1 16 0" fill="#fde68a" />
          <g fill={PAPER}>
            <circle cx="-5" cy="1" r="1.3" />
            <circle cx="1" cy="-1" r="1.3" />
            <circle cx="6" cy="1" r="1.3" />
          </g>
        </g>
        <rect x="190" y="208" width="5" height="14" fill="#9aa5b1" />
        <rect x="234" y="208" width="5" height="14" fill="#9aa5b1" />
        <circle cx="250" cy="186" r="8" fill={MINT} />
        <path d="M246 186l3 3 5-6" stroke={PAPER} strokeWidth="2.4" strokeLinecap="round" fill="none" />
      </g>

      {/* ------------- student 2: books under one arm, phone in hand -------- */}
      <g>
        <ellipse cx="322" cy="230" rx="20" ry="4" fill="#1f2937" opacity="0.12" />
        {/* backpack, worn on the back */}
        <rect x="302" y="182" width="15" height="26" rx="7" fill={VIOLET} />
        <rect x="304" y="192" width="11" height="7" rx="3" fill="#c4b5fd" />
        <rect x="313" y="164" width="18" height="14" rx="6" fill={SKIN_DEEP} />
        <circle cx="322" cy="150" r="16" fill={SKIN} />
        <path d="M306 152c0-12 7-19 16-19s16 7 16 19c-3-6-8-9-16-9s-13 3-16 9z" fill={HAIR_LIGHT} />
        <g fill="#3b2f2a">
          <circle cx="317" cy="152" r="1.7" />
          <circle cx="327" cy="152" r="1.7" />
        </g>
        <path d="M316 158c2 2.4 4.6 2.4 6.6 0" stroke="#a2543f" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        <path d="M303 226c0-23 8-38 19-38s19 15 19 38z" fill={TEE_MINT} />
        <path d="M322 188c-5 4-8 8-8 12h16c0-4-3-8-8-12z" fill={TEE_MINT_DARK} />
        {/* books held against the chest */}
        <g transform="translate(300 196) rotate(-8)">
          <rect x="-10" y="0" width="24" height="7" rx="2" fill={BOOK} />
          <rect x="-8" y="-8" width="22" height="7" rx="2" fill={PINK} />
          <rect x="-10" y="-16" width="20" height="7" rx="2" fill={MINT} />
        </g>
        {/* phone held up, playing something */}
        <g transform="rotate(8 346 180)">
          <rect x="335" y="158" width="24" height="40" rx="6" fill="#1f2937" />
          <rect x="338" y="162" width="18" height="30" rx="3" fill="#c7d9ff" />
          <path d="M346 171l8 7-8 7z" fill={TEE_BLUE} />
          <rect x="344" y="194" width="6" height="2" rx="1" fill="#64748b" />
        </g>
        <path d="M340 200c-3 6-4 12-3 18" stroke={SKIN} strokeWidth="7" strokeLinecap="round" fill="none" />
        <rect x="313" y="214" width="9" height="16" rx="4" fill={PANTS} />
        <rect x="325" y="214" width="9" height="16" rx="4" fill={PANTS} />
        <rect x="309" y="228" width="16" height="7" rx="3.5" fill={SHOE} />
        <rect x="324" y="228" width="16" height="7" rx="3.5" fill={SHOE} />
      </g>

      {/* ---------------- student 1: at the counter, mid-bite --------------- */}
      <g>
        <ellipse cx="262" cy="230" rx="19" ry="4" fill="#1f2937" opacity="0.12" />
        <rect x="253" y="160" width="19" height="15" rx="7" fill={SKIN_DEEP} />
        <circle cx="262" cy="146" r="17" fill={SKIN} />
        <path d="M245 148c0-13 8-21 17-21s17 8 17 21c-3-7-9-10-17-10s-14 3-17 10z" fill={HAIR} />
        <g fill="#3b2f2a">
          <circle cx="257" cy="148" r="1.8" />
          <circle cx="267" cy="148" r="1.8" />
        </g>
        <path d="M256 154c2 2.4 4.6 2.4 6.6 0" stroke="#a2543f" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        <path d="M243 226c0-24 8-40 19-40s19 16 19 40z" fill={TEE_BLUE} />
        <path d="M262 184c-6 5-9 10-9 15h18c0-5-3-10-9-15z" fill={TEE_BLUE_DARK} />
        {/* arm out to the counter, burger in hand */}
        <path d="M248 196c-5 7-8 13-8 19" stroke={SKIN} strokeWidth="7" strokeLinecap="round" fill="none" />
        <g transform="translate(234 200)">
          <ellipse cx="0" cy="4" rx="11" ry="4" fill="#e9a23b" />
          <path d="M-11 4a11 9 0 0 1 22 0z" fill="#f7c66b" />
          <path d="M-7 0a7 5 0 0 1 14 0" fill="#fde68a" />
        </g>
        <rect x="253" y="212" width="9" height="16" rx="4" fill={PANTS} />
        <rect x="265" y="212" width="9" height="16" rx="4" fill={PANTS} />
        <rect x="249" y="226" width="16" height="7" rx="3.5" fill={SHOE} />
        <rect x="264" y="226" width="16" height="7" rx="3.5" fill={SHOE} />
      </g>

      {/* ------------------------------- bus -------------------------------- */}
      <g>
        <ellipse cx="404" cy="258" rx="56" ry="5" fill="#1f2937" opacity="0.16" />
        <rect x="354" y="196" width="100" height="44" rx="10" fill={BUS} />
        <path d="M354 216h100v14a10 10 0 0 1-10 10H364a10 10 0 0 1-10-10z" fill={BUS_DARK} />
        <rect x="361" y="203" width="26" height="20" rx="5" fill={BUS_WINDOW} />
        <rect x="391" y="203" width="26" height="20" rx="5" fill={BUS_WINDOW} />
        <rect x="421" y="203" width="26" height="20" rx="5" fill={BUS_WINDOW} />
        <circle cx="374" cy="242" r="9" fill="#1f2937" />
        <circle cx="374" cy="242" r="3.6" fill="#cbd5e1" />
        <circle cx="436" cy="242" r="9" fill="#1f2937" />
        <circle cx="436" cy="242" r="3.6" fill="#cbd5e1" />
      </g>

      {/* ----------------------------- sparkles ----------------------------- */}
      <g fill={AMBER}>
        <path d="M196 70c1.2 6 2.6 7.4 8.6 8.6-6 1.2-7.4 2.6-8.6 8.6-1.2-6-2.6-7.4-8.6-8.6 6-1.2 7.4-2.6 8.6-8.6Z" />
        <path d="M232 112c.8 4 1.7 5 5.7 5.7-4 .8-4.9 1.7-5.7 5.7-.8-4-1.7-5-5.7-5.7 4-.8 4.9-1.7 5.7-5.7Z" opacity="0.7" />
      </g>
      <g fill={PINK} opacity="0.9">
        <circle cx="258" cy="96" r="4" />
        <circle cx="272" cy="110" r="2.6" />
      </g>
      <g fill={MINT}>
        <circle cx="452" cy="120" r="3.4" />
        <circle cx="440" cy="132" r="2.2" />
      </g>
    </svg>
  );
}
