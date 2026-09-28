/**
 * FaqArt — FAQ section illustration.
 * Tactile Minimalism x Luminous Glassmorphism.
 * Clean, high-tech fintech graphic: floating query glass cards, security shield,
 * 3D coin stack, and emerald ambient light. No awkward characters.
 */
export default function FaqArt() {
  return (
    <svg
      className="faq-art"
      viewBox="0 0 420 400"
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="faq-bg-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
          <stop offset="60%" stopColor="#051424" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#051424" stopOpacity="0" />
        </radialGradient>

        <radialGradient id="faq-circle" cx="40%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#142a22" />
          <stop offset="60%" stopColor="#0c1d29" />
          <stop offset="100%" stopColor="#051424" />
        </radialGradient>

        <linearGradient id="faq-glass-card" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1c2b3c" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#0f1d2a" stopOpacity="0.88" />
        </linearGradient>

        <linearGradient id="faq-glass-sub" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#162635" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#0a1824" stopOpacity="0.82" />
        </linearGradient>

        <linearGradient id="faq-primary-glow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#4edea3" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>

        <linearGradient id="faq-coin-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe28a" />
          <stop offset="40%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>

        <filter id="faq-filter-glow" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id="faq-soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.5" />
        </filter>
      </defs>

      {/* Main ambient glow & geometric circle */}
      <circle cx="210" cy="200" r="176" fill="url(#faq-bg-glow)" />
      <circle cx="210" cy="200" r="162" fill="url(#faq-circle)" stroke="#4edea3" strokeWidth="1.2" strokeOpacity="0.18" />

      {/* Subtle orbital dash rings */}
      <circle cx="210" cy="200" r="182" fill="none" stroke="#4edea3" strokeWidth="1" strokeDasharray="6 8" strokeOpacity="0.12" />
      <circle cx="210" cy="200" r="130" fill="none" stroke="#10b981" strokeWidth="1" strokeDasharray="3 6" strokeOpacity="0.1" />

      {/* Ambient glowing float dots */}
      <circle cx="58" cy="74" r="16" fill="#ffb95f" opacity="0.18" />
      <circle cx="58" cy="74" r="7" fill="#ffb95f" opacity="0.45" />
      <circle cx="372" cy="98" r="14" fill="#4edea3" opacity="0.18" />
      <circle cx="372" cy="98" r="6" fill="#4edea3" opacity="0.5" />
      <circle cx="48" cy="318" r="10" fill="#60a5fa" opacity="0.25" />
      <circle cx="380" cy="290" r="12" fill="#a78bfa" opacity="0.22" />

      {/* Card 1: Question Bubble (Top Left) */}
      <g filter="url(#faq-soft-shadow)">
        <g filter="url(#faq-filter-glow)">
          <rect x="24" y="38" width="220" height="84" rx="20" fill="url(#faq-glass-card)" stroke="#4edea3" strokeWidth="1.3" strokeOpacity="0.4" />
        </g>
        <circle cx="60" cy="80" r="20" fill="#ffb95f" opacity="0.95" />
        {/* Question mark glyph */}
        <path d="M54 74a6 6 0 0 1 11 1.6c0 4.2-5.5 5.2-5.5 8.4" stroke="#472a00" strokeWidth="3" fill="none" strokeLinecap="round" />
        <circle cx="59.5" cy="88" r="2.2" fill="#472a00" />
        
        {/* Question text placeholder lines */}
        <rect x="94" y="68" width="130" height="9" rx="4.5" fill="#4edea3" opacity="0.85" />
        <rect x="94" y="85" width="92" height="8" rx="4" fill="#94a3b8" opacity="0.55" />
      </g>

      {/* Card 2: Interactive Search / Quick Answer (Center-Right) */}
      <g filter="url(#faq-soft-shadow)">
        <rect x="160" y="142" width="236" height="124" rx="22" fill="url(#faq-glass-card)" stroke="#4edea3" strokeWidth="1.4" strokeOpacity="0.55" />
        
        {/* Search header / badge */}
        <circle cx="196" cy="182" r="18" fill="url(#faq-primary-glow)" />
        {/* Sparkle / check icon inside badge */}
        <path d="M190 182 l4 4 9-9" stroke="#003824" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        
        {/* Content rows */}
        <rect x="228" y="171" width="144" height="10" rx="5" fill="#f4fffb" opacity="0.95" />
        <rect x="228" y="190" width="120" height="8" rx="4" fill="#94a3b8" opacity="0.65" />
        
        {/* Divider */}
        <line x1="184" y1="214" x2="372" y2="214" stroke="#4edea3" strokeWidth="1" strokeOpacity="0.2" />
        
        {/* Tags / Pills inside card */}
        <rect x="184" y="226" width="62" height="22" rx="11" fill="rgba(78, 222, 163, 0.15)" stroke="#4edea3" strokeWidth="0.8" strokeOpacity="0.5" />
        <circle cx="196" cy="237" r="4" fill="#4edea3" />
        <rect x="206" y="234" width="30" height="6" rx="3" fill="#4edea3" opacity="0.8" />
        
        <rect x="254" y="226" width="70" height="22" rx="11" fill="rgba(255, 185, 95, 0.15)" stroke="#ffb95f" strokeWidth="0.8" strokeOpacity="0.4" />
        <circle cx="266" cy="237" r="4" fill="#ffb95f" />
        <rect x="276" y="234" width="38" height="6" rx="3" fill="#ffb95f" opacity="0.8" />
      </g>

      {/* Card 3: Security & Verification Chip (Left) */}
      <g filter="url(#faq-soft-shadow)">
        <rect x="34" y="174" width="148" height="46" rx="23" fill="url(#faq-glass-sub)" stroke="#4edea3" strokeWidth="1" strokeOpacity="0.35" />
        <circle cx="58" cy="197" r="14" fill="#10b981" opacity="0.25" />
        <circle cx="58" cy="197" r="10" fill="#10b981" opacity="0.8" />
        <path d="M54 197 l3 3 6-6" stroke="#003824" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="80" y="193" width="86" height="8" rx="4" fill="#d4e4fa" opacity="0.8" />
      </g>

      {/* Card 4: 256-bit Encryption Chip (Lower Left) */}
      <g filter="url(#faq-soft-shadow)">
        <rect x="44" y="238" width="138" height="44" rx="22" fill="url(#faq-glass-sub)" stroke="#ffb95f" strokeWidth="1" strokeOpacity="0.32" />
        <circle cx="68" cy="260" r="13" fill="#ffb95f" opacity="0.25" />
        <rect x="63" y="258" width="10" height="9" rx="2" fill="#ffb95f" />
        <path d="M65 258 v-3 a3 3 0 0 1 6 0 v3" stroke="#ffb95f" strokeWidth="2" fill="none" />
        <rect x="90" y="256" width="76" height="8" rx="4" fill="#d4e4fa" opacity="0.7" />
      </g>

      {/* Card 5: Student Privacy Guarantee (Bottom Left) */}
      <g filter="url(#faq-soft-shadow)">
        <rect x="36" y="300" width="154" height="46" rx="23" fill="url(#faq-glass-sub)" stroke="#a78bfa" strokeWidth="1" strokeOpacity="0.35" />
        <circle cx="60" cy="323" r="13" fill="#a78bfa" opacity="0.25" />
        <path d="M60 315 l6 4-6 4-6-4z" fill="#a78bfa" />
        <rect x="82" y="319" width="92" height="8" rx="4" fill="#d4e4fa" opacity="0.7" />
      </g>

      {/* Stacks of 3D Gold Coins (Bottom Right) */}
      <g transform="translate(268, 290)">
        {/* Glow behind coins */}
        <ellipse cx="40" cy="46" rx="54" ry="18" fill="#f59e0b" opacity="0.2" filter="url(#faq-filter-glow)" />

        {/* Coin Stack 1 (Back left) */}
        <ellipse cx="20" cy="48" rx="22" ry="8" fill="#92400e" opacity="0.6" />
        <ellipse cx="20" cy="42" rx="22" ry="8" fill="url(#faq-coin-grad)" stroke="#fff" strokeWidth="0.5" strokeOpacity="0.4" />
        <ellipse cx="20" cy="36" rx="22" ry="8" fill="url(#faq-coin-grad)" stroke="#fff" strokeWidth="0.5" strokeOpacity="0.4" />
        <ellipse cx="20" cy="30" rx="22" ry="8" fill="url(#faq-coin-grad)" stroke="#fff" strokeWidth="0.5" strokeOpacity="0.4" />
        <text x="20" y="33" textAnchor="middle" fontSize="11" fontWeight="800" fill="#78350f">$</text>

        {/* Coin Stack 2 (Front right) */}
        <ellipse cx="58" cy="54" rx="24" ry="9" fill="#92400e" opacity="0.6" />
        <ellipse cx="58" cy="48" rx="24" ry="9" fill="url(#faq-coin-grad)" stroke="#fff" strokeWidth="0.5" strokeOpacity="0.4" />
        <ellipse cx="58" cy="42" rx="24" ry="9" fill="url(#faq-coin-grad)" stroke="#fff" strokeWidth="0.5" strokeOpacity="0.4" />
        <ellipse cx="58" cy="36" rx="24" ry="9" fill="url(#faq-coin-grad)" stroke="#fff" strokeWidth="0.5" strokeOpacity="0.4" />
        <ellipse cx="58" cy="30" rx="24" ry="9" fill="url(#faq-coin-grad)" stroke="#fff" strokeWidth="0.5" strokeOpacity="0.4" />
        <text x="58" y="34" textAnchor="middle" fontSize="12" fontWeight="800" fill="#78350f">$</text>

        {/* Single Tilted Coin in front */}
        <g transform="rotate(-18 84 46)">
          <ellipse cx="84" cy="46" rx="16" ry="12" fill="url(#faq-coin-grad)" stroke="#fef08a" strokeWidth="1.2" />
          <text x="84" y="49.5" textAnchor="middle" fontSize="10" fontWeight="900" fill="#78350f">$</text>
        </g>
      </g>

      {/* Sparkling Stars & Twinkles */}
      <g transform="translate(348, 230)" fill="#ffb95f">
        <path d="M0 12c1.2 5.5 2.5 6.8 8 8-5.5 1.2-6.8 2.5-8 8-1.2-5.5-2.5-6.8-8-8 5.5-1.2 6.8-2.5 8-8Z" />
      </g>
      <g transform="translate(196, 68)" fill="#4edea3">
        <path d="M0 9c1 4.2 2 5.2 6 6-4 0.8-5 1.8-6 6-1-4.2-2-5.2-6-6 4-0.8 5-1.8 6-6Z" opacity="0.8" />
      </g>
      <g transform="translate(142, 290)" fill="#4edea3">
        <path d="M0 7c0.8 3.5 1.5 4.2 5 5-3.5 0.8-4.2 1.5-5 5-0.8-3.5-1.5-4.2-5-5 3.5-0.8 4.2-1.5 5-5Z" opacity="0.75" />
      </g>
      <circle cx="360" cy="180" r="3" fill="#ffb95f" opacity="0.6" />
      <circle cx="112" cy="148" r="3.5" fill="#4edea3" opacity="0.5" />
      <circle cx="230" cy="340" r="2.5" fill="#4edea3" opacity="0.6" />
    </svg>
  );
}