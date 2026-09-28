/**
 * AuthArt — Sleek, futuristic fintech glassmorphism illustrations for
 * Login, Register, Admin, and Password Reset screens.
 *
 * Designed to seamlessly blend with CampusCoin's Obsidian & Emerald design system:
 * - Glowing 3D shields and security badges
 * - Luminous holographic student cards and charts
 * - Mint and solar-amber accents
 * - Zero awkward cartoon human figures
 */

export function LoginArt() {
  return (
    <>
      <defs>
        <radialGradient id="login-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.32" />
          <stop offset="60%" stopColor="#059669" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#04241d" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="shield-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="50%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#065f46" />
        </linearGradient>
        <linearGradient id="gold-coin" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="40%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
        <linearGradient id="card-glass" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1e3a34" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#0d231e" stopOpacity="0.85" />
        </linearGradient>
        <filter id="auth-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="12" stdDeviation="16" floodColor="#04241d" floodOpacity="0.6" />
        </filter>
        <filter id="auth-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="10" floodColor="#34d399" floodOpacity="0.5" />
        </filter>
      </defs>

      {/* Ambient background glow */}
      <circle cx="210" cy="170" r="150" fill="url(#login-glow)" />

      {/* Outer ambient decorative orbits */}
      <circle cx="210" cy="170" r="130" fill="none" stroke="rgba(78, 222, 163, 0.12)" strokeWidth="1.5" strokeDasharray="6 8" />
      <circle cx="210" cy="170" r="95" fill="none" stroke="rgba(78, 222, 163, 0.08)" strokeWidth="1" />

      {/* Floating glass verification panel (back) */}
      <g transform="translate(60, 60)" filter="url(#auth-shadow)">
        <rect width="180" height="74" rx="18" fill="url(#card-glass)" stroke="rgba(78, 222, 163, 0.35)" strokeWidth="1.5" />
        <circle cx="36" cy="37" r="18" fill="rgba(16, 185, 129, 0.25)" stroke="#34d399" strokeWidth="1.5" />
        <path d="M28 37l5 5 11-11" fill="none" stroke="#4edea3" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="66" y="26" width="86" height="8" rx="4" fill="#eafff5" opacity="0.95" />
        <rect x="66" y="42" width="56" height="6" rx="3" fill="#6ee7b7" opacity="0.7" />
      </g>

      {/* Center 3D Security Shield */}
      <g transform="translate(160, 110)" filter="url(#auth-shadow)">
        {/* Shield background */}
        <path
          d="M50 10 L94 30 C94 68 76 100 50 114 C24 100 6 68 6 30 Z"
          fill="url(#shield-grad)"
          stroke="#a7f3d0"
          strokeWidth="2.5"
          filter="url(#auth-glow)"
        />
        {/* Inner shield contour */}
        <path
          d="M50 20 L84 36 C84 68 68 94 50 104 C32 94 16 68 16 36 Z"
          fill="none"
          stroke="rgba(255, 255, 255, 0.4)"
          strokeWidth="1.5"
        />
        {/* Shield Lock core */}
        <rect x="36" y="54" width="28" height="24" rx="6" fill="#ffffff" />
        <path d="M42 54V44a8 8 0 0 1 16 0v10" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="50" cy="65" r="3" fill="#065f46" />
        <path d="M50 67v5" stroke="#065f46" strokeWidth="2.5" strokeLinecap="round" />
      </g>

      {/* Floating secondary badge (right) */}
      <g transform="translate(260, 180)" filter="url(#auth-shadow)">
        <rect width="130" height="54" rx="14" fill="url(#card-glass)" stroke="rgba(251, 191, 36, 0.4)" strokeWidth="1.5" />
        <circle cx="28" cy="27" r="14" fill="rgba(245, 158, 11, 0.2)" stroke="#fbbf24" strokeWidth="1.5" />
        <text x="28" y="32" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fbbf24">🔒</text>
        <rect x="50" y="20" width="64" height="6" rx="3" fill="#fff" opacity="0.9" />
        <rect x="50" y="31" width="42" height="5" rx="2.5" fill="#fde68a" opacity="0.75" />
      </g>

      {/* Floating 3D Gold Coins */}
      <g transform="translate(90, 240)" filter="url(#auth-shadow)">
        {/* Bottom coin */}
        <ellipse cx="26" cy="36" rx="26" ry="11" fill="#78350f" />
        <ellipse cx="26" cy="30" rx="26" ry="11" fill="url(#gold-coin)" />
        <ellipse cx="26" cy="30" rx="20" ry="8" fill="none" stroke="#fef08a" strokeWidth="1.5" strokeDasharray="3 2" />
        <text x="26" y="34" textAnchor="middle" fontSize="13" fontWeight="900" fill="#78350f">C</text>

        {/* Top overlapping coin */}
        <g transform="translate(24, -14)">
          <ellipse cx="20" cy="24" rx="20" ry="9" fill="#78350f" />
          <ellipse cx="20" cy="19" rx="20" ry="9" fill="url(#gold-coin)" />
          <ellipse cx="20" cy="19" rx="15" ry="6.5" fill="none" stroke="#fef08a" strokeWidth="1.2" strokeDasharray="3 2" />
          <text x="20" y="23" textAnchor="middle" fontSize="11" fontWeight="900" fill="#78350f">$</text>
        </g>
      </g>

      {/* Sparkling particle stars */}
      <g fill="#4edea3">
        <circle cx="340" cy="80" r="3.5" filter="url(#auth-glow)" />
        <circle cx="80" cy="160" r="2.5" opacity="0.8" />
        <circle cx="290" cy="260" r="3" opacity="0.9" filter="url(#auth-glow)" />
      </g>
      <g fill="#fbbf24">
        <polygon points="350,110 352,116 358,118 352,120 350,126 348,120 342,118 348,116" opacity="0.85" />
        <polygon points="70,100 71,104 75,105 71,106 70,110 69,106 65,105 69,104" opacity="0.75" />
      </g>
    </>
  );
}

