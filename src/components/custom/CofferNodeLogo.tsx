import type { FC, SVGProps } from 'react'

interface CofferNodeLogoProps extends SVGProps<SVGSVGElement> {
  variant?: 'full' | 'icon'
}

/**
 * CofferNode brand logo.
 *  - variant="full"  — icon + wordmark + tagline (default, use in Navbar / landing)
 *  - variant="icon"  — hexagonal vault icon only (use in favicon, small badges)
 *
 * Palette: #0D1117 graphite, #0A3D3F teal, #00C58E neon green, #E6F5F3 mint.
 */
export const CofferNodeLogo: FC<CofferNodeLogoProps> = ({
  variant = 'full',
  ...props
}) => {
  if (variant === 'icon') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 64 64"
        fill="none"
        {...props}
      >
        <defs>
          <linearGradient id="cn-green" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#00C58E" />
            <stop offset="100%" stopColor="#0A9E76" />
          </linearGradient>
          <filter id="cn-glow">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g filter="url(#cn-glow)">
          <polygon
            points="32,2 58,15 58,43 32,56 6,43 6,15"
            stroke="#0A3D3F"
            strokeWidth="2"
            fill="none"
          />
          <polygon
            points="32,2 58,15 58,43 32,56 6,43 6,15"
            stroke="#00C58E"
            strokeWidth="0.6"
            fill="none"
            opacity="0.25"
          />
          <polygon
            points="32,13 46,21 46,37 32,45 18,37 18,21"
            stroke="#0A3D3F"
            strokeWidth="1.8"
            fill="#0A3D3F"
            fillOpacity="0.15"
          />
          <polygon
            points="32,13 46,21 46,37 32,45 18,37 18,21"
            stroke="#00C58E"
            strokeWidth="0.5"
            fill="none"
            opacity="0.3"
          />
          <rect x="29" y="25" width="6" height="8" rx="1.5" fill="url(#cn-green)" />
          <path
            d="M30 25 V22 a2 2 0 0 1 4 0 V25"
            stroke="#00C58E"
            strokeWidth="1.5"
            fill="none"
          />
          <circle cx="32" cy="2" r="3.5" fill="#00C58E" />
          <circle cx="58" cy="15" r="3" fill="#00C58E" opacity="0.85" />
          <circle cx="58" cy="43" r="3" fill="#00C58E" opacity="0.85" />
          <circle cx="32" cy="56" r="3.5" fill="#00C58E" />
          <circle cx="6" cy="43" r="3" fill="#00C58E" opacity="0.85" />
          <circle cx="6" cy="15" r="3" fill="#00C58E" opacity="0.85" />
          <circle cx="32" cy="13" r="2" fill="#E6F5F3" opacity="0.7" />
          <circle cx="46" cy="21" r="1.5" fill="#E6F5F3" opacity="0.5" />
          <circle cx="46" cy="37" r="1.5" fill="#E6F5F3" opacity="0.5" />
          <circle cx="32" cy="45" r="2" fill="#E6F5F3" opacity="0.7" />
          <circle cx="18" cy="37" r="1.5" fill="#E6F5F3" opacity="0.5" />
          <circle cx="18" cy="21" r="1.5" fill="#E6F5F3" opacity="0.5" />
          <line x1="32" y1="2" x2="58" y2="15" stroke="#0A3D3F" strokeWidth="0.8" />
          <line x1="58" y1="15" x2="58" y2="43" stroke="#0A3D3F" strokeWidth="0.8" />
          <line x1="58" y1="43" x2="32" y2="56" stroke="#0A3D3F" strokeWidth="0.8" />
          <line x1="32" y1="56" x2="6" y2="43" stroke="#0A3D3F" strokeWidth="0.8" />
          <line x1="6" y1="43" x2="6" y2="15" stroke="#0A3D3F" strokeWidth="0.8" />
          <line x1="6" y1="15" x2="32" y2="2" stroke="#0A3D3F" strokeWidth="0.8" />
          <line
            x1="32" y1="2" x2="32" y2="13"
            stroke="#00C58E" strokeWidth="0.4" opacity="0.35"
          />
          <line
            x1="58" y1="15" x2="46" y2="21"
            stroke="#00C58E" strokeWidth="0.4" opacity="0.35"
          />
          <line
            x1="58" y1="43" x2="46" y2="37"
            stroke="#00C58E" strokeWidth="0.4" opacity="0.35"
          />
          <line
            x1="32" y1="56" x2="32" y2="45"
            stroke="#00C58E" strokeWidth="0.4" opacity="0.35"
          />
          <line
            x1="6" y1="43" x2="18" y2="37"
            stroke="#00C58E" strokeWidth="0.4" opacity="0.35"
          />
          <line
            x1="6" y1="15" x2="18" y2="21"
            stroke="#00C58E" strokeWidth="0.4" opacity="0.35"
          />
        </g>
      </svg>
    )
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 340 100"
      fill="none"
      {...props}
    >
      <defs>
        <linearGradient id="cn-full-green" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00C58E" />
          <stop offset="100%" stopColor="#0A9E76" />
        </linearGradient>
        <filter id="cn-full-glow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g transform="translate(10, 15)" filter="url(#cn-full-glow)">
        <polygon
          points="32,0 58,14 58,42 32,56 6,42 6,14"
          stroke="#0A3D3F" strokeWidth="2" fill="none"
        />
        <polygon
          points="32,0 58,14 58,42 32,56 6,42 6,14"
          stroke="#00C58E" strokeWidth="0.6" fill="none" opacity="0.25"
        />
        <polygon
          points="32,12 46,20 46,36 32,44 18,36 18,20"
          stroke="#0A3D3F" strokeWidth="1.8" fill="#0A3D3F" fillOpacity="0.15"
        />
        <polygon
          points="32,12 46,20 46,36 32,44 18,36 18,20"
          stroke="#00C58E" strokeWidth="0.5" fill="none" opacity="0.3"
        />
        <rect x="29" y="24" width="6" height="8" rx="1.5" fill="url(#cn-full-green)" />
        <path
          d="M30 24 V21 a2 2 0 0 1 4 0 V24"
          stroke="#00C58E" strokeWidth="1.5" fill="none"
        />
        <circle cx="32" cy="0" r="3.5" fill="#00C58E" />
        <circle cx="58" cy="14" r="3" fill="#00C58E" opacity="0.85" />
        <circle cx="58" cy="42" r="3" fill="#00C58E" opacity="0.85" />
        <circle cx="32" cy="56" r="3.5" fill="#00C58E" />
        <circle cx="6" cy="42" r="3" fill="#00C58E" opacity="0.85" />
        <circle cx="6" cy="14" r="3" fill="#00C58E" opacity="0.85" />
        <circle cx="32" cy="12" r="2" fill="#E6F5F3" opacity="0.7" />
        <circle cx="46" cy="20" r="1.5" fill="#E6F5F3" opacity="0.5" />
        <circle cx="46" cy="36" r="1.5" fill="#E6F5F3" opacity="0.5" />
        <circle cx="32" cy="44" r="2" fill="#E6F5F3" opacity="0.7" />
        <circle cx="18" cy="36" r="1.5" fill="#E6F5F3" opacity="0.5" />
        <circle cx="18" cy="20" r="1.5" fill="#E6F5F3" opacity="0.5" />
        <line x1="32" y1="0" x2="58" y2="14" stroke="#0A3D3F" strokeWidth="0.8" />
        <line x1="58" y1="14" x2="58" y2="42" stroke="#0A3D3F" strokeWidth="0.8" />
        <line x1="58" y1="42" x2="32" y2="56" stroke="#0A3D3F" strokeWidth="0.8" />
        <line x1="32" y1="56" x2="6" y2="42" stroke="#0A3D3F" strokeWidth="0.8" />
        <line x1="6" y1="42" x2="6" y2="14" stroke="#0A3D3F" strokeWidth="0.8" />
        <line x1="6" y1="14" x2="32" y2="0" stroke="#0A3D3F" strokeWidth="0.8" />
        <line
          x1="32" y1="0" x2="32" y2="12"
          stroke="#00C58E" strokeWidth="0.4" opacity="0.35"
        />
        <line
          x1="58" y1="14" x2="46" y2="20"
          stroke="#00C58E" strokeWidth="0.4" opacity="0.35"
        />
        <line
          x1="58" y1="42" x2="46" y2="36"
          stroke="#00C58E" strokeWidth="0.4" opacity="0.35"
        />
        <line
          x1="32" y1="56" x2="32" y2="44"
          stroke="#00C58E" strokeWidth="0.4" opacity="0.35"
        />
        <line
          x1="6" y1="42" x2="18" y2="36"
          stroke="#00C58E" strokeWidth="0.4" opacity="0.35"
        />
        <line
          x1="6" y1="14" x2="18" y2="20"
          stroke="#00C58E" strokeWidth="0.4" opacity="0.35"
        />
      </g>

      <text
        x="86" y="56"
        fontFamily="'Inter', system-ui, -apple-system, sans-serif"
        fontSize="36" fontWeight="700" letterSpacing="-1"
        fill="#E6F5F3"
      >
        Coffer
        <tspan fill="#00C58E">Node</tspan>
      </text>
      <text
        x="86" y="76"
        fontFamily="'Inter', system-ui, -apple-system, sans-serif"
        fontSize="9.5" fontWeight="500" letterSpacing="3"
        fill="#0A3D3F"
      >
        PEER-TO-PEER EXCHANGE
      </text>
    </svg>
  )
}
