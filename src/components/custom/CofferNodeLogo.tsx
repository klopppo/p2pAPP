import type { FC, SVGProps } from 'react'

interface CofferNodeLogoProps extends SVGProps<SVGSVGElement> {
  variant?: 'icon' | 'cn' | 'full' | 'cn-full'
  theme?: 'color' | 'white' | 'black' | 'gray'
}

const FONT = "Inter,system-ui,-apple-system,sans-serif"

/**
 * CofferNode Logo — Circle-CN Mark.
 * Geometric CN monogram inside concentric circles,
 * with the N-stroke extending through the ring.
 */
export const CofferNodeLogo: FC<CofferNodeLogoProps> = ({
  variant = 'full',
  theme = 'color',
  ...props
}) => {
  const mono = theme !== 'color'
  const gray = theme === 'gray'
  const darkBg = theme === 'white' || theme === 'color'
  const fg = gray ? '#94A3B8' : theme === 'black' ? '#0F172A' : '#F8FAFC'
  const accent = mono ? fg : '#00E5FF'
  const accentSec = mono ? fg : '#C8F31E'

  // Color fills for the Circle-CN geometry
  const ringOuter = darkBg ? '#0B0F12' : '#FFFFFF'
  const ringInner = darkBg ? '#FFFFFF' : '#0B0F12'
  const barFill = darkBg ? '#0B0F12' : '#FFFFFF'
  const barStroke = darkBg ? '#0B0F12' : '#FFFFFF'
  const bgRect = darkBg ? '#FFFFFF' : '#0B0F12'

  // ──────────────── ICON MARK (100×100 viewBox) ────────────────
  if (variant === 'icon') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" {...props}>
        <rect width="100" height="100" rx="18" fill={bgRect} />
        <circle cx="50" cy="50" r="34" fill={ringOuter} />
        <circle cx="50" cy="50" r="22" fill={ringInner} />
        <rect x="70" y="28" width="16" height="44" fill={ringInner} />
        <rect x="36" y="36" width="4" height="28" rx="1" fill={barFill} />
        <rect x="52" y="36" width="4" height="28" rx="1" fill={barFill} />
        <path d="M40 36 L56 64" stroke={barStroke} strokeWidth="4" strokeLinecap="round" />
        {!mono && (
          <>
            <circle cx="78" cy="18" r="3" fill={accentSec} />
            <circle cx="86" cy="24" r="2.4" fill={accentSec} />
            <circle cx="82" cy="12" r="2" fill={accentSec} />
            <line x1="78" y1="18" x2="86" y2="24" stroke={accentSec} strokeWidth="0.8" opacity="0.4" />
            <line x1="78" y1="18" x2="82" y2="12" stroke={accentSec} strokeWidth="0.8" opacity="0.4" />
            <line x1="82" y1="12" x2="86" y2="24" stroke={accentSec} strokeWidth="0.8" opacity="0.4" />
          </>
        )}
      </svg>
    )
  }

  // ──────────────── CN MONOGRAM (100×100 viewBox) ────────────────
  if (variant === 'cn') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" {...props}>
        <circle cx="50" cy="50" r="34" stroke={accent} strokeWidth="1.8" fill="none" opacity="0.3" />
        <circle cx="50" cy="50" r="22" stroke={accent} strokeWidth="1.8" fill="none" opacity="0.3" />
        <text
          x="50" y="56"
          textAnchor="middle"
          fontFamily={FONT}
          fontSize="22"
          fontWeight="800"
          letterSpacing="-0.5"
          fill={accent}
        >CN</text>
        {!mono && (
          <>
            <circle cx="78" cy="18" r="2.4" fill={accentSec} />
            <circle cx="86" cy="24" r="2" fill={accentSec} />
          </>
        )}
      </svg>
    )
  }

  // ──────────────── FULL WORDMARK ────────────────
  const isCn = variant === 'cn-full'

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 100" fill="none" {...props}>
      {/* Mark — left side */}
      <g transform="translate(8, 8)">
        {isCn ? (
          <>
            <circle cx="42" cy="42" r="34" stroke={accent} strokeWidth="1.8" fill="none" opacity="0.3" />
            <circle cx="42" cy="42" r="22" stroke={accent} strokeWidth="1.8" fill="none" opacity="0.3" />
            <text
              x="42" y="48"
              textAnchor="middle"
              fontFamily={FONT}
              fontSize="18"
              fontWeight="800"
              letterSpacing="-0.5"
              fill={accent}
            >CN</text>
            <circle cx="70" cy="10" r="2" fill={accentSec} />
            <circle cx="78" cy="16" r="1.6" fill={accentSec} />
          </>
        ) : (
          <>
            <rect width="84" height="84" rx="15" fill={bgRect} />
            <circle cx="42" cy="42" r="28" fill={ringOuter} />
            <circle cx="42" cy="42" r="18" fill={ringInner} />
            <rect x="58" y="23" width="14" height="38" fill={ringInner} />
            <rect x="30" y="30" width="3.5" height="24" rx="1" fill={barFill} />
            <rect x="44" y="30" width="3.5" height="24" rx="1" fill={barFill} />
            <path d="M33 30 L48 54" stroke={barStroke} strokeWidth="3.5" strokeLinecap="round" />
            {!mono && (
              <>
                <circle cx="68" cy="14" r="2.6" fill={accentSec} />
                <circle cx="75" cy="19" r="2" fill={accentSec} />
                <circle cx="71" cy="9" r="1.7" fill={accentSec} />
                <line x1="68" y1="14" x2="75" y2="19" stroke={accentSec} strokeWidth="0.7" opacity="0.4" />
                <line x1="68" y1="14" x2="71" y2="9" stroke={accentSec} strokeWidth="0.7" opacity="0.4" />
                <line x1="71" y1="9" x2="75" y2="19" stroke={accentSec} strokeWidth="0.7" opacity="0.4" />
              </>
            )}
          </>
        )}
      </g>

      {/* Brand Name */}
      <text
        x="110" y="52"
        fontFamily={FONT}
        fontSize="34"
        fontWeight="800"
        letterSpacing="-0.8"
        fill={fg}
      >
        Coffer<tspan fill={gray ? '#0F172A' : mono ? accent : '#00E5FF'}>Node</tspan>
      </text>

      {/* Subtitle */}
      <text
        x="112" y="68"
        fontFamily={FONT}
        fontSize="9"
        fontWeight="700"
        letterSpacing="4"
        fill={mono ? fg : '#94A3B8'}
        opacity={mono ? 0.5 : 1}
      >
        P2P
      </text>
    </svg>
  )
}
