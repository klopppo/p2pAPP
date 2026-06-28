interface NonCustodialGraphicProps {
  className?: string
}

/**
 * Animated "non-custodial" illustration.
 *
 * A solid cube (your wallet, you hold your keys) flows into an outlined cube
 * with a glowing locked core (smart-contract escrow). Theme-aware: the
 * wireframe uses `currentColor` and the accents use the `--primary` token, so
 * it matches the app's brand in both light and dark mode.
 *
 * Ported (graphic only) from the landing mockup. Keyframes live in index.css:
 * `.ncg-float` / `.ncg-flow-dash` / `.ncg-pulse-slow`.
 */
export function NonCustodialGraphic({ className }: NonCustodialGraphicProps) {
  // Glow built from the brand color so it adapts to the theme.
  const glow = (strength: number) =>
    `drop-shadow(0 0 ${strength}px color-mix(in srgb, var(--primary) 60%, transparent))`

  return (
    <svg
      className={className}
      viewBox="0 0 800 400"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Your wallet locks funds directly in a smart-contract escrow — no custodian holds them"
    >
      {/* Left cube — your wallet (solid, you hold it) */}
      <g transform="translate(100,150)">
        <g className="ncg-float">
          <path
            d="M10 40 L60 10 L160 50 L110 80 Z"
            fill="currentColor"
            fillOpacity={0.05}
            stroke="currentColor"
            strokeWidth={2}
          />
          <path
            d="M10 40 L10 100 L110 140 L110 80 Z"
            fill="currentColor"
            fillOpacity={0.05}
            stroke="currentColor"
            strokeWidth={2}
          />
          <path
            d="M110 140 L160 110 L160 50 L110 80 Z"
            fill="currentColor"
            fillOpacity={0.05}
            stroke="currentColor"
            strokeWidth={2}
          />
          <path
            d="M130 65 L160 80 L160 100 L130 85 Z"
            fill="currentColor"
            fillOpacity={0.05}
            stroke="currentColor"
            strokeWidth={2}
          />
          {/* pulsing key indicator */}
          <circle cx={65} cy={85} r={10} fill="none" stroke="var(--primary)" strokeWidth={2}>
            <animate attributeName="r" dur="3s" repeatCount="indefinite" values="9;11;9" />
          </circle>
          <path
            d="M75 85 L95 85 L95 95 M85 85 L85 90"
            stroke="var(--primary)"
            strokeWidth={2}
            fill="none"
            style={{ filter: glow(6) }}
          />
        </g>
      </g>

      {/* Flow lines — funds moving from wallet to escrow */}
      <g opacity={0.85}>
        <path
          className="ncg-flow-dash"
          d="M280 180 Q400 130 520 180"
          stroke="var(--primary)"
          strokeDasharray="8 8"
          strokeWidth={2}
          fill="none"
        />
        <path
          d="M510 170 L525 182 L510 190"
          stroke="var(--primary)"
          strokeWidth={2}
          fill="none"
          style={{ filter: glow(5) }}
        />
        <path
          d="M280 260 Q400 310 520 260"
          stroke="var(--primary)"
          strokeWidth={2}
          fill="none"
          opacity={0.5}
        />
        <path d="M290 250 L275 258 L290 270" stroke="var(--primary)" strokeWidth={2} fill="none" opacity={0.5} />
      </g>

      {/* Right cube — smart-contract escrow (outline + locked glowing core) */}
      <g transform="translate(550,150)">
        <path d="M0 40 L70 0 L140 40 L70 80 Z" fill="none" stroke="currentColor" strokeOpacity={0.4} strokeWidth={1.5} />
        <path d="M0 40 L0 100 L70 140 L70 80 Z" fill="none" stroke="currentColor" strokeOpacity={0.4} strokeWidth={1.5} />
        <path d="M70 140 L140 100 L140 40 L70 80 Z" fill="none" stroke="currentColor" strokeOpacity={0.4} strokeWidth={1.5} />
        <g className="ncg-pulse-slow">
          <path
            d="M40 55 L70 40 L100 55 L70 70 Z"
            fill="var(--primary)"
            fillOpacity={0.2}
            stroke="var(--primary)"
            strokeWidth={2}
            style={{ filter: glow(14) }}
          />
          <path d="M40 55 L40 85 L70 100 L70 70 Z" fill="var(--primary)" fillOpacity={0.2} stroke="var(--primary)" strokeWidth={2} />
          <path d="M70 100 L100 85 L100 55 L70 70 Z" fill="var(--primary)" fillOpacity={0.2} stroke="var(--primary)" strokeWidth={2} />
        </g>
      </g>
    </svg>
  )
}