export function RegisterArt() {
  return (
    <>
      <defs>
        <radialGradient id="reg-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.30" />
          <stop offset="50%" stopColor="#10b981" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#04241d" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="card-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0f766e" />
          <stop offset="45%" stopColor="#044d3f" />
          <stop offset="100%" stopColor="#022a22" />
        </linearGradient>
        <linearGradient id="chip-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
      </defs>

      {/* Ambient background glow */}
      <circle cx="210" cy="170" r="150" fill="url(#reg-glow)" />
      <circle cx="210" cy="170" r="125" fill="none" stroke="rgba(45, 212, 191, 0.15)" strokeWidth="1.5" strokeDasharray="8 6" />

      {/* 3D Student Smart Card (perspective tilt) */}
      <g transform="translate(100, 75) rotate(-6)" filter="url(#auth-shadow)">
        {/* Card Body */}
        <rect width="230" height="145" rx="18" fill="url(#card-grad)" stroke="rgba(78, 222, 163, 0.4)" strokeWidth="1.8" />

        {/* Decorative holographic wave */}
        <path d="M0 60 Q 60 40, 115 70 T 230 65 L 230 145 L 0 145 Z" fill="rgba(16, 185, 129, 0.12)" />
        <path d="M0 90 Q 70 70, 130 95 T 230 90 L 230 145 L 0 145 Z" fill="rgba(56, 189, 248, 0.10)" />

        {/* Card Header */}
        <circle cx="32" cy="32" r="14" fill="rgba(255, 255, 255, 0.15)" />
        <text x="32" y="37" textAnchor="middle" fontSize="13" fontWeight="900" fill="#a7f3d0">C</text>
        <text x="56" y="32" fontSize="12" fontWeight="800" fill="#eafff5" letterSpacing="0.05em">CAMPUS COIN</text>
        <text x="56" y="44" fontSize="8" fontWeight="600" fill="#6ee7b7" letterSpacing="0.08em">STUDENT PASS</text>

        {/* EMV Chip */}
        <rect x="24" y="60" width="34" height="26" rx="5" fill="url(#chip-grad)" stroke="#b45309" strokeWidth="0.8" />
        <line x1="24" y1="73" x2="58" y2="73" stroke="#92400e" strokeWidth="0.8" />
        <line x1="41" y1="60" x2="41" y2="86" stroke="#92400e" strokeWidth="0.8" />

        {/* Card Number / Details */}
        <rect x="24" y="104" width="130" height="7" rx="3.5" fill="#eafff5" opacity="0.85" />
        <rect x="24" y="120" width="60" height="6" rx="3" fill="#6ee7b7" opacity="0.7" />

        {/* Contactless symbol */}
        <path d="M196 30 a12 12 0 0 1 0 16" fill="none" stroke="#6ee7b7" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M202 26 a18 18 0 0 1 0 24" fill="none" stroke="#6ee7b7" strokeWidth="1.8" strokeLinecap="round" />
      </g>

      {/* Floating Student Free Badge (bottom right) */}
      <g transform="translate(240, 205)" filter="url(#auth-shadow)">
        <rect width="140" height="52" rx="16" fill="url(#card-glass)" stroke="rgba(52, 211, 153, 0.45)" strokeWidth="1.5" />
        <circle cx="28" cy="26" r="14" fill="rgba(16, 185, 129, 0.3)" stroke="#34d399" strokeWidth="1.2" />
        <text x="28" y="31" textAnchor="middle" fontSize="13" fontWeight="900" fill="#4edea3">🎓</text>
        <text x="50" y="24" fontSize="11" fontWeight="800" fill="#ffffff">100% Free</text>
        <text x="50" y="37" fontSize="9" fontWeight="600" fill="#a7f3d0">Student Account</text>
      </g>

      {/* Floating Sparkles & Coins */}
      <g transform="translate(60, 220)" filter="url(#auth-shadow)">
        <ellipse cx="26" cy="30" rx="22" ry="10" fill="#78350f" />
        <ellipse cx="26" cy="25" rx="22" ry="10" fill="url(#gold-coin)" />
        <ellipse cx="26" cy="25" rx="16" ry="7" fill="none" stroke="#fef08a" strokeWidth="1.2" strokeDasharray="3 2" />
        <text x="26" y="29" textAnchor="middle" fontSize="12" fontWeight="900" fill="#78350f">C</text>
      </g>

      <circle cx="340" cy="70" r="3" fill="#38bdf8" filter="url(#auth-glow)" />
      <circle cx="70" cy="180" r="3.5" fill="#34d399" filter="url(#auth-glow)" />
      <polygon points="320,180 322,185 327,187 322,189 320,194 318,189 313,187 318,185" fill="#fde68a" />
    </>
  );
}

