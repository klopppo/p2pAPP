import { useId } from 'react'
import type { FC, SVGProps } from 'react'

interface CofferNodeLogoProps extends SVGProps<SVGSVGElement> {
  variant?: 'icon' | 'cn' | 'full' | 'cn-full'
  theme?: 'color' | 'white' | 'black' | 'gray'
}

const FONT = "Inter,system-ui,-apple-system,sans-serif"

/**
 * CofferNode Logo — 3D Glass Tazzina Mark.
 * Italian espresso cup (tazzina) partially filled with glowing liquid,
 * cat eye floating inside the liquid, P2P nodes orbiting above.
 * The cup = non-custodial vault (transparent = trustless).
 * The liquid = magic of anonymity.
 * The eye = watchful guardian.
 * The nodes = decentralized P2P network.
 */
export const CofferNodeLogo: FC<CofferNodeLogoProps> = ({
  variant = 'full',
  theme = 'color',
  ...props
}) => {
  const uid = useId().replace(/:/g, '')
  const mono = theme !== 'color'
  const gray = theme === 'gray'
  const fg = gray ? '#94A3B8' : theme === 'black' ? '#0F172A' : '#F8FAFC'
  const accent = mono ? fg : '#00E5FF'
  const accentSec = mono ? fg : '#C8F31E'
  const g = `g-${uid}`
  const gl = `gl-${uid}`
  const gm = `gm-${uid}`
  const gc = `gc-${uid}`
  const clip = `clip-${uid}`

  // ──────────────── ICON MARK (64×64) ────────────────
  if (variant === 'icon') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" {...props}>
        <defs>
          {!mono && (
            <>
              <linearGradient id={g} x1="18" y1="14" x2="46" y2="56">
                <stop offset="0%" stopColor="#00E5FF" />
                <stop offset="50%" stopColor="#00FF87" />
                <stop offset="100%" stopColor="#C8F31E" />
              </linearGradient>
              <linearGradient id={gl} x1="18" y1="42" x2="46" y2="42">
                <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.55" />
                <stop offset="50%" stopColor="#00FF87" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#C8F31E" stopOpacity="0.35" />
              </linearGradient>
              <radialGradient id={gm} cx="50%" cy="50%">
                <stop offset="0%" stopColor="#00FFCC" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#00C9A7" stopOpacity="0.4" />
              </radialGradient>
              <radialGradient id={gc} cx="50%" cy="50%">
                <stop offset="0%" stopColor="#C8F31E" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#C8F31E" stopOpacity="0" />
              </radialGradient>
            </>
          )}
          <clipPath id={clip}>
            <path d="M18 14 C18 14 20 24 22 30 C24.5 38 30 44 32 47 C34 44 39.5 38 42 30 C44 24 46 14 46 14 Z" />
          </clipPath>
        </defs>

        {/* Handle behind the cup */}
        <path
          d="M46 24 C54 24 56 34 56 38 C56 42 52 48 44 46"
          stroke={mono ? accent : `url(#${g})`}
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />

        {/* Cup body — glass vessel */}
        <path
          d="M18 14 C18 14 20 24 22 30 C24.5 38 30 44 32 47 C34 44 39.5 38 42 30 C44 24 46 14 46 14 Z"
          stroke={mono ? accent : `url(#${g})`}
          strokeWidth="2.5"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Liquid inside — clipped to cup */}
        {!mono && (
          <g clipPath={`url(#${clip})`}>
            <path
              d="M18 36 C24 33 40 33 46 36 L46 50 C46 50 40 52 32 52 C24 52 18 50 18 50 Z"
              fill={`url(#${gl})`}
            />
            {/* Subtle wave */}
            <path
              d="M18 37 C24 35 40 35 46 37"
              stroke={mono ? accent : '#00FF87'}
              strokeWidth="0.8"
              fill="none"
              opacity="0.5"
            />
          </g>
        )}

        {/* Glass highlight — left reflection */}
        <path
          d="M22 18 C23 22 24 30 25 38"
          stroke={mono ? fg : '#FFFFFF'}
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          opacity={mono ? 0.2 : 0.35}
        />

        {/* Rim */}
        <path
          d="M16 14 L48 14"
          stroke={mono ? accent : `url(#${g})`}
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Cat Eye — floating in liquid */}
        <g clipPath={`url(#${clip})`}>
          <path
            d="M24 41 C28 37 36 37 40 41 C36 45 28 45 24 41 Z"
            stroke={mono ? accent : '#00FFCC'}
            strokeWidth="1.4"
            fill="none"
          />
          <path
            d="M32 38.5 C33.2 39.8 33.2 42.2 32 43.5 C30.8 42.2 30.8 39.8 32 38.5 Z"
            fill={mono ? accent : `url(#${gm})`}
          />
          {/* Eye glow */}
          {!mono && (
            <circle cx="32" cy="41" r="4" fill={`url(#${gc})`} />
          )}
        </g>

        {/* Stem */}
        <path
          d="M32 47 L32 52"
          stroke={mono ? accent : `url(#${g})`}
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Base */}
        <path
          d="M25 52 L39 52"
          stroke={mono ? accent : `url(#${g})`}
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* P2P Node connections — thin lines */}
        <line x1="28" y1="9" x2="32" y2="5" stroke={accentSec} strokeWidth="0.7" opacity="0.4" />
        <line x1="36" y1="9" x2="32" y2="5" stroke={accentSec} strokeWidth="0.7" opacity="0.4" />
        <line x1="28" y1="9" x2="36" y2="9" stroke={accentSec} strokeWidth="0.7" opacity="0.4" />

        {/* P2P Nodes — floating above */}
        <circle cx="28" cy="9" r="2" fill={accentSec} />
        <circle cx="36" cy="9" r="2" fill={accentSec} />
        <circle cx="32" cy="5" r="1.8" fill={accentSec} />
      </svg>
    )
  }

  // ──────────────── CN MONOGRAM (64×64) ────────────────
  if (variant === 'cn') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" {...props}>
        <defs>
          {!mono && (
            <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#00E5FF" />
              <stop offset="100%" stopColor="#00FF87" />
            </linearGradient>
          )}
        </defs>

        {/* Simplified cup outline behind text */}
        <path
          d="M18 14 C18 14 20 24 22 30 C24.5 38 30 44 32 47 C34 44 39.5 38 42 30 C44 24 46 14 46 14 Z"
          stroke={mono ? accent : `url(#${g})`}
          strokeWidth="1.8"
          strokeLinejoin="round"
          fill="none"
          opacity="0.3"
        />
        <path d="M16 14 L48 14" stroke={mono ? accent : `url(#${g})`} strokeWidth="1.8" strokeLinecap="round" opacity="0.3" />

        <text
          x="32" y="38"
          textAnchor="middle"
          fontFamily={FONT}
          fontSize="18"
          fontWeight="800"
          letterSpacing="-0.5"
          fill={mono ? accent : `url(#${g})`}
        >CN</text>

        <circle cx="28" cy="9" r="1.8" fill={accentSec} />
        <circle cx="36" cy="9" r="1.8" fill={accentSec} />
      </svg>
    )
  }

  // ──────────────── FULL WORDMARK ────────────────
  const isCn = variant === 'cn-full'

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 72" fill="none" {...props}>
      <defs>
        {!mono && (
          <>
            <linearGradient id={g} x1="18" y1="14" x2="46" y2="56">
              <stop offset="0%" stopColor="#00E5FF" />
              <stop offset="50%" stopColor="#00FF87" />
              <stop offset="100%" stopColor="#C8F31E" />
            </linearGradient>
            <linearGradient id={gl} x1="18" y1="42" x2="46" y2="42">
              <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.55" />
              <stop offset="50%" stopColor="#00FF87" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#C8F31E" stopOpacity="0.35" />
            </linearGradient>
            <radialGradient id={gm} cx="50%" cy="50%">
              <stop offset="0%" stopColor="#00FFCC" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#00C9A7" stopOpacity="0.4" />
            </radialGradient>
            <radialGradient id={gc} cx="50%" cy="50%">
              <stop offset="0%" stopColor="#C8F31E" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#C8F31E" stopOpacity="0" />
            </radialGradient>
          </>
        )}
        <clipPath id={clip}>
          <path d="M18 14 C18 14 20 24 22 30 C24.5 38 30 44 32 47 C34 44 39.5 38 42 30 C44 24 46 14 46 14 Z" />
        </clipPath>
      </defs>

      <g transform="translate(14, 4)">
        {isCn ? (
          <>
            <path
              d="M18 14 C18 14 20 24 22 30 C24.5 38 30 44 32 47 C34 44 39.5 38 42 30 C44 24 46 14 46 14 Z"
              stroke={mono ? accent : `url(#${g})`}
              strokeWidth="1.8"
              strokeLinejoin="round"
              fill="none"
              opacity="0.3"
            />
            <path d="M16 14 L48 14" stroke={mono ? accent : `url(#${g})`} strokeWidth="1.8" strokeLinecap="round" opacity="0.3" />
            <text
              x="32" y="38"
              textAnchor="middle"
              fontFamily={FONT}
              fontSize="16"
              fontWeight="800"
              letterSpacing="-0.5"
              fill={mono ? accent : `url(#${g})`}
            >CN</text>
            <circle cx="28" cy="9" r="1.6" fill={accentSec} />
            <circle cx="36" cy="9" r="1.6" fill={accentSec} />
          </>
        ) : (
          <>
            {/* Handle behind */}
            <path
              d="M46 24 C54 24 56 34 56 38 C56 42 52 48 44 46"
              stroke={mono ? accent : `url(#${g})`}
              strokeWidth="2.2"
              strokeLinecap="round"
              fill="none"
            />

            {/* Cup body */}
            <path
              d="M18 14 C18 14 20 24 22 30 C24.5 38 30 44 32 47 C34 44 39.5 38 42 30 C44 24 46 14 46 14 Z"
              stroke={mono ? accent : `url(#${g})`}
              strokeWidth="2.2"
              strokeLinejoin="round"
              fill="none"
            />

            {/* Liquid */}
            {!mono && (
              <g clipPath={`url(#${clip})`}>
                <path
                  d="M18 36 C24 33 40 33 46 36 L46 50 C46 50 40 52 32 52 C24 52 18 50 18 50 Z"
                  fill={`url(#${gl})`}
                />
                <path
                  d="M18 37 C24 35 40 35 46 37"
                  stroke="#00FF87"
                  strokeWidth="0.8"
                  fill="none"
                  opacity="0.5"
                />
              </g>
            )}

            {/* Glass highlight */}
            <path
              d="M22 18 C23 22 24 30 25 38"
              stroke={mono ? fg : '#FFFFFF'}
              strokeWidth="1.3"
              strokeLinecap="round"
              fill="none"
              opacity={mono ? 0.2 : 0.35}
            />

            {/* Rim */}
            <path
              d="M16 14 L48 14"
              stroke={mono ? accent : `url(#${g})`}
              strokeWidth="2.2"
              strokeLinecap="round"
            />

            {/* Cat Eye in liquid */}
            <g clipPath={`url(#${clip})`}>
              <path
                d="M24 41 C28 37 36 37 40 41 C36 45 28 45 24 41 Z"
                stroke={mono ? accent : '#00FFCC'}
                strokeWidth="1.2"
                fill="none"
              />
              <path
                d="M32 38.5 C33.2 39.8 33.2 42.2 32 43.5 C30.8 42.2 30.8 39.8 32 38.5 Z"
                fill={mono ? accent : `url(#${gm})`}
              />
              {!mono && <circle cx="32" cy="41" r="4" fill={`url(#${gc})`} />}
            </g>

            {/* Stem + Base */}
            <path d="M32 47 L32 52" stroke={mono ? accent : `url(#${g})`} strokeWidth="2.2" strokeLinecap="round" />
            <path d="M25 52 L39 52" stroke={mono ? accent : `url(#${g})`} strokeWidth="2.2" strokeLinecap="round" />

            {/* P2P connections */}
            <line x1="28" y1="9" x2="32" y2="5" stroke={accentSec} strokeWidth="0.6" opacity="0.4" />
            <line x1="36" y1="9" x2="32" y2="5" stroke={accentSec} strokeWidth="0.6" opacity="0.4" />
            <line x1="28" y1="9" x2="36" y2="9" stroke={accentSec} strokeWidth="0.6" opacity="0.4" />

            {/* P2P Nodes */}
            <circle cx="28" cy="9" r="1.6" fill={accentSec} />
            <circle cx="36" cy="9" r="1.6" fill={accentSec} />
            <circle cx="32" cy="5" r="1.4" fill={accentSec} />
          </>
        )}
      </g>

      {/* Brand Name */}
      <text
        x="92" y="40"
        fontFamily={FONT}
        fontSize="31"
        fontWeight="800"
        letterSpacing="-0.8"
        fill={fg}
      >
        Coffer<tspan fill={gray ? '#0F172A' : mono ? accent : '#00E5FF'}>Node</tspan>
      </text>

      {/* Subtitle */}
      <text
        x="94" y="56"
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