export function AdminArt() {
  return (
    <>
      <defs>
        <radialGradient id="admin-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.30" />
          <stop offset="60%" stopColor="#10b981" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#04241d" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bar-1" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#059669" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
        <linearGradient id="bar-2" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#0284c7" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
        <linearGradient id="bar-3" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
        <linearGradient id="bar-4" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>

      {/* Ambient background glow */}
      <circle cx="210" cy="170" r="150" fill="url(#admin-glow)" />

      {/* Glass Analytics Console */}
      <g transform="translate(80, 80)" filter="url(#auth-shadow)">
        <rect width="260" height="160" rx="20" fill="url(#card-glass)" stroke="rgba(99, 102, 241, 0.4)" strokeWidth="1.8" />

        {/* Console Header Bar */}
        <rect x="20" y="20" width="80" height="8" rx="4" fill="#e0e7ff" opacity="0.9" />
        <circle cx="220" cy="24" r="5" fill="#34d399" filter="url(#auth-glow)" />
        <circle cx="236" cy="24" r="5" fill="#fbbf24" />

        {/* Bar Chart Bars */}
        <g transform="translate(24, 60)">
          {/* Baseline */}
          <line x1="0" y1="70" x2="140" y2="70" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="1.5" />

          {/* Bars */}
          <rect x="10" y="32" width="22" height="38" rx="6" fill="url(#bar-1)" />
          <rect x="42" y="18" width="22" height="52" rx="6" fill="url(#bar-2)" />
          <rect x="74" y="8" width="22" height="62" rx="6" fill="url(#bar-3)" />
          <rect x="106" y="24" width="22" height="46" rx="6" fill="url(#bar-4)" />
        </g>

        {/* Circular Progress Gauge */}
        <g transform="translate(195, 95)">
          <circle cx="26" cy="26" r="24" fill="none" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="6" />
          <circle
            cx="26"
            cy="26"
            r="24"
            fill="none"
            stroke="#4edea3"
            strokeWidth="6"
            strokeDasharray="150"
            strokeDashoffset="38"
            strokeLinecap="round"
            transform="rotate(-90 26 26)"
          />
          <text x="26" y="30" textAnchor="middle" fontSize="11" fontWeight="800" fill="#ffffff">99%</text>
        </g>
      </g>

      {/* Floating 3D Golden Admin Key & Shield */}
      <g transform="translate(50, 195)" filter="url(#auth-shadow)">
        <rect width="130" height="52" rx="14" fill="url(#card-glass)" stroke="rgba(251, 191, 36, 0.5)" strokeWidth="1.5" />
        <circle cx="28" cy="26" r="14" fill="rgba(245, 158, 11, 0.25)" stroke="#fbbf24" strokeWidth="1.2" />
        <text x="28" y="31" textAnchor="middle" fontSize="13" fontWeight="900" fill="#fbbf24">🔑</text>
        <text x="50" y="23" fontSize="11" fontWeight="800" fill="#ffffff">Staff Portal</text>
        <text x="50" y="36" fontSize="9" fontWeight="600" fill="#fde68a">256-Bit Encrypted</text>
      </g>

      <circle cx="340" cy="90" r="3.5" fill="#818cf8" filter="url(#auth-glow)" />
      <polygon points="75,65 77,70 82,71 77,73 75,78 73,73 68,71 73,70" fill="#34d399" />
    </>
  );
}

export function ResetArt() {
  return (
    <>
      <defs>
        <radialGradient id="reset-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.28" />
          <stop offset="50%" stopColor="#10b981" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#04241d" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Ambient background glow */}
      <circle cx="210" cy="170" r="150" fill="url(#reset-glow)" />
      <circle cx="210" cy="170" r="115" fill="none" stroke="rgba(56, 189, 248, 0.15)" strokeWidth="1.5" strokeDasharray="6 8" />

      {/* Floating 3D Vault Lock Dial */}
      <g transform="translate(145, 95)" filter="url(#auth-shadow)">
        {/* Outer Ring */}
        <circle cx="65" cy="65" r="62" fill="url(#card-glass)" stroke="rgba(78, 222, 163, 0.4)" strokeWidth="2.5" />
        <circle cx="65" cy="65" r="50" fill="none" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="1.5" strokeDasharray="5 4" />

        {/* Center Golden Dial */}
        <circle cx="65" cy="65" r="32" fill="url(#gold-coin)" stroke="#fef08a" strokeWidth="2" filter="url(#auth-glow)" />
        <circle cx="65" cy="65" r="14" fill="#78350f" />
        <rect x="63" y="38" width="4" height="12" rx="2" fill="#ffffff" />

        {/* Glowing keyhole */}
        <circle cx="65" cy="63" r="3.5" fill="#fef08a" />
        <polygon points="63,64 67,64 66,71 64,71" fill="#fef08a" />
      </g>

      {/* Floating Verification Code Card */}
      <g transform="translate(240, 70)" filter="url(#auth-shadow)">
        <rect width="130" height="54" rx="14" fill="url(#card-glass)" stroke="rgba(56, 189, 248, 0.4)" strokeWidth="1.5" />
        <circle cx="26" cy="27" r="13" fill="rgba(56, 189, 248, 0.25)" stroke="#38bdf8" strokeWidth="1.2" />
        <text x="26" y="31" textAnchor="middle" fontSize="12" fill="#38bdf8">✉️</text>
        <rect x="48" y="20" width="68" height="6" rx="3" fill="#ffffff" opacity="0.9" />
        <rect x="48" y="31" width="46" height="5" rx="2.5" fill="#7dd3fc" opacity="0.75" />
      </g>

      {/* Floating Safe Recovery Badge */}
      <g transform="translate(70, 205)" filter="url(#auth-shadow)">
        <rect width="140" height="50" rx="14" fill="url(#card-glass)" stroke="rgba(52, 211, 153, 0.4)" strokeWidth="1.5" />
        <circle cx="26" cy="25" r="13" fill="rgba(16, 185, 129, 0.25)" stroke="#34d399" strokeWidth="1.2" />
        <path d="M21 25l3.5 3.5 7.5-7.5" fill="none" stroke="#4edea3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <text x="48" y="22" fontSize="11" fontWeight="800" fill="#ffffff">Instant Reset</text>
        <text x="48" y="35" fontSize="9" fontWeight="600" fill="#a7f3d0">Encrypted Email OTP</text>
      </g>

      <circle cx="340" cy="180" r="3" fill="#38bdf8" filter="url(#auth-glow)" />
      <polygon points="90,90 92,94 96,95 92,96 90,100 88,96 84,95 88,94" fill="#fbbf24" />
    </>
  );
}

const VARIANTS = { login: LoginArt, register: RegisterArt, admin: AdminArt, reset: ResetArt };

/** variant: 'login' | 'register' | 'admin' | 'reset' */
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
